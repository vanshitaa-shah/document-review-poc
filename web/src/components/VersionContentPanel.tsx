import type { FormEvent } from 'react'
import parseHtml from 'html-react-parser'
import ReactMarkdown from 'react-markdown'
import { VersionStatus } from '../lib/constants'
import { card, mutedText, sectionHeading } from '../lib/ui'
import { AnnotatedContent, type NewAnchoredComment, type StoredComment } from './AnnotatedContent'
import { GeneralComments } from './GeneralComments'

interface VersionContent {
  format: 'text' | 'markdown' | 'html' | 'unsupported'
  content: string | null
}

// Rendered version content (text/markdown/html) with recogito highlighting,
// plus the general (non-anchored) comments section below it. One panel per
// current version — DocumentDetailPage owns all the fetching and state.
export function VersionContentPanel({
  status,
  isReviewer,
  versionContent,
  inlineComments,
  commentBusy,
  onCreateAnchoredComment,
  versionLevelComment,
  onVersionLevelCommentChange,
  onCreateVersionLevelComment,
}: {
  status: string
  isReviewer: boolean
  versionContent: VersionContent | null
  inlineComments: StoredComment[]
  commentBusy: boolean
  onCreateAnchoredComment: (comment: NewAnchoredComment) => Promise<void>
  versionLevelComment: string
  onVersionLevelCommentChange: (value: string) => void
  onCreateVersionLevelComment: (e: FormEvent) => void
}) {
  const canComment = isReviewer && status !== VersionStatus.APPROVED
  const hasGeneralComments = inlineComments.some((c) => c.anchorQuote === null)

  return (
    <section className="mt-6">
      <h2 className={sectionHeading}>Content &amp; comments</h2>
      <div className={`mt-2 p-4 ${card}`}>
        {!versionContent && <p className={mutedText}>Loading…</p>}

        {versionContent?.format === 'unsupported' && (
          <p className={mutedText}>No inline preview for this file type — comments apply to the whole version.</p>
        )}

        {versionContent && versionContent.format !== 'unsupported' && versionContent.content !== null && (
          <AnnotatedContent
            comments={inlineComments}
            canAnnotate={canComment}
            busy={commentBusy}
            onCreate={onCreateAnchoredComment}
          >
            {versionContent.format === 'text' && versionContent.content}
            {versionContent.format === 'markdown' && <ReactMarkdown>{versionContent.content}</ReactMarkdown>}
            {versionContent.format === 'html' && <div>{parseHtml(versionContent.content)}</div>}
          </AnnotatedContent>
        )}

        {(hasGeneralComments || canComment) && (
          <GeneralComments
            comments={inlineComments}
            canCreate={canComment}
            busy={commentBusy}
            value={versionLevelComment}
            onChange={onVersionLevelCommentChange}
            onSubmit={onCreateVersionLevelComment}
          />
        )}
      </div>
    </section>
  )
}
