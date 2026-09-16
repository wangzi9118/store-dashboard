import type { AnnualTarget, AppData, MoneyLine, MonthlyRecord, Store } from '../types'
import { shouldHighlight, sumAmounts } from './moneyLines'

const stores: Store[] = [
  { id: 'store-1', name: '旗舰店（徐汇）', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'store-2', name: '静安店', createdAt: '2025-01-01T00:00:00.000Z' },
  { id: 'store-3', name: '浦东店', createdAt: '2025-01-01T00:00:00.000Z' },
]

let seedLineSeq = 0
function sid(prefix: string): string {
  return `${prefix}-seed-${++seedLineSeq}`
}

function makeLine(day: number, detail: string, amount: number, highlight?: boolean): MoneyLine {
  const h = highlight ?? shouldHighlight(detail)
  return { id: sid('line'), day, detail, amount, highlight: h }
}

function withItems(
  base: Omit<MonthlyRecord, 'incomeItems' | 'expenseItems' | 'incomeChannels' | 'expenseChannels' | 'income' | 'expense' | 'totalExpense' | 'orderExpense' | 'payroll'> &
  Partial<Pick<MonthlyRecord, 'totalExpense' | 'orderExpense' | 'payroll'>> & {
    incomeItems: MoneyLine[]
    expenseItems: MoneyLine[]
  },
): MonthlyRecord {
  const detailExpense = sumAmounts(base.expenseItems)
  const totalExpense = base.totalExpense ?? detailExpense
  return {
    ...base,
    totalExpense,
    orderExpense: base.orderExpense ?? Math.round(totalExpense * 0.58),
    payroll: base.payroll ?? Math.round(totalExpense * 0.18),
    income: sumAmounts(base.incomeItems),
    expense: detailExpense,
    incomeChannels: [],
    expenseChannels: [],
  }
}

function summaryItems(income: number, expense: number): {
  incomeItems: MoneyLine[]
  expenseItems: MoneyLine[]
} {
  return {
    incomeItems: [makeLine(1, '汇总', income)],
    expenseItems: [makeLine(1, '汇总', expense)],
  }
}

/**
 * Realistic 2025 monthly sample approximating the reference dashboard totals:
 * 营业额 ~1,406,005 | 其他收入 ~1,399,208 | 其他支出 ~789,505
 * 总提现 ~589,547 | 总分红 ~367,088
 */
function build2025Records(): MonthlyRecord[] {
  const salesByMonth = [
    98500, 166648, 112400, 98520, 87500, 102300, 178200, 172800, 118600, 95600, 88420, 86517,
  ]
  const weights = [0.42, 0.33, 0.25]

  const records: MonthlyRecord[] = []
  let idx = 0

  for (let m = 1; m <= 12; m++) {
    const monthSales = salesByMonth[m - 1]
    for (let s = 0; s < stores.length; s++) {
      const w = weights[s]
      const sales = Math.round(monthSales * w)
      const income = Math.round(sales * 0.995)
      const expense = Math.round(sales * 0.5615)
      const withdraw = Math.round(sales * 0.4193)
      const dividend = Math.round(sales * 0.2611)
      const items = summaryItems(income, expense)
      records.push(
        withItems({
          id: `rec-${++idx}`,
          storeId: stores[s].id,
          year: 2025,
          month: m,
          sales,
          withdraw,
          dividend,
          ...items,
        }),
      )
    }
  }

  const totals = records.reduce(
    (a, r) => {
      a.sales += r.sales
      a.income += r.income
      a.expense += r.expense
      a.withdraw += r.withdraw
      a.dividend += r.dividend
      return a
    },
    { sales: 0, income: 0, expense: 0, withdraw: 0, dividend: 0 },
  )

  const targets = {
    sales: 1406005,
    income: 1399208,
    expense: 789505,
    withdraw: 589547,
    dividend: 367088,
  }

  const last = records[records.length - 1]
  last.sales += targets.sales - totals.sales
  last.withdraw += targets.withdraw - totals.withdraw
  last.dividend += targets.dividend - totals.dividend
  // Adjust last summary lines so income/expense hit targets
  const incomeAdj = targets.income - (totals.income - last.income)
  const expenseAdj = targets.expense - (totals.expense - last.expense)
  last.incomeItems = [makeLine(1, '汇总', incomeAdj)]
  last.expenseItems = [makeLine(1, '汇总', expenseAdj)]
  last.income = incomeAdj
  last.expense = expenseAdj

  return records
}

/** Sparse 2024 sample so year switch still shows something */
function build2024Sample(): MonthlyRecord[] {
  const records: MonthlyRecord[] = []
  let idx = 1000
  const base = [72000, 81000, 76500, 84000, 91000, 95500, 102000, 98000, 87000, 82000, 79000, 85000]
  for (let m = 1; m <= 12; m++) {
    const sales = base[m - 1]
    const income = Math.round(sales * 0.99)
    const expense = Math.round(sales * 0.55)
    records.push(
      withItems({
        id: `rec-${++idx}`,
        storeId: 'store-1',
        year: 2024,
        month: m,
        sales,
        withdraw: Math.round(sales * 0.4),
        dividend: Math.round(sales * 0.24),
        ...summaryItems(income, expense),
      }),
    )
  }
  return records
}

/**
 * 2026.3 旗舰店：多行明细样例，贴近参考表（左支出 / 右收入）
 */
function build2026MarchDetailSample(): MonthlyRecord[] {
  const expenseItems: MoneyLine[] = [
    makeLine(1, '房租', 18000, true),
    makeLine(3, '电费', 2450, true),
    makeLine(5, '货款进货', 28600),
    makeLine(8, '员工工资', 32000, true),
    makeLine(11, '快递运费', 1860),
    makeLine(15, '耗材采购', 3200),
    makeLine(18, '水电费补缴', 980),
    makeLine(22, '推广投放', 5600),
    makeLine(25, '维修保养', 1200),
    makeLine(28, '其他杂费', 860),
  ]
  const incomeItems: MoneyLine[] = [
    makeLine(1, '零售收银', 42000),
    makeLine(4, '线上订单回款', 18500),
    makeLine(9, '会员充值', 8000),
    makeLine(12, '批发货款', 15600),
    makeLine(16, '活动定金', 3200),
    makeLine(20, '售后补差', 680),
    makeLine(24, '其他收入', 1500),
    makeLine(27, '尾款结算', 9200),
  ]

  const sales = 98000
  return [
    withItems({
      id: 'rec-2026-3-1',
      storeId: 'store-1',
      year: 2026,
      month: 3,
      sales,
      withdraw: 28000,
      dividend: 15000,
      incomeItems,
      expenseItems,
    }),
    withItems({
      id: 'rec-2026-3-2',
      storeId: 'store-2',
      year: 2026,
      month: 3,
      sales: 72000,
      withdraw: 20000,
      dividend: 11000,
      ...summaryItems(71500, 40500),
    }),
  ]
}

function build2025Targets(): AnnualTarget[] {
  return [
    {
      id: 'tgt-2025-1',
      storeId: 'store-1',
      year: 2025,
      salesTarget: 630000,
      incomeTarget: 625000,
      expenseTarget: 350000,
      withdrawTarget: 260000,
      dividendTarget: 165000,
    },
    {
      id: 'tgt-2025-2',
      storeId: 'store-2',
      year: 2025,
      salesTarget: 495000,
      incomeTarget: 490000,
      expenseTarget: 275000,
      withdrawTarget: 205000,
      dividendTarget: 130000,
    },
    {
      id: 'tgt-2025-3',
      storeId: 'store-3',
      year: 2025,
      salesTarget: 375000,
      incomeTarget: 370000,
      expenseTarget: 210000,
      withdrawTarget: 155000,
      dividendTarget: 98000,
    },
  ]
}

function build2024Targets(): AnnualTarget[] {
  return [
    {
      id: 'tgt-2024-1',
      storeId: 'store-1',
      year: 2024,
      salesTarget: 1100000,
      incomeTarget: 1080000,
      expenseTarget: 600000,
      withdrawTarget: 450000,
      dividendTarget: 270000,
    },
  ]
}

function build2026Targets(): AnnualTarget[] {
  return [
    {
      id: 'tgt-2026-1',
      storeId: 'store-1',
      year: 2026,
      salesTarget: 650000,
      incomeTarget: 640000,
      expenseTarget: 360000,
      withdrawTarget: 270000,
      dividendTarget: 170000,
    },
    {
      id: 'tgt-2026-2',
      storeId: 'store-2',
      year: 2026,
      salesTarget: 510000,
      incomeTarget: 500000,
      expenseTarget: 285000,
      withdrawTarget: 210000,
      dividendTarget: 135000,
    },
    {
      id: 'tgt-2026-3',
      storeId: 'store-3',
      year: 2026,
      salesTarget: 390000,
      incomeTarget: 380000,
      expenseTarget: 220000,
      withdrawTarget: 160000,
      dividendTarget: 100000,
    },
  ]
}

export function createSeedData(): AppData {
  return {
    stores: [...stores],
    records: [...build2025Records(), ...build2024Sample(), ...build2026MarchDetailSample()],
    targets: [...build2025Targets(), ...build2024Targets(), ...build2026Targets()],
    seeded: true,
  }
}
