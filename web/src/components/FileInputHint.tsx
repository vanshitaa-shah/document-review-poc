import { ALLOWED_UPLOAD_EXTENSIONS, MAX_UPLOAD_MB } from '../lib/constants'

export function FileInputHint() {
  return (
    <p className="text-xs text-[#6e7781]">
      {ALLOWED_UPLOAD_EXTENSIONS.join(', ')} — up to {MAX_UPLOAD_MB} MB
    </p>
  )
}
