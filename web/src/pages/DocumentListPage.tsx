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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Documents</h1>
          <p className="text-sm text-gray-500">
            {user?.role === 'AUTHOR' ? 'Documents you authored.' : 'Everything visible to your categories.'}
          </p>
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

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Title
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Category
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Version
              </th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {documents.map((doc) => (
              <tr key={doc.id} className="transition-colors hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">
                  <Link to={`/documents/${doc.id}`} className="font-medium text-gray-900 hover:underline">
                    {doc.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{doc.category.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {doc.currentVersion ? `v${doc.currentVersion.versionNumber}` : 'no version'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {doc.currentVersion && <StatusBadge status={doc.currentVersion.status} />}
                </td>
              </tr>
            ))}
            {documents.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500">
                  No documents yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">Page {page}</span>
        <div className="flex gap-2">
          <button
            onClick={goPrevious}
            disabled={loading || cursorHistory.length === 0}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={goNext}
            disabled={loading || !nextCursor}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Next'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}
