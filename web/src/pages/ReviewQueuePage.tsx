import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { AppShell } from '../components/AppShell'
import { ErrorMessage } from '../components/ErrorMessage'
import { formatDateTime } from '../lib/format'

interface QueueItem {
  id: string
  versionNumber: number
  uploadedAt: string
  documentId: string
  document: {
    title: string
    category: { id: string; name: string }
  }
  uploadedBy: { id: string; email: string }
}

interface QueueResponse {
  items: QueueItem[]
  nextCursor: string | null
}

export function ReviewQueuePage() {
  const { token } = useAuth()
  const [pages, setPages] = useState<QueueItem[][]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function loadPage(after: string | null) {
    setLoading(true)
    setError(null)
    try {
      const query = after ? `?cursor=${encodeURIComponent(after)}` : ''
      const res = await api.get<QueueResponse>(`/reviews/queue${query}`, token)
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

  const items = pages.flat()

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Review queue</h1>
        <p className="text-sm text-gray-500">Submitted versions waiting on your categories.</p>
      </div>

      <ErrorMessage error={error} />

      <ul className="mt-4 divide-y divide-gray-200 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={`/documents/${item.documentId}`}
              className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-gray-50"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{item.document.title}</p>
                <p className="text-xs text-gray-500">
                  {item.document.category.name} · v{item.versionNumber} · {item.uploadedBy.email}
                </p>
              </div>
              <span className="text-xs text-gray-400">{formatDateTime(item.uploadedAt)}</span>
            </Link>
          </li>
        ))}
        {items.length === 0 && !loading && (
          <li className="px-4 py-10 text-center text-sm text-gray-500">Nothing waiting on review.</li>
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
