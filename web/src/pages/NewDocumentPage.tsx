import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { AppShell } from '../components/AppShell'
import { ErrorMessage } from '../components/ErrorMessage'
import { FileInputHint } from '../components/FileInputHint'
import { ROUTES } from '../lib/constants'
import { btnPrimary, card, input, label, pageHeading, mutedText, select } from '../lib/ui'

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
      navigate(ROUTES.documentDetail(document.id))
    } catch (err) {
      setError(err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-lg">
        <h1 className={pageHeading}>New document</h1>
        <p className={`mt-1 ${mutedText}`}>
          Uploads version 1 as a draft. Submit it for review from the document page when ready.
        </p>

        <form onSubmit={handleSubmit} className={`mt-6 space-y-4 p-6 ${card}`}>
          <ErrorMessage error={error} />

          <div className="space-y-1">
            <label htmlFor="title" className={label}>
              Title
            </label>
            <input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
          </div>

          <div className="space-y-1">
            <label htmlFor="category" className={label}>
              Category
            </label>
            <select
              id="category"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={select}
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
            <label htmlFor="file" className={label}>
              File
            </label>
            <input
              id="file"
              type="file"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-[#1f2328] file:mr-3 file:rounded-md file:border-0 file:bg-[#f6f8fa] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#24292f] hover:file:bg-[#eaeef2]"
            />
            <FileInputHint />
          </div>

          <button type="submit" disabled={submitting || categories.length === 0} className={`${btnPrimary} w-full py-2`}>
            {submitting ? 'Uploading…' : 'Upload document'}
          </button>
        </form>
      </div>
    </AppShell>
  )
}
