import type { YearTotals } from '../lib/aggregates'
import { formatMoney, formatPct, formatPoints, formatSignedMoney, formatSignedPct, pctChange } from '../lib/formulas'
import { Icon } from './ui/Icon'

export interface Comparison {
  totals?: YearTotals
  /** 对比基准的名称，例如“2025年全年” */
  label: string
  type: '同比' | '环比'
}

export interface Spark {
  /** 12 个月的营业额，无数据为 null */
  values: Array<number | null>
  /** 高亮的月份下标（月份视图）；年度视图不高亮 */
  activeIndex?: number
}

interface Props {
  totals: YearTotals
  comparison?: Comparison | null
  /** 当前筛选的月份尚未结束 */
  inProgress?: boolean
  spark?: Spark
}

interface Metric {
  key: keyof YearTotals
  label: string
  percent?: boolean
  positiveIsGood: boolean
  /** 口径说明 */
  hint: string
}

const M: Record<string, Metric> = {
  sales: { key: 'sales', label: '营业额实收', positiveIsGood: true, hint: '所有收入渠道金额之和' },
  totalExpense: { key: 'totalExpense', label: '总支出', positiveIsGood: false, hint: '所有支出渠道金额之和' },
  grossMargin: { key: 'grossMargin', label: '毛利率', percent: true, positiveIsGood: true, hint: '(营业额实收 − 总支出) / 营业额实收' },
  withdraw: { key: 'withdraw', label: '总提现', positiveIsGood: true, hint: '月度录入的提现金额，不计入营业额' },
  orderExpense: { key: 'orderExpense', label: '订货支出', positiveIsGood: false, hint: '来自 Excel“订货总支出”列或手工录入' },
  orderRatio: { key: 'orderRatio', label: '订货占比', percent: true, positiveIsGood: false, hint: '订货支出 / 营业额实收' },
  payroll: { key: 'payroll', label: '工资支出', positiveIsGood: false, hint: '来自 Excel“工资”列或手工录入' },
  payrollRatio: { key: 'payrollRatio', label: '工资占比', percent: true, positiveIsGood: false, hint: '工资支出 / 营业额实收' },
}

/** 值与单位拆开：值大字，单位小字 */
function splitValue(metric: Metric, value: number): { value: string; unit: string } {
  return metric.percent ? { value: formatPct(value).replace('%', ''), unit: '%' } : { value: formatMoney(value), unit: '元' }
}

function Value({ metric, value, size }: { metric: Metric; value: number; size: 'hero' | 'md' | 'sm' }) {
  const parts = splitValue(metric, value)
  const cls = size === 'hero'
    ? 'text-[40px] sm:text-[52px] font-medium tracking-[-0.04em]'
    : size === 'md'
      ? 'text-[22px] sm:text-[28px] font-medium tracking-[-0.03em]'
      : 'text-base font-medium tracking-[-0.02em]'
  const negative = value < 0
  return (
    <div className={`flex min-w-0 items-baseline gap-1 leading-none ${negative ? 'text-bad' : 'text-ink'}`}>
      <span className={`truncate tnum ${cls}`}>{parts.value}</span>
      <span className={`shrink-0 text-ink-3 ${size === 'hero' ? 'text-sm sm:text-base' : 'text-xs'}`}>{parts.unit}</span>
    </div>
  )
}

/**
 * 对比：方向用 ▲▼ 与文字双重编码，颜色表达“有利/不利”。
 * 金额类显示百分比为主、绝对差为辅；比率类显示“个百分点”。
 */
function Delta({ metric, current, previous, comparison, compact = false }: { metric: Metric; current: number; previous: number; comparison: Comparison; compact?: boolean }) {
  const diff = current - previous
  const rounded = metric.percent ? Math.round(diff * 1000) / 1000 : Math.round(diff)
  const zero = rounded === 0
  const favorable = metric.positiveIsGood ? rounded > 0 : rounded < 0
  const tone = zero ? 'bg-surface-2 text-ink-3' : favorable ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'
  let primary: string
  let secondary: string | null = null
  if (metric.percent) primary = formatPoints(diff)
  else {
    const pct = pctChange(current, previous)
    primary = pct === null ? formatSignedMoney(diff) : formatSignedPct(pct)
    secondary = pct === null || zero ? null : formatSignedMoney(diff)
  }
  return (
    <div className={`flex flex-wrap items-center gap-1.5 text-ink-3 ${compact ? 'text-[11px]' : 'text-xs'}`} title={`${comparison.label}：${metric.percent ? formatPct(previous) : formatMoney(previous)}`}>
      <span className={`mono inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
        {!zero && <span aria-hidden="true" className="text-[9px]">{rounded > 0 ? '▲' : '▼'}</span>}
        {primary}
      </span>
      <span className="tnum">{comparison.type}{secondary ? ` · ${secondary}` : ''}</span>
    </div>
  )
}

/** 12 个月的迷你柱：收入色，年度视图全部同色，月份视图只亮所选月 */
function SparkBars({ spark }: { spark: Spark }) {
  const max = Math.max(...spark.values.map((v) => v ?? 0), 1)
  const active = spark.activeIndex
  return (
    <div className="mt-auto flex h-11 w-full max-w-[360px] items-end gap-2 pt-5 sm:h-12 sm:gap-2.5" aria-hidden="true">
      {spark.values.map((value, index) => {
        const height = value === null ? 0 : Math.max(8, (value / max) * 100)
        const on = active === undefined ? true : index === active
        return (
          <div key={index} className="flex h-full flex-1 items-end">
            <div
              className={`spark-bar w-full rounded-[2px] ${value === null ? 'bg-surface-3' : on ? 'bg-income/80' : 'bg-income/25'}`}
              style={{ height: value === null ? 3 : `${height}%`, animationDelay: `${index * 40}ms` }}
            />
          </div>
        )
      })}
    </div>
  )
}

function Card({ metric, totals, comparison, sub, inProgress, hero, spark, className = '' }: {
  metric: Metric; totals: YearTotals; comparison?: Comparison | null; sub?: Metric; inProgress?: boolean
  hero?: boolean; spark?: Spark; className?: string
}) {
  const current = totals[metric.key]
  const previous = comparison?.totals?.[metric.key]
  return (
    <div className={`surface rise-in flex min-w-0 flex-col ${hero ? 'p-5 sm:p-6' : 'p-4 sm:p-5'} ${className}`}>
      <div className="flex items-center gap-2">
        <span className="label">{metric.label}</span>
        <span className="cursor-help text-ink-4 hover:text-ink-2" title={metric.hint}><Icon name="info" size={12} /></span>
        {hero && inProgress && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-ink-2"><span className="status-dot" />进行中</span>
        )}
      </div>
      <div className={hero ? 'mt-4' : 'mt-3'}>
        <Value metric={metric} value={current} size={hero ? 'hero' : 'md'} />
        {comparison && previous !== undefined && (
          <div className="mt-2.5"><Delta metric={metric} current={current} previous={previous} comparison={comparison} /></div>
        )}
      </div>
      {hero && spark && <SparkBars spark={spark} />}
      {sub && (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-2 border-t border-line pt-3">
          <div className="flex items-center gap-1.5">
            <span className="label">{sub.label}</span>
            <span className="cursor-help text-ink-4 hover:text-ink-2" title={sub.hint}><Icon name="info" size={11} /></span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Value metric={sub} value={totals[sub.key]} size="sm" />
            {comparison && comparison.totals && (
              <Delta metric={sub} current={totals[sub.key]} previous={comparison.totals[sub.key]} comparison={comparison} compact />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * KPI 网格（参考 Industrial Hub 的 2fr 1fr 1fr）：
 * 第一行 营业额（跨两列）| 毛利率 | 总支出；第二行 总提现 | 订货支出+占比 | 工资支出+占比。
 */
export function KpiCards({ totals, comparison, inProgress, spark }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Card metric={M.sales} totals={totals} comparison={comparison} inProgress={inProgress} hero spark={spark} className="col-span-2" />
      <Card metric={M.grossMargin} totals={totals} comparison={comparison} />
      <Card metric={M.totalExpense} totals={totals} comparison={comparison} />
      <Card metric={M.withdraw} totals={totals} comparison={comparison} className="col-span-2 lg:col-span-1" />
      <Card metric={M.orderExpense} sub={M.orderRatio} totals={totals} comparison={comparison} className="col-span-2 sm:col-span-1 lg:col-span-1" />
      <Card metric={M.payroll} sub={M.payrollRatio} totals={totals} comparison={comparison} className="col-span-2 sm:col-span-1 lg:col-span-2" />
    </div>
  )
}
