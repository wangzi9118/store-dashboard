import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import { ToastProvider } from './components/ui/Toast'
import { DataProvider } from './context/DataContext'
import { Dashboard } from './pages/Dashboard'
import { DataEntry } from './pages/DataEntry'
import { Login } from './pages/Login'
import { StorePK } from './pages/StorePK'
import { Stores } from './pages/Stores'
import { UserManagement } from './pages/UserManagement'
import { useCurrentUser } from './lib/auth'

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()
  return user.role === 'admin' ? <>{children}</> : <Navigate to="/" replace />
}

export default function App() {
  return (
    <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DataProvider>
                      <Layout />
                    </DataProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Dashboard />} />
                <Route path="pk" element={<StorePK />} />
                <Route path="data" element={<AdminRoute><DataEntry /></AdminRoute>} />
                <Route path="stores" element={<AdminRoute><Stores /></AdminRoute>} />
                <Route path="users" element={<AdminRoute><UserManagement /></AdminRoute>} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
  )
}
