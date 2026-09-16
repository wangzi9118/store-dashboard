import { useEffect, useRef } from 'react'

export interface SegmentedOption<T extends string | number> {
  value: T
  label: string
  /** 弱化显示，例如没有数据的月份 */
  muted?: boolean
  title?: string
}

interface Props<T extends string | number> {
  value: T
  options: SegmentedOption<T>[]
  onChange: (value: T) => void
  label: string
  size?: 'sm' | 'md'
  className?: string
}

/**
 * 分段筛选：一排芯片，选中项为更亮的面 + 强边线 + 主文字（见 index.css .chip）。
 * 与主导航的「文字 + 底部指示线」刻意区分。窄屏横向滚动，选中项自动滚入视野。
 */
export function Segmented<T extends string | number>({ value, options, onChange, label, size = 'md', className = '' }: Props<T>) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>('[aria-checked="true"]')
    if (!active) return
    const left = active.offsetLeft - container.clientWidth / 2 + active.clientWidth / 2
    container.scrollTo({ left, behavior: 'smooth' })
  }, [value])

  return (
    <div ref={containerRef} role="radiogroup" aria-label={label} className={`scroll-x flex max-w-full items-center gap-1 ${className}`}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.title}
            onClick={() => onChange(option.value)}
            className={`chip mono shrink-0 ${size === 'md' ? 'min-h-[34px] px-3 text-sm' : 'text-[12px]'} ${option.muted && !active ? 'is-muted' : ''}`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
