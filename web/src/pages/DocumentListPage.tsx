import { useEffect, useState } from 'react'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { ErrorMessage } from '../components/ErrorMessage'

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
  const { token, user, logout } = useAuth()
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
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900">Documents</h1>
        <div className="flex items-center gap-3 text-sm text-gray-600">
          <span>{user?.email}</span>
          <button onClick={logout} className="text-gray-500 underline">
            Sign out
          </button>
        </div>
      </div>

      <ErrorMessage error={error} />

      <ul className="mt-4 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-900">{doc.title}</p>
              <p className="text-xs text-gray-500">{doc.category.name}</p>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>{doc.currentVersion ? `v${doc.currentVersion.versionNumber}` : 'no version'}</p>
              <p>{doc.currentVersion?.status ?? '—'}</p>
            </div>
          </li>
        ))}
        {documents.length === 0 && !loading && (
          <li className="px-4 py-6 text-center text-sm text-gray-500">No documents yet.</li>
        )}
      </ul>

      {hasMore && (
        <button
          onClick={() => void loadPage(cursor)}
          disabled={loading}
          className="mt-4 rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  )
}
