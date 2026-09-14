import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/apiClient'
import { AppShell } from '../components/AppShell'
import { ErrorMessage } from '../components/ErrorMessage'
import { Avatar } from '../components/Avatar'
import { FileIcon } from '../components/Icons'
import { ROUTES } from '../lib/constants'
import { formatDateTime } from '../lib/format'
import { btnDefault, card, fainterText, mutedText, pageHeading, select } from '../lib/ui'

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

interface CategoryOption {
  id: string
  name: string
}

const ALL_CATEGORIES = ''

export function ReviewQueuePage() {
  const [pages, setPages] = useState<QueueItem[][]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function loadPage(after: string | null) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (after) params.set('cursor', after)
      if (categoryFilter) params.set('categoryId', categoryFilter)

      const res = await api.get<QueueResponse>(`/reviews/queue?${params.toString()}`)
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
    void api
      .get<{ items: CategoryOption[] }>('/categories')
      .then((res) => setCategories(res.items))
      .catch(() => setCategories([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setCursor(null)
    void loadPage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter])

  const items = pages.flat()

  return (
    <AppShell>
      <div className="mb-5">
        <h1 className={pageHeading}>Review queue</h1>
        <p className={`mt-0.5 ${mutedText}`}>Submitted versions waiting on your categories, newest first.</p>
      </div>

      <div className="mb-4">
        <label htmlFor="queue-category-filter" className="mb-1 block text-xs font-medium text-[#59636e]">
          Category
        </label>
        <select
          id="queue-category-filter"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className={`${select} w-44`}
        >
          <option value={ALL_CATEGORIES}>All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <ErrorMessage error={error} />

      <div className={`mt-3 overflow-hidden ${card}`}>
        <ul className="divide-y divide-[#d8dee4]">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={ROUTES.documentDetail(item.documentId)}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#f6f8fa]"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <FileIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#59636e]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#0969da] hover:underline">
                      {item.document.title}
                    </p>
                    <p className={`flex items-center gap-1.5 ${fainterText}`}>
                      <Avatar email={item.uploadedBy.email} size="sm" />
                      {item.document.category.name} · v{item.versionNumber} · {item.uploadedBy.email}
                    </p>
                  </div>
                </div>
                <span className={`flex-shrink-0 ${fainterText}`}>{formatDateTime(item.uploadedAt)}</span>
              </Link>
            </li>
          ))}
          {items.length === 0 && !loading && (
            <li className={`px-4 py-10 text-center ${mutedText}`}>Nothing waiting on review.</li>
          )}
        </ul>
      </div>

      {hasMore && (
        <button onClick={() => void loadPage(cursor)} disabled={loading} className={`mt-4 ${btnDefault}`}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </AppShell>
  )
}
