import type { DocumentVersion } from '@prisma/client'

type WithVersions = { versions: DocumentVersion[] }

// Every document response shape collapses its `versions: [current]` include
// down to a single `currentVersion` field — this is the one place that does it.
export function withCurrentVersion<T extends WithVersions>(
  document: T,
): Omit<T, 'versions'> & { currentVersion: DocumentVersion | null } {
  const { versions, ...doc } = document
  return { ...doc, currentVersion: versions[0] ?? null }
}
