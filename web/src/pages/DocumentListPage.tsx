import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { ErrorMessage } from '../components/ErrorMessage'
import { StatusBadge } from '../components/StatusBadge'
import { AppShell } from '../components/AppShell'
import { FileIcon } from '../components/Icons'
import { btnDefault, card, fainterText, mutedText, pageHeading } from '../lib/ui'

interface DocumentVersionSummary {
  id: string
  versionNumber: number
  status: string
}

interface DocumentSummary {
  id: string
  title: string
  category: { id: string; name: string }
  currentVersion: DocumentVersionSummary | null
}

interface DocumentListResponse {
  items: DocumentSummary[]
  nextCursor: string | null
}

const PAGE_SIZE = 10

export function DocumentListPage() {
  const { token, user } = useAuth()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function loadPage(target: string | null) {
    setLoading(true)
    setError(null)
    try {
      const query = `?limit=${PAGE_SIZE}${target ? `&cursor=${encodeURIComponent(target)}` : ''}`
      const res = await api.get<DocumentListResponse>(`/documents${query}`, token)
      setDocuments(res.items)
      setNextCursor(res.nextCursor)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadPage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goNext() {
    if (!nextCursor) return
    setCursorHistory((prev) => [...prev, cursor])
    setCursor(nextCursor)
    void loadPage(nextCursor)
  }

  function goPrevious() {
    if (cursorHistory.length === 0) return
    const previous = cursorHistory[cursorHistory.length - 1] ?? null
    setCursorHistory((prev) => prev.slice(0, -1))
    setCursor(previous)
    void loadPage(previous)
  }

  const page = cursorHistory.length + 1

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className={pageHeading}>Documents</h1>
          <p className={`mt-0.5 ${mutedText}`}>
            {user?.role === 'AUTHOR' ? 'Documents you authored.' : 'Everything visible to your categories.'}
          </p>
        </div>
        {user?.role === 'AUTHOR' && (
          <Link to="/documents/new" className="inline-flex items-center gap-1.5 rounded-md border border-[#1a7f37] bg-[#1f883d] px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#1a7f37]">
            New document
          </Link>
        )}
      </div>

      <ErrorMessage error={error} />

      <div className={`mt-3 overflow-hidden ${card}`}>
        <div className="flex items-center justify-between border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#59636e]">
          <span>{documents.length} document{documents.length === 1 ? '' : 's'} on this page</span>
        </div>
        <ul className="divide-y divide-[#d8dee4]">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                to={`/documents/${doc.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#f6f8fa]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <FileIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#59636e]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0969da] hover:underline">{doc.title}</p>
                    <p className={fainterText}>{doc.category.name}</p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <span className={fainterText}>
                    {doc.currentVersion ? `v${doc.currentVersion.versionNumber}` : 'no version'}
                  </span>
                  {doc.currentVersion && <StatusBadge status={doc.currentVersion.status} />}
                </div>
              </Link>
            </li>
          ))}
          {documents.length === 0 && !loading && (
            <li className={`px-4 py-10 text-center ${mutedText}`}>No documents yet.</li>
          )}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className={fainterText}>Page {page}</span>
        <div className="flex gap-2">
          <button
            onClick={goPrevious}
            disabled={loading || cursorHistory.length === 0}
            className={btnDefault}
          >
            Previous
          </button>
          <button onClick={goNext} disabled={loading || !nextCursor} className={btnDefault}>
            {loading ? 'Loading…' : 'Next'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}
