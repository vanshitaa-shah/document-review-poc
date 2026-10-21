import { useEffect, useState, type ReactNode } from 'react'
import { Annotorious, useAnnotator } from '@annotorious/react'
import {
  TextAnnotationPopup,
  TextAnnotator,
  type RecogitoTextAnnotator,
  type TextAnnotation,
} from '@recogito/react-text-annotator'
import { Avatar } from './Avatar'
import { ErrorMessage } from './ErrorMessage'
import { formatDateTime } from '../lib/format'
import { fainterText } from '../lib/ui'

export interface StoredComment {
  id: string
  parentId: string | null
  body: string
  createdAt: string
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
      .filter((c) => c.parentId === null && c.anchorQuote !== null && c.anchorStart !== null && c.anchorEnd !== null)
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

// Collapsed to a "Reply" link until clicked, so ten comments don't mean ten open textareas.
function ReplyBox({
  commentId,
  busy,
  onReply,
}: {
  commentId: string
  busy: boolean
  onReply: (commentId: string, body: string) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  const [error, setError] = useState<unknown>(null)

  async function handleReply() {
    if (!body.trim()) return
    setError(null)
    try {
      await onReply(commentId, body)
      setBody('')
      setOpen(false)
    } catch (err) {
      setError(err)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-1 text-xs font-medium text-blue-600 hover:underline">
        Reply
      </button>
    )
  }

  return (
    <div className="mt-2">
      <ErrorMessage error={error} />
      <textarea
        autoFocus
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a reply…"
        rows={2}
        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
      />
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          onClick={() => {
            setOpen(false)
            setBody('')
            setError(null)
          }}
          className="rounded-md px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={() => void handleReply()}
          disabled={busy || !body.trim()}
          className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Reply'}
        </button>
      </div>
    </div>
  )
}

const VISIBLE_REPLIES = 2

// One reviewer's comment with its replies; older replies fold away once a thread grows.
function CommentThread({
  comment,
  replies,
  canReply,
  busy,
  onReply,
}: {
  comment: StoredComment
  replies: StoredComment[]
  canReply: boolean
  busy: boolean
  onReply: (commentId: string, body: string) => Promise<void>
}) {
  const [showAll, setShowAll] = useState(false)
  const hidden = showAll ? 0 : Math.max(0, replies.length - VISIBLE_REPLIES)
  const shownReplies = replies.slice(hidden)

  return (
    <div className="px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Avatar email={comment.author.email} size="sm" />
        <span className="truncate text-xs font-medium text-gray-700">{comment.author.email}</span>
        <span className={`ml-auto flex-shrink-0 text-[11px] ${fainterText}`}>{formatDateTime(comment.createdAt)}</span>
      </div>
      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-gray-800">{comment.body}</p>

      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
          {hidden > 0 && (
            <button onClick={() => setShowAll(true)} className="text-xs font-medium text-blue-600 hover:underline">
              Show {hidden} earlier {hidden === 1 ? 'reply' : 'replies'}
            </button>
          )}
          {shownReplies.map((r) => (
            <div key={r.id}>
              <div className="flex items-center gap-1.5">
                <Avatar email={r.author.email} size="sm" />
                <span className="truncate text-xs font-medium text-gray-700">{r.author.email}</span>
                <span className={`ml-auto flex-shrink-0 text-[11px] ${fainterText}`}>{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-800">{r.body}</p>
            </div>
          ))}
        </div>
      )}

      {canReply && <ReplyBox commentId={comment.id} busy={busy} onReply={onReply} />}
    </div>
  )
}

// Closes the popup on any click outside it and the annotated text.
function CloseOnOutsideClick() {
  const anno = useAnnotator<RecogitoTextAnnotator>()

  useEffect(() => {
    if (!anno) return

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Element | null
      if (target?.closest('[data-comment-popup], [data-annotated-content]')) return
      anno.cancelSelected()
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [anno])

  return null
}

// The popup recogito shows on a fresh selection (to write a new comment) or on
// clicking an existing highlight (to read the comment already on it).
function CommentPopup({
  annotation,
  editable,
  comments,
  canReply,
  busy,
  onCreate,
  onReply,
}: {
  annotation: TextAnnotation
  editable?: boolean
  comments: StoredComment[]
  canReply: boolean
  busy: boolean
  onCreate: (comment: NewAnchoredComment) => Promise<void>
  onReply: (commentId: string, body: string) => Promise<void>
}) {
  const [body, setBody] = useState('')
  const [error, setError] = useState<unknown>(null)

  const clicked = comments.find((c) => c.id === annotation.id)

  // Recogito's hit-test resolves a click to one annotation id, but several
  // comments can share the exact same {start, end} range (two reviewers
  // highlighting the same passage) — show every comment anchored to that
  // range, not just the one id recogito happened to report.
  if (clicked) {
    // Oldest first so a thread reads top to bottom.
    const byTime = (x: StoredComment, y: StoredComment) => x.createdAt.localeCompare(y.createdAt)
    const onSameAnchor = comments
      .filter((c) => c.parentId === null && c.anchorStart === clicked.anchorStart && c.anchorEnd === clicked.anchorEnd)
      .sort(byTime)

    return (
      <div data-comment-popup className="w-80 overflow-hidden rounded-lg border border-gray-200 bg-white text-sm shadow-lg">
        <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
          <p className="truncate text-xs italic text-gray-500">“{clicked.anchorQuote}”</p>
          <p className={`mt-0.5 text-[11px] ${fainterText}`}>
            {onSameAnchor.length} {onSameAnchor.length === 1 ? 'comment' : 'comments'}
          </p>
        </div>
        <div className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
          {onSameAnchor.map((c) => (
            <CommentThread
              key={c.id}
              comment={c}
              replies={comments.filter((r) => r.parentId === c.id).sort(byTime)}
              canReply={canReply}
              busy={busy}
              onReply={onReply}
            />
          ))}
        </div>
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
    <div data-comment-popup className="w-72 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
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
  canReply,
  busy,
  onCreate,
  onReply,
  children,
}: {
  comments: StoredComment[]
  canAnnotate: boolean
  canReply: boolean
  busy: boolean
  onCreate: (comment: NewAnchoredComment) => Promise<void>
  onReply: (commentId: string, body: string) => Promise<void>
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
      <CloseOnOutsideClick />
      <TextAnnotationPopup
        popup={(props) => (
          <CommentPopup
            annotation={props.annotation}
            editable={props.editable ?? false}
            comments={comments}
            canReply={canReply}
            busy={busy}
            onCreate={onCreate}
            onReply={onReply}
          />
        )}
      />
    </Annotorious>
  )
}
