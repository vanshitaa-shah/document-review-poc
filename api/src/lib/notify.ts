import type { Notification, Prisma } from '@prisma/client'

// Same names as AuditAction, minus the ones nobody needs to hear about.
export type NotificationType =
  | 'SUBMITTED'
  | 'VERSION_SUPERSEDED'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENT_REPLIED'

interface NotifyInput {
  actorId: string
  documentId: string
  versionId: string
}

interface Context {
  title: string
  versionNumber: number
  authorId: string
  categoryId: string
}

// Notifications are written on the action's own `tx` (like audit rows), so a rolled-back
// or retried (40001) attempt leaves none behind. The caller returns the rows out of the
// transaction and hands them to publishNotifications() once it has committed.
async function loadContext(tx: Prisma.TransactionClient, versionId: string): Promise<Context> {
  const version = await tx.documentVersion.findUniqueOrThrow({
    where: { id: versionId },
    select: {
      versionNumber: true,
      document: { select: { title: true, authorId: true, categoryId: true } },
    },
  })
  return { versionNumber: version.versionNumber, ...version.document }
}

// Recipients are resolved by category membership in the query, never filtered after the fact.
async function categoryReviewerIds(tx: Prisma.TransactionClient, categoryId: string): Promise<string[]> {
  const members = await tx.categoryMembership.findMany({
    where: { categoryId, user: { role: { name: 'REVIEWER' } } },
    select: { userId: true },
  })
  return members.map((m) => m.userId)
}

async function reviewerIdsOnVersion(tx: Prisma.TransactionClient, versionId: string): Promise<string[]> {
  const reviews = await tx.review.findMany({ where: { versionId }, select: { reviewerId: true } })
  return reviews.map((r) => r.reviewerId)
}

async function createNotifications(
  tx: Prisma.TransactionClient,
  input: NotifyInput & { type: NotificationType; message: string; recipientIds: string[] },
): Promise<Notification[]> {
  const { recipientIds, ...row } = input
  // Never notify yourself about your own action.
  const unique = [...new Set(recipientIds)].filter((id) => id !== input.actorId)
  if (unique.length === 0) {
    return []
  }
  return tx.notification.createManyAndReturn({
    data: unique.map((userId) => ({ ...row, userId })),
  })
}

// A document (first submit, or a revision taking over) is now waiting on review.
export async function notifySubmitted(tx: Prisma.TransactionClient, input: NotifyInput) {
  const ctx = await loadContext(tx, input.versionId)
  return createNotifications(tx, {
    ...input,
    type: 'SUBMITTED',
    message: `"${ctx.title}" v${ctx.versionNumber} was submitted for review`,
    recipientIds: await categoryReviewerIds(tx, ctx.categoryId),
  })
}

// A revision superseded the version under review. Reviewers who had already acted on the
// old version are told it's stale; the rest of the category just hears a new version is up.
export async function notifyRevisionSubmitted(
  tx: Prisma.TransactionClient,
  input: NotifyInput & { supersededVersionId: string },
) {
  const { supersededVersionId, ...base } = input
  const ctx = await loadContext(tx, base.versionId)
  const oldCtx = await loadContext(tx, supersededVersionId)
  const engaged = await reviewerIdsOnVersion(tx, supersededVersionId)
  const all = await categoryReviewerIds(tx, ctx.categoryId)
  const engagedSet = new Set(engaged)
  const superseded = await createNotifications(tx, {
    ...base,
    type: 'VERSION_SUPERSEDED',
    message: `"${ctx.title}" v${oldCtx.versionNumber} was superseded by v${ctx.versionNumber} — your review no longer applies`,
    recipientIds: engaged,
  })
  const submitted = await createNotifications(tx, {
    ...base,
    type: 'SUBMITTED',
    message: `"${ctx.title}" v${ctx.versionNumber} was submitted for review`,
    recipientIds: all.filter((id) => !engagedSet.has(id)),
  })
  return [...superseded, ...submitted]
}

// The author, plus the other reviewers in the category — approval only happens on an untouched
// SUBMITTED version, so there's no one who "already acted"; anyone may have it open right now.
export async function notifyApproved(tx: Prisma.TransactionClient, input: NotifyInput) {
  const ctx = await loadContext(tx, input.versionId)
  return createNotifications(tx, {
    ...input,
    type: 'APPROVED',
    message: `"${ctx.title}" v${ctx.versionNumber} was approved`,
    recipientIds: [ctx.authorId, ...(await categoryReviewerIds(tx, ctx.categoryId))],
  })
}

// Request-changes and an inline comment both land here — a comment is a change request.
export async function notifyChangesRequested(tx: Prisma.TransactionClient, input: NotifyInput) {
  const ctx = await loadContext(tx, input.versionId)
  return createNotifications(tx, {
    ...input,
    type: 'CHANGES_REQUESTED',
    message: `Changes were requested on "${ctx.title}" v${ctx.versionNumber}`,
    recipientIds: [ctx.authorId],
  })
}

// Everyone already in the thread plus the document's author — whoever just replied is excluded.
export async function notifyCommentReplied(
  tx: Prisma.TransactionClient,
  input: NotifyInput & { rootCommentId: string },
) {
  const { rootCommentId, ...base } = input
  const ctx = await loadContext(tx, base.versionId)
  const thread = await tx.comment.findMany({
    where: { OR: [{ id: rootCommentId }, { parentId: rootCommentId }] },
    select: { authorId: true },
  })
  return createNotifications(tx, {
    ...base,
    type: 'COMMENT_REPLIED',
    message: `New reply on a comment in "${ctx.title}" v${ctx.versionNumber}`,
    recipientIds: [ctx.authorId, ...thread.map((c) => c.authorId)],
  })
}
