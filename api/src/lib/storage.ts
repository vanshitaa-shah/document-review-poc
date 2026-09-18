import path from 'node:path'
import { Readable } from 'node:stream'
import { v2 as cloudinary } from 'cloudinary'

// Cloudinary — chosen over R2/S3 because its free tier needs no card on file.
// Uploaded files here are documents, not images, so they go in as `resource_type:
// 'raw'` (an opaque blob, no image processing). Delivery type is plain `upload`
// (Cloudinary's authenticated/signed-delivery path for raw resources turned out
// to be unreliable in practice) — the object id is a fresh `randomUUID()` per
// file (see uploadedFile.ts), so the URL is unguessable even though it isn't
// access-controlled by Cloudinary itself. Every read in this app still goes
// through this app's own auth/category checks before that URL is ever built.
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set`)
  }
  return value
}

cloudinary.config({
  cloud_name: requireEnv('CLOUDINARY_CLOUD_NAME'),
  api_key: requireEnv('CLOUDINARY_API_KEY'),
  api_secret: requireEnv('CLOUDINARY_API_SECRET'),
  secure: true,
})

// Keys are generated as `${uuid}${ext}` (see uploadedFile.ts) — Cloudinary wants
// the extension passed separately as `format`, not embedded in the public_id.
// Every upload in this app has a real extension (see ALLOWED_EXTENSIONS in
// upload.ts), so falling back to an empty format never happens in practice.
function splitKey(key: string): { publicId: string; format: string } {
  const ext = path.extname(key)
  return {
    publicId: ext ? key.slice(0, -ext.length) : key,
    format: ext ? ext.slice(1) : '',
  }
}

export async function putObject(key: string, body: Buffer): Promise<void> {
  const { publicId, format } = splitKey(key)
  await new Promise<void>((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream(
      { resource_type: 'raw', type: 'upload', public_id: publicId, format },
      (err) => (err ? reject(err) : resolve()),
    )
    upload.end(body)
  })
}

function deliveryUrl(key: string): string {
  const { publicId, format } = splitKey(key)
  return cloudinary.url(publicId, { resource_type: 'raw', type: 'upload', format, secure: true })
}

// Buffered read — used where the whole file is needed in memory anyway
// (hashing, mammoth's docx->html conversion, small text files).
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await fetch(deliveryUrl(key))
  if (!res.ok) {
    throw new Error(`Cloudinary fetch failed for ${key}: ${res.status}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

// Streamed read — used for download, so a large PDF isn't buffered fully in
// memory before it starts reaching the client.
export async function getObjectStream(key: string): Promise<Readable> {
  const res = await fetch(deliveryUrl(key))
  if (!res.ok || !res.body) {
    throw new Error(`Cloudinary fetch failed for ${key}: ${res.status}`)
  }
  return Readable.fromWeb(res.body as import('stream/web').ReadableStream)
}
