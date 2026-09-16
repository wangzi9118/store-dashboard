import type { AppData } from '../types'

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

interface RemoteResponse {
  data: AppData
  updatedAt?: string
}

export async function loadRemoteData(): Promise<AppData | null> {
  const response = await fetch(`${apiBase}/data`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`读取服务器数据失败（${response.status}）`)
  const payload = await response.json() as RemoteResponse
  return payload.data
}

export async function saveRemoteData(data: AppData): Promise<void> {
  const response = await fetch(`${apiBase}/data`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ data }),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(payload?.message || `保存服务器数据失败（${response.status}）`)
  }
}
