const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

export interface TemplateMeta {
  exists: boolean
  filename?: string
  size?: number
  updatedAt?: string
}

export async function getTemplateMeta(): Promise<TemplateMeta> {
  const response = await fetch(`${apiBase}/template/meta`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error('获取模板信息失败')
  }
  return response.json() as Promise<TemplateMeta>
}

export async function uploadTemplate(file: File): Promise<{ message?: string; filename: string; size: number; updatedAt: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${apiBase}/template`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  })

  const data = await response.json().catch(() => ({})) as { message?: string; filename?: string; size?: number; updatedAt?: string }
  if (!response.ok) {
    throw new Error(data.message || '上传模板失败')
  }
  return data as { message?: string; filename: string; size: number; updatedAt: string }
}

export function getTemplateDownloadUrl(): string {
  return `${apiBase}/template`
}

export async function downloadTemplate(): Promise<void> {
  const response = await fetch(`${apiBase}/template`, {
    credentials: 'include',
  })
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(errorData.message || '下载模板失败')
  }

  // 获取文件名
  let filename = '月度收支录入模板.xlsx'
  const disposition = response.headers.get('Content-Disposition')
  if (disposition) {
    const match = disposition.match(/filename\*?=(?:UTF-8'')?([^;]+)/i)
    if (match?.[1]) {
      try {
        filename = decodeURIComponent(match[1].replace(/["']/g, ''))
      } catch {
        filename = match[1].replace(/["']/g, '')
      }
    }
  }

  const blob = await response.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
