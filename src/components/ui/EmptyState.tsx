import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

interface Props {
  icon?: IconName
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}

/**
 * 空状态三要素：这是什么、为什么为空、下一步做什么。
 */
export function EmptyState({ icon = 'inbox', title, description, action, compact = false }: Props) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-12'}`}>
      <span className={`flex items-center justify-center rounded-[var(--r-inner)] border border-line bg-surface-2 text-ink-3 ${compact ? 'h-9 w-9' : 'h-12 w-12'}`}>
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <div>
        <div className="text-sm font-medium text-ink">{title}</div>
        {description && <p className="mx-auto mt-1 max-w-[46ch] text-xs leading-relaxed text-ink-3">{description}</p>}
      </div>
      {action}
    </div>
  )
}
