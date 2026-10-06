import type { Prisma } from '@prisma/client'

// The actions this project tracks in the audit trail (see phases/06-audit-pagination-logging.md;
// REVIEW_CANCELLED was dropped — nothing ever creates a PENDING review for it to cancel).
// A literal union instead of `string` so a typo'd action name is a type error, not a
// silent gap in the audit trail.
export type AuditAction =
  | 'DOCUMENT_UPLOADED'
  | 'VERSION_UPLOADED'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'VERSION_SUPERSEDED'

interface AuditEventInput {
  actorId: string
  action: AuditAction
  documentId: string
  versionId?: string
  metadata?: Prisma.InputJsonValue
}

// Every state-changing action writes its audit row through this, on the same
// `tx` as the state change — never after the transaction commits.
export function recordAuditEvent(tx: Prisma.TransactionClient, data: AuditEventInput) {
  return tx.auditEvent.create({ data })
}
