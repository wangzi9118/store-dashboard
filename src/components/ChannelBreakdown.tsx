import { useState } from 'react'
import { formatMoneyExact, formatPct } from '../lib/formulas'
import type { ChannelAmount, MonthlyRecord } from '../types'
import { Button } from './ui/Button'
import { SectionHeader } from './ui/PageHeader'

interface Props {
  records: MonthlyRecord[]
}

interface ChannelRow {
  name: string
  amount: number
}

const TOP_N = 8

function aggregateChannels(records: MonthlyRecord[], key: 'incomeChannels' | 'expenseChannels'): ChannelRow[] {
  const totals = new Map<string, number>()
  records.flatMap((record) => record[key] ?? []).forEach((channel: ChannelAmount) => {
    const name = channel.name.trim()
    if (!name) return
    totals.set(name, (totals.get(name) ?? 0) + (Number(channel.amount) || 0))
  })
  return [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .filter((channel) => channel.amount > 0)
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))
}

function ChannelList({ title, rows, tone }: { title: string; rows: ChannelRow[]; tone: 'income' | 'expense' }) {
  const [expanded, setExpanded] = useState(false)
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  const max = Math.max(...rows.map((row) => row.amount), 1)
  const shown = expanded ? rows : rows.slice(0, TOP_N)
  const rest = rows.slice(TOP_N)
  const restTotal = rest.reduce((sum, row) => sum + row.amount, 0)
  const fill = tone === 'income' ? 'bg-income' : 'bg-expense'
  const swatch = tone === 'income' ? 'bg-income' : 'bg-expense'

  return (
    <div className="min-w-0 px-4 py-4 sm:px-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className={`h-2 w-2 rounded-full ${swatch}`} aria-hidden="true" />{title}
          <span className="mono text-[11px] font-normal text-ink-3">{rows.length} 项</span>
        </h3>
        <span className="tnum text-xs text-ink-3">合计 {formatMoneyExact(total)}</span>
      </div>
      <ol className="divide-y divide-line">
        {shown.map((row, index) => (
          <li key={row.name} className="grid grid-cols-[2.25ch_minmax(0,1fr)_4.5rem] items-center gap-3 py-2.5">
            <span className="mono text-[11px] text-ink-3">{String(index + 1).padStart(2, '0')}</span>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink" title={row.name}>{row.name}</span>
                <span className="tnum shrink-0 font-medium text-ink">{formatMoneyExact(row.amount)}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-[2px] bg-surface-3">
                <div className={`grow-x h-full rounded-[2px] ${fill}`} style={{ width: `${Math.max(2, (row.amount / max) * 100)}%`, animationDelay: `${index * 40}ms` }} aria-hidden="true" />
              </div>
            </div>
            <span className="mono rounded-[var(--r-sm)] border border-line bg-surface px-1.5 py-0.5 text-right text-[11px] text-ink-2">{total > 0 ? formatPct(row.amount / total) : '—'}</span>
          </li>
        ))}
        {!expanded && rest.length > 0 && (
          <li className="grid grid-cols-[2.25ch_minmax(0,1fr)_4.5rem] items-center gap-3 py-2.5 text-sm text-ink-3">
            <span className="mono text-[11px]">··</span>
            <div className="flex items-baseline justify-between gap-3"><span>其余 {rest.length} 项</span><span className="tnum">{formatMoneyExact(restTotal)}</span></div>
            <span className="mono text-right text-[11px]">{total > 0 ? formatPct(restTotal / total) : '—'}</span>
          </li>
        )}
      </ol>
      {rest.length > 0 && (
        <Button variant="link" size="sm" className="mt-3 text-xs" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收起' : `展开全部 ${rows.length} 项`}
        </Button>
      )}
    </div>
  )
}

/**
 * 收支渠道分布：按金额排序，默认显示前 8 项，其余折叠为一行合计。
 */
export function ChannelBreakdown({ records }: Props) {
  const incomeRows = aggregateChannels(records, 'incomeChannels')
  const expenseRows = aggregateChannels(records, 'expenseChannels')
  if (!incomeRows.length && !expenseRows.length) return null

  const columns = incomeRows.length && expenseRows.length ? 'md:grid-cols-2' : 'md:grid-cols-1'
  return (
    <section className="surface rise-in overflow-hidden">
      <SectionHeader title="收支渠道" description="营业额实收和总支出分别等于两侧渠道的合计" />
      <div className={`grid ${columns} md:divide-x md:divide-line`}>
        {incomeRows.length > 0 && <ChannelList title="收入渠道" rows={incomeRows} tone="income" />}
        {expenseRows.length > 0 && <ChannelList title="支出渠道" rows={expenseRows} tone="expense" />}
      </div>
    </section>
  )
}
