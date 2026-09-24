import pino, { type LoggerOptions } from 'pino'
import type { Options as HttpLoggerOptions } from 'pino-http'

const isProduction = process.env.NODE_ENV === 'production'

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProduction ? 'info' : 'debug'),
  transport: isProduction
    ? { target: 'pino/file', options: { destination: 1 } } // raw JSON to stdout
    : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' } },
  // body is logged below (via customProps) — mask the one field in it that's
  // ever a plaintext secret (auth.schema.ts) so it never lands in logs.
  redact: { paths: ['body.password'], censor: '[REDACTED]' },
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
  // pino-http binds `req` (and its serializer) at request start, before
  // express.json() has parsed the body — so req.body is only ever visible
  // here, since customProps re-runs lazily at response-finish time.
  customProps: (req) => {
    const { user, body } = req as import('express').Request
    return {
      ...(user?.id ? { userId: user.id } : {}),
      ...(body && Object.keys(body).length ? { body } : {}),
    }
  },
  customSuccessMessage: (req, res, responseTime) => `${req.method} ${req.url} -> ${res.statusCode} (${responseTime}ms)`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.url} -> ${res.statusCode} (${err.message})`,
}
