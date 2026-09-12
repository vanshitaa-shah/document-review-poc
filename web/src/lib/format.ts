export type VersionStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'SUPERSEDED'

interface StatusStyle {
  label: string
  className: string
  dot: string
}

// One style per version status — used by StatusBadge everywhere a status shows
// up (list, detail, queue) so the same status always reads the same, GitHub
// label-style: a tinted pill with a matching dot.
export const STATUS_STYLES: Record<VersionStatus, StatusStyle> = {
  DRAFT: { label: 'Draft', className: 'bg-[#f6f8fa] text-[#59636e] ring-1 ring-inset ring-[#d0d7de]', dot: '#59636e' },
  SUBMITTED: {
    label: 'Submitted',
    className: 'bg-[#ddf4ff] text-[#0969da] ring-1 ring-inset ring-[#54aeff]/40',
    dot: '#0969da',
  },
  APPROVED: {
    label: 'Approved',
    className: 'bg-[#dafbe1] text-[#1a7f37] ring-1 ring-inset ring-[#4ac26b]/40',
    dot: '#1a7f37',
  },
  CHANGES_REQUESTED: {
    label: 'Changes requested',
    className: 'bg-[#fff8c5] text-[#7d4e00] ring-1 ring-inset ring-[#d4a72c]/40',
    dot: '#9a6700',
  },
  SUPERSEDED: {
    label: 'Superseded',
    className: 'bg-[#f6f8fa] text-[#6e7781] ring-1 ring-inset ring-[#d0d7de]',
    dot: '#afb8c1',
  },
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
