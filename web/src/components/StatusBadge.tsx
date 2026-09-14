import { STATUS_STYLES } from '../lib/format'
import type { VersionStatus } from '../lib/constants'
import { DotIcon } from './Icons'

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status as VersionStatus] ?? {
    label: status,
    className: 'bg-[#f6f8fa] text-[#59636e] ring-1 ring-inset ring-[#d0d7de]',
    dot: '#59636e',
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.className}`}
    >
      <DotIcon color={style.dot} />
      {style.label}
    </span>
  )
}
