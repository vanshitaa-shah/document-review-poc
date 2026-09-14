import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, ApiError } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { AppShell } from '../components/AppShell'
import { DocumentHeader } from '../components/DocumentHeader'
import { ErrorMessage } from '../components/ErrorMessage'
import { StatusBadge } from '../components/StatusBadge'
import { Avatar } from '../components/Avatar'
import { ClockIcon } from '../components/Icons'
import { auditActionLabel, formatBytes, formatDateTime } from '../lib/format'
import { card, fainterText, mutedText, sectionHeading } from '../lib/ui'

interface CategoryRef {
  id: string
  name: string
}

interface CurrentVersion {
  versionNumber: number
  status: string
}

interface DocumentDetail {
  id: string
  title: string
  category: CategoryRef
  currentVersion: CurrentVersion | null
}

interface UserRef {
  id: string
  email: string
}

interface ApprovalInfo {
  approvedAt: string
  approver: UserRef
}

interface VersionRow {
  id: string
  versionNumber: number
  status: string
  uploadedAt: string
  fileName: string
  size: number
  uploadedBy: UserRef
  approval: ApprovalInfo | null
}

interface AuditRow {
  id: string
  action: string
  timestamp: string
  metadata: unknown
  actor: UserRef
}

export function DocumentHistoryPage() {
  const { id } = useParams<{ id: string }>()
  const { token } = useAuth()

  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [downloadError, setDownloadError] = useState<unknown>(null)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const [doc, versionsRes, auditRes] = await Promise.all([
        api.get<DocumentDetail>(`/documents/${id}`, token),
        api.get<{ items: VersionRow[] }>(`/documents/${id}/versions`, token),
        api.get<{ items: AuditRow[] }>(`/documents/${id}/audit`, token),
      ])
      setDocument(doc)
      setVersions(versionsRes.items)
      setAudit(auditRes.items)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [id, token])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDownload(versionId: string, fileName: string) {
    try {
      const res = await fetch(`/versions/${versionId}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const payload = await res.json().catch(() => ({ error: 'Download failed' }))
        throw new ApiError(payload.error ?? 'Download failed', res.status)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = fileName
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setDownloadError(err)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <p className={mutedText}>Loading…</p>
      </AppShell>
    )
  }

  if (error || !document) {
    return (
      <AppShell>
        <ErrorMessage error={error} />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <DocumentHeader title={document.title} categoryName={document.category.name} current={document.currentVersion} />

      <div className="mb-4">
        <ErrorMessage error={downloadError} />
      </div>

      <section>
        <h2 className={sectionHeading}>Version history</h2>
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
                      onClick={() => void handleDownload(v.id, v.fileName)}
                      className="text-xs font-medium text-[#0969da] hover:underline"
                    >
                      Download
                    </button>
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
      </section>

      <section className="mt-6">
        <h2 className={sectionHeading}>Audit trail</h2>
        <ul className={`mt-2 space-y-3 p-4 ${card}`}>
          {audit.map((event) => (
            <li key={event.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="flex items-center gap-2 text-[#1f2328]">
                <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#6e7781]" />
                {auditActionLabel(event.action)}
                <span className={fainterText}>· {event.actor.email}</span>
              </span>
              <span className={`flex-shrink-0 ${fainterText}`}>{formatDateTime(event.timestamp)}</span>
            </li>
          ))}
          {audit.length === 0 && <li className={mutedText}>No activity yet.</li>}
        </ul>
      </section>
    </AppShell>
  )
}
