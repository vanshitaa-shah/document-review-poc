import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../lib/apiClient'
import { useAuth } from '../lib/auth'
import { Role } from '../lib/constants'
import type { NewAnchoredComment, StoredComment } from '../components/AnnotatedContent'

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

export interface CurrentVersion {
  id: string
  versionNumber: number
  status: string
  fileName: string
  approval: ApprovalInfo | null
}

export interface DocumentDetail {
  id: string
  title: string
  authorId: string
  category: CategoryRef
  currentVersion: CurrentVersion | null
}

export interface VersionContent {
  format: 'text' | 'markdown' | 'html' | 'unsupported'
  content: string | null
}

// All the data-fetching and mutation logic for the Overview tab, kept out of
// the page component so DocumentDetailPage stays pure composition/JSX.
export function useDocumentDetail(id: string | undefined) {
  const { user } = useAuth()

  const [document, setDocument] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [actionError, setActionError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)

  const [revisionFile, setRevisionFile] = useState<File | null>(null)
  const [comment, setComment] = useState('')

  const [versionContent, setVersionContent] = useState<VersionContent | null>(null)
  const [inlineComments, setInlineComments] = useState<StoredComment[]>([])
  const [commentBusy, setCommentBusy] = useState(false)

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
        const doc = await api.get<DocumentDetail>(`/documents/${id}`)
        setDocument(doc)
      } catch (err) {
        if (!opts.silent) setError(err)
      } finally {
        setLoading(false)
      }
    },
    [id],
  )

  useEffect(() => {
    void load()
  }, [load])

  const currentVersionId = document?.currentVersion?.id ?? null

  const loadComments = useCallback(async () => {
    if (!currentVersionId) return
    try {
      const [contentRes, commentsRes] = await Promise.all([
        api.get<VersionContent>(`/versions/${currentVersionId}/content`),
        api.get<{ items: StoredComment[] }>(`/versions/${currentVersionId}/comments`),
      ])
      setVersionContent(contentRes)
      setInlineComments(commentsRes.items)
    } catch {
      // Non-fatal — the rest of the page still works without inline content/comments.
      setVersionContent(null)
      setInlineComments([])
    }
  }, [currentVersionId])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const isAuthor = document?.authorId === user?.id
  const isReviewer = user?.role === Role.REVIEWER
  const current = document?.currentVersion ?? null

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
    await runAction(() => api.post(`/documents/${id}/submit`))
  }

  async function handleUploadRevision(e: FormEvent) {
    e.preventDefault()
    if (!revisionFile) return
    await runAction(async () => {
      const formData = new FormData()
      formData.append('file', revisionFile)
      await api.postForm(`/documents/${id}/versions`, formData)
      setRevisionFile(null)
    })
  }

  async function handleApprove() {
    if (!current) return
    await runAction(() => api.post(`/versions/${current.id}/approve`))
  }

  async function handleRequestChanges(e: FormEvent) {
    e.preventDefault()
    if (!current || !comment.trim()) return
    await runAction(async () => {
      await api.post(`/versions/${current.id}/request-changes`, { comment })
      setComment('')
    })
  }

  async function handleCreateAnchoredComment(payload: NewAnchoredComment) {
    if (!current) return
    setCommentBusy(true)
    try {
      await api.post(`/versions/${current.id}/comments`, payload)
      await loadComments()
    } finally {
      setCommentBusy(false)
    }
  }

  async function handleDownload(versionId: string, fileName: string) {
    try {
      const res = await fetch(`/versions/${versionId}/download`, { credentials: 'include' })
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

  return {
    document,
    loading,
    error,
    actionError,
    busy,
    isAuthor,
    isReviewer,
    current,
    revisionFile,
    setRevisionFile,
    comment,
    setComment,
    versionContent,
    inlineComments,
    commentBusy,
    handleSubmit,
    handleUploadRevision,
    handleApprove,
    handleRequestChanges,
    handleCreateAnchoredComment,
    handleDownload,
  }
}
