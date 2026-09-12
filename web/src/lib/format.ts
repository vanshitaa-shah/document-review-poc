export type VersionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'SUPERSEDED'

interface StatusStyle {
  label: string
  className: string
}

// Tailwind pairs for each version status — used by StatusBadge everywhere a
// status shows up (list, detail, queue) so the same status always reads the same.
export const STATUS_STYLES: Record<VersionStatus, StatusStyle> = {
  DRAFT: { label: 'Draft', className: 'bg-gray-100 text-gray-700 ring-gray-500/20' },
  SUBMITTED: { label: 'Submitted', className: 'bg-blue-50 text-blue-700 ring-blue-600/20' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  CHANGES_REQUESTED: { label: 'Changes requested', className: 'bg-amber-50 text-amber-800 ring-amber-600/20' },
  SUPERSEDED: { label: 'Superseded', className: 'bg-gray-50 text-gray-500 ring-gray-500/20' },
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  DOCUMENT_UPLOADED: 'Document uploaded',
  SUBMITTED: 'Submitted for review',
  VERSION_UPLOADED: 'New revision uploaded',
  VERSION_SUPERSEDED: 'Version superseded',
  REVIEW_CANCELLED: 'Pending review cancelled',
  APPROVED: 'Approved',
  CHANGES_REQUESTED: 'Changes requested',
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABELS[action] ?? action
}

export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}
