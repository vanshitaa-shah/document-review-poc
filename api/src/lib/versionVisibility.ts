import type { VersionStatus } from '@prisma/client'

// Statuses a version has before the author has ever exposed it to reviewers.
// Only the author sees these versions, or any audit event that points at them.
export const UNSUBMITTED_STATUSES: VersionStatus[] = ['DRAFT', 'DISCARDED']

// Post-fetch companion to the category predicate: the row already passed the
// category filter, this hides the author's private drafts from everyone else.
export function isHiddenFromUser(
  version: { status: VersionStatus; document: { authorId: string } },
  userId: string,
): boolean {
  return UNSUBMITTED_STATUSES.includes(version.status) && version.document.authorId !== userId
}
