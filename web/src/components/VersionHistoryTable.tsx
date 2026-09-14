import { Avatar } from './Avatar'
import { StatusBadge } from './StatusBadge'
import { formatBytes, formatDateTime } from '../lib/format'
import { card, fainterText, mutedText } from '../lib/ui'

interface UserRef {
  email: string
}

export interface VersionRow {
  id: string
  versionNumber: number
  status: string
  uploadedAt: string
  fileName: string
  size: number
  uploadedBy: UserRef
}

// The version-history table on the History tab: one row per version, with
// download and (for v2+) a "Compare with previous" action. Pure presentation.
export function VersionHistoryTable({
  versions,
  onDownload,
  onCompare,
}: {
  versions: VersionRow[]
  onDownload: (versionId: string, fileName: string) => void
  onCompare: (version: VersionRow) => void
}) {
  return (
    <div className={`mt-2 overflow-hidden ${card}`}>
      <table className="w-full text-left text-sm">
        <thead className="bg-[#f6f8fa] text-xs uppercase tracking-wide text-[#59636e]">
          <tr>
            <th className="px-4 py-2 font-medium">Version</th>
            <th className="px-4 py-2 font-medium">Uploaded by</th>
            <th className="px-4 py-2 font-medium">When</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d8dee4]">
          {versions.map((v) => (
            <tr key={v.id} className="hover:bg-[#f6f8fa]">
              <td className="px-4 py-2.5 font-medium text-[#1f2328]">
                v{v.versionNumber}
                <span className={`ml-2 font-normal ${fainterText}`}>{formatBytes(v.size)}</span>
              </td>
              <td className="px-4 py-2.5 text-[#3d444d]">
                <span className="flex items-center gap-1.5">
                  <Avatar email={v.uploadedBy.email} size="sm" />
                  {v.uploadedBy.email}
                </span>
              </td>
              <td className={`px-4 py-2.5 ${fainterText}`}>{formatDateTime(v.uploadedAt)}</td>
              <td className="px-4 py-2.5">
                <StatusBadge status={v.status} />
              </td>
              <td className="px-4 py-2.5 text-right">
                <button
                  onClick={() => onDownload(v.id, v.fileName)}
                  className="text-xs font-medium text-[#0969da] hover:underline"
                >
                  Download
                </button>
                {v.versionNumber > 1 && (
                  <button
                    onClick={() => onCompare(v)}
                    className="ml-3 text-xs font-medium text-[#0969da] hover:underline"
                  >
                    Compare with previous
                  </button>
                )}
              </td>
            </tr>
          ))}
          {versions.length === 0 && (
            <tr>
              <td colSpan={5} className={`px-4 py-10 text-center ${mutedText}`}>
                No versions yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
