import { useEffect, useState, type ReactNode } from 'react'
import { Annotorious, useAnnotator } from '@annotorious/react'
import {
  TextAnnotationPopup,
  TextAnnotator,
  type RecogitoTextAnnotator,
  type TextAnnotation,
} from '@recogito/react-text-annotator'
import { ErrorMessage } from './ErrorMessage'

export interface StoredComment {
  id: string
  body: string
  anchorQuote: string | null
  anchorStart: number | null
  anchorEnd: number | null
  author: { id: string; email: string }
}

export interface NewAnchoredComment {
  body: string
  anchorQuote: string
  anchorPrefix: string
  anchorSuffix: string
  anchorStart: number
  anchorEnd: number
}

const CONTEXT_CHARS = 30

// Highlights already-saved comments by feeding recogito the same {quote, start, end}
// anchor we stored — it re-locates the range in the current DOM, which is why this
// keeps working across reloads as long as the rendered content doesn't change.
function SyncAnnotations({ comments }: { comments: StoredComment[] }) {
  const anno = useAnnotator<RecogitoTextAnnotator>()

  useEffect(() => {
    if (!anno) return

    const annotations: TextAnnotation[] = comments
      .filter((c) => c.anchorQuote !== null && c.anchorStart !== null && c.anchorEnd !== null)
      .map((c) => ({
        id: c.id,
        bodies: [{ id: `${c.id}-body`, annotation: c.id, purpose: 'commenting', value: c.body }],
        target: {
          annotation: c.id,
          selector: [{ quote: c.anchorQuote as string, start: c.anchorStart as number, end: c.anchorEnd as number }],
        },
      }))

    anno.setAnnotations(annotations, true)
  }, [anno, comments])

  return null
}

// The popup recogito shows on a fresh selection (to write a new comment) or on
// clicking an existing highlight (to read the comment already on it).
function CommentPopup({
  annotation,
  editable,
  comments,
  busy,
  onCreate,
}: {
  annotation: TextAnnotation
  editable?: boolean
  comments: StoredComment[]
  busy: boolean
  onCreate: (comment: NewAnchoredComment) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<unknown>(null)

  const existing = comments.find((c) => c.id === annotation.id)

  if (existing) {
    return (
      <div className="w-64 rounded-md border border-gray-200 bg-white p-3 text-sm shadow-lg">
        <p className="text-gray-800">{existing.body}</p>
        <p className="mt-2 text-xs text-gray-400">{existing.author.email}</p>
      </div>
    )
  }

  if (!editable) {
    return null
  }

  const selector = annotation.target.selector[0]

  async function handleSave() {
    if (!body.trim() || !selector) return
    setError(null)
    try {
      const quote = selector.quote
      const container = document.querySelector('[data-annotated-content]')
      const fullText = container?.textContent ?? ''
      const prefix = fullText.slice(Math.max(0, selector.start - CONTEXT_CHARS), selector.start)
      const suffix = fullText.slice(selector.end, selector.end + CONTEXT_CHARS)

      await onCreate({
        body,
        anchorQuote: quote,
        anchorPrefix: prefix,
        anchorSuffix: suffix,
        anchorStart: selector.start,
        anchorEnd: selector.end,
      })
      setBody('')
    } catch (err) {
      setError(err)
    }
  }

  return (
    <div className="w-72 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
      <ErrorMessage error={error} />
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        rows={3}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      <button
        onClick={() => void handleSave()}
        disabled={busy || !body.trim()}
        className="mt-2 w-full rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Saving…' : 'Save comment'}
      </button>
    </div>
  )
}

// Wraps rendered version content with recogito's selection/highlight layer.
// `canAnnotate` gates *creating* new highlights (reviewers only) — everyone still
// sees existing ones via SyncAnnotations, which doesn't check that flag.
export function AnnotatedContent({
  comments,
  canAnnotate,
  busy,
  onCreate,
  children,
}: {
  comments: StoredComment[]
  canAnnotate: boolean
  busy: boolean
  onCreate: (comment: NewAnchoredComment) => Promise<void>
  children: ReactNode
}) {
  return (
    <Annotorious>
      <TextAnnotator annotatingEnabled={canAnnotate}>
        <div data-annotated-content className="prose prose-sm max-w-none whitespace-pre-wrap">
          {children}
        </div>
      </TextAnnotator>
      <SyncAnnotations comments={comments} />
      <TextAnnotationPopup
        popup={(props) => (
          <CommentPopup
            annotation={props.annotation}
            editable={props.editable ?? false}
            comments={comments}
            busy={busy}
            onCreate={onCreate}
          />
        )}
      />
    </Annotorious>
  )
}
