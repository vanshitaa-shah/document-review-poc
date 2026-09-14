import { useVersionDiff } from '../hooks/useVersionDiff'
import { ErrorMessage } from './ErrorMessage'
import { card, mutedText, sectionHeading } from '../lib/ui'

// GitHub-diff-style rendering of a word-level diff between one version and
// its immediate predecessor. Purely presentational — useVersionDiff owns the
// fetch + diff computation.
export function VersionDiffView({
  currentVersionId,
  previousVersionId,
  currentVersionNumber,
  previousVersionNumber,
  onClose,
}: {
  currentVersionId: string
  previousVersionId: string
  currentVersionNumber: number
  previousVersionNumber: number
  onClose: () => void
}) {
  const { parts, unsupported, loading, error } = useVersionDiff(currentVersionId, previousVersionId)

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <h2 className={sectionHeading}>
          Comparing v{previousVersionNumber} → v{currentVersionNumber}
        </h2>
        <button onClick={onClose} className="text-xs font-medium text-[#0969da] hover:underline">
          Close
        </button>
      </div>

      <div className={`mt-2 p-4 ${card}`}>
        <ErrorMessage error={error} />
        {loading && <p className={mutedText}>Loading diff…</p>}
        {!loading && unsupported && <p className={mutedText}>No inline diff available for this file type.</p>}
        {!loading && parts && (
          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-[#1f2328]">
            {parts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? 'bg-[#dafbe1] text-[#1a7f37]'
                    : part.removed
                      ? 'bg-[#ffebe9] text-[#cf222e] line-through'
                      : undefined
                }
              >
                {part.value}
              </span>
            ))}
          </pre>
        )}
      </div>
    </section>
  )
}
