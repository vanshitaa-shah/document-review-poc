import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useParams } from 'react-router'
import ReactMarkdown from 'react-markdown'
import { api, ApiError } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { AppShell } from '../components/AppShell'
import { ErrorMessage } from '../components/ErrorMessage'
import { StatusBadge } from '../components/StatusBadge'
import { FileInputHint } from '../components/FileInputHint'
import { AnnotatedContent, type NewAnchoredComment, type StoredComment } from '../components/AnnotatedContent'
import { auditActionLabel, formatBytes, formatDateTime } from '../lib/format'

interface CategoryRef {
  id: string
  name: string
}

interface UserRef {
  id: string
  email: string
}

interface ApprovalInfo {
  approvedAt: string
  approver: UserRef
}

interface VersionSummary {
  id: string
  versionNumber: number
  status: string
  uploadedAt: string
}

interface DocumentDetail {
  id: string
  title: string
  authorId: string
  category: CategoryRef
  currentVersion: VersionSummary | null
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

interface VersionContent {
  format: 'text' | 'markdown' | 'html' | 'unsupported'
  content: string | null
}

export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { token, user } = useAuth()

  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [audit, setAudit] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const [revisionFile, setRevisionFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')

  const [versionContent, setVersionContent] = useState<VersionContent | null>(null)
  const [inlineComments, setInlineComments] = useState<StoredComment[]>([])
  const [commentBusy, setCommentBusy] = useState(false)
  const [versionLevelComment, setVersionLevelComment] = useState('')

  // `silent` is for the refresh after a failed action (e.g. a stale-version 409):
  // a revision landing mid-review can make the document DRAFT-and-hidden again for
  // a reviewer (invariant 4), which would 404 here. That must not blow away the
  // page the actionError is anchored to — so a silent failure just keeps the last
  // known good state on screen instead of replacing it with a bare "Not found".
  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (!id) return
      if (!opts.silent) setError(null)
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
        if (!opts.silent) setError(err)
      } finally {
        setLoading(false)
      }
    },
    [id, token],
  )

  useEffect(() => {
    void load()
  }, [load])

  const currentVersionId = document?.currentVersion?.id ?? null

  const loadComments = useCallback(async () => {
    if (!currentVersionId) return
    try {
      const [contentRes, commentsRes] = await Promise.all([
        api.get<VersionContent>(`/versions/${currentVersionId}/content`, token),
        api.get<{ items: StoredComment[] }>(`/versions/${currentVersionId}/comments`, token),
      ])
      setVersionContent(contentRes)
      setInlineComments(commentsRes.items)
    } catch {
      // Non-fatal — the rest of the page still works without inline content/comments.
      setVersionContent(null)
      setInlineComments([])
    }
  }, [currentVersionId, token])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  if (loading) {
    return (
      <AppShell>
        <p className="text-sm text-gray-500">Loading…</p>
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

  const isAuthor = document.authorId === user?.id
  const isReviewer = user?.role === 'REVIEWER'
  const current = document.currentVersion
  const currentRow = versions.find((v) => v.id === current?.id)

  async function runAction(action: () => Promise<void>) {
    setActionError(null)
    setBusy(true)
    try {
      await action()
      await load()
    } catch (err) {
      setActionError(err)
      // A stale-version 409 is most legible next to the real current state, so try
      // to refresh — silently, so if the refresh itself fails the 409 stays on screen
      // instead of being replaced by a full-page error.
      await load({ silent: true })
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit() {
    await runAction(() => api.post(`/documents/${id}/submit`, undefined, token))
  }

  async function handleUploadRevision(e: FormEvent) {
    e.preventDefault()
    if (!revisionFile) return
    await runAction(async () => {
      const formData = new FormData()
      formData.append('file', revisionFile)
      await api.postForm(`/documents/${id}/versions`, formData, token)
      setRevisionFile(null)
    })
  }

  async function handleApprove() {
    if (!current) return
    await runAction(() => api.post(`/versions/${current.id}/approve`, undefined, token))
  }

  async function handleRequestChanges(e: FormEvent) {
    e.preventDefault()
    if (!current || !comment.trim()) return
    await runAction(async () => {
      await api.post(`/versions/${current.id}/request-changes`, { comment }, token)
      setComment('')
    })
  }

  async function handleCreateAnchoredComment(payload: NewAnchoredComment) {
    if (!current) return
    setCommentBusy(true)
    try {
      await api.post(`/versions/${current.id}/comments`, payload, token)
      await loadComments()
    } finally {
      setCommentBusy(false)
    }
  }

  async function handleCreateVersionLevelComment(e: FormEvent) {
    e.preventDefault()
    if (!current || !versionLevelComment.trim()) return
    setCommentBusy(true)
    setActionError(null)
    try {
      await api.post(`/versions/${current.id}/comments`, { body: versionLevelComment }, token)
      setVersionLevelComment('')
      await loadComments()
    } catch (err) {
      setActionError(err)
    } finally {
      setCommentBusy(false)
    }
  }

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
      setActionError(err)
    }
  }

  return (
    <AppShell>
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{document.title}</h1>
            <p className="mt-1 text-sm text-gray-500">{document.category.name}</p>
          </div>
          {current && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">v{current.versionNumber}</span>
              <StatusBadge status={current.status} />
            </div>
          )}
        </div>

        <ErrorMessage error={actionError} />

        {currentRow?.approval && (
          <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Approved by {currentRow.approval.approver.email} on{' '}
            {formatDateTime(currentRow.approval.approvedAt)} (v{currentRow.versionNumber})
          </div>
        )}

        {current && (
          <div className="mt-4 flex flex-wrap gap-2">
            {current.status === 'APPROVED' && (
              <button
                onClick={() => void handleDownload(current.id, currentRow?.fileName ?? document.title)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Download
              </button>
            )}

            {isAuthor && current.status === 'DRAFT' && (
              <button
                onClick={() => void handleSubmit()}
                disabled={busy}
                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
              >
                Submit for review
              </button>
            )}

            {isReviewer && current.status === 'SUBMITTED' && (
              <button
                onClick={() => void handleApprove()}
                disabled={busy}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                Approve
              </button>
            )}
          </div>
        )}

        {isAuthor && current?.status !== 'APPROVED' && (
          <form onSubmit={handleUploadRevision} className="mt-6 border-t border-gray-100 pt-4">
            <h2 className="text-sm font-medium text-gray-900">Upload a revision</h2>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <input
                type="file"
                required
                onChange={(e) => setRevisionFile(e.target.files?.[0] ?? null)}
                className="text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
              />
              <button
                type="submit"
                disabled={busy || !revisionFile}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Upload revision
              </button>
            </div>
            <FileInputHint />
          </form>
        )}

        {isReviewer && current?.status === 'SUBMITTED' && (
          <form onSubmit={handleRequestChanges} className="mt-6 border-t border-gray-100 pt-4">
            <h2 className="text-sm font-medium text-gray-900">Request changes</h2>
            <textarea
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Explain what needs to change…"
              rows={3}
              className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
            <button
              type="submit"
              disabled={busy || !comment.trim()}
              className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 shadow-sm hover:bg-amber-100 disabled:opacity-50"
            >
              Request changes
            </button>
          </form>
        )}
      </div>

      {current && (
        <section className="mt-6">
          <h2 className="text-sm font-semibold text-gray-900">Content &amp; comments</h2>
          <div className="mt-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            {!versionContent && <p className="text-sm text-gray-500">Loading…</p>}

            {versionContent?.format === 'unsupported' && (
              <p className="text-sm text-gray-500">
                No inline preview for this file type — comments apply to the whole version.
              </p>
            )}

            {versionContent && versionContent.format !== 'unsupported' && versionContent.content !== null && (
              <AnnotatedContent
                comments={inlineComments}
                canAnnotate={isReviewer && current.status !== 'APPROVED'}
                busy={commentBusy}
                onCreate={handleCreateAnchoredComment}
              >
                {versionContent.format === 'text' && versionContent.content}
                {versionContent.format === 'markdown' && <ReactMarkdown>{versionContent.content}</ReactMarkdown>}
                {versionContent.format === 'html' && (
                  <div dangerouslySetInnerHTML={{ __html: versionContent.content }} />
                )}
              </AnnotatedContent>
            )}

            {isReviewer && current.status !== 'APPROVED' && versionContent?.format === 'unsupported' && (
              <form onSubmit={handleCreateVersionLevelComment} className="mt-3">
                <textarea
                  value={versionLevelComment}
                  onChange={(e) => setVersionLevelComment(e.target.value)}
                  placeholder="Add a comment on this version…"
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
                <button
                  type="submit"
                  disabled={commentBusy || !versionLevelComment.trim()}
                  className="mt-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
                >
                  Add comment
                </button>
              </form>
            )}

            {inlineComments.some((c) => c.anchorQuote === null) && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  General comments
                </h3>
                <ul className="mt-2 space-y-2">
                  {inlineComments
                    .filter((c) => c.anchorQuote === null)
                    .map((c) => (
                      <li key={c.id} className="text-sm text-gray-700">
                        {c.body} <span className="text-xs text-gray-400">— {c.author.email}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Version history</h2>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-medium">Version</th>
                <th className="px-4 py-2 font-medium">Uploaded by</th>
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {versions.map((v) => (
                <tr key={v.id}>
                  <td className="px-4 py-2 font-medium text-gray-900">
                    v{v.versionNumber}
                    <span className="ml-2 text-xs font-normal text-gray-400">{formatBytes(v.size)}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{v.uploadedBy.email}</td>
                  <td className="px-4 py-2 text-gray-600">{formatDateTime(v.uploadedAt)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => void handleDownload(v.id, v.fileName)}
                      className="text-xs font-medium text-gray-500 underline hover:text-gray-900"
                    >
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold text-gray-900">Audit trail</h2>
        <ul className="mt-2 space-y-1 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          {audit.map((event) => (
            <li key={event.id} className="flex items-center justify-between text-sm">
              <span className="text-gray-800">
                {auditActionLabel(event.action)} <span className="text-gray-400">· {event.actor.email}</span>
              </span>
              <span className="text-xs text-gray-400">{formatDateTime(event.timestamp)}</span>
            </li>
          ))}
          {audit.length === 0 && <li className="text-sm text-gray-500">No activity yet.</li>}
        </ul>
      </section>
    </AppShell>
  )
}
