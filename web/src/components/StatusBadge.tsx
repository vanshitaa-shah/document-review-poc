import { STATUS_STYLES, type VersionStatus } from '../lib/format'

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status as VersionStatus] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700 ring-gray-500/20',
  }

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  )
}
