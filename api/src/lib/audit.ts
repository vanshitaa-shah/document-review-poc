import type { Prisma } from '@prisma/client'

interface AuditEventInput {
  actorId: string
  action: string
  documentId: string
  versionId?: string
  metadata?: Prisma.InputJsonValue
}

// Every state-changing action writes its audit row through this, on the same
// `tx` as the state change — never after the transaction commits.
export function recordAuditEvent(tx: Prisma.TransactionClient, data: AuditEventInput) {
  return tx.auditEvent.create({ data })
}
