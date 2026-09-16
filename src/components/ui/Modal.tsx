import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './Button'

interface Props {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** 对话框宽度 */
  size?: 'sm' | 'md'
}

/**
 * 基于原生 <dialog> 的模态框：焦点圈定、Esc 关闭、遮罩点击关闭由浏览器处理。
 * 手机端贴底显示（见 index.css dialog.modal）。
 */
export function Modal({ open, title, description, onClose, children, footer, size = 'md' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = `modal-${title.replace(/\s+/g, '-')}`

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal ${size === 'sm' ? 'sm:max-w-[400px]' : ''}`}
      aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === ref.current) onClose() }}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="mt-1 text-sm text-ink-3">{description}</p>}
        </div>
        <IconButton icon="x" label="关闭" onClick={onClose} className="-mr-2 -mt-1" />
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  )
}
