import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChannelBreakdown } from '../components/ChannelBreakdown'
import { FilterBar } from '../components/FilterBar'
import { KpiCards, type Comparison } from '../components/KpiCards'
import { LineChart } from '../components/LineChart'
import { TransactionDetails } from '../components/TransactionDetails'
import { Button } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { SectionHeader } from '../components/ui/PageHeader'
import { useData } from '../context/DataContext'
import { useCurrentUser } from '../lib/auth'
import { filterRecords, monthlySeries, sumTotals, type MonthFilter } from '../lib/aggregates'

export function Dashboard() {
  const { data, status } = useData()
  const user = useCurrentUser()
  const now = new Date()
  const [year, setYear] = useState(() => now.getFullYear())
  const [month, setMonth] = useState<MonthFilter>('all')
  const [storeId, setStoreId] = useState<string>('all')

  const filtered = useMemo(() => filterRecords(data.records, year, storeId, month), [data.records, year, storeId, month])
  const yearRecords = useMemo(() => filterRecords(data.records, year, storeId, 'all'), [data.records, year, storeId])
  const totals = useMemo(() => sumTotals(filtered), [filtered])
  const series = useMemo(() => monthlySeries(yearRecords, 'all'), [yearRecords])
  const previousSeries = useMemo(() => monthlySeries(filterRecords(data.records, year - 1, storeId, 'all'), 'all'), [data.records, year, storeId])
  const monthsWithData = useMemo(() => new Set(yearRecords.map((record) => record.month)), [yearRecords])
  const yearsWithData = useMemo(() => new Set(data.records.map((record) => record.year)), [data.records])

  const comparison = useMemo<Comparison>(() => {
    const isAnnual = month === 'all'
    const previousMonth = isAnnual ? 'all' : month === 1 ? 12 : month - 1
    const previousYear = isAnnual || month === 1 ? year - 1 : year
    const previousRecords = filterRecords(data.records, previousYear, storeId, previousMonth)
    return {
      totals: previousRecords.length > 0 ? sumTotals(previousRecords) : undefined,
      label: isAnnual ? `${previousYear}年全年` : `${previousYear}年${previousMonth}月`,
      type: isAnnual ? '同比' : '环比',
    }
  }, [data.records, year, month, storeId])

  const detailCount = useMemo(
    () => filtered.reduce((count, record) => count + [...record.incomeItems, ...record.expenseItems].filter((item) => item.detail.trim() || item.amount !== 0).length, 0),
    [filtered],
  )

  const inProgressMonth = year === now.getFullYear() ? now.getMonth() + 1 : undefined
  const selectedInProgress = month !== 'all' && month === inProgressMonth
  const hasAny = filtered.length > 0
  const storeName = storeId === 'all' ? '全部门店' : data.stores.find((store) => store.id === storeId)?.name ?? ''
  const periodLabel = month === 'all' ? `${year} 年全年` : `${year} 年 ${month} 月`

  const note = !comparison.totals
    ? `${comparison.label}暂无记录，本页不显示${comparison.type}。`
    : `${comparison.type}基准：${comparison.label}${selectedInProgress ? ' · 本月尚未结束，数字会继续变化' : ''}`

  function onYearChange(next: number) {
    setYear(next)
    setMonth('all')
  }

  return (
    <div className="space-y-4">
      <FilterBar
        year={year}
        onYearChange={onYearChange}
        month={month}
        onMonthChange={setMonth}
        monthsWithData={monthsWithData}
        yearsWithData={yearsWithData}
        stores={data.stores}
        storeId={storeId}
        onStoreChange={setStoreId}
        note={hasAny ? note : undefined}
      />

      <div className="flex flex-wrap items-end justify-between gap-2 pt-3 sm:pt-4">
        <div><div className="tech mb-2">Overview · {year}</div><h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink sm:text-2xl">{periodLabel} · {storeName}</h1></div>
        <span className="mono rounded-[var(--r-sm)] border border-line bg-surface px-2 py-1 text-[11px] text-ink-2">{filtered.length} 条月度记录</span>
      </div>

      {!hasAny && status !== 'loading' ? (
        <div className="surface">
          <EmptyState
            icon="chart"
            title={`${periodLabel}还没有经营数据`}
            description={
              data.stores.length === 0
                ? '系统里还没有门店。先在“门店管理”新增门店，再录入或导入月度数据。'
                : user.role === 'admin'
                  ? '可以在“月度录入”手工填写渠道金额，或直接导入 Excel 账目。导入会自动跳过全空的月份。'
                  : '管理员录入数据后，这里会自动显示。'
            }
            action={user.role === 'admin' ? (
              <Link to="/data"><Button variant="primary" icon="edit">去录入</Button></Link>
            ) : undefined}
          />
        </div>
      ) : (
        <>
          <KpiCards totals={totals} comparison={comparison} inProgress={selectedInProgress} spark={{ values: series.map((item) => (item.count > 0 ? item.sales : null)), activeIndex: month === 'all' ? undefined : month - 1 }} />
          {month === 'all' && (
            <LineChart year={year} series={series} previousSeries={previousSeries} previousYear={year - 1} inProgressMonth={inProgressMonth} />
          )}
          <ChannelBreakdown records={filtered} />
          {month !== 'all' && (
            detailCount > 0 ? (
              <section className="space-y-3">
                <div className="surface"><SectionHeader title="收支明细" count={`${detailCount} 条`} description="明细只作记录，不参与营业额、总支出或利润率计算" /></div>
                <TransactionDetails records={filtered} stores={data.stores} />
              </section>
            ) : (
              <div className="surface">
                <EmptyState
                  compact
                  icon="inbox"
                  title="本月没有收支明细"
                  description="明细来自 Excel 的明细页或月度录入，只作记录，不影响上方任何指标。"
                  action={user.role === 'admin' ? <Link to="/data"><Button size="sm" variant="secondary" icon="edit">去录入明细</Button></Link> : undefined}
                />
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}
