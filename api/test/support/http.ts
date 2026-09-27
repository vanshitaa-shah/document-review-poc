import request from 'supertest'
import { app } from '../../src/app.ts'

export interface UploadedDocument {
  id: string
  currentVersion: { id: string; versionNumber: number; status: string }
}

interface UploadOptions {
  title: string
  categoryId: string
  fileName?: string
  content?: Buffer | string
}

interface RevisionOptions {
  fileName?: string
  content?: Buffer | string
}

export function authCookie(token: string): string {
  return `auth_token=${token}`
}

/** The raw `Set-Cookie` entry for `auth_token`, attributes (HttpOnly, SameSite, ...) and all. */
export function findAuthCookie(res: request.Response): string | undefined {
  const cookies = res.headers['set-cookie'] as unknown as string[] | undefined
  return cookies?.find((c) => c.startsWith('auth_token='))
}

/** Pulls just the `name=value` pair off a login response, the way a browser would carry it forward. */
export function extractAuthCookie(res: request.Response): string {
  const cookie = findAuthCookie(res)
  if (!cookie) throw new Error('no auth_token cookie in response')
  return cookie.split(';')[0]!
}

function toBuffer(content: Buffer | string): Buffer {
  return Buffer.isBuffer(content) ? content : Buffer.from(content)
}

export function uploadDocument(token: string, opts: UploadOptions): request.Test {
  return request(app)
    .post('/documents')
    .set('Cookie', authCookie(token))
    .field('title', opts.title)
    .field('categoryId', opts.categoryId)
    .attach('file', toBuffer(opts.content ?? 'v1 content'), opts.fileName ?? 'v1.txt')
}

export function submitDocument(token: string, documentId: string): request.Test {
  return request(app).post(`/documents/${documentId}/submit`).set('Cookie', authCookie(token))
}

export function uploadRevision(token: string, documentId: string, opts: RevisionOptions = {}): request.Test {
  return request(app)
    .post(`/documents/${documentId}/versions`)
    .set('Cookie', authCookie(token))
    .attach('file', toBuffer(opts.content ?? 'v2 content'), opts.fileName ?? 'v2.txt')
}

export function approveVersion(token: string, versionId: string): request.Test {
  return request(app).post(`/versions/${versionId}/approve`).set('Cookie', authCookie(token))
}

export function requestChanges(token: string, versionId: string, comment?: string): request.Test {
  return request(app)
    .post(`/versions/${versionId}/request-changes`)
    .set('Cookie', authCookie(token))
    .send(comment === undefined ? {} : { comment })
}

/** Uploads and returns the created document's body — throws away the raw supertest response. */
export async function createDocument(token: string, opts: UploadOptions): Promise<UploadedDocument> {
  const res = await uploadDocument(token, opts)
  return res.body as UploadedDocument
}

/** Uploads a document and immediately submits it, as most review/approval tests need as a starting point. */
export async function createSubmittedDocument(authorToken: string, opts: UploadOptions): Promise<UploadedDocument> {
  const doc = await createDocument(authorToken, opts)
  await submitDocument(authorToken, doc.id)
  return doc
}
