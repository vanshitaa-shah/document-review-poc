import { Avatar } from './Avatar'
import { ClockIcon } from './Icons'
import { auditActionLabel, formatDateTime } from '../lib/format'
import { card, fainterText, mutedText } from '../lib/ui'

interface UserRef {
  email: string
}

export interface AuditRow {
  id: string
  action: string
  timestamp: string
  metadata: unknown
  actor: UserRef
}

// The only audit action that currently carries reviewer-written text.
function auditComment(event: AuditRow): string | null {
  if (event.action !== 'CHANGES_REQUESTED') return null
  const metadata = event.metadata
  if (!metadata || typeof metadata !== 'object' || !('comment' in metadata)) return null
  const { comment } = metadata as { comment: unknown }
  return typeof comment === 'string' ? comment : null
}

// Chronological audit trail on the History tab. A CHANGES_REQUESTED event
// shows the reviewer's written comment inline, attributed to that reviewer —
// visible to author and reviewer alike, since both fetch the same endpoint.
export function AuditTrailList({ events }: { events: AuditRow[] }) {
  return (
    <ul className={`mt-2 space-y-3 p-4 ${card}`}>
      {events.map((event) => {
        const comment = auditComment(event)
        return (
          <li key={event.id} className="text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[#1f2328]">
                <ClockIcon className="h-3.5 w-3.5 flex-shrink-0 text-[#6e7781]" />
                {auditActionLabel(event.action)}
                <span className={fainterText}>· {event.actor.email}</span>
              </span>
              <span className={`flex-shrink-0 ${fainterText}`}>{formatDateTime(event.timestamp)}</span>
            </div>
            {comment && (
              <div className="ml-5 mt-1.5 flex items-start gap-2 rounded-md border border-[#d8dee4] bg-[#f6f8fa] px-3 py-2">
                <Avatar email={event.actor.email} size="sm" />
                <p className="text-[#1f2328]">
                  {comment} <span className={fainterText}>— {event.actor.email}</span>
                </p>
              </div>
            )}
          </li>
        )
      })}
      {events.length === 0 && <li className={mutedText}>No activity yet.</li>}
    </ul>
  )
}
