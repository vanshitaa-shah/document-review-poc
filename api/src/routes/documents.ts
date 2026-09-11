import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import {
  documentCategoryFilter,
  documentVersionCategoryFilter,
  documentVisibilityFilter,
  isCategoryMember,
} from '../lib/categoryAccess.js'
import { withSerializableRetry } from '../lib/dbRetry.js'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js'
import { sha256File } from '../lib/fileHash.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { upload } from '../lib/upload.js'
import { decodeCursor, encodeCursor } from '../lib/pagination.js'

export const documentsRouter = Router()

const paramsSchema = z.object({ id: z.string().uuid() })

const createDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  categoryId: z.string().uuid(),
})

const versionsQuerySchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

documentsRouter.get(
  '/',
  requireAuth,
  validate({ query: listQuerySchema }),
  async (req, res) => {
    const { cursor, limit = 20 } = req.validatedQuery as z.infer<typeof listQuerySchema>
    const { id: userId } = req.user!

    const cursorPage = cursor ? decodeCursor(cursor) : null

    const documents = await prisma.document.findMany({
      where: {
        AND: [
          documentVisibilityFilter(userId),
          ...(cursorPage
            ? [
                {
                  OR: [
                    { createdAt: { lt: cursorPage.createdAt } },
                    { createdAt: cursorPage.createdAt, id: { lt: cursorPage.id } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { versions: { where: { isCurrent: true } } },
    })

    const hasMore = documents.length > limit
    const page = documents.slice(0, limit)
    const last = page[page.length - 1]

    res.json({
      items: page.map(({ versions, ...doc }) => ({ ...doc, currentVersion: versions[0] ?? null })),
      nextCursor: hasMore && last ? encodeCursor(last) : null,
    })
  },
)

// Author uploads the initial file for a new document — version 1, current, DRAFT.
// Phase 02 (upload & submit) hasn't landed yet; this is the minimal slice of it
// phase 03 needs so there is a current version to supersede.
documentsRouter.post(
  '/',
  requireAuth,
  requireRole('AUTHOR'),
  upload.single('file'),
  validate({ body: createDocumentSchema }),
  async (req, res) => {
    const { title, categoryId } = req.body as z.infer<typeof createDocumentSchema>
    const { id: userId } = req.user!
    const file = req.file

    if (!file) {
      throw new ValidationError('A file is required')
    }
    if (!(await isCategoryMember(userId, categoryId))) {
      throw new ForbiddenError('Not a member of this category')
    }

    const sha256 = await sha256File(file.path)

    const document = await prisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: { title, categoryId, authorId: userId },
      })
      const version = await tx.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          filePath: file.path,
          fileName: file.originalname,
          mimeType: file.mimetype,
          size: file.size,
          sha256,
          uploadedById: userId,
          isCurrent: true,
          status: 'DRAFT',
        },
      })
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: 'DOCUMENT_CREATED',
          documentId: doc.id,
          versionId: version.id,
        },
      })
      return { ...doc, currentVersion: version }
    })

    res.status(201).json(document)
  },
)

documentsRouter.post(
  '/:id/submit',
  requireAuth,
  requireRole('AUTHOR'),
  validate({ params: paramsSchema }),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>
    const { id: userId } = req.user!

    const document = await prisma.document.findFirst({
      where: { id, authorId: userId, ...documentCategoryFilter(userId) },
    })
    if (!document) {
      throw new NotFoundError()
    }

    await prisma.$transaction(async (tx) => {
      const { count } = await tx.documentVersion.updateMany({
        where: { documentId: id, isCurrent: true, status: 'DRAFT' },
        data: { status: 'SUBMITTED' },
      })
      if (count === 0) {
        throw new ConflictError('Current version is not a draft')
      }

      const current = await tx.documentVersion.findFirst({
        where: { documentId: id, isCurrent: true },
      })
      await tx.auditEvent.create({
        data: {
          actorId: userId,
          action: 'VERSION_SUBMITTED',
          documentId: id,
          versionId: current!.id,
        },
      })
    })

    res.status(204).send()
  },
)

documentsRouter.get(
  '/:id',
  requireAuth,
  validate({ params: paramsSchema }),
  async (req, res) => {
    const { id } = req.params as z.infer<typeof paramsSchema>
    const { id: userId } = req.user!

    const document = await prisma.document.findFirst({
      where: { id, ...documentVisibilityFilter(userId) },
      include: { versions: { where: { isCurrent: true } } },
    })

    if (!document) {
      throw new NotFoundError()
    }

    const { versions, ...doc } = document
    res.json({ ...doc, currentVersion: versions[0] ?? null })
  },
)

// Revision upload — one SERIALIZABLE transaction: lock the current version,
// demote it, insert the new one, cancel any pending reviews on the old one,
// and audit all of it together. See versioning-invariants skill, rules 1 & 3.
documentsRouter.post(
  '/:id/versions',
  requireAuth,
  requireRole('AUTHOR'),
  upload.single('file'),
  validate({ params: paramsSchema }),
  async (req, res) => {
    const { id: documentId } = req.params as z.infer<typeof paramsSchema>
    const { id: userId } = req.user!
    const file = req.file

    if (!file) {
      throw new ValidationError('A file is required')
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, authorId: userId, ...documentCategoryFilter(userId) },
    })
    if (!document) {
      throw new NotFoundError()
    }

    const sha256 = await sha256File(file.path)

    const newVersion = await withSerializableRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const [current] = await tx.$queryRaw<Array<{ id: string; versionNumber: number }>>`
            SELECT id, "versionNumber" FROM "DocumentVersion"
            WHERE "documentId" = ${documentId} AND "isCurrent" = true
            FOR UPDATE
          `
          if (!current) {
            throw new ConflictError('Document has no current version')
          }

          await tx.documentVersion.update({
            where: { id: current.id },
            data: { isCurrent: false, status: 'SUPERSEDED' },
          })

          const created = await tx.documentVersion.create({
            data: {
              documentId,
              versionNumber: current.versionNumber + 1,
              filePath: file.path,
              fileName: file.originalname,
              mimeType: file.mimetype,
              size: file.size,
              sha256,
              uploadedById: userId,
              isCurrent: true,
              status: 'DRAFT',
            },
          })

          const pendingReviews = await tx.review.findMany({
            where: { versionId: current.id, status: 'PENDING' },
          })
          if (pendingReviews.length > 0) {
            await tx.review.updateMany({
              where: { id: { in: pendingReviews.map((r) => r.id) } },
              data: { status: 'SUPERSEDED', decidedAt: new Date() },
            })
          }

          await tx.auditEvent.create({
            data: {
              actorId: userId,
              action: 'VERSION_SUPERSEDED',
              documentId,
              versionId: current.id,
              metadata: { supersededBy: created.id },
            },
          })
          for (const review of pendingReviews) {
            await tx.auditEvent.create({
              data: {
                actorId: userId,
                action: 'REVIEW_CANCELLED',
                documentId,
                versionId: current.id,
                metadata: { reviewId: review.id, reviewerId: review.reviewerId },
              },
            })
          }
          await tx.auditEvent.create({
            data: {
              actorId: userId,
              action: 'VERSION_UPLOADED',
              documentId,
              versionId: created.id,
            },
          })

          return created
        },
        { isolationLevel: 'Serializable' },
      ),
    )

    res.status(201).json(newVersion)
  },
)

documentsRouter.get(
  '/:id/versions',
  requireAuth,
  validate({ params: paramsSchema, query: versionsQuerySchema }),
  async (req, res) => {
    const { id: documentId } = req.params as z.infer<typeof paramsSchema>
    const { cursor, limit = 20 } = req.validatedQuery as z.infer<typeof versionsQuerySchema>
    const { id: userId } = req.user!

    const document = await prisma.document.findFirst({
      where: { id: documentId, ...documentVisibilityFilter(userId) },
    })
    if (!document) {
      throw new NotFoundError()
    }

    const versions = await prisma.documentVersion.findMany({
      where: {
        documentId,
        ...documentVersionCategoryFilter(userId),
        ...(cursor && { versionNumber: { lt: cursor } }),
      },
      orderBy: { versionNumber: 'desc' },
      take: limit + 1,
      include: { uploadedBy: { select: { id: true, email: true } } },
    })

    const hasMore = versions.length > limit
    const page = versions.slice(0, limit)

    res.json({
      items: page,
      nextCursor: hasMore ? page[page.length - 1]!.versionNumber : null,
    })
  },
)
