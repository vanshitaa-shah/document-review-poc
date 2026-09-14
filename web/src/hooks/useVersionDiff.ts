import { useEffect, useState } from 'react'
import { diffWords } from 'diff'
import { api } from '../lib/apiClient'

interface VersionContentResponse {
  format: 'text' | 'markdown' | 'html' | 'unsupported'
  content: string | null
}

export interface DiffPart {
  value: string
  added?: boolean
  removed?: boolean
}

// HTML (docx-converted) content is diffed as text, not markup — tags would
// make the diff noisy without adding anything a reviewer needs to see.
function extractDiffableText(res: VersionContentResponse | null): string | null {
  if (!res || res.format === 'unsupported' || res.content === null) return null
  if (res.format === 'html') return res.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return res.content
}

// Word-level diff between a version and its immediate predecessor. Both
// contents come from the same category-access-checked endpoint already used
// by the Overview tab, so there is no new authorization surface here.
export function useVersionDiff(currentVersionId: string | null, previousVersionId: string | null, token: string | null) {
  const [parts, setParts] = useState<DiffPart[] | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    if (!currentVersionId || !previousVersionId) {
      setParts(null)
      setUnsupported(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    setParts(null)
    setUnsupported(false)

    Promise.all([
      api.get<VersionContentResponse>(`/versions/${currentVersionId}/content`, token),
      api.get<VersionContentResponse>(`/versions/${previousVersionId}/content`, token),
    ])
      .then(([current, previous]) => {
        if (cancelled) return
        const currentText = extractDiffableText(current)
        const previousText = extractDiffableText(previous)
        if (currentText === null || previousText === null) {
          setUnsupported(true)
          return
        }
        setParts(diffWords(previousText, currentText))
      })
      .catch((err) => {
        if (!cancelled) setError(err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [currentVersionId, previousVersionId, token])

  return { parts, unsupported, loading, error }
}
