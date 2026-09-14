import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth, RequireRole } from './lib/auth'
import { Role, ROUTES } from './lib/constants'
import { LoginPage } from './pages/LoginPage'
import { DocumentListPage } from './pages/DocumentListPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { DocumentHistoryPage } from './pages/DocumentHistoryPage'
import { NewDocumentPage } from './pages/NewDocumentPage'
import { ReviewQueuePage } from './pages/ReviewQueuePage'

export function App() {
  return (
    <Routes>
      <Route path={ROUTES.login} element={<LoginPage />} />
      <Route
        path={ROUTES.documents}
        element={
          <RequireAuth>
            <DocumentListPage />
          </RequireAuth>
        }
      />
      <Route
        path={ROUTES.newDocument}
        element={
          <RequireAuth>
            <RequireRole role={Role.AUTHOR}>
              <NewDocumentPage />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route
        path="/documents/:id"
        element={
          <RequireAuth>
            <DocumentDetailPage />
          </RequireAuth>
        }
      />
      <Route
        path="/documents/:id/history"
        element={
          <RequireAuth>
            <DocumentHistoryPage />
          </RequireAuth>
        }
      />
      <Route
        path={ROUTES.reviewQueue}
        element={
          <RequireAuth>
            <RequireRole role={Role.REVIEWER}>
              <ReviewQueuePage />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to={ROUTES.documents} replace />} />
      <Route path="*" element={<Navigate to={ROUTES.documents} replace />} />
    </Routes>
  )
}
