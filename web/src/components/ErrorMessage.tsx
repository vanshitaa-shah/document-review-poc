import { ApiError } from '../lib/apiClient'
import { AlertIcon } from './Icons'

// Shows the server's message verbatim — a 409 naming the actual current version
// must reach the screen, not get flattened into "something went wrong".
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) {
    return null
  }

  const message = error instanceof ApiError ? error.message : 'Something went wrong'

  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-[#ffc1ba] bg-[#fff1f0] px-3 py-2 text-sm text-[#82071e]"
    >
      <AlertIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#cf222e]" />
      <span>{message}</span>
    </div>
  )
}
