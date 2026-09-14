import { Avatar } from './Avatar'
import { btnDefault, fainterText, textarea } from '../lib/ui'
import type { StoredComment } from './AnnotatedContent'

// Comments with no anchor (quote/offset) — apply to the whole version rather
// than a highlighted passage. Shown under the content preview regardless of
// file format, so a reviewer always has a way to leave feedback.
export function GeneralComments({
  comments,
  canCreate,
  busy,
  value,
  onChange,
  onSubmit,
}: {
  comments: StoredComment[]
  canCreate: boolean
  busy: boolean
  value: string
  onChange: (value: string) => void
  onSubmit: (e: React.FormEvent) => void
}) {
  const general = comments.filter((c) => c.anchorQuote === null)

  return (
    <div className="mt-4 border-t border-[#d8dee4] pt-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[#59636e]">General comments</h3>
      <p className={`mt-1 ${fainterText}`}>Not tied to a specific passage — applies to the whole version.</p>

      <ul className="mt-2 space-y-2">
        {general.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm text-[#1f2328]">
            <Avatar email={c.author.email} size="sm" />
            <span>
              {c.body} <span className={fainterText}>— {c.author.email}</span>
            </span>
          </li>
        ))}
      </ul>

      {canCreate && (
        <form onSubmit={onSubmit} className="mt-3">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Add a general comment on this version…"
            rows={2}
            className={textarea}
          />
          <button type="submit" disabled={busy || !value.trim()} className={`mt-2 ${btnDefault}`}>
            Add comment
          </button>
        </form>
      )}
    </div>
  )
}
