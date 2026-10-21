import type { Prisma } from '@prisma/client'
import { ConflictError } from './errors.ts'

// Approve, request-changes and comment share this: when the conditional write affects
// zero rows, say why. A superseded version is a versioning conflict and names the
// current version; a version that is still current but in the wrong state (already
// approved, never submitted, ...) is a state conflict and must not claim otherwise.
export async function throwStaleVersionConflict(
  tx: Prisma.TransactionClient,
  versionId: string,
  documentId: string,
): Promise<never> {
  const version = await tx.documentVersion.findUnique({ where: { id: versionId } })

  if (version?.isCurrent) {
    switch (version.status) {
      case 'APPROVED':
        throw new ConflictError('This version has already been approved.')
      case 'DRAFT':
        throw new ConflictError('This version has not been submitted for review yet.')
      default:
        throw new ConflictError(`This version cannot be changed in its current state (${version.status}).`)
    }
  }

  const current = await tx.documentVersion.findFirst({ where: { documentId, isCurrent: true } })
  throw new ConflictError(
    current
      ? `Version is no longer current. Current version is v${current.versionNumber}.`
      : 'Document has no current version.',
  )
}
