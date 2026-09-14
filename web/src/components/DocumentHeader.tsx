import { NavLink, useParams } from 'react-router'
import { StatusBadge } from './StatusBadge'
import { ROUTES } from '../lib/constants'
import { fainterText, mutedText, pageHeading } from '../lib/ui'

function tabClass({ isActive }: { isActive: boolean }) {
  return `border-b-2 px-0.5 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'border-[#fd8c73] text-[#1f2328]'
      : 'border-transparent text-[#59636e] hover:border-[#d0d7de] hover:text-[#1f2328]'
  }`
}

interface CurrentVersionRef {
  versionNumber: number
  status: string
}

// Shared title/status header + Overview/History tab strip for one document —
// rendered at the top of both DocumentDetailPage and DocumentHistoryPage so
// switching tabs doesn't lose the "what am I looking at" context.
export function DocumentHeader({
  title,
  categoryName,
  current,
}: {
  title: string
  categoryName: string
  current: CurrentVersionRef | null
}) {
  const { id } = useParams<{ id: string }>()

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className={pageHeading}>{title}</h1>
          <p className={`mt-1 ${mutedText}`}>{categoryName}</p>
        </div>
        {current && (
          <div className="flex items-center gap-2">
            <span className={fainterText}>v{current.versionNumber}</span>
            <StatusBadge status={current.status} />
          </div>
        )}
      </div>

      <nav className="mt-4 flex gap-5 border-b border-[#d8dee4]">
        <NavLink to={ROUTES.documentDetail(id ?? '')} end className={tabClass}>
          Overview
        </NavLink>
        <NavLink to={ROUTES.documentHistory(id ?? '')} className={tabClass}>
          History
        </NavLink>
      </nav>
    </div>
  )
}
