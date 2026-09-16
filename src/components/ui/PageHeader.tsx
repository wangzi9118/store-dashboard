import type { ReactNode } from 'react'

interface Props {
  title: string
  description?: string
  actions?: ReactNode
  meta?: ReactNode
  /** 标题上方的技术标签，例如 "OVERVIEW · 2026" */
  eyebrow?: string
}

/** 页级标题：eyebrow（mono 技术标签）+ 22–24px 标题 + 一句说明 + 右侧操作 */
export function PageHeader({ title, description, actions, meta, eyebrow }: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 pt-5 sm:pt-6">
      <div className="min-w-0">
        {eyebrow && <div className="tech mb-2">{eyebrow}</div>}
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-2xl">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1.5 max-w-[68ch] text-[13px] text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** 区块标题：卡片内部的一级标题行 */
export function SectionHeader({ title, count, description, actions, tone }: { title: string; count?: ReactNode; description?: string; actions?: ReactNode; tone?: 'income' | 'expense' }) {
  const swatch = tone === 'income' ? 'bg-income' : tone === 'expense' ? 'bg-expense' : null
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {swatch && <span className={`h-2 w-2 rounded-full ${swatch}`} aria-hidden="true" />}
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {count !== undefined && <span className="mono rounded-[var(--r-sm)] border border-line bg-surface px-1.5 py-0.5 text-[11px] text-ink-2">{count}</span>}
        </div>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
