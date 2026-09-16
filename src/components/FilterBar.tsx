import type { ReactNode } from 'react'
import { YEARS } from '../types'
import type { Store } from '../types'
import type { MonthFilter } from '../lib/aggregates'
import { Segmented } from './ui/Segmented'

interface Props {
  year: number
  onYearChange: (year: number) => void
  month: MonthFilter
  onMonthChange: (month: MonthFilter) => void
  /** 有记录的月份，用于弱化没有数据的月份 */
  monthsWithData?: Set<number>
  yearsWithData?: Set<number>
  stores?: Store[]
  storeId?: string
  onStoreChange?: (storeId: string) => void
  /** 筛选栏下方的一行说明，例如“2025 年暂无数据，无法同比” */
  note?: ReactNode
  /** 右侧附加内容 */
  trailing?: ReactNode
}

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

/**
 * 统一筛选栏：年份下拉 + 月份芯片 + 门店下拉。
 * 吸在页眉（56px）之下，自带模糊底与底部渐隐；手机上月份可横向滚动。
 */
export function FilterBar({ year, onYearChange, month, onMonthChange, monthsWithData, yearsWithData, stores, storeId, onStoreChange, note, trailing }: Props) {
  const monthOptions = [
    { value: 'all' as MonthFilter, label: '全年' },
    ...MONTHS.map((m) => ({
      value: m as MonthFilter,
      label: `${m}月`,
      muted: monthsWithData ? !monthsWithData.has(m) : false,
      title: monthsWithData && !monthsWithData.has(m) ? `${m}月暂无记录` : undefined,
    })),
  ]

  return (
    <div className="sticky-bar top-[68px] -mx-4 border-b border-line px-4 pb-2 pt-1 sm:-mx-6 sm:px-6">
      {/* 手机：第一行 年份 + 门店，第二行 月份；桌面：一行排开 */}
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        <label className="order-1 min-w-0 flex-1 sm:flex-none">
          <span className="sr-only">年份</span>
          <select
            aria-label="年份"
            value={year}
            onChange={(event) => onYearChange(Number(event.target.value))}
            className="control control-sm w-full font-medium sm:w-[96px]"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>{y} 年{yearsWithData && !yearsWithData.has(y) ? ' ·' : ''}</option>
            ))}
          </select>
        </label>
        <span className="tech order-2 hidden pl-2 sm:block" aria-hidden="true">周期</span>
        <Segmented value={month} options={monthOptions} onChange={onMonthChange} label="月份" size="sm" className="order-4 w-full sm:order-3 sm:w-auto sm:min-w-0 sm:flex-1" />
        {stores && onStoreChange && (
          <label className="order-3 min-w-0 flex-1 sm:order-4 sm:ml-auto sm:flex-none">
            <span className="sr-only">门店</span>
            <select
              aria-label="门店"
              value={storeId}
              onChange={(event) => onStoreChange(event.target.value)}
              className="control control-sm w-full font-medium sm:w-40"
            >
              <option value="all">全部门店</option>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        )}
        {trailing && <div className="order-5">{trailing}</div>}
      </div>
      {note && <div className="mx-auto mt-1.5 max-w-7xl text-xs text-ink-3">{note}</div>}
    </div>
  )
}
