# OpenObserve log shipping — verification

Phase 06 "done when": logs are searchable in the OpenObserve UI.

## Setup

`docker compose up` brings up `openobserve` alongside `api` and `postgres`. The api
container gets `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` pointing at OpenObserve's built-in
OTLP HTTP receiver (`http://openobserve:5080/api/default/v1/logs`) and a Basic-auth
header for the seeded root user. `pino-opentelemetry-transport` picks up those
standard `OTEL_EXPORTER_OTLP_LOGS_*` env vars itself — see `src/lib/logger.ts`.

## Verification steps run

1. `docker compose up -d --build` — all three containers healthy.
2. Hit the API a few times (`/health`, `/auth/login`, `/documents` with a bearer
   token) to generate request-completed log lines.
3. Queried OpenObserve directly:
   ```sh
   curl -u 'admin@example.com:Complexpass#123' -X POST \
     http://localhost:5080/api/default/_search \
     -H 'Content-Type: application/json' \
     -d '{"query":{"sql":"select * from \"default\" limit 10",
          "start_time": <last-hour-in-micros>, "end_time": <now-in-micros>, "size":10}}'
   ```
4. Confirmed hits included the real app's request logs — `service_name:
   "document-review-api"`, `req_id`, `req_method`, `req_url`, `res_statuscode` — and
   that the `POST /documents` request's `req_headers_authorization` came through as
   `"[redacted]"`, not the actual bearer token.

Note: the `/api/default/streams` stats endpoint (`doc_num`) lags well behind what's
actually queryable — it stayed at `0` throughout even once `_search` was returning
real hits. Use `_search`, not the stats endpoint, to check whether logs landed.
