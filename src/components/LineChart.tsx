import ReactECharts from 'echarts-for-react'
import type { MonthSeries } from '../lib/aggregates'
import { areaGradient, baseGrid, emptyGraphic, glow, useChartTokens, withAlpha } from '../lib/chartTheme'
import { formatMoneyExact, formatSignedPct, formatWan, pctChange } from '../lib/formulas'
import { useIsMobile } from '../lib/theme'
import { SectionHeader } from './ui/PageHeader'

interface Props {
  year: number
  series: MonthSeries[]
  /** 上一年度同月数据，用于同比虚线；没有数据时不画 */
  previousSeries?: MonthSeries[]
  previousYear?: number
  /** 当前进行中的月份（仅当筛选年份为今年） */
  inProgressMonth?: number
}

function toValues(series: MonthSeries[], key: 'sales' | 'expense'): Array<number | null> {
  return series.map((item) => (item.count > 0 ? item[key] : null))
}

function lastIndex(values: Array<number | null>): number {
  for (let index = values.length - 1; index >= 0; index -= 1) if (values[index] !== null) return index
  return -1
}

/**
 * 年度走势：营业额实收（主线 + 面积渐变 + 端点标签）与总支出（副线）。
 * 无记录的月份留空而不画 0；上年同月以同色虚线压在本年之下。
 */
export function LineChart({ year, series, previousSeries, previousYear, inProgressMonth }: Props) {
  const tokens = useChartTokens()
  const mobile = useIsMobile()
  const months = series.map((s) => `${s.month}月`)
  const sales = toValues(series, 'sales')
  const expense = toValues(series, 'expense')
  const hasData = sales.some((v) => v !== null)
  const prevSales = previousSeries ? toValues(previousSeries, 'sales') : []
  const prevExpense = previousSeries ? toValues(previousSeries, 'expense') : []
  const hasPrevious = prevSales.some((v) => v !== null)
  const base = baseGrid(tokens, mobile)
  // 两条线终点接近时，只保留营业额的端点标签，避免重叠（悬停仍可见两者）
  const lastSales = sales[lastIndex(sales)] ?? 0
  const lastExpense = expense[lastIndex(expense)] ?? 0
  const peak = Math.max(...sales.map((v) => v ?? 0), ...expense.map((v) => v ?? 0), 1)
  const endpointsClose = lastIndex(sales) === lastIndex(expense) && Math.abs(lastSales - lastExpense) / peak < 0.08

  const endPoint = (values: Array<number | null>, color: string, showLabel = true) => {
    const index = lastIndex(values)
    if (index < 0) return undefined
    return {
      symbol: 'circle',
      symbolSize: 10,
      itemStyle: { color, borderColor: tokens.surface, borderWidth: 2, ...glow(color) },
      label: {
        show: !mobile && showLabel,
        position: 'right',
        distance: 8,
        formatter: () => formatWan(values[index] as number),
        color: tokens.ink,
        backgroundColor: withAlpha(color, 0.18),
        borderRadius: 4,
        padding: [3, 6],
        fontSize: 11,
        fontWeight: 600,
      },
      data: [{ coord: [index, values[index]] }],
      silent: true,
    }
  }

  const option = {
    backgroundColor: 'transparent',
    animationDuration: 500,
    animationEasing: 'cubicOut',
    ...base,
    grid: { ...base.grid, right: mobile ? 12 : 84, top: 40 },
    legend: {
      top: 4,
      left: 0,
      icon: 'roundRect',
      itemWidth: 14,
      itemHeight: 6,
      itemGap: 14,
      textStyle: { color: tokens.ink2, fontSize: 12, fontFamily: 'JetBrains Mono, monospace' },
      data: [
        { name: '营业额实收' },
        { name: '总支出' },
        ...(hasPrevious ? [{ name: `${previousYear} 营业额` }, { name: `${previousYear} 总支出` }] : []),
      ],
    },
    xAxis: { ...base.xAxis, data: months },
    yAxis: { ...base.yAxis, scale: false },
    tooltip: {
      ...base.tooltip,
      formatter: (params: Array<{ seriesName: string; value: number | null; color: string; dataIndex: number; axisValue: string }>) => {
        if (!params.length) return ''
        const index = params[0].dataIndex
        const rows = params
          .filter((p) => p.value !== null && p.value !== undefined)
          .map((p) => `<div style="display:flex;justify-content:space-between;gap:16px"><span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${p.color};margin-right:6px"></span>${p.seriesName}</span><b style="font-variant-numeric:tabular-nums">${formatMoneyExact(p.value as number)}</b></div>`)
        const current = sales[index]
        const previous = prevSales[index]
        let yoy = ''
        if (current !== null && previous !== null && previous !== undefined) {
          const change = pctChange(current, previous)
          if (change !== null) yoy = `<div style="margin-top:6px;padding-top:6px;border-top:1px solid ${tokens.line};color:${tokens.ink3}">营业额同比 <b style="color:${change >= 0 ? tokens.good : tokens.bad}">${formatSignedPct(change)}</b></div>`
        }
        const progress = inProgressMonth === index + 1 ? `<div style="margin-top:4px;color:${tokens.ink3}">本月尚未结束</div>` : ''
        return `<div style="font-weight:600;margin-bottom:6px">${year}年${params[0].axisValue}</div>${rows.join('')}${yoy}${progress}`
      },
    },
    series: [
      ...(hasPrevious ? [
        {
          name: `${previousYear} 营业额`, type: 'line', data: prevSales, z: 1, connectNulls: false,
          showSymbol: false, lineStyle: { color: withAlpha(tokens.income, 0.55), width: 1.5, type: 'dashed' }, itemStyle: { color: withAlpha(tokens.income, 0.55) },
        },
        {
          name: `${previousYear} 总支出`, type: 'line', data: prevExpense, z: 1, connectNulls: false,
          showSymbol: false, lineStyle: { color: withAlpha(tokens.expense, 0.55), width: 1.5, type: 'dashed' }, itemStyle: { color: withAlpha(tokens.expense, 0.55) },
        },
      ] : []),
      {
        name: '营业额实收', type: 'line', data: sales, z: 3, connectNulls: false,
        showSymbol: false, symbol: 'circle', symbolSize: 8,
        lineStyle: { color: tokens.income, width: 2.5, ...glow(tokens.income) },
        itemStyle: { color: tokens.income, borderColor: tokens.surface, borderWidth: 2 },
        areaStyle: { color: areaGradient(tokens.income, 0.28) },
        emphasis: { focus: 'series' },
        markPoint: endPoint(sales, tokens.income),
        markArea: inProgressMonth ? {
          silent: true,
          itemStyle: { color: withAlpha(tokens.ink3, 0.08) },
          label: { show: true, position: 'insideTop', color: tokens.ink3, fontSize: 10, formatter: '进行中' },
          data: [[{ xAxis: `${inProgressMonth}月` }, { xAxis: `${inProgressMonth}月` }]],
        } : undefined,
      },
      {
        name: '总支出', type: 'line', data: expense, z: 2, connectNulls: false,
        showSymbol: false, symbol: 'circle', symbolSize: 7,
        lineStyle: { color: tokens.expense, width: 2, type: [6, 5] },
        itemStyle: { color: tokens.expense, borderColor: tokens.surface, borderWidth: 2 },
        emphasis: { focus: 'series' },
        markPoint: endPoint(expense, tokens.expense, !endpointsClose),
      },
    ],
    graphic: hasData ? undefined : [emptyGraphic(`${year} 年暂无月度数据`, tokens)],
  }

  return (
    <section className="surface rise-in overflow-hidden">
      <SectionHeader
        title={`${year} 年营业额与总支出走势`}
        description={hasPrevious ? `虚线为 ${previousYear} 年同月；悬停查看同比` : undefined}
      />
      <div className="px-2 pb-3 pt-2 sm:px-4">
        <ReactECharts option={option} notMerge style={{ height: mobile ? 260 : 360, width: '100%' }} opts={{ renderer: 'canvas' }} />
      </div>
    </section>
  )
}
