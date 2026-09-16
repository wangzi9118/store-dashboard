import type { ReactNode } from 'react'

interface Props {
  label: string
  htmlFor?: string
  hint?: string
  children: ReactNode
  className?: string
}

export function Field({ label, htmlFor, hint, children, className = '' }: Props) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-ink-2">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

/** 只读的派生数值格子（例如“营业额实收 = 收入渠道合计”） */
export function ReadonlyValue({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'income' | 'expense' | 'neutral' }) {
  const color = tone === 'income' ? 'text-income-text' : tone === 'expense' ? 'text-expense-text' : 'text-ink'
  return (
    <div className="inset min-w-0 px-3.5 py-2.5">
      <div className="label">{label}</div>
      <output className={`mt-0.5 block truncate text-base font-semibold tnum ${color}`}>{value}</output>
      {hint && <div className="mt-0.5 text-[11px] text-ink-3">{hint}</div>}
    </div>
  )
}
