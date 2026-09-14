import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a', 'span',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre',
]

// Version content served as 'html' (docx-converted or a raw .html upload) is
// rendered inside another user's authenticated session — an author's file
// runs in a reviewer's browser. Sanitize once, here, so no caller of
// get-content.ts has to remember to do it before rendering.
export function sanitizeVersionHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { a: ['href'], span: ['style'] },
    allowedSchemes: ['http', 'https', 'mailto'],
  })
}
