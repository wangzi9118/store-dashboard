export interface Store {
  id: string
  name: string
  createdAt: string
}

/** 收入/支出明细行 */
export interface MoneyLine {
  id: string
  /** 日（1–31），展示为 M.D */
  day: number
  detail: string
  amount: number
  /** 可选高亮（如电费、工资类行） */
  highlight?: boolean
}

/** 月度收入/支出渠道金额 */
export interface ChannelAmount {
  id: string
  name: string
  amount: number
}

export interface ImportedLedgerSnapshot {
  sourceFile: string
  sourceSheet: string
  importedAt: string
  systemIncome: number
  systemExpense: number
  balance: number
  actualRevenue: number
  orderExpense: number
  managementFee: number
  disinfectionFee: number
  brandFee: number
  otherExpense: number
  electricity: number
  water: number
  rent: number
  payroll: number
  orderRatio: number
  payrollRatio: number
  channels: Record<string, number>
}

export interface MonthlyRecord {
  id: string
  storeId: string
  year: number
  month: number // 1-12
  sales: number // 营业额实收（= sum incomeChannels）
  totalExpense: number // 总支出（= sum expenseChannels）
  orderExpense: number // 订货支出
  payroll: number // 工资支出
  /** 旧版兼容字段，不参与经营指标计算 */
  income: number
  /** 旧版兼容字段，不参与经营指标计算 */
  expense: number
  withdraw: number // 提现
  /** 旧版兼容字段，不再展示或参与计算 */
  dividend: number
  incomeItems: MoneyLine[]
  expenseItems: MoneyLine[]
  incomeChannels: ChannelAmount[]
  expenseChannels: ChannelAmount[]
  /** 旧版 Excel 快照，仅用于兼容历史数据，不再参与看板展示 */
  ledger?: ImportedLedgerSnapshot
}

/** 门店年度 KPI 目标（按 storeId + year 唯一） */
export interface AnnualTarget {
  id: string
  storeId: string
  year: number
  /** 营业额目标 */
  salesTarget: number
  /** 可选扩展字段（v1 录入支持，看板暂未单独使用） */
  incomeTarget?: number
  expenseTarget?: number
  withdrawTarget?: number
  dividendTarget?: number
}

export interface AppData {
  stores: Store[]
  records: MonthlyRecord[]
  targets: AnnualTarget[]
  seeded: boolean
}

export const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030] as const

export const AUTH_USER = 'admin'
export const AUTH_PASS = 'change-me'
export const AUTH_KEY = 'store-dashboard-auth'
export const DATA_KEY = 'store-dashboard-data'

/** 明细含这些关键词时自动高亮 */
export const HIGHLIGHT_KEYWORDS = ['电费', '工资', '房租', '租金'] as const
