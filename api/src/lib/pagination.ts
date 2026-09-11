export interface CursorPage {
  createdAt: Date
  id: string
}

export function encodeCursor({ createdAt, id }: CursorPage): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string): CursorPage {
  const [iso, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|')
  return { createdAt: new Date(iso!), id: id! }
}
