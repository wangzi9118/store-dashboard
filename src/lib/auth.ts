import { createContext, useContext } from 'react'

export interface CurrentUser {
  id: string
  username: string
  role: 'admin' | 'observer'
  allowedStoreIds?: string[]
  canEditData?: boolean
  canManageStores?: boolean
}
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export async function login(username: string, password: string): Promise<CurrentUser> {
  const response = await fetch(`${apiBase}/auth/login`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  const payload = await response.json().catch(() => ({})) as { user?: CurrentUser; message?: string }
  if (!response.ok || !payload.user) throw new Error(payload.message || '用户名或密码错误')
  return payload.user
}
export async function changePassword(username: string, oldPassword: string, newPassword: string): Promise<void> {
  const response = await fetch(`${apiBase}/auth/change-password`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, oldPassword, newPassword }) })
  const payload = await response.json().catch(() => ({})) as { message?: string }
  if (!response.ok) throw new Error(payload.message || '修改密码失败')
}
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(`${apiBase}/auth/me`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 401) return null
  if (!response.ok) throw new Error('无法读取登录状态')
  return (await response.json() as { user: CurrentUser }).user
}
export async function logout(): Promise<void> { await fetch(`${apiBase}/auth/logout`, { method: 'POST', credentials: 'include' }) }
export const AuthContext = createContext<CurrentUser | null>(null)
export function useCurrentUser(): CurrentUser { const user = useContext(AuthContext); if (!user) throw new Error('当前未登录'); return user }
