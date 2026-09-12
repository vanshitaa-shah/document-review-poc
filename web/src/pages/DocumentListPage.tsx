import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { ErrorMessage } from '../components/ErrorMessage'
import { StatusBadge } from '../components/StatusBadge'
import { AppShell } from '../components/AppShell'

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

export function DocumentListPage() {
  const { token, user } = useAuth()
  const [pages, setPages] = useState<DocumentSummary[][]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function loadPage(after: string | null) {
    setLoading(true)
    setError(null)
    try {
      const query = after ? `?cursor=${encodeURIComponent(after)}` : ''
      const res = await api.get<DocumentListResponse>(`/documents${query}`, token)
      setPages((prev) => (after ? [...prev, res.items] : [res.items]))
      setCursor(res.nextCursor)
      setHasMore(res.nextCursor !== null)
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

  const documents = pages.flat()

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">Everything visible to your categories.</p>
        </div>
        {user?.role === 'AUTHOR' && (
          <Link
            to="/documents/new"
            className="rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700"
          >
            New document
          </Link>
        )}
      </div>

      <ErrorMessage error={error} />

      <ul className="mt-4 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {documents.map((doc) => (
          <li key={doc.id}>
            <Link
              to={`/documents/${doc.id}`}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                <p className="text-xs text-gray-500">{doc.category.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {doc.currentVersion ? `v${doc.currentVersion.versionNumber}` : 'no version'}
                </span>
                {doc.currentVersion && <StatusBadge status={doc.currentVersion.status} />}
              </div>
            </Link>
          </li>
        ))}
        {documents.length === 0 && !loading && (
          <li className="px-4 py-10 text-center text-sm text-gray-500">No documents yet.</li>
        )}
      </ul>

      {hasMore && (
        <button
          onClick={() => void loadPage(cursor)}
          disabled={loading}
          className="mt-4 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </AppShell>
  )
}
