import parseHtml from 'html-react-parser'
import ReactMarkdown from 'react-markdown'
import { VersionStatus } from '../lib/constants'
import { card, mutedText, sectionHeading } from '../lib/ui'
import { AnnotatedContent, type NewAnchoredComment, type StoredComment } from './AnnotatedContent'

interface VersionContent {
  format: 'text' | 'markdown' | 'html' | 'unsupported'
  content: string | null
}

// Rendered version content (text/markdown/html) with recogito highlighting.
// Every comment is anchored to a highlighted passage — there is no
// version-level (generic) comment, so an unsupported format (pdf) has no
// commenting at all. One panel per current version — DocumentDetailPage owns
// all the fetching and state.
export function VersionContentPanel({
  status,
  isReviewer,
  versionContent,
  inlineComments,
  commentBusy,
  onCreateAnchoredComment,
}: {
  status: string
  isReviewer: boolean
  versionContent: VersionContent | null
  inlineComments: StoredComment[]
  commentBusy: boolean
  onCreateAnchoredComment: (comment: NewAnchoredComment) => Promise<void>
}) {
  const canComment = isReviewer && status !== VersionStatus.APPROVED

  return (
    <section className="mt-6">
      <h2 className={sectionHeading}>Content &amp; comments</h2>
      <div className={`mt-2 p-4 ${card}`}>
        {!versionContent && <p className={mutedText}>Loading…</p>}

        {versionContent?.format === 'unsupported' && (
          <p className={mutedText}>No inline preview or commenting available for this file type.</p>
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
      </div>
    </section>
  )
}
