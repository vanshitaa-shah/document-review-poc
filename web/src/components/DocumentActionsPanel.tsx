import type { FormEvent } from 'react'
import { VersionStatus } from '../lib/constants'
import { formatDateTime } from '../lib/format'
import { btnDefault, btnPrimary, btnWarning, card, sectionHeading, textarea } from '../lib/ui'
import { CheckCircleIcon } from './Icons'
import { ErrorMessage } from './ErrorMessage'
import { FileInputHint } from './FileInputHint'

interface UserRef {
  email: string
}

interface CurrentVersion {
  id: string
  versionNumber: number
  status: string
  fileName: string
  approval: { approvedAt: string; approver: UserRef } | null
}

// The document header card: approval banner, role-gated action buttons
// (submit / approve), and the upload-revision / request-changes forms.
// Pure presentation — all state and API calls stay in DocumentDetailPage.
export function DocumentActionsPanel({
  current,
  isAuthor,
  isReviewer,
  busy,
  actionError,
  revisionFile,
  onRevisionFileChange,
  comment,
  onCommentChange,
  onSubmit,
  onApprove,
  onUploadRevision,
  onRequestChanges,
  onDownload,
}: {
  current: CurrentVersion | null
  isAuthor: boolean
  isReviewer: boolean
  busy: boolean
  actionError: unknown
  revisionFile: File | null
  onRevisionFileChange: (file: File | null) => void
  comment: string
  onCommentChange: (value: string) => void
  onSubmit: () => void
  onApprove: () => void
  onUploadRevision: (e: FormEvent) => void
  onRequestChanges: (e: FormEvent) => void
  onDownload: (versionId: string, fileName: string) => void
}) {
  return (
    <div className={`p-6 ${card}`}>
      <ErrorMessage error={actionError} />

      {current?.approval && (
        <div className="flex items-center gap-2 rounded-md border border-[#4ac26b]/40 bg-[#dafbe1] px-3 py-2 text-sm text-[#1a7f37]">
          <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
          <span>
            Approved by {current.approval.approver.email} on {formatDateTime(current.approval.approvedAt)} (v
            {current.versionNumber})
          </span>
        </div>
      )}

      {current && (
        <div className={`flex flex-wrap gap-2 ${current.approval ? 'mt-4' : ''}`}>
          {current.status === VersionStatus.APPROVED && (
            <button onClick={() => onDownload(current.id, current.fileName)} className={btnDefault}>
              Download
            </button>
          )}

          {isAuthor && current.status === VersionStatus.DRAFT && (
            <button onClick={onSubmit} disabled={busy} className={btnPrimary}>
              Submit for review
            </button>
          )}

          {isReviewer && current.status === VersionStatus.SUBMITTED && (
            <button onClick={onApprove} disabled={busy} className={btnPrimary}>
              Approve
            </button>
          )}
        </div>
      )}

      {isAuthor && current?.status !== VersionStatus.APPROVED && (
        <form onSubmit={onUploadRevision} className="mt-6 border-t border-[#d8dee4] pt-4">
          <h2 className={sectionHeading}>Upload a revision</h2>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              type="file"
              required
              onChange={(e) => onRevisionFileChange(e.target.files?.[0] ?? null)}
              className="text-sm text-[#1f2328] file:mr-3 file:rounded-md file:border-0 file:bg-[#f6f8fa] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#24292f] hover:file:bg-[#eaeef2]"
            />
            <button type="submit" disabled={busy || !revisionFile} className={btnDefault}>
              Upload revision
            </button>
          </div>
          <FileInputHint />
        </form>
      )}

      {isReviewer && current?.status === VersionStatus.SUBMITTED && (
        <form onSubmit={onRequestChanges} className="mt-6 border-t border-[#d8dee4] pt-4">
          <h2 className={sectionHeading}>Request changes</h2>
          <textarea
            required
            value={comment}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Explain what needs to change…"
            rows={3}
            className={`mt-2 ${textarea}`}
          />
          <button type="submit" disabled={busy || !comment.trim()} className={`mt-2 ${btnWarning}`}>
            Request changes
          </button>
        </form>
      )}
    </div>
  )
}
