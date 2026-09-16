import { useEffect, useState, type InputHTMLAttributes } from 'react'

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'size'> {
  /** 数值，0 显示为空 */
  value: number | string
  onChange: (value: number) => void
  /** 失焦后是否显示千分位（默认是） */
  format?: boolean
  size?: 'sm' | 'md'
}

function toNumber(raw: string): number {
  const cleaned = raw.replace(/[,，\s￥¥]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0
}

function formatDisplay(value: number): string {
  if (!value) return ''
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

/**
 * 金额输入：聚焦时显示纯数字，失焦后显示千分位；右对齐、等宽数字。
 * 只接受非负数（业务规则：支出以绝对值保存）。
 */
export function MoneyInput({ value, onChange, format = true, size = 'md', className = '', onFocus, onBlur, ...rest }: Props) {
  const numeric = typeof value === 'string' ? toNumber(value) : Math.abs(Number(value) || 0)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(() => (numeric ? String(numeric) : ''))

  useEffect(() => {
    if (!focused) setDraft(numeric ? String(numeric) : '')
  }, [numeric, focused])

  const shown = focused || !format ? draft : formatDisplay(numeric)

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      placeholder="0"
      onFocus={(event) => { setFocused(true); setDraft(numeric ? String(numeric) : ''); onFocus?.(event) }}
      onBlur={(event) => { setFocused(false); onChange(toNumber(draft)); onBlur?.(event) }}
      onChange={(event) => {
        const raw = event.target.value
        if (!/^[\d,，.\s]*$/.test(raw)) return
        setDraft(raw)
        onChange(toNumber(raw))
      }}
      className={`control tnum text-right ${size === 'sm' ? 'control-sm' : ''} ${className}`}
      {...rest}
    />
  )
}
