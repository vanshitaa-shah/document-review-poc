// Single source of truth for the string literals that used to be scattered
// across pages as inline comparisons ('AUTHOR', 'SUBMITTED', ...). Mirrors the
// Prisma enums on the backend (UserRole, VersionStatus) — keep them in sync.

export const Role = {
  AUTHOR: 'AUTHOR',
  REVIEWER: 'REVIEWER',
} as const
export type Role = (typeof Role)[keyof typeof Role]

export const VersionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  APPROVED: 'APPROVED',
  CHANGES_REQUESTED: 'CHANGES_REQUESTED',
  SUPERSEDED: 'SUPERSEDED',
} as const
export type VersionStatus = (typeof VersionStatus)[keyof typeof VersionStatus]

export const DOCUMENT_LIST_PAGE_SIZE = 10

// Client-side hint only — the server (api/src/lib/upload.ts) is the real validator.
export const ALLOWED_UPLOAD_EXTENSIONS = ['.txt', '.pdf', '.md', '.docx']
export const MAX_UPLOAD_MB = 10

export const ROUTES = {
  login: '/login',
  documents: '/documents',
  newDocument: '/documents/new',
  documentDetail: (id: string) => `/documents/${id}`,
  documentHistory: (id: string) => `/documents/${id}/history`,
  reviewQueue: '/reviews/queue',
} as const
