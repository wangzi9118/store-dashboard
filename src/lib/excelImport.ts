import * as XLSX from '@e965/xlsx'
import type { ChannelAmount, ImportedLedgerSnapshot, MoneyLine } from '../types'
import { shouldHighlight, sumChannelAmounts } from './moneyLines'

export interface ExcelImportRow {
  storeName: string
  year: number
  month: number
  sales: number
  totalExpense: number
  orderExpense: number
  payroll: number
  income: number
  expense: number
  withdraw: number
  incomeItems: MoneyLine[]
  expenseItems: MoneyLine[]
  incomeChannels: ChannelAmount[]
  expenseChannels: ChannelAmount[]
  sourceIncome: number
  sourceExpense: number
  sourceSheet: string
  hasWithdraw: boolean
  ledger: ImportedLedgerSnapshot
}

export interface ExcelImportResult {
  fileName: string
  rows: ExcelImportRow[]
  warnings: string[]
  /** 汇总页中被识别为汇总/比率/提现、因此没有作为渠道导入的列 */
  ignoredColumns: string[]
  summarySheet?: string
  detailSheet?: string
}

type Cell = unknown
type Row = Cell[]

function text(value: Cell): string {
  return String(value ?? '').replace(/[\s\u3000]+/g, '').trim()
}

function numberValue(value: Cell): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const raw = String(value ?? '').replace(/[，,￥¥\s]/g, '').trim()
  if (!raw || raw === '-' || raw === '—') return 0
  const parsed = Number(raw.replace(/%$/, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function positive(value: Cell): number {
  return Math.abs(numberValue(value))
}

function findHeader(rows: Row[], required: string[]): number {
  return rows.findIndex((row) => {
    const joined = row.map(text).join('|')
    return required.every((key) => joined.includes(key))
  })
}

function headerMap(row: Row): Map<string, number> {
  const map = new Map<string, number>()
  row.forEach((cell, index) => {
    const key = text(cell)
    if (key) map.set(key, index)
  })
  return map
}

function findColumn(headers: Map<string, number>, aliases: string[]): number | undefined {
  for (const alias of aliases) {
    const exact = headers.get(alias)
    if (exact !== undefined) return exact
  }
  for (const [header, index] of headers) {
    if (aliases.some((alias) => header.includes(alias))) return index
  }
  return undefined
}

function detectYear(sheetName: string, rows: Row[], fallback = new Date().getFullYear()): number {
  const textToSearch = `${sheetName} ${rows.slice(0, 8).flat().map(text).join(' ')}`
  const match = textToSearch.match(/(20\d{2})年?/)
  return match ? Number(match[1]) : fallback
}

function parseMonth(value: Cell): number {
  const match = String(value ?? '').match(/(\d{1,2})/)
  const month = match ? Number(match[1]) : 0
  return month >= 1 && month <= 12 ? month : 0
}

function line(id: string, day: number, detail: string, amount: number): MoneyLine {
  return {
    id,
    day: Math.min(31, Math.max(1, Math.floor(day || 1))),
    detail: detail || '导入明细',
    amount,
    highlight: shouldHighlight(detail),
  }
}

/**
 * 不作为收支渠道导入的列：定位列、汇总列、比率列，以及“提现/提取”。
 * 提现是老板从账户取走的钱，单独写入 withdraw；如果再算作收入渠道，
 * 会被重复计入营业额实收并抬高毛利率。
 */
const CHANNEL_EXCLUSIONS = new Set([
  '店', '门店', '月', '系统收入金额', '系统支出金额', '营业额实收',
  '总收入', '收入合计', '总支出', '支出合计', '订货总支出',
  '订货占比', '工资占比', '本月结余', '余额', '备注', '提现', '提取',
])

const CHANNEL_EXCLUSION_KEYWORDS = ['提现', '提取']

export function isExcludedChannelName(name: string): boolean {
  const clean = name.trim()
  if (!clean) return true
  if (CHANNEL_EXCLUSIONS.has(clean)) return true
  return CHANNEL_EXCLUSION_KEYWORDS.some((keyword) => clean.includes(keyword))
}

function isExpenseChannel(value: number, groupName: string): boolean {
  if (value !== 0) return value < 0
  return groupName.includes('支出')
}

function parseChannels(headers: string[], groups: string[], row: Row): {
  incomeChannels: ChannelAmount[]
  expenseChannels: ChannelAmount[]
} {
  const incomeChannels: ChannelAmount[] = []
  const expenseChannels: ChannelAmount[] = []
  headers.forEach((name, index) => {
    if (!name || isExcludedChannelName(name)) return
    const value = numberValue(row[index])
    const expense = isExpenseChannel(value, groups[index] ?? '')
    const channel: ChannelAmount = {
      id: `xls-channel-${expense ? 'expense' : 'income'}-${index}`,
      name,
      amount: Math.abs(value),
    }
    if (expense) expenseChannels.push(channel)
    else incomeChannels.push(channel)
  })
  return { incomeChannels, expenseChannels }
}

function sheetRows(workbook: XLSX.WorkBook, name: string): Row[] {
  return XLSX.utils.sheet_to_json(workbook.Sheets[name], {
    header: 1,
    defval: null,
    raw: true,
  }) as Row[]
}

function findSummarySheet(workbook: XLSX.WorkBook): string | undefined {
  return workbook.SheetNames.find((name) => {
    const rows = sheetRows(workbook, name).slice(0, 15)
    return rows.some((row) => {
      const joined = row.map(text).join('|')
      return joined.includes('店') && joined.includes('月') && joined.includes('营业额')
    })
  })
}

function findDetailSheet(workbook: XLSX.WorkBook, summarySheet?: string): string | undefined {
  return workbook.SheetNames.find((name) => {
    if (name === summarySheet) return false
    const rows = sheetRows(workbook, name).slice(0, 15)
    return rows.some((row, index) => {
      const joined = row.map(text).join('|')
      const nearby = `${joined}|${(rows[index - 1] || []).map(text).join('|')}|${(rows[index + 1] || []).map(text).join('|')}`
      return joined.includes('月') && joined.includes('日') && nearby.includes('支出') && nearby.includes('收入')
    })
  })
}

function parseDetails(
  workbook: XLSX.WorkBook,
  sheetName: string | undefined,
): Map<string, { incomeItems: MoneyLine[]; expenseItems: MoneyLine[] }> {
  const result = new Map<string, { incomeItems: MoneyLine[]; expenseItems: MoneyLine[] }>()
  if (!sheetName) return result
  const rows = sheetRows(workbook, sheetName)
  const headerIndex = rows.findIndex((row) => row.map(text).includes('月') && row.map(text).includes('日'))
  if (headerIndex < 0) return result
  const headerRow = rows[headerIndex - 1] || []
  const headers = headerMap(rows[headerIndex].map((cell, index) => text(cell) || headerRow[index] || null))
  if (findColumn(headers, ['支出']) === undefined || findColumn(headers, ['收入']) === undefined) return result
  const monthIndex = findColumn(headers, ['月'])
  const dayIndex = findColumn(headers, ['日'])
  const detailIndex = findColumn(headers, ['明细'])
  const summaryIndex = findColumn(headers, ['摘要'])
  const expenseIndex = findColumn(headers, ['支出'])
  const incomeIndex = findColumn(headers, ['收入'])
  if (monthIndex === undefined || dayIndex === undefined) return result
  const year = detectYear(sheetName, rows)
  let sequence = 0
  for (const row of rows.slice(headerIndex + 1)) {
    const month = parseMonth(row[monthIndex])
    if (!month) continue
    const day = parseMonth(row[dayIndex]) || 1
    const detail = text(row[detailIndex ?? -1]) || text(row[summaryIndex ?? -1])
    const expense = positive(row[expenseIndex ?? -1])
    const income = positive(row[incomeIndex ?? -1])
    if (!detail && !expense && !income) continue
    const key = `${year}-${month}`
    const current = result.get(key) || { incomeItems: [], expenseItems: [] }
    if (expense > 0) current.expenseItems.push(line(`xls-exp-${++sequence}`, day, detail, expense))
    if (income > 0) current.incomeItems.push(line(`xls-inc-${++sequence}`, day, detail, income))
    result.set(key, current)
  }
  return result
}

function parseSummary(
  workbook: XLSX.WorkBook,
  sheetName: string,
  detailByMonth: Map<string, { incomeItems: MoneyLine[]; expenseItems: MoneyLine[] }>,
  warnings: string[],
  ignoredColumns: Set<string>,
): ExcelImportRow[] {
  const rows = sheetRows(workbook, sheetName)
  const headerIndex = findHeader(rows, ['店', '月', '营业额'])
  if (headerIndex < 0) throw new Error('没有找到包含“店、月、营业额”的汇总表头')
  const groupHeader = rows[headerIndex - 1] || []
  const headerNames = rows[headerIndex].map((cell, index) => text(cell) || text(groupHeader[index]))
  headerNames.forEach((name) => {
    if (name && isExcludedChannelName(name) && !['店', '门店', '月'].includes(name)) ignoredColumns.add(name)
  })
  let currentGroup = ''
  const groupNames = headerNames.map((_, index) => {
    const nextGroup = text(groupHeader[index])
    if (nextGroup) currentGroup = nextGroup
    return currentGroup
  })
  const headers = headerMap(headerNames)
  const storeIndex = findColumn(headers, ['店', '门店'])
  const monthIndex = findColumn(headers, ['月'])
  const incomeIndex = findColumn(headers, ['其他收入'])
  const expenseIndex = findColumn(headers, ['其他支出'])
  const systemIncomeIndex = findColumn(headers, ['系统收入金额'])
  const systemExpenseIndex = findColumn(headers, ['系统支出金额'])
  const withdrawIndex = findColumn(headers, ['提现', '提取'])
  const balanceIndex = findColumn(headers, ['本月结余', '余额'])
  const actualRevenueIndex = headers.get('营业额实收')
  const orderExpenseIndex = findColumn(headers, ['订货总支出'])
  const managementFeeIndex = findColumn(headers, ['门店管理费'])
  const disinfectionFeeIndex = findColumn(headers, ['消杀费用'])
  const brandFeeIndex = findColumn(headers, ['品牌使用费'])
  const otherExpenseIndex = findColumn(headers, ['另外支出费用'])
  const electricityIndex = findColumn(headers, ['电费'])
  const waterIndex = findColumn(headers, ['水费'])
  const rentIndex = findColumn(headers, ['房租', '租金'])
  const payrollIndex = findColumn(headers, ['工资'])
  const orderRatioIndex = findColumn(headers, ['订货占比'])
  const payrollRatioIndex = findColumn(headers, ['工资占比'])
  if (storeIndex === undefined || monthIndex === undefined) throw new Error('汇总表缺少门店或月份列')
  const year = detectYear(sheetName, rows)
  const result: ExcelImportRow[] = []
  let lastStore = ''
  for (const row of rows.slice(headerIndex + 1)) {
    const rawStore = text(row[storeIndex])
    if (rawStore && rawStore !== '总计') lastStore = rawStore
    const storeName = rawStore && rawStore !== '总计' ? rawStore : lastStore
    const month = parseMonth(row[monthIndex])
    if (!storeName || storeName === '总计' || !month) continue
    const sourceIncome = numberValue(row[incomeIndex ?? -1])
    const sourceExpense = positive(row[expenseIndex ?? -1])
    const details = detailByMonth.get(`${year}-${month}`)
    const incomeItems = details?.incomeItems ?? []
    const expenseItems = details?.expenseItems ?? []
    if (details && incomeItems.length + expenseItems.length > 0) {
      warnings.push(`${storeName} ${year}年${month}月：已读取明细页中的 ${incomeItems.length + expenseItems.length} 条收支明细。`)
    }
    const { incomeChannels, expenseChannels } = parseChannels(headerNames, groupNames, row)
    const sales = sumChannelAmounts(incomeChannels)
    const totalExpense = sumChannelAmounts(expenseChannels)
    const channels = Object.fromEntries([
      ...incomeChannels.map((channel) => [channel.name, channel.amount] as const),
      ...expenseChannels.map((channel) => [channel.name, -channel.amount] as const),
    ])
    const ratio = (value: Cell) => {
      const parsed = numberValue(value)
      return Math.abs(parsed) > 1 ? parsed / 100 : parsed
    }
    const ledger: ImportedLedgerSnapshot = {
      sourceFile: '',
      sourceSheet: sheetName,
      importedAt: '',
      systemIncome: positive(row[systemIncomeIndex ?? -1]),
      systemExpense: positive(row[systemExpenseIndex ?? -1]),
      balance: numberValue(row[balanceIndex ?? -1]),
      actualRevenue: positive(row[actualRevenueIndex ?? -1]),
      orderExpense: positive(row[orderExpenseIndex ?? -1]),
      managementFee: positive(row[managementFeeIndex ?? -1]),
      disinfectionFee: positive(row[disinfectionFeeIndex ?? -1]),
      brandFee: positive(row[brandFeeIndex ?? -1]),
      otherExpense: positive(row[otherExpenseIndex ?? -1]),
      electricity: positive(row[electricityIndex ?? -1]),
      water: positive(row[waterIndex ?? -1]),
      rent: positive(row[rentIndex ?? -1]),
      payroll: positive(row[payrollIndex ?? -1]),
      orderRatio: ratio(row[orderRatioIndex ?? -1]),
      payrollRatio: ratio(row[payrollRatioIndex ?? -1]),
      channels,
    }
    result.push({
      storeName,
      year,
      month,
      sales,
      totalExpense,
      orderExpense: positive(row[orderExpenseIndex ?? -1]),
      payroll: positive(row[payrollIndex ?? -1]),
      income: incomeItems.length ? incomeItems.reduce((sum, item) => sum + item.amount, 0) : sourceIncome,
      expense: expenseItems.length ? expenseItems.reduce((sum, item) => sum + item.amount, 0) : sourceExpense || positive(row[systemExpenseIndex ?? -1]),
      withdraw: positive(row[withdrawIndex ?? -1]),
      incomeItems,
      expenseItems,
      incomeChannels,
      expenseChannels,
      sourceIncome,
      sourceExpense,
      sourceSheet: sheetName,
      hasWithdraw: withdrawIndex !== undefined,
      ledger,
    })
  }
  return result
}

function hasMeaningfulData(row: ExcelImportRow): boolean {
  const ledgerNumbers = [
    row.ledger.systemIncome,
    row.ledger.systemExpense,
    row.ledger.balance,
    row.ledger.actualRevenue,
    row.ledger.orderExpense,
    row.ledger.managementFee,
    row.ledger.disinfectionFee,
    row.ledger.brandFee,
    row.ledger.otherExpense,
    row.ledger.electricity,
    row.ledger.water,
    row.ledger.rent,
    row.ledger.payroll,
  ]
  return (
    [row.sales, row.totalExpense, row.orderExpense, row.payroll, row.withdraw, ...ledgerNumbers].some(
      (value) => value !== 0,
    ) ||
    [...row.incomeChannels, ...row.expenseChannels].some((channel) => channel.amount !== 0) ||
    [...row.incomeItems, ...row.expenseItems].some((item) => item.amount !== 0 || item.detail.trim() !== '')
  )
}

export function parseExcelImport(buffer: ArrayBuffer, fileName: string): ExcelImportResult {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
  const warnings: string[] = []
  const summarySheet = findSummarySheet(workbook)
  if (!summarySheet) throw new Error('未找到可识别的汇总工作表。需要包含“店、月、营业额”列。')
  const detailSheet = findDetailSheet(workbook, summarySheet)
  const detailByMonth = parseDetails(workbook, detailSheet)
  const ignoredColumns = new Set<string>()
  const parsedRows = parseSummary(workbook, summarySheet, detailByMonth, warnings, ignoredColumns)
  const rows = parsedRows.filter(hasMeaningfulData)
  const ignoredRows = parsedRows.length - rows.length
  if (!rows.length) throw new Error('汇总表中没有找到可导入的门店月份数据。')
  if (ignoredRows > 0) warnings.unshift(`已忽略 ${ignoredRows} 条全部为空或为 0 的月份数据。`)
  if (detailSheet && detailByMonth.size > 0) warnings.unshift(`已识别明细工作表“${detailSheet}”，收入/支出明细会写入月度录入。`)
  const importedAt = new Date().toISOString()
  rows.forEach((row) => {
    row.ledger.sourceFile = fileName
    row.ledger.importedAt = importedAt
  })
  return { fileName, rows, warnings, ignoredColumns: [...ignoredColumns], summarySheet, detailSheet }
}
