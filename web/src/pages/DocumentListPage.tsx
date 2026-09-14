import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { ErrorMessage } from '../components/ErrorMessage'
import { StatusBadge } from '../components/StatusBadge'
import { AppShell } from '../components/AppShell'
import { FileIcon } from '../components/Icons'
import { DOCUMENT_LIST_PAGE_SIZE, Role, ROUTES } from '../lib/constants'
import { VERSION_STATUS_OPTIONS } from '../lib/format'
import { btnDefault, btnPrimary, card, fainterText, mutedText, pageHeading, select } from '../lib/ui'

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

interface CategoryOption {
  id: string
  name: string
}

const ALL_STATUSES = ''
const ALL_CATEGORIES = ''

export function DocumentListPage() {
  const { token, user } = useAuth()
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES)
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES)
  const [cursor, setCursor] = useState<string | null>(null)
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  async function loadPage(target: string | null) {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: String(DOCUMENT_LIST_PAGE_SIZE) })
      if (target) params.set('cursor', target)
      if (statusFilter) params.set('status', statusFilter)
      if (categoryFilter) params.set('categoryId', categoryFilter)

      const res = await api.get<DocumentListResponse>(`/documents?${params.toString()}`, token)
      setDocuments(res.items)
      setNextCursor(res.nextCursor)
    } catch (err) {
      setError(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void api
      .get<{ items: CategoryOption[] }>('/categories', token)
      .then((res) => setCategories(res.items))
      .catch(() => setCategories([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-fetch page 1 whenever a filter changes — a filter change invalidates
  // whatever cursor position we were at.
  useEffect(() => {
    setCursor(null)
    setCursorHistory([])
    void loadPage(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter])

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
  const hasActiveFilters = statusFilter !== ALL_STATUSES || categoryFilter !== ALL_CATEGORIES

  function clearFilters() {
    setStatusFilter(ALL_STATUSES)
    setCategoryFilter(ALL_CATEGORIES)
  }

  return (
    <AppShell>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className={pageHeading}>Documents</h1>
          <p className={`mt-0.5 ${mutedText}`}>
            {user?.role === Role.AUTHOR ? 'Documents you authored.' : 'Everything visible to your categories.'}
          </p>
        </div>
        {user?.role === Role.AUTHOR && (
          <Link to={ROUTES.newDocument} className={btnPrimary}>
            New document
          </Link>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="status-filter" className="mb-1 block text-xs font-medium text-[#59636e]">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={`${select} w-44`}
          >
            <option value={ALL_STATUSES}>All statuses</option>
            {VERSION_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="category-filter" className="mb-1 block text-xs font-medium text-[#59636e]">
            Category
          </label>
          <select
            id="category-filter"
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

        {hasActiveFilters && (
          <button onClick={clearFilters} className={btnDefault}>
            Clear filters
          </button>
        )}
      </div>

      <ErrorMessage error={error} />

      <div className={`mt-3 overflow-hidden ${card}`}>
        <div className="flex items-center justify-between border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#59636e]">
          <span>
            {documents.length} document{documents.length === 1 ? '' : 's'} on this page
          </span>
        </div>
        <ul className="divide-y divide-[#d8dee4]">
          {documents.map((doc) => (
            <li key={doc.id}>
              <Link
                to={ROUTES.documentDetail(doc.id)}
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
            <li className={`px-4 py-10 text-center ${mutedText}`}>
              {hasActiveFilters ? 'No documents match these filters.' : 'No documents yet.'}
            </li>
          )}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className={fainterText}>Page {page}</span>
        <div className="flex gap-2">
          <button onClick={goPrevious} disabled={loading || cursorHistory.length === 0} className={btnDefault}>
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
