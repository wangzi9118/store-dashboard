import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'
import { Modal } from './Modal'

export interface ConfirmOptions {
  title: string
  /** 说明后果，例如“将同时删除 8 个月的记录” */
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * 全站统一的确认对话框，替代浏览器原生 confirm()。
 * 用法：const confirm = useConfirm(); if (await confirm({...})) {...}
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((options) => {
    resolver.current?.(false)
    setState(options)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setState(null)
  }, [])

  const value = useMemo(() => confirm, [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        open={state !== null}
        title={state?.title ?? ''}
        onClose={() => settle(false)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>{state?.cancelLabel ?? '取消'}</Button>
            <Button variant={state?.danger ? 'primary' : 'primary'} className={state?.danger ? '!bg-bad !text-white' : ''} onClick={() => settle(true)} autoFocus>
              {state?.confirmLabel ?? '确认'}
            </Button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-inner)] ${state?.danger ? 'bg-bad-soft text-bad' : 'bg-surface-3 text-ink'}`}>
            <Icon name={state?.danger ? 'alert' : 'info'} size={16} />
          </span>
          <p className="text-sm leading-relaxed text-ink-2">{state?.description ?? '此操作将立即生效。'}</p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider')
  return ctx
}
