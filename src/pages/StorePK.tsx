import { useMemo, useState } from 'react'
import { FilterBar } from '../components/FilterBar'
import { StorePkChart, type PkMetricKey } from '../components/StorePkChart'
import { EmptyState } from '../components/ui/EmptyState'
import { Icon } from '../components/ui/Icon'
import { PageHeader, SectionHeader } from '../components/ui/PageHeader'
import { Pill } from '../components/ui/Pill'
import { Segmented } from '../components/ui/Segmented'
import { useData } from '../context/DataContext'
import { filterRecords, sumTotals, type MonthFilter, type YearTotals } from '../lib/aggregates'
import { formatMoneyExact, formatPct, formatPoints, formatSignedMoney } from '../lib/formulas'
import type { MonthlyRecord } from '../types'

interface MetricDefinition {
  key: keyof YearTotals
  label: string
  percent?: boolean
  /** 数值越高越好（收入、毛利）还是越低越好（费用、占比） */
  higherIsBetter: boolean
  chartable?: boolean
}

const metrics: MetricDefinition[] = [
  { key: 'sales', label: '营业额实收', higherIsBetter: true, chartable: true },
  { key: 'totalExpense', label: '总支出', higherIsBetter: false, chartable: true },
  { key: 'grossMargin', label: '毛利率', percent: true, higherIsBetter: true, chartable: true },
  { key: 'orderExpense', label: '订货支出', higherIsBetter: false, chartable: true },
  { key: 'orderRatio', label: '订货占比', percent: true, higherIsBetter: false },
  { key: 'payroll', label: '工资支出', higherIsBetter: false, chartable: true },
  { key: 'payrollRatio', label: '工资占比', percent: true, higherIsBetter: false },
  { key: 'withdraw', label: '总提现', higherIsBetter: true, chartable: true },
]

function monthlyMetric(records: MonthlyRecord[], year: number, storeId: string, key: PkMetricKey): Array<number | null> {
  return Array.from({ length: 12 }, (_, index) => {
    const monthRecords = filterRecords(records, year, storeId, index + 1)
    return monthRecords.length ? sumTotals(monthRecords)[key] : null
  })
}

function formatValue(metric: MetricDefinition, value: number): string {
  return metric.percent ? formatPct(value) : formatMoneyExact(value)
}

function formatDifference(metric: MetricDefinition, left: number, right: number): string {
  const difference = left - right
  return metric.percent ? formatPoints(difference) : formatSignedMoney(difference)
}

function StoreDot({ side }: { side: 'left' | 'right' }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${side === 'left' ? 'bg-income' : 'bg-expense'}`} aria-hidden="true" />
}

function leader(metric: MetricDefinition, left: number, right: number): 'left' | 'right' | null {
  if (left === right) return null
  const leftWins = metric.higherIsBetter ? left > right : left < right
  return leftWins ? 'left' : 'right'
}

export function StorePK() {
  const { data } = useData()
  const [year, setYear] = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState<MonthFilter>('all')
  const [leftStoreId, setLeftStoreId] = useState(() => data.stores[0]?.id || '')
  const [rightStoreId, setRightStoreId] = useState(() => data.stores[1]?.id || '')
  const [chartMetric, setChartMetric] = useState<PkMetricKey>('sales')

  const selectedLeftId = data.stores.some((store) => store.id === leftStoreId) ? leftStoreId : data.stores[0]?.id || ''
  const selectedRightId = data.stores.some((store) => store.id === rightStoreId) && rightStoreId !== selectedLeftId
    ? rightStoreId
    : data.stores.find((store) => store.id !== selectedLeftId)?.id || ''
  const leftStore = data.stores.find((store) => store.id === selectedLeftId)
  const rightStore = data.stores.find((store) => store.id === selectedRightId)

  const leftRecords = useMemo(() => filterRecords(data.records, year, selectedLeftId, month), [data.records, year, selectedLeftId, month])
  const rightRecords = useMemo(() => filterRecords(data.records, year, selectedRightId, month), [data.records, year, selectedRightId, month])
  const leftTotals = useMemo(() => sumTotals(leftRecords), [leftRecords])
  const rightTotals = useMemo(() => sumTotals(rightRecords), [rightRecords])
  const leftTrend = useMemo(() => monthlyMetric(data.records, year, selectedLeftId, chartMetric), [data.records, year, selectedLeftId, chartMetric])
  const rightTrend = useMemo(() => monthlyMetric(data.records, year, selectedRightId, chartMetric), [data.records, year, selectedRightId, chartMetric])
  const monthsWithData = useMemo(
    () => new Set(filterRecords(data.records, year, 'all', 'all').filter((r) => r.storeId === selectedLeftId || r.storeId === selectedRightId).map((r) => r.month)),
    [data.records, year, selectedLeftId, selectedRightId],
  )
  const yearsWithData = useMemo(() => new Set(data.records.map((record) => record.year)), [data.records])
  const selectedChartMetric = metrics.find((metric) => metric.key === chartMetric) ?? metrics[0]

  function selectLeft(storeId: string) {
    setLeftStoreId(storeId)
    if (storeId === selectedRightId) setRightStoreId(selectedLeftId)
  }
  function selectRight(storeId: string) {
    setRightStoreId(storeId)
    if (storeId === selectedLeftId) setLeftStoreId(selectedRightId)
  }

  if (data.stores.length < 2) {
    return (
      <div className="space-y-4">
        <PageHeader title="门店 PK" description="选择两家门店，查看同一统计周期的经营差异。" />
        <div className="surface">
          <EmptyState
            icon="compare"
            title="至少需要两家门店才能对比"
            description={data.stores.length === 0 ? '系统里还没有门店。' : `当前只能看到「${data.stores[0].name}」。管理员可以在门店管理中新增门店，或为你的账号开放更多门店。`}
          />
        </div>
      </div>
    )
  }

  const periodLabel = month === 'all' ? `${year} 年全年` : `${year} 年 ${month} 月`
  const missing = [leftRecords.length === 0 ? leftStore?.name : null, rightRecords.length === 0 ? rightStore?.name : null].filter(Boolean)
  const note = missing.length ? `${missing.join('、')}在${periodLabel}没有记录，对应数值按 0 显示。` : `${periodLabel} · 差值按 A − B 计算，“领先”按该指标的好坏方向判断。`

  const chartOptions = metrics.filter((m) => m.chartable).map((m) => ({ value: m.key as PkMetricKey, label: m.label }))

  return (
    <div className="space-y-4">
      <FilterBar year={year} onYearChange={(next) => { setYear(next); setMonth('all') }} month={month} onMonthChange={setMonth} monthsWithData={monthsWithData} yearsWithData={yearsWithData} note={note} />

      <PageHeader title="门店 PK" description="选择两家门店，查看同一统计周期的经营差异。" />

      <section className="surface p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-2"><StoreDot side="left" />门店 A</span>
            <select value={selectedLeftId} onChange={(event) => selectLeft(event.target.value)} className="control font-medium">
              {data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
          <div className="hidden h-10 items-center px-1 text-xs font-semibold tracking-widest text-ink-3 md:flex">VS</div>
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-2"><StoreDot side="right" />门店 B</span>
            <select value={selectedRightId} onChange={(event) => selectRight(event.target.value)} className="control font-medium">
              {data.stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="surface overflow-hidden">
        <SectionHeader title="经营指标对比" description={`${periodLabel} · 点击指标行可切换下方趋势图`} count={`${metrics.length} 项`} />

        {/* 桌面表格 */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[640px] table-fixed text-sm">
            <thead className="text-xs text-ink-3">
              <tr>
                <th className="w-[22%] px-4 py-2.5 text-left font-medium">指标</th>
                <th className="w-[26%] px-4 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><StoreDot side="left" />A · {leftStore?.name}</span></th>
                <th className="w-[26%] px-4 py-2.5 text-center font-medium">差值（A − B）</th>
                <th className="w-[26%] px-4 py-2.5 text-right font-medium"><span className="inline-flex items-center gap-1.5"><StoreDot side="right" />B · {rightStore?.name}</span></th>
              </tr>
            </thead>
            <tbody>
              {metrics.map((metric) => {
                const leftValue = leftTotals[metric.key]
                const rightValue = rightTotals[metric.key]
                const winner = leader(metric, leftValue, rightValue)
                const active = metric.chartable && metric.key === chartMetric
                const diff = leftValue - rightValue
                return (
                  <tr
                    key={metric.key}
                    onClick={metric.chartable ? () => setChartMetric(metric.key as PkMetricKey) : undefined}
                    aria-selected={active || undefined}
                    title={metric.chartable ? '查看该指标的月度趋势' : '占比类指标不提供趋势图'}
                    className={`border-t border-line/70 ${metric.chartable ? 'cursor-pointer hover:bg-surface-2/60' : ''} ${active ? 'bg-surface-2' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-ink">
                      <span className="inline-flex items-center gap-1.5">
                        {metric.chartable && <Icon name="chart" size={13} className={active ? 'text-ink' : 'text-ink-3'} />}
                        {metric.label}
                      </span>
                    </td>
                    <td className={`px-4 py-2.5 text-right tnum ${winner === 'left' ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                      {winner === 'left' && <Pill tone="good" icon="trophy" className="mr-2">领先</Pill>}
                      {formatValue(metric, leftValue)}
                    </td>
                    <td className={`px-4 py-2.5 text-center tnum ${diff === 0 ? 'text-ink-3' : 'text-ink-2'}`}>{formatDifference(metric, leftValue, rightValue)}</td>
                    <td className={`px-4 py-2.5 text-right tnum ${winner === 'right' ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                      {formatValue(metric, rightValue)}
                      {winner === 'right' && <Pill tone="good" icon="trophy" className="ml-2">领先</Pill>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* 手机卡片 */}
        <ul className="divide-y divide-line/70 sm:hidden">
          {metrics.map((metric) => {
            const leftValue = leftTotals[metric.key]
            const rightValue = rightTotals[metric.key]
            const winner = leader(metric, leftValue, rightValue)
            const active = metric.chartable && metric.key === chartMetric
            return (
              <li key={metric.key}>
                <button
                  type="button"
                  disabled={!metric.chartable}
                  onClick={() => metric.chartable && setChartMetric(metric.key as PkMetricKey)}
                  className={`w-full px-4 py-3 text-left ${active ? 'bg-surface-2' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                      {metric.chartable && <Icon name="chart" size={13} className={active ? 'text-ink' : 'text-ink-3'} />}{metric.label}
                    </span>
                    <span className="text-xs text-ink-3 tnum">差值 {formatDifference(metric, leftValue, rightValue)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    {(['left', 'right'] as const).map((side) => {
                      const value = side === 'left' ? leftValue : rightValue
                      return (
                        <div key={side} className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] text-ink-3"><StoreDot side={side} />{side === 'left' ? leftStore?.name : rightStore?.name}</div>
                          <div className={`mt-0.5 flex items-center gap-1.5 text-base tnum ${winner === side ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                            {formatValue(metric, value)}
                            {winner === side && <Icon name="trophy" size={13} className="text-good" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="surface overflow-hidden">
        <SectionHeader
          title={`${year} 年 ${selectedChartMetric.label} 月度趋势`}
          description={month === 'all' ? '两家门店各月对比，空缺月份表示没有记录' : `已标出 ${month} 月`}
          actions={<Segmented value={chartMetric} options={chartOptions} onChange={setChartMetric} label="趋势指标" size="sm" className="max-w-full" />}
        />
        <StorePkChart
          year={year}
          selectedMonth={month}
          metricLabel={selectedChartMetric.label}
          percent={selectedChartMetric.percent}
          left={{ name: leftStore?.name || '门店 A', values: leftTrend }}
          right={{ name: rightStore?.name || '门店 B', values: rightTrend }}
        />
      </section>
    </div>
  )
}
