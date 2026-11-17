# Phase 12 — Live notifications

**Post-plan** · Depends on: 09

## Goal
The author and reviewers hear about workflow changes as they happen, without refreshing.

## Tasks

**Persist — same transaction as the action (like audit rows)**
- `notifications` table: one row per (event, recipient), with `read_at`
- `lib/notify.ts` writes the rows on the action's own `tx`; recipients are resolved by
  category membership in the query, the actor is never notified of their own action
- A rolled-back or retried (`40001`) attempt leaves no rows

**Publish — only after commit**
- Controllers return the created rows out of the transaction and call
  `publishNotifications()` (`lib/events.ts`, in-process emitter) once it has committed

**Deliver**
- `GET /notifications/stream` — SSE, scoped to the caller's own user id
- `GET /notifications` (cursor-paginated, `unreadCount`), `POST /notifications/:id/read`,
  `POST /notifications/read-all`
- No replay on the server: a reconnecting client refetches the list

**Who hears what**

| Event | Recipients |
|---|---|
| Submit (first) | Reviewers in the document's category |
| Submit (revision) | Reviewers who acted on the old version → `VERSION_SUPERSEDED`; other category reviewers → `SUBMITTED` |
| Approve | Author + other category reviewers |
| Request changes / inline comment | Author |
| Reply | Author + everyone already in the thread |

**UI**
- `NotificationsProvider` opens one `EventSource` per session; bell with unread badge,
  dropdown, toast
- Document detail, document list and review queue refetch when an event arrives

## Done when
- A reviewer's open document updates when the author submits a revision
- The author is told when a reviewer requests changes or approves
- A stale (409) action writes and publishes nothing
- Two simultaneous approvals produce exactly one `APPROVED` notification per recipient

## Not covered
- Email/Slack delivery; multi-instance fan-out (needs `LISTEN/NOTIFY`); per-user mute settings
