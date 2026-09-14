import { useParams } from 'react-router'
import { AppShell } from '../components/AppShell'
import { DocumentHeader } from '../components/DocumentHeader'
import { DocumentActionsPanel } from '../components/DocumentActionsPanel'
import { VersionContentPanel } from '../components/VersionContentPanel'
import { ErrorMessage } from '../components/ErrorMessage'
import { useDocumentDetail } from '../hooks/useDocumentDetail'
import { mutedText } from '../lib/ui'

// Overview tab: title/status header, actions panel, and the content &
// comments panel. All data-fetching and mutation logic lives in
// useDocumentDetail — this component is composition only.
export function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const detail = useDocumentDetail(id)

  if (detail.loading) {
    return (
      <AppShell>
        <p className={mutedText}>Loading…</p>
      </AppShell>
    )
  }

  if (detail.error || !detail.document) {
    return (
      <AppShell>
        <ErrorMessage error={detail.error} />
      </AppShell>
    )
  }

  const { document, current } = detail

  return (
    <AppShell>
      <DocumentHeader title={document.title} categoryName={document.category.name} current={current} />

      <DocumentActionsPanel
        current={current}
        isAuthor={detail.isAuthor}
        isReviewer={detail.isReviewer}
        busy={detail.busy}
        actionError={detail.actionError}
        revisionFile={detail.revisionFile}
        onRevisionFileChange={detail.setRevisionFile}
        comment={detail.comment}
        onCommentChange={detail.setComment}
        onSubmit={() => void detail.handleSubmit()}
        onApprove={() => void detail.handleApprove()}
        onUploadRevision={detail.handleUploadRevision}
        onRequestChanges={detail.handleRequestChanges}
        onDownload={(versionId, fileName) => void detail.handleDownload(versionId, fileName)}
      />

      {current && (
        <VersionContentPanel
          status={current.status}
          isReviewer={detail.isReviewer}
          versionContent={detail.versionContent}
          inlineComments={detail.inlineComments}
          commentBusy={detail.commentBusy}
          onCreateAnchoredComment={detail.handleCreateAnchoredComment}
        />
      )}
    </AppShell>
  )
}
