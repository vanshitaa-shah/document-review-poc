// Prisma's default interactive-transaction budget (5s timeout, 2s maxWait) is
// tuned for a local, sub-millisecond-latency Postgres. Every transaction in
// this app does several sequential round trips (find, update, create, audit
// inserts, ...); over a remote DB (Neon) at ~275-300ms per round trip — worse
// while queued behind a concurrent transaction's row lock — the defaults
// routinely abort a transaction that was actually fine, just slow. That's a
// different failure (P2028) from a genuine 40001 conflict (see dbRetry.ts)
// and isn't retryable the same way, so it needs real headroom instead.
export const transactionOptions = {
  timeout: 20000,
  maxWait: 10000,
}
