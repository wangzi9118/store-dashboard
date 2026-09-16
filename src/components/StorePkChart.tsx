import ReactECharts from 'echarts-for-react'
import type { YearTotals } from '../lib/aggregates'
import { baseGrid, emptyGraphic, glow, useChartTokens, withAlpha } from '../lib/chartTheme'
import { formatMoneyExact, formatPct, formatWan } from '../lib/formulas'
import { useIsMobile } from '../lib/theme'

export type PkMetricKey = keyof Pick<YearTotals, 'sales' | 'totalExpense' | 'orderExpense' | 'payroll' | 'withdraw' | 'grossMargin'>

interface StoreSeries {
  name: string
  /** 12 个月的值；没有记录的月份为 null */
  values: Array<number | null>
}

interface Props {
  year: number
  selectedMonth: number | 'all'
  metricLabel: string
  percent?: boolean
  left: StoreSeries
  right: StoreSeries
}

/**
 * 双门店趋势：A 蓝 / B 橙（经 CVD 校验的相邻色），选中月份用竖向参考线和放大端点强调。
 */
export function StorePkChart({ year, selectedMonth, metricLabel, percent, left, right }: Props) {
  const tokens = useChartTokens()
  const mobile = useIsMobile()
  const formatValue = (value: number) => (percent ? formatPct(value) : formatMoneyExact(value))
  const selectedIndex = selectedMonth === 'all' ? -1 : selectedMonth - 1
  const hasData = [...left.values, ...right.values].some((v) => v !== null)
  const base = baseGrid(tokens, mobile)

  const line = (series: StoreSeries, color: string, symbol: string) => ({
    name: series.name,
    type: 'line',
    data: series.values,
    connectNulls: false,
    symbol,
    showSymbol: true,
    symbolSize: (_value: number, params: { dataIndex: number }) => (params.dataIndex === selectedIndex ? 12 : 6),
    itemStyle: { color, borderColor: tokens.surface, borderWidth: 2 },
    lineStyle: { color, width: 2.5, ...glow(color) },
    emphasis: { focus: 'series' },
  })

  const option = {
    backgroundColor: 'transparent',
    animationDuration: 400,
    ...base,
    grid: { ...base.grid, top: 40 },
    legend: {
      top: 4, left: 0, icon: 'roundRect', itemWidth: 14, itemHeight: 6, itemGap: 14,
      textStyle: { color: tokens.ink2, fontSize: 12 },
      data: [left.name, right.name],
    },
    xAxis: {
      ...base.xAxis,
      data: Array.from({ length: 12 }, (_, index) => `${index + 1}月`),
      axisLabel: {
        ...base.xAxis.axisLabel,
        color: (value: string) => (value === `${selectedMonth}月` ? tokens.ink : tokens.ink3),
        fontWeight: (value: string) => (value === `${selectedMonth}月` ? 600 : 400),
      },
    },
    yAxis: {
      ...base.yAxis,
      scale: percent,
      axisLabel: { ...base.yAxis.axisLabel, formatter: (value: number) => (percent ? `${Math.round(value * 100)}%` : formatWan(value)) },
    },
    tooltip: {
      ...base.tooltip,
      valueFormatter: (value: number | null) => (value === null || value === undefined ? '无记录' : formatValue(Number(value))),
    },
    series: [
      {
        ...line(left, tokens.storeA, 'circle'),
        markLine: selectedIndex >= 0 ? {
          silent: true,
          symbol: 'none',
          lineStyle: { color: withAlpha(tokens.ink3, 0.6), type: 'dashed', width: 1 },
          label: { show: true, position: 'insideEndTop', color: tokens.ink3, fontSize: 10, formatter: `${selectedMonth}月` },
          data: [{ xAxis: `${selectedMonth}月` }],
        } : undefined,
      },
      line(right, tokens.storeB, 'diamond'),
    ],
    graphic: hasData ? undefined : [emptyGraphic(`${year} 年两家门店都没有${metricLabel}数据`, tokens)],
  }

  return (
    <div className="px-2 pb-2 pt-1 sm:px-3">
      <ReactECharts option={option} notMerge style={{ height: mobile ? 260 : 340, width: '100%' }} opts={{ renderer: 'canvas' }} />
    </div>
  )
}
