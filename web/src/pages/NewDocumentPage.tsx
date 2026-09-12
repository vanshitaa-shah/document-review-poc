import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { AppShell } from '../components/AppShell'
import { ErrorMessage } from '../components/ErrorMessage'
import { FileInputHint } from '../components/FileInputHint'

interface Category {
  id: string
  name: string
}

export function NewDocumentPage() {
  const { token } = useAuth()
  const navigate = useNavigate()

  const [categories, setCategories] = useState<Category[]>([])
  const [title, setTitle] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    void api
      .get<{ items: Category[] }>('/categories', token)
      .then((res) => {
        setCategories(res.items)
        setCategoryId((current) => current || (res.items[0]?.id ?? ''))
      })
      .catch(setError)
  }, [token])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) {
      setError(new Error('A file is required'))
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('categoryId', categoryId)
      formData.append('file', file)
      const document = await api.postForm<{ id: string }>('/documents', formData, token)
      navigate(`/documents/${document.id}`)
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-gray-900">New document</h1>
        <p className="mt-1 text-sm text-gray-500">
          Uploads version 1 as a draft. Submit it for review from the document page when ready.
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm"
        >
          <ErrorMessage error={error} />

          <div className="space-y-1">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="category" className="block text-sm font-medium text-gray-700">
              Category
            </label>
            <select
              id="category"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              {categories.length === 0 && <option value="">No categories available</option>}
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="file" className="block text-sm font-medium text-gray-700">
              File
            </label>
            <input
              id="file"
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
            <FileInputHint />
          </div>

          <button
            type="submit"
            disabled={submitting || categories.length === 0}
            className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
          >
            {submitting ? 'Uploading…' : 'Upload document'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
