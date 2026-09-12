import type { Options } from 'pino-http'

// JSON to stdout always; when OTEL_EXPORTER_OTLP_LOGS_ENDPOINT is set (docker-compose
// wires it to the openobserve container), logs are additionally shipped over OTLP.
// pino-opentelemetry-transport reads the standard OTEL_EXPORTER_OTLP_LOGS_* env vars
// itself, so there is nothing to configure here beyond turning it on.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT

export const httpLoggerOptions: Options = {
  level: process.env.LOG_LEVEL ?? 'info',
  // A bearer token in the Authorization header must never land in a log line.
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie'],
    censor: '[redacted]',
  },
  ...(otlpEndpoint && {
    transport: {
      targets: [
        { target: 'pino/file', options: { destination: 1 } },
        {
          target: 'pino-opentelemetry-transport',
          options: {
            resourceAttributes: {
              'service.name': process.env.OTEL_SERVICE_NAME ?? 'document-review-api',
            },
          },
        },
      ],
    },
  }),
}
