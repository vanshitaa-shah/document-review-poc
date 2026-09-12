import type { Prisma } from '@prisma/client'
import { ConflictError } from './errors.js'

// Approve and request-changes share this: when the conditional write affects zero
// rows, name the version that is actually current instead of a bare 409.
export async function throwStaleVersionConflict(
  tx: Prisma.TransactionClient,
  documentId: string,
): Promise<never> {
  const current = await tx.documentVersion.findFirst({ where: { documentId, isCurrent: true } })
  throw new ConflictError(
    current
      ? `Version is no longer current. Current version is v${current.versionNumber}.`
      : 'Document has no current version.',
  )
}
