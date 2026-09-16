import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link'
type Size = 'sm' | 'md'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: IconName
  loading?: boolean
  children?: ReactNode
}

/**
 * 按钮层级：
 * primary   浅底深字，一屏只有一个
 * secondary 玻璃面 + 边线
 * ghost     纯文字，悬停出面
 * danger    红字，悬停出红面；破坏性操作
 */
const variantClass: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink font-semibold hover:bg-accent-hover disabled:opacity-50',
  secondary: 'bg-surface-2 text-ink border border-line hover:bg-surface-3 hover:border-line-strong disabled:opacity-50',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50',
  danger: 'text-bad hover:bg-bad-soft disabled:opacity-50',
  link: 'text-income-text hover:text-ink hover:underline px-0 min-h-0 disabled:opacity-50',
}

const sizeClass: Record<Size, string> = {
  sm: 'min-h-[32px] px-3 text-[13px] gap-1.5 rounded-[var(--r-sm)]',
  md: 'min-h-[38px] px-4 text-sm gap-2 rounded-[var(--r-inner)]',
}

export function Button({ variant = 'secondary', size = 'md', icon, loading, children, className = '', disabled, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-medium whitespace-nowrap transition-[color,background-color,border-color] duration-150 ${variant === 'link' ? '' : sizeClass[size]} ${variantClass[variant]} ${className}`}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Icon name="loading" size={16} className="animate-spin" /> : icon ? <Icon name={icon} size={size === 'sm' ? 15 : 16} /> : null}
      {children}
    </button>
  )
}

/** 图标按钮，保证 36px 点击区 */
export function IconButton({ icon, label, tone = 'default', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-[var(--r-sm)] transition-colors duration-150 ${tone === 'danger' ? 'text-ink-3 hover:bg-bad-soft hover:text-bad' : 'text-ink-3 hover:bg-surface-2 hover:text-ink'} ${className}`}
      {...rest}
    >
      <Icon name={icon} size={16} />
    </button>
  )
}
