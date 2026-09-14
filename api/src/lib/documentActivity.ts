import type { Prisma } from '@prisma/client'

// Bumps Document.updatedAt in the same transaction as the state change that
// caused it — submit, revision upload, approve, request-changes. Keeps the
// document list's "most recently changed first" sort accurate without
// depending on Prisma's @updatedAt (which only fires on writes to the
// Document row itself, and most of these actions write DocumentVersion/Review).
export function touchDocument(tx: Prisma.TransactionClient, documentId: string) {
  return tx.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } })
}
