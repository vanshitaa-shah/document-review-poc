import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth, RequireRole } from './lib/auth'
import { LoginPage } from './pages/LoginPage'
import { DocumentListPage } from './pages/DocumentListPage'
import { DocumentDetailPage } from './pages/DocumentDetailPage'
import { NewDocumentPage } from './pages/NewDocumentPage'
import { ReviewQueuePage } from './pages/ReviewQueuePage'

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/documents"
        element={
          <RequireAuth>
            <DocumentListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/documents/new"
        element={
          <RequireAuth>
            <RequireRole role="AUTHOR">
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
        path="/reviews/queue"
        element={
          <RequireAuth>
            <RequireRole role="REVIEWER">
              <ReviewQueuePage />
            </RequireRole>
          </RequireAuth>
        }
      />
      <Route path="/" element={<Navigate to="/documents" replace />} />
      <Route path="*" element={<Navigate to="/documents" replace />} />
    </Routes>
  )
}
