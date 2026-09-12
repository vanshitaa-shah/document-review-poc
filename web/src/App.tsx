import { Navigate, Route, Routes } from 'react-router'
import { RequireAuth } from './lib/auth'
import { LoginPage } from './pages/LoginPage'
import { DocumentListPage } from './pages/DocumentListPage'

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
      <Route path="/" element={<Navigate to="/documents" replace />} />
      <Route path="*" element={<Navigate to="/documents" replace />} />
    </Routes>
  )
}
