import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'accent' | 'income' | 'expense'

/** 状态胶囊：小、低饱和的面 + 同色字，永远配文字 */
const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  good: 'bg-good-soft text-good border-transparent',
  bad: 'bg-bad-soft text-bad border-transparent',
  warn: 'bg-warn-soft text-warn border-transparent',
  accent: 'bg-accent-soft text-ink border-line-strong',
  income: 'bg-income-soft text-income-text border-transparent',
  expense: 'bg-expense-soft text-expense-text border-transparent',
}

export function Pill({ tone = 'neutral', icon, children, className = '', title }: { tone?: Tone; icon?: IconName; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-[var(--r-pill)] border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${toneClass[tone]} ${className}`}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}
