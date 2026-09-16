import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import { IconButton } from './Button'

type Tone = 'warn' | 'error' | 'info'

const toneClass: Record<Tone, { wrap: string; icon: IconName }> = {
  warn: { wrap: 'border-warn/40 bg-warn-soft text-ink', icon: 'alert' },
  error: { wrap: 'border-bad/40 bg-bad-soft text-ink', icon: 'wifiOff' },
  info: { wrap: 'border-line bg-surface-2 text-ink', icon: 'info' },
}

export function Banner({ tone = 'info', children, action, onDismiss }: { tone?: Tone; children: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  const meta = toneClass[tone]
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-[var(--r-inner)] border px-4 py-3 text-sm ${meta.wrap}`}>
      <Icon name={meta.icon} size={16} className={`mt-0.5 ${tone === 'warn' ? 'text-warn' : tone === 'error' ? 'text-bad' : 'text-ink-3'}`} />
      <div className="min-w-0 flex-1 leading-snug">{children}</div>
      {action}
      {onDismiss && <IconButton icon="x" label="关闭提示" onClick={onDismiss} className="-my-1.5 -mr-1.5 h-8 w-8" />}
    </div>
  )
}
