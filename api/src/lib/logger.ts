import pino, { type LoggerOptions } from 'pino'
import type { Options as HttpLoggerOptions } from 'pino-http'

const isProduction = process.env.NODE_ENV === 'production'
// docker-compose points this at the openobserve container.
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  transport: {
    targets: [
      // stdout always gets a line — colorized in dev, raw JSON in production.
      isProduction
        ? { target: 'pino/file', options: { destination: 1 } }
        : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } },
      ...(otlpEndpoint
        ? [{ target: 'pino-opentelemetry-transport', options: { resourceAttributes: { 'service.name': 'document-review-api' } } }]
        : []),
    ],
  },
}

export const logger = pino(options)

// Mounted once in app.ts via pinoHttp(httpLoggerOptions) — gives every request a
// short "METHOD path -> status (Nms)" line instead of pino-http's default full
// req/res header dump.
export const httpLoggerOptions: HttpLoggerOptions = {
  logger,
  serializers: {
    req: (req) => ({ method: req.method, url: req.url }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
  customProps: (req) => {
    const userId = (req as import('express').Request).user?.id
    return userId ? { userId } : {}
  },
  customSuccessMessage: (req, res, responseTime) => `${req.method} ${req.url} -> ${res.statusCode} (${responseTime}ms)`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} -> ${res.statusCode} (${err.message})`,
}
