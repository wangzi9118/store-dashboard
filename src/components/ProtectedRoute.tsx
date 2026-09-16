import { Navigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { AuthContext, getCurrentUser, type CurrentUser } from '../lib/auth'
import { Icon } from './ui/Icon'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { void getCurrentUser().then(setUser).catch(() => setUser(null)).finally(() => setLoading(false)) }, [])
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-canvas text-sm text-ink-3" role="status">
        <Icon name="refresh" size={16} className="animate-spin" />
        正在验证登录状态…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <AuthContext.Provider value={user}>{children}</AuthContext.Provider>
}
