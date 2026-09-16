import type { ChannelAmount, MoneyLine, MonthlyRecord } from '../types'
import { HIGHLIGHT_KEYWORDS } from '../types'

function lineId(prefix = 'line'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function sumAmounts(items: MoneyLine[]): number {
  return items.reduce((s, it) => s + (Number(it.amount) || 0), 0)
}

export function sumChannelAmounts(items: ChannelAmount[]): number {
  const total = items.reduce((sum, item) => sum + Math.abs(Number(item.amount) || 0), 0)
  return Math.round(total * 100) / 100
}

export function shouldHighlight(detail: string, explicit?: boolean): boolean {
  if (explicit === true) return true
  if (explicit === false) return false
  return HIGHLIGHT_KEYWORDS.some((k) => detail.includes(k))
}

export function emptyLine(day = 1): MoneyLine {
  return {
    id: lineId('line'),
    day,
    detail: '',
    amount: 0,
    highlight: false,
  }
}

export function emptyChannel(): ChannelAmount {
  return {
    id: lineId('channel'),
    name: '',
    amount: 0,
  }
}

const WITHDRAW_KEYWORDS = ['提现', '提取']

/**
 * 旧版导入把 Excel 的“提现”列同时写进了收入渠道，导致营业额实收被重复抬高。
 * 这里在规范化时剔除由 Excel 导入的提现渠道；手工录入的渠道不受影响。
 */
function isImportedWithdrawChannel(channel: ChannelAmount): boolean {
  return channel.id.startsWith('xls-channel-income-') && WITHDRAW_KEYWORDS.some((keyword) => channel.name.includes(keyword))
}

function normalizeChannel(channel: Partial<ChannelAmount>): ChannelAmount {
  return {
    id: channel.id || lineId('channel'),
    name: String(channel.name ?? '').trim(),
    amount: Math.abs(Number(channel.amount) || 0),
  }
}

/** 将旧版扁平收入/支出转为单条「汇总」明细 */
export function syntheticLine(amount: number, prefix = 'sum'): MoneyLine {
  return {
    id: lineId(prefix),
    day: 1,
    detail: '汇总',
    amount: Number(amount) || 0,
    highlight: false,
  }
}

export function syncRecordTotals(record: MonthlyRecord): MonthlyRecord {
  const incomeItems = record.incomeItems ?? []
  const expenseItems = record.expenseItems ?? []
  const incomeChannels = record.incomeChannels ?? []
  const expenseChannels = record.expenseChannels ?? []
  return {
    ...record,
    incomeItems,
    expenseItems,
    incomeChannels,
    expenseChannels,
    sales: sumChannelAmounts(incomeChannels),
    totalExpense: sumChannelAmounts(expenseChannels),
    income: Number(record.income) || 0,
    expense: Number(record.expense) || 0,
  }
}

function normalizeLine(line: Partial<MoneyLine>): MoneyLine {
  const detail = String(line.detail ?? '')
  const highlight =
    typeof line.highlight === 'boolean'
      ? line.highlight
      : shouldHighlight(detail)
  return {
    id: line.id || lineId('line'),
    day: clampDay(Number(line.day) || 1),
    detail,
    amount: Number(line.amount) || 0,
    highlight,
  }
}

export function clampDay(day: number): number {
  if (!Number.isFinite(day) || day < 1) return 1
  if (day > 31) return 31
  return Math.floor(day)
}

/** 展示用日期：M.D */
export function formatDayLabel(month: number, day: number): string {
  return `${month}.${day}`
}

/**
 * 规范化单条月度记录。营业额和总支出始终由渠道合计得出；
 * 对升级前没有渠道的记录生成兼容渠道，以保留历史数值。
 */
export function normalizeRecord(
  raw: Partial<MonthlyRecord> &
    Pick<MonthlyRecord, 'id' | 'storeId' | 'year' | 'month'>,
): MonthlyRecord {
  const previousSales = Number(raw.sales) || 0
  const previousTotalExpense = Number(raw.totalExpense) || Number(raw.ledger?.systemExpense) || 0
  const orderExpense = Number(raw.orderExpense) || Number(raw.ledger?.orderExpense) || 0
  const payroll = Number(raw.payroll) || Number(raw.ledger?.payroll) || 0
  const withdraw = Number(raw.withdraw) || 0
  const dividend = Number(raw.dividend) || 0
  const oldIncome = Number(raw.income) || 0
  const oldExpense = Number(raw.expense) || 0

  const hasIncomeItems = Array.isArray(raw.incomeItems)
  const hasExpenseItems = Array.isArray(raw.expenseItems)

  const incomeItems: MoneyLine[] = hasIncomeItems
    ? (raw.incomeItems as MoneyLine[]).map(normalizeLine)
    : [syntheticLine(oldIncome, 'inc')]

  const expenseItems: MoneyLine[] = hasExpenseItems
    ? (raw.expenseItems as MoneyLine[]).map(normalizeLine)
    : [syntheticLine(oldExpense, 'exp')]

  const legacyChannels = Object.entries(raw.ledger?.channels ?? {})
  const migratedIncomeChannels: ChannelAmount[] = Array.isArray(raw.incomeChannels)
    ? raw.incomeChannels.map(normalizeChannel).filter((channel) => !isImportedWithdrawChannel(channel))
    : legacyChannels
        .filter(([, amount]) => Number(amount) >= 0)
        .map(([name, amount], index) => normalizeChannel({
          id: `legacy-channel-income-${index}`,
          name,
          amount,
        }))
  const migratedExpenseChannels: ChannelAmount[] = Array.isArray(raw.expenseChannels)
    ? raw.expenseChannels.map(normalizeChannel)
    : legacyChannels
        .filter(([, amount]) => Number(amount) < 0)
        .map(([name, amount], index) => normalizeChannel({
          id: `legacy-channel-expense-${index}`,
          name,
          amount,
        }))
  // 只有“完全没有渠道数组”的旧记录才用历史营业额兜底；
  // 已有渠道数组但剔除提现后为空的记录，营业额应当为 0。
  const incomeChannels = Array.isArray(raw.incomeChannels) || migratedIncomeChannels.length || previousSales === 0
    ? migratedIncomeChannels
    : [normalizeChannel({
        id: 'legacy-channel-sales',
        name: '历史营业额',
        amount: previousSales,
      })]
  const expenseChannels = migratedExpenseChannels.length || previousTotalExpense === 0
    ? migratedExpenseChannels
    : [normalizeChannel({
        id: 'legacy-channel-total-expense',
        name: '历史总支出',
        amount: previousTotalExpense,
      })]

  return syncRecordTotals({
    id: raw.id,
    storeId: raw.storeId,
    year: Number(raw.year),
    month: Number(raw.month),
    sales: previousSales,
    totalExpense: previousTotalExpense,
    orderExpense,
    payroll,
    withdraw,
    dividend,
    income: oldIncome,
    expense: oldExpense,
    incomeItems,
    expenseItems,
    incomeChannels,
    expenseChannels,
    ledger: raw.ledger,
  })
}
