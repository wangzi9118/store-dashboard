import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Tone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: Tone
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const toneMeta: Record<Tone, { icon: IconName; className: string }> = {
  success: { icon: 'check', className: 'text-good' },
  error: { icon: 'alert', className: 'text-bad' },
  info: { icon: 'info', className: 'text-ink-2' },
}

/**
 * 全站通知：右上角（桌面）/ 底部（手机，避开 tab bar），aria-live 播报。
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const counter = useRef(0)

  const push = useCallback((tone: Tone, message: string) => {
    const id = ++counter.current
    setItems((current) => [...current.slice(-2), { id, tone, message }])
    window.setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), tone === 'error' ? 6000 : 3500)
  }, [])

  const api = useMemo<ToastApi>(() => ({
    success: (message) => push('success', message),
    error: (message) => push('error', message),
    info: (message) => push('info', message),
  }), [push])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom,0px))] z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-4 sm:items-end"
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className="toast-in pointer-events-auto flex max-w-[92vw] items-start gap-2 rounded-[var(--r-inner)] border border-line-strong bg-surface-solid px-4 py-3 text-sm text-ink shadow-[var(--shadow)] sm:max-w-sm"
          >
            <Icon name={toneMeta[item.tone].icon} size={16} className={`mt-0.5 ${toneMeta[item.tone].className}`} />
            <span className="leading-snug">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
