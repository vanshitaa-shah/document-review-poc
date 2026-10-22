import type { VersionStatus } from '@prisma/client'
import type { RoleName } from './roles.ts'

// Statuses a version has before the author has ever exposed it to reviewers.
// Only the author sees these versions, or any audit event that points at them.
export const UNSUBMITTED_STATUSES: VersionStatus[] = ['DRAFT', 'DISCARDED']

// Post-fetch companion to the category predicate: the row already passed the
// category filter, this hides the author's private drafts from everyone else, and
// any document from an AUTHOR who doesn't own it (see documentVisibilityFilter).
export function isHiddenFromUser(
  version: { status: VersionStatus; document: { authorId: string } },
  userId: string,
  role: RoleName,
): boolean {
  const isOwner = version.document.authorId === userId
  if (role === 'AUTHOR' && !isOwner) return true
  return UNSUBMITTED_STATUSES.includes(version.status) && !isOwner
}
