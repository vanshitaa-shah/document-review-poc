import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { api, ApiError } from '../lib/apiClient'
import { AppShell } from '../components/AppShell'
import { DocumentHeader } from '../components/DocumentHeader'
import { ErrorMessage } from '../components/ErrorMessage'
import { VersionDiffView } from '../components/VersionDiffView'
import { VersionHistoryTable, type VersionRow } from '../components/VersionHistoryTable'
import { AuditTrailList, type AuditRow } from '../components/AuditTrailList'
import { mutedText, sectionHeading } from '../lib/ui'

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

// History tab: version history table, version-diff view, and the audit
// trail (including reviewers' request-changes comments). All data-fetching
// lives here; VersionHistoryTable and AuditTrailList are pure presentation.
export function DocumentHistoryPage() {
  const { id } = useParams<{ id: string }>()

  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [downloadError, setDownloadError] = useState<unknown>(null)
  const [compareVersion, setCompareVersion] = useState<VersionRow | null>(null)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    try {
      const [doc, versionsRes, auditRes] = await Promise.all([
        api.get<DocumentDetail>(`/documents/${id}`),
        api.get<{ items: VersionRow[] }>(`/documents/${id}/versions`),
        api.get<{ items: AuditRow[] }>(`/documents/${id}/audit`),
      ])
      setDocument(doc)
      setVersions(versionsRes.items)
      setAudit(auditRes.items)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function handleDownload(versionId: string, fileName: string) {
    try {
      const res = await fetch(`/versions/${versionId}/download`, { credentials: 'include' })
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

  const previousVersion = compareVersion
    ? versions.find((v) => v.versionNumber === compareVersion.versionNumber - 1)
    : null

  return (
    <AppShell>
      <DocumentHeader title={document.title} categoryName={document.category.name} current={document.currentVersion} />

      <div className="mb-4">
        <ErrorMessage error={downloadError} />
      </div>

      <section>
        <h2 className={sectionHeading}>Version history</h2>
        <VersionHistoryTable versions={versions} onDownload={handleDownload} onCompare={setCompareVersion} />
      </section>

      {compareVersion && previousVersion && (
        <VersionDiffView
          currentVersionId={compareVersion.id}
          previousVersionId={previousVersion.id}
          currentVersionNumber={compareVersion.versionNumber}
          previousVersionNumber={previousVersion.versionNumber}
          onClose={() => setCompareVersion(null)}
        />
      )}

      <section className="mt-6">
        <h2 className={sectionHeading}>Audit trail</h2>
        <AuditTrailList events={audit} />
      </section>
    </AppShell>
  )
}
