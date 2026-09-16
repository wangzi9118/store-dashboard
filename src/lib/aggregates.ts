import type { MonthlyRecord } from '../types'
import { grossMargin } from './formulas'

export interface YearTotals {
  sales: number
  totalExpense: number
  orderExpense: number
  orderRatio: number
  payroll: number
  payrollRatio: number
  withdraw: number
  grossMargin: number
}

export interface MonthSeries {
  month: number
  sales: number
  expense: number
  /** 该月记录数；为 0 表示没有数据，图表应画为空而不是 0 */
  count: number
}

export type MonthFilter = number | 'all'

export function filterRecords(
  records: MonthlyRecord[],
  year: number,
  storeId: string | 'all',
  month: MonthFilter = 'all',
): MonthlyRecord[] {
  return records.filter(
    (r) =>
      r.year === year &&
      (storeId === 'all' || r.storeId === storeId) &&
      (month === 'all' || r.month === month),
  )
}

export function sumTotals(records: MonthlyRecord[]): YearTotals {
  const t = records.reduce(
    (a, r) => {
      a.sales += r.sales
      a.totalExpense += r.totalExpense
      a.orderExpense += r.orderExpense
      a.payroll += r.payroll
      a.withdraw += r.withdraw
      return a
    },
    { sales: 0, totalExpense: 0, orderExpense: 0, payroll: 0, withdraw: 0 },
  )
  return {
    ...t,
    orderRatio: t.sales > 0 ? t.orderExpense / t.sales : 0,
    payrollRatio: t.sales > 0 ? t.payroll / t.sales : 0,
    grossMargin: grossMargin(t.sales, t.totalExpense),
  }
}

export function monthlySeries(
  records: MonthlyRecord[],
  month: MonthFilter = 'all',
): MonthSeries[] {
  const months = month === 'all' ? Array.from({ length: 12 }, (_, i) => i + 1) : [month]
  return months.map((m) => {
    const monthRecs = records.filter((r) => r.month === m)
    return {
      month: m,
      sales: monthRecs.reduce((s, r) => s + r.sales, 0),
      expense: monthRecs.reduce((s, r) => s + r.totalExpense, 0),
      count: monthRecs.length,
    }
  })
}
