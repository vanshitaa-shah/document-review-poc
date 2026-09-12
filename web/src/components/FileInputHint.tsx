// Client-side hint only — the server (lib/upload.ts) is the real validator.
export const ALLOWED_EXTENSIONS = ['.txt', '.pdf', '.md', '.docx']
export const MAX_UPLOAD_MB = 10

export function FileInputHint() {
  return (
    <p className="text-xs text-gray-500">
      {ALLOWED_EXTENSIONS.join(', ')} — up to {MAX_UPLOAD_MB} MB
    </p>
  )
}
