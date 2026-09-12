import { ApiError } from '../lib/apiClient'

// Shows the server's message verbatim — a 409 naming the actual current version
// must reach the screen, not get flattened into "something went wrong".
export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) {
    return null
  }

  const message = error instanceof ApiError ? error.message : 'Something went wrong'

  return (
    <div role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </div>
  )
}
