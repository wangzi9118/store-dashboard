import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Button, IconButton } from '../components/ui/Button'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, ReadonlyValue } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { MoneyInput } from '../components/ui/MoneyInput'
import { PageHeader, SectionHeader } from '../components/ui/PageHeader'
import { Pill } from '../components/ui/Pill'
import { Segmented } from '../components/ui/Segmented'
import { useToast } from '../components/ui/Toast'
import { useData } from '../context/DataContext'
import { parseExcelImport, type ExcelImportResult } from '../lib/excelImport'
import { formatMoney, formatMoneyExact, formatPct, grossMargin } from '../lib/formulas'
import { clampDay, emptyChannel, emptyLine, shouldHighlight, sumAmounts, sumChannelAmounts, syncRecordTotals } from '../lib/moneyLines'
import { newId } from '../lib/storage'
import { useIsMobile } from '../lib/theme'
import { useCurrentUser } from '../lib/auth'
import { downloadTemplate, getTemplateMeta, type TemplateMeta } from '../lib/templateApi'
import { YEARS } from '../types'
import type { ChannelAmount, MoneyLine, MonthlyRecord, Store } from '../types'

const now = new Date()
const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1)

interface Scope { storeId: string; year: number; month: number }

function cloneLines(items: MoneyLine[] | undefined): MoneyLine[] {
  return items?.length ? items.map((item) => ({ ...item })) : [emptyLine(1)]
}

function cleanLines(items: MoneyLine[]): MoneyLine[] {
  return items
    .map((item) => ({ ...item, day: clampDay(item.day), detail: item.detail.trim(), amount: Math.abs(Number(item.amount) || 0), highlight: item.highlight || shouldHighlight(item.detail) }))
    .filter((item) => item.detail !== '' || item.amount !== 0)
}

function mergeImportedLines(imported: MoneyLine[], existing: MoneyLine[] | undefined): MoneyLine[] {
  if (!imported.length) return cloneLines(existing)
  return [...imported, ...(existing ?? []).filter((item) => !item.id.startsWith('xls-'))]
}

function cloneChannels(items: ChannelAmount[] | undefined): ChannelAmount[] {
  return items?.length ? items.map((item) => ({ ...item })) : [emptyChannel()]
}

function cleanChannels(items: ChannelAmount[]): ChannelAmount[] {
  return items
    .map((item) => ({ ...item, name: item.name.trim(), amount: Math.abs(Number(item.amount) || 0) }))
    .filter((item) => item.name !== '')
}

function mergeImportedChannels(imported: ChannelAmount[], existing: ChannelAmount[] | undefined): ChannelAmount[] {
  const manual = (existing ?? []).filter((item) => !item.id.startsWith('xls-channel-') && !item.id.startsWith('legacy-channel-'))
  return [...imported.map((item) => ({ ...item })), ...manual]
}

function isEmptyRecord(record: MonthlyRecord): boolean {
  const hasMetrics = [record.sales, record.totalExpense, record.orderExpense, record.payroll, record.withdraw].some((value) => value !== 0)
  const hasChannels = [...record.incomeChannels, ...record.expenseChannels].some((item) => item.amount !== 0 || item.name.trim() !== '')
  const hasDetails = [...record.incomeItems, ...record.expenseItems].some((item) => item.amount !== 0 || item.detail.trim() !== '')
  return !hasMetrics && !hasChannels && !hasDetails
}

function isInProgress(year: number, month: number): boolean {
  return year === now.getFullYear() && month === now.getMonth() + 1
}

/* ------------------------------------------------------------------------- */

interface ChannelTableProps {
  items: ChannelAmount[]
  tone: 'income' | 'expense'
  onChange: (items: ChannelAmount[]) => void
}

function ChannelTable({ items, tone, onChange }: ChannelTableProps) {
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  const swatch = tone === 'income' ? 'bg-income' : 'bg-expense'

  function update(index: number, patch: Partial<ChannelAmount>) {
    onChange(items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)))
  }
  function remove(index: number) {
    onChange(items.length <= 1 ? [emptyChannel()] : items.filter((_, itemIndex) => itemIndex !== index))
  }
  function add() {
    onChange([...items, emptyChannel()])
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden="true" />{tone === 'income' ? '收入渠道' : '支出渠道'}
          <span className="text-xs font-normal text-ink-3">{items.filter((item) => item.name.trim()).length} 项</span>
        </h3>
        <Button size="sm" variant="secondary" icon="plus" onClick={add}>添加渠道</Button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_7.5rem_2.25rem] gap-x-2 px-4 pb-1 text-xs text-ink-3 sm:grid-cols-[minmax(0,1fr)_9rem_2.25rem]">
        <span>渠道名称</span><span className="text-right">金额</span><span />
      </div>
      <ul className="space-y-1.5 px-4 pb-3">
        {items.map((item, index) => (
          <li key={item.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_2.25rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_9rem_2.25rem]">
            <input
              type="text"
              value={item.name}
              onChange={(event) => update(index, { name: event.target.value })}
              placeholder={tone === 'income' ? '例如：美团外卖' : '例如：房租'}
              aria-label={`${tone === 'income' ? '收入' : '支出'}渠道名称`}
              className="control control-sm"
            />
            <MoneyInput size="sm" value={item.amount} onChange={(amount) => update(index, { amount })} aria-label="渠道金额" />
            <IconButton icon="trash" label="删除该渠道" tone="danger" onClick={() => remove(index)} />
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2 text-sm">
        <span className="text-ink-3">{tone === 'income' ? '收入渠道合计 = 营业额实收' : '支出渠道合计 = 总支出'}</span>
        <span className="font-semibold text-ink tnum">{formatMoneyExact(total)}</span>
      </div>
    </div>
  )
}

interface MoneyTableProps {
  month: number
  items: MoneyLine[]
  tone: 'income' | 'expense'
  onChange: (items: MoneyLine[]) => void
}

function MoneyTable({ month, items, tone, onChange }: MoneyTableProps) {
  const total = sumAmounts(items)
  const swatch = tone === 'income' ? 'bg-income' : 'bg-expense'

  function update(index: number, patch: Partial<MoneyLine>) {
    onChange(items.map((row, rowIndex) => {
      if (rowIndex !== index) return row
      const merged = { ...row, ...patch }
      if (patch.detail !== undefined && patch.highlight === undefined) merged.highlight = shouldHighlight(merged.detail)
      if (patch.day !== undefined) merged.day = clampDay(Number(patch.day) || 1)
      if (patch.amount !== undefined) merged.amount = Math.abs(Number(patch.amount) || 0)
      return merged
    }))
  }

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <span className={`h-2.5 w-2.5 rounded-sm ${swatch}`} aria-hidden="true" />{tone === 'income' ? '收入明细' : '支出明细'}
          <span className="text-xs font-normal text-ink-3">{items.filter((item) => item.detail.trim() || item.amount).length} 条</span>
        </h3>
        <Button size="sm" variant="secondary" icon="plus" onClick={() => onChange([...items, emptyLine(items.at(-1)?.day || 1)])}>添加一行</Button>
      </div>
      <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_7rem_2.25rem] gap-x-2 px-4 pb-1 text-xs text-ink-3">
        <span>日期</span><span>明细说明</span><span className="text-right">金额</span><span />
      </div>
      <ul className="space-y-1.5 px-4 pb-3">
        {items.map((row, index) => {
          const highlighted = row.highlight || shouldHighlight(row.detail)
          return (
            <li key={row.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_7rem_2.25rem] items-center gap-x-2">
              <div className="flex items-center gap-1">
                <span className="text-xs text-ink-3 tnum">{month}.</span>
                <input type="number" min={1} max={31} inputMode="numeric" value={row.day || ''} onChange={(event) => update(index, { day: Number(event.target.value) || 1 })} aria-label="日" className="control control-sm tnum px-1.5 text-center" />
              </div>
              <input type="text" value={row.detail} onChange={(event) => update(index, { detail: event.target.value })} placeholder="明细说明" aria-label="明细说明" className={`control control-sm ${highlighted ? 'border-warn/60 text-warn' : ''}`} />
              <MoneyInput size="sm" value={row.amount} onChange={(amount) => update(index, { amount })} aria-label="明细金额" />
              <IconButton icon="trash" label="删除该行" tone="danger" onClick={() => onChange(items.length <= 1 ? [emptyLine(1)] : items.filter((_, itemIndex) => itemIndex !== index))} />
            </li>
          )
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-line bg-surface-2/60 px-4 py-2 text-sm">
        <span className="text-ink-3">明细合计（不参与指标计算）</span>
        <span className="font-semibold text-ink tnum">{formatMoneyExact(total)}</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

export function DataEntry() {
  const { data, saveRecord, saveStore, removeRecord } = useData()
  const user = useCurrentUser()
  const confirm = useConfirm()
  const toast = useToast()
  const mobile = useIsMobile()

  const writableStores = useMemo(
    () => user.role === 'admin' ? data.stores : data.stores.filter((store) => store.ownerUserId === user.id),
    [data.stores, user.id, user.role],
  )
  const writableStoreIds = useMemo(() => new Set(writableStores.map((store) => store.id)), [writableStores])

  const [scope, setScope] = useState<Scope>({ storeId: writableStores[0]?.id || '', year: now.getFullYear(), month: now.getMonth() + 1 })
  const [orderExpense, setOrderExpense] = useState(0)
  const [payroll, setPayroll] = useState(0)
  const [withdraw, setWithdraw] = useState(0)
  const [incomeChannels, setIncomeChannels] = useState<ChannelAmount[]>(() => [emptyChannel()])
  const [expenseChannels, setExpenseChannels] = useState<ChannelAmount[]>(() => [emptyChannel()])
  const [incomeItems, setIncomeItems] = useState<MoneyLine[]>(() => [emptyLine(1)])
  const [expenseItems, setExpenseItems] = useState<MoneyLine[]>(() => [emptyLine(1)])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [channelTab, setChannelTab] = useState<'income' | 'expense'>('income')
  const [detailTab, setDetailTab] = useState<'income' | 'expense'>('expense')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [filterYear, setFilterYear] = useState(now.getFullYear())
  const [filterStore, setFilterStore] = useState<string>('all')
  const [excelImport, setExcelImport] = useState<ExcelImportResult | null>(null)
  const [excelError, setExcelError] = useState('')
  const [excelImporting, setExcelImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formTopRef = useRef<HTMLDivElement>(null)

  const [templateMeta, setTemplateMeta] = useState<TemplateMeta | null>(null)
  const [templateDownloading, setTemplateDownloading] = useState(false)

  useEffect(() => {
    getTemplateMeta()
      .then((meta) => setTemplateMeta(meta))
      .catch(() => {})
  }, [])

  async function handleDownloadTemplate() {
    setTemplateDownloading(true)
    try {
      await downloadTemplate()
      toast.success('模板下载开始')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '下载模板失败')
    } finally {
      setTemplateDownloading(false)
    }
  }

  const currentRecord = useMemo(
    () => data.records.find((record) => record.storeId === scope.storeId && record.year === scope.year && record.month === scope.month),
    [data.records, scope],
  )

  const applyRecord = useCallback((record: MonthlyRecord | undefined) => {
    setEditingId(record?.id ?? null)
    setOrderExpense(record?.orderExpense || 0)
    setPayroll(record?.payroll || 0)
    setWithdraw(record?.withdraw || 0)
    setIncomeChannels(cloneChannels(record?.incomeChannels))
    setExpenseChannels(cloneChannels(record?.expenseChannels))
    setIncomeItems(cloneLines(record?.incomeItems))
    setExpenseItems(cloneLines(record?.expenseItems))
    setDirty(false)
  }, [])

  // 首次进入或门店列表就绪时加载当前范围
  const loadedScopeKey = useRef('')
  useEffect(() => {
    const key = `${scope.storeId}|${scope.year}|${scope.month}`
    if (!scope.storeId && writableStores[0]) { setScope((s) => ({ ...s, storeId: writableStores[0].id })); return }
    if (scope.storeId && !writableStoreIds.has(scope.storeId)) { setScope((s) => ({ ...s, storeId: writableStores[0]?.id || '' })); return }
    if (loadedScopeKey.current === key) return
    loadedScopeKey.current = key
    applyRecord(currentRecord)
    // 记录被其他操作（导入、删除）改动时不打断正在进行的编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, writableStores, writableStoreIds])

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const touch = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setDirty(true) }

  async function changeScope(patch: Partial<Scope>) {
    if (dirty) {
      const ok = await confirm({
        title: '放弃当前月份未保存的修改？',
        description: `${storeName(scope.storeId)} ${scope.year} 年 ${scope.month} 月的改动还没有保存，切换后会丢失。`,
        confirmLabel: '放弃修改',
        cancelLabel: '继续编辑',
        danger: true,
      })
      if (!ok) return
    }
    setScope((current) => ({ ...current, ...patch }))
  }

  const rows = useMemo(
    () => data.records
      .filter((record) => writableStoreIds.has(record.storeId) && record.year === filterYear && (filterStore === 'all' || record.storeId === filterStore))
      .sort((a, b) => b.month - a.month || a.storeId.localeCompare(b.storeId)),
    [data.records, filterYear, filterStore, writableStoreIds],
  )

  const sales = sumChannelAmounts(incomeChannels)
  const totalExpense = sumChannelAmounts(expenseChannels)
  const orderRatio = sales > 0 ? orderExpense / sales : 0
  const payrollRatio = sales > 0 ? payroll / sales : 0
  const margin = grossMargin(sales, totalExpense)
  const incomeCount = incomeChannels.filter((item) => item.name.trim()).length
  const expenseCount = expenseChannels.filter((item) => item.name.trim()).length
  const detailCount = [...incomeItems, ...expenseItems].filter((item) => item.detail.trim() || item.amount).length

  function storeName(id: string) { return data.stores.find((store) => store.id === id)?.name || id }

  const previousScopeRecord = useMemo(() => {
    const prevMonth = scope.month === 1 ? 12 : scope.month - 1
    const prevYear = scope.month === 1 ? scope.year - 1 : scope.year
    return data.records.find((record) => record.storeId === scope.storeId && record.year === prevYear && record.month === prevMonth)
  }, [data.records, scope])
  const canCopyChannels = incomeCount + expenseCount === 0 && previousScopeRecord && (previousScopeRecord.incomeChannels.length + previousScopeRecord.expenseChannels.length > 0)

  function copyPreviousChannels() {
    if (!previousScopeRecord) return
    setIncomeChannels(previousScopeRecord.incomeChannels.filter((c) => c.name.trim()).map((c) => ({ id: newId('channel'), name: c.name, amount: 0 })))
    setExpenseChannels(previousScopeRecord.expenseChannels.filter((c) => c.name.trim()).map((c) => ({ id: newId('channel'), name: c.name, amount: 0 })))
    setDirty(true)
    toast.info(`已带入 ${previousScopeRecord.year} 年 ${previousScopeRecord.month} 月的渠道名称，金额需要重新填写`)
  }

  function loadRecord(record: MonthlyRecord) {
    void changeScope({ storeId: record.storeId, year: record.year, month: record.month }).then(() => {
      formTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  function discard() {
    applyRecord(currentRecord)
    toast.info('已恢复为上次保存的内容')
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!scope.storeId) { toast.error('请先选择门店。'); return }
    const unnamed = [...incomeChannels, ...expenseChannels].filter((item) => item.amount !== 0 && !item.name.trim())
    if (unnamed.length) { toast.error(`有 ${unnamed.length} 个渠道填了金额但没有名称，请补全后再保存。`); return }
    const existing = data.records.find((record) => record.id === editingId) ?? currentRecord
    const record = syncRecordTotals({
      id: editingId || newId('rec'), storeId: scope.storeId, year: scope.year, month: scope.month,
      sales, totalExpense, orderExpense, payroll, withdraw,
      dividend: existing?.dividend || 0,
      income: 0, expense: 0,
      incomeItems: cleanLines(incomeItems), expenseItems: cleanLines(expenseItems),
      incomeChannels: cleanChannels(incomeChannels), expenseChannels: cleanChannels(expenseChannels),
      ledger: existing?.ledger,
    })
    saveRecord(record)
    setEditingId(record.id)
    setDirty(false)
    toast.success(`已保存 ${storeName(scope.storeId)} ${scope.year} 年 ${scope.month} 月：营业额 ${formatMoney(sales)}，总支出 ${formatMoney(totalExpense)}`)
  }

  async function onDeleteRecord(record: MonthlyRecord) {
    const ok = await confirm({
      title: `删除 ${storeName(record.storeId)} ${record.year} 年 ${record.month} 月的记录？`,
      description: `该月的 ${record.incomeChannels.length + record.expenseChannels.length} 个渠道、${record.incomeItems.length + record.expenseItems.length} 条明细和经营数据都会删除，不能撤销。`,
      confirmLabel: '删除记录',
      cancelLabel: '保留',
      danger: true,
    })
    if (!ok) return
    removeRecord(record.id)
    if (record.id === editingId) { applyRecord(undefined) }
    toast.success('记录已删除')
  }

  async function onExcelSelected(file: File | undefined) {
    if (!file) return
    setExcelError('')
    if (file.size > 15 * 1024 * 1024) { setExcelImport(null); setExcelError('文件超过 15 MB。请拆分账目后再导入。'); return }
    setExcelImporting(true)
    try {
      setExcelImport(parseExcelImport(await file.arrayBuffer(), file.name))
    } catch (error) {
      setExcelImport(null)
      setExcelError(error instanceof Error ? error.message : 'Excel 解析失败，请检查文件格式。')
    } finally {
      setExcelImporting(false)
    }
  }

  const previewRows = useMemo(() => {
    if (!excelImport) return []
    return excelImport.rows.map((row) => {
      const requestedName = row.storeName.trim()
      const observerPrefix = `${user.username}-`
      const prefixedName = user.role === 'observer'
        ? `${observerPrefix}${requestedName.toLocaleLowerCase().startsWith(observerPrefix.toLocaleLowerCase()) ? requestedName.slice(observerPrefix.length) : requestedName}`
        : requestedName
      const storeId = writableStores.find((store) => store.name.trim() === requestedName || store.name.trim() === prefixedName)?.id
      const existing = storeId ? data.records.find((record) => record.storeId === storeId && record.year === row.year && record.month === row.month) : undefined
      return { row, status: !storeId ? 'newStore' as const : existing ? 'overwrite' as const : 'new' as const }
    })
  }, [excelImport, writableStores, data.records, user.role, user.username])
  const overwriteCount = previewRows.filter((item) => item.status === 'overwrite').length
  const newCount = previewRows.length - overwriteCount
  const newStoreNames = [...new Set(previewRows.filter((item) => item.status === 'newStore').map((item) => item.row.storeName.trim()))]

  async function importExcelRows() {
    if (!excelImport) return
    if (user.role === 'observer' && !user.canManageStores && newStoreNames.length > 0) {
      toast.error('当前账号没有门店管理权限，无法自动创建 Excel 中的新门店。')
      return
    }
    if (dirty) {
      const ok = await confirm({ title: '导入前先放弃当前未保存的修改？', description: '导入会更新对应月份的记录，当前编辑区未保存的改动会丢失。', confirmLabel: '放弃并导入', cancelLabel: '先不导入', danger: true })
      if (!ok) return
    }
    const storeIds = new Map(writableStores.map((store) => [store.name.trim(), store.id]))
    let createdStores = 0
    const importedScopes = new Set(excelImport.rows.map((row) => `${row.storeName.trim()}|${row.year}`))
    for (const record of data.records) {
      const name = writableStores.find((store) => store.id === record.storeId)?.name.trim()
      if (name && importedScopes.has(`${name}|${record.year}`) && isEmptyRecord(record)) removeRecord(record.id)
    }
    for (const row of excelImport.rows) {
      const requestedName = row.storeName.trim()
      const observerPrefix = `${user.username}-`
      const finalName = user.role === 'observer'
        ? `${observerPrefix}${requestedName.toLocaleLowerCase().startsWith(observerPrefix.toLocaleLowerCase()) ? requestedName.slice(observerPrefix.length) : requestedName}`
        : requestedName
      let storeId = storeIds.get(requestedName) || storeIds.get(finalName)
      if (!storeId) {
        const store: Store = { id: newId('store'), name: finalName, createdAt: new Date().toISOString(), ownerUserId: user.role === 'observer' ? user.id : undefined }
        saveStore(store); storeIds.set(store.name, store.id); storeIds.set(requestedName, store.id); storeId = store.id; createdStores += 1
      }
      const existing = data.records.find((record) => record.storeId === storeId && record.year === row.year && record.month === row.month)
      saveRecord(syncRecordTotals({
        id: existing?.id || newId('rec'), storeId, year: row.year, month: row.month,
        sales: row.sales, totalExpense: row.totalExpense, orderExpense: row.orderExpense, payroll: row.payroll,
        withdraw: row.hasWithdraw ? row.withdraw : existing?.withdraw || 0,
        dividend: existing?.dividend || 0,
        income: 0, expense: 0,
        incomeItems: mergeImportedLines(row.incomeItems, existing?.incomeItems),
        expenseItems: mergeImportedLines(row.expenseItems, existing?.expenseItems),
        incomeChannels: mergeImportedChannels(row.incomeChannels, existing?.incomeChannels),
        expenseChannels: mergeImportedChannels(row.expenseChannels, existing?.expenseChannels),
        ledger: row.ledger,
      }))
    }
    toast.success(`已导入 ${excelImport.rows.length} 个月份的数据${createdStores ? `，自动新增 ${createdStores} 家门店` : ''}`)
    setExcelImport(null)
    loadedScopeKey.current = ''
    setFilterYear(excelImport.rows[0]?.year ?? filterYear)
  }

  const status = currentRecord
    ? { tone: 'accent' as const, icon: 'check' as const, text: `已有记录 · 渠道 ${currentRecord.incomeChannels.length}/${currentRecord.expenseChannels.length} · 明细 ${currentRecord.incomeItems.length + currentRecord.expenseItems.length}` }
    : { tone: 'neutral' as const, icon: 'inbox' as const, text: '本月尚未录入' }
  const inProgress = isInProgress(scope.year, scope.month)

  const tabOptions = (income: number, expense: number, unit: string) => [
    { value: 'income' as const, label: `收入 ${formatMoney(income)}${unit}` },
    { value: 'expense' as const, label: `支出 ${formatMoney(expense)}${unit}` },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="月度数据录入"
        description="营业额实收和总支出由收支渠道自动汇总；占比和毛利率实时计算。收支明细只作记录。"
        actions={
          <>
            {templateMeta?.exists && (
              <Button
                variant="secondary"
                icon="download"
                loading={templateDownloading}
                onClick={() => void handleDownloadTemplate()}
                title="下载管理员上传的月度收支录入模板"
              >
                下载模板
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={excelImporting}
              onChange={(event) => { void onExcelSelected(event.target.files?.[0]); event.currentTarget.value = '' }}
            />
            <Button variant="secondary" icon="upload" loading={excelImporting} onClick={() => fileInputRef.current?.click()}>
              {excelImporting ? '正在解析…' : '导入 Excel'}
            </Button>
          </>
        }
      />

      {excelError && (
        <div role="alert" className="flex items-start gap-2 rounded-[var(--r-inner)] border border-bad/40 bg-bad-soft px-4 py-3 text-sm text-ink">
          <Icon name="alert" size={16} className="mt-0.5 text-bad" /><span>{excelError}</span>
        </div>
      )}

      {excelImport && (
        <section className="surface overflow-hidden !border-line-strong">
          <SectionHeader
            title={`导入预览 · ${excelImport.fileName}`}
            description={`识别到 ${excelImport.rows.length} 个月份${excelImport.detailSheet ? `，明细页“${excelImport.detailSheet}”` : '，未识别到明细页'}。确认前不会改动任何数据。`}
            actions={<Button variant="ghost" size="sm" icon="x" onClick={() => setExcelImport(null)}>取消</Button>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="text-ink-3">
                <tr>{['状态', '门店', '月份', '营业额实收', '总支出', '订货支出', '工资支出', '提现', '渠道', '明细'].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr>
              </thead>
              <tbody>
                {previewRows.map(({ row, status: rowStatus }) => (
                  <tr key={`${row.storeName}-${row.year}-${row.month}`} className="border-t border-line/70">
                    <td className="px-3 py-2">
                      {rowStatus === 'overwrite' ? <Pill tone="warn">覆盖</Pill> : rowStatus === 'newStore' ? <Pill tone="accent">新门店</Pill> : <Pill tone="good">新增</Pill>}
                    </td>
                    <td className="px-3 py-2 text-ink">{row.storeName}</td>
                    <td className="px-3 py-2 tnum">{row.year}.{row.month}</td>
                    <td className="px-3 py-2 tnum">{formatMoney(row.sales)}</td>
                    <td className="px-3 py-2 tnum">{formatMoney(row.totalExpense)}</td>
                    <td className="px-3 py-2 tnum">{formatMoney(row.orderExpense)}</td>
                    <td className="px-3 py-2 tnum">{formatMoney(row.payroll)}</td>
                    <td className="px-3 py-2 tnum">{row.hasWithdraw ? formatMoney(row.withdraw) : '—'}</td>
                    <td className="px-3 py-2 text-ink-3">收 {row.incomeChannels.length} / 支 {row.expenseChannels.length}</td>
                    <td className="px-3 py-2 text-ink-3">收 {row.incomeItems.length} / 支 {row.expenseItems.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 border-t border-line px-4 py-3 text-xs text-ink-3">
            {excelImport.ignoredColumns.length > 0 && (
              <p><span className="font-medium text-ink-2">不作为渠道导入的列：</span>{excelImport.ignoredColumns.join('、')}。其中“提现”单独写入总提现，汇总列用于校对。</p>
            )}
            {excelImport.warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface-2/60 px-4 py-3">
            <span className="text-sm text-ink-2">
              新增 <b className="text-ink tnum">{newCount}</b> 个月，覆盖 <b className="text-ink tnum">{overwriteCount}</b> 个月
              {newStoreNames.length > 0 && <>，新建门店 <b className="text-ink">{newStoreNames.join('、')}</b></>}
            </span>
            <Button variant="primary" icon="check" onClick={() => void importExcelRows()}>确认导入</Button>
          </div>
        </section>
      )}

      <form onSubmit={onSubmit} className="space-y-4">
        <section ref={formTopRef} className="surface scroll-mt-28 p-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="门店" htmlFor="scope-store" className="col-span-2 md:col-span-1">
              <select id="scope-store" value={scope.storeId} onChange={(event) => void changeScope({ storeId: event.target.value })} className="control font-medium" required>
                <option value="" disabled>选择门店</option>
                {writableStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </Field>
            <Field label="年份" htmlFor="scope-year">
              <select id="scope-year" value={scope.year} onChange={(event) => void changeScope({ year: Number(event.target.value) })} className="control font-medium">
                {YEARS.map((year) => <option key={year} value={year}>{year} 年</option>)}
              </select>
            </Field>
            <Field label="月份" htmlFor="scope-month">
              <select id="scope-month" value={scope.month} onChange={(event) => void changeScope({ month: Number(event.target.value) })} className="control font-medium">
                {MONTHS.map((month) => <option key={month} value={month}>{month} 月</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Pill tone={status.tone} icon={status.icon}>{status.text}</Pill>
            {inProgress && <Pill tone="warn" icon="clock">本月进行中</Pill>}
            {dirty && <Pill tone="warn" icon="pencil">有未保存的修改</Pill>}
            <span className="ml-auto flex items-center gap-1">
              {canCopyChannels && <Button size="sm" variant="secondary" icon="copy" onClick={copyPreviousChannels}>带入上月渠道名</Button>}
              <Button size="sm" variant="ghost" icon="refresh" onClick={discard} disabled={!dirty}>恢复</Button>
            </span>
          </div>
        </section>

        {/* 收支渠道：决定营业额与总支出，放在第一位、默认展开 */}
        <section className="surface overflow-hidden">
          <SectionHeader
            title="收支渠道"
            count={`收入 ${incomeCount} / 支出 ${expenseCount}`}
            description="营业额实收 = 收入渠道合计；总支出 = 支出渠道合计。支出按绝对值填写。"
            actions={mobile ? (
              <Segmented value={channelTab} options={tabOptions(sales, totalExpense, '')} onChange={setChannelTab} label="渠道类型" size="sm" />
            ) : undefined}
          />
          {mobile ? (
            channelTab === 'income'
              ? <ChannelTable items={incomeChannels} tone="income" onChange={touch(setIncomeChannels)} />
              : <ChannelTable items={expenseChannels} tone="expense" onChange={touch(setExpenseChannels)} />
          ) : (
            <div className="grid md:grid-cols-2 md:divide-x md:divide-line">
              <ChannelTable items={incomeChannels} tone="income" onChange={touch(setIncomeChannels)} />
              <ChannelTable items={expenseChannels} tone="expense" onChange={touch(setExpenseChannels)} />
            </div>
          )}
        </section>

        <section className="surface p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <ReadonlyValue label="营业额实收" value={formatMoney(sales)} hint="= 收入渠道合计" tone="income" />
            <ReadonlyValue label="总支出" value={formatMoney(totalExpense)} hint="= 支出渠道合计" tone="expense" />
            <div className={`inset min-w-0 px-3.5 py-2.5 ${sales > 0 && margin < 0 ? '!border-bad/50' : ''}`}>
              <div className="text-xs text-ink-3">毛利率</div>
              <output className={`mt-0.5 block text-base font-semibold tnum ${sales > 0 && margin < 0 ? 'text-bad' : 'text-ink'}`}>{sales > 0 ? formatPct(margin) : '—'}</output>
              <div className="mt-0.5 text-[11px] text-ink-3">(营业额 − 总支出) / 营业额</div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="订货支出" htmlFor="order-expense" hint={sales > 0 ? `订货占比 ${formatPct(orderRatio)}` : '填写营业额后显示订货占比'}>
              <MoneyInput id="order-expense" value={orderExpense} onChange={touch(setOrderExpense)} />
            </Field>
            <Field label="工资支出" htmlFor="payroll" hint={sales > 0 ? `工资占比 ${formatPct(payrollRatio)}` : '填写营业额后显示工资占比'}>
              <MoneyInput id="payroll" value={payroll} onChange={touch(setPayroll)} />
            </Field>
            <Field label="总提现" htmlFor="withdraw" hint="不计入营业额，也不参与毛利率">
              <MoneyInput id="withdraw" value={withdraw} onChange={touch(setWithdraw)} />
            </Field>
          </div>
        </section>

        <section className="surface overflow-hidden">
          <button
            type="button"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-2/60"
          >
            <span>
              <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                收支明细 <span className="text-xs font-normal text-ink-3 tnum">{detailCount} 条</span>
              </span>
              <span className="mt-0.5 block text-xs text-ink-3">逐日记录用途和金额，只作记录，不参与营业额、总支出或利润率计算。</span>
            </span>
            <Icon name="chevronDown" size={18} className={`text-ink-3 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
          </button>
          {detailsOpen && (
            <div className="border-t border-line">
              {mobile ? (
                <>
                  <div className="px-4 pt-3">
                    <Segmented value={detailTab} options={tabOptions(sumAmounts(incomeItems), sumAmounts(expenseItems), '')} onChange={setDetailTab} label="明细类型" size="sm" />
                  </div>
                  {detailTab === 'expense'
                    ? <MoneyTable month={scope.month} items={expenseItems} tone="expense" onChange={touch(setExpenseItems)} />
                    : <MoneyTable month={scope.month} items={incomeItems} tone="income" onChange={touch(setIncomeItems)} />}
                </>
              ) : (
                <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-line">
                  <MoneyTable month={scope.month} items={expenseItems} tone="expense" onChange={touch(setExpenseItems)} />
                  <MoneyTable month={scope.month} items={incomeItems} tone="income" onChange={touch(setIncomeItems)} />
                </div>
              )}
            </div>
          )}
        </section>

        {/* 固定保存栏：手机端避开底部导航 */}
        <div className="sticky z-20 bottom-[calc(64px+env(safe-area-inset-bottom,0px))] sm:bottom-4">
          <div className="surface flex flex-wrap items-center gap-3 px-4 py-3 shadow-[var(--shadow)]">
            <div className="min-w-0 flex-1 text-sm">
              <span className="text-ink-3">{storeName(scope.storeId) || '未选门店'} · {scope.year} 年 {scope.month} 月</span>
              <span className="ml-2 text-ink-2 tnum">营业额 <b className="text-ink">{formatMoney(sales)}</b> · 总支出 <b className="text-ink">{formatMoney(totalExpense)}</b></span>
            </div>
            <div className="flex items-center gap-2">
              {dirty && <Button variant="ghost" onClick={discard}>放弃修改</Button>}
              <Button type="submit" variant="primary" icon="save" disabled={!scope.storeId}>{currentRecord ? '保存修改' : '保存本月数据'}</Button>
            </div>
          </div>
        </div>
      </form>

      <section className="surface overflow-hidden">
        <SectionHeader
          title="已录入的月份"
          count={`${rows.length} 条`}
          actions={
            <div className="flex items-center gap-2">
              <select aria-label="筛选年份" value={filterYear} onChange={(event) => setFilterYear(Number(event.target.value))} className="control control-sm w-[96px]">
                {YEARS.map((year) => <option key={year} value={year}>{year} 年</option>)}
              </select>
              <select aria-label="筛选门店" value={filterStore} onChange={(event) => setFilterStore(event.target.value)} className="control control-sm w-[120px] sm:w-36">
                <option value="all">全部门店</option>
                {writableStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState compact icon="calendar" title={`${filterYear} 年还没有记录`} description="在上方选择门店和月份填写渠道金额，或点击右上角“导入 Excel”。" />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="text-xs text-ink-3">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">门店</th>
                    <th className="px-3 py-2.5 font-medium">月份</th>
                    <th className="px-3 py-2.5 text-right font-medium">营业额实收</th>
                    <th className="px-3 py-2.5 text-right font-medium">总支出</th>
                    <th className="px-3 py-2.5 text-right font-medium">毛利率</th>
                    <th className="px-3 py-2.5 text-right font-medium">订货占比</th>
                    <th className="px-3 py-2.5 text-right font-medium">工资占比</th>
                    <th className="px-3 py-2.5 text-right font-medium">总提现</th>
                    <th className="px-3 py-2.5 text-right font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((record) => {
                    const recordMargin = grossMargin(record.sales, record.totalExpense)
                    const editing = record.id === editingId
                    return (
                      <tr key={record.id} className={`border-t border-line/70 ${editing ? 'bg-surface-2' : 'hover:bg-surface'}`}>
                        <td className="px-4 py-2.5 font-medium text-ink">{storeName(record.storeId)}{editing && <Pill tone="accent" className="ml-2">编辑中</Pill>}</td>
                        <td className="px-3 py-2.5 tnum">{record.month} 月{isInProgress(record.year, record.month) && <Pill tone="warn" className="ml-2">进行中</Pill>}</td>
                        <td className="px-3 py-2.5 text-right tnum">{formatMoney(record.sales)}</td>
                        <td className="px-3 py-2.5 text-right tnum">{formatMoney(record.totalExpense)}</td>
                        <td className={`px-3 py-2.5 text-right tnum ${record.sales > 0 && recordMargin < 0 ? 'font-medium text-bad' : ''}`}>{record.sales > 0 ? formatPct(recordMargin) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tnum">{record.sales > 0 ? formatPct(record.orderExpense / record.sales) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tnum">{record.sales > 0 ? formatPct(record.payroll / record.sales) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tnum">{formatMoney(record.withdraw)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <span className="inline-flex items-center gap-0.5">
                            <IconButton icon="pencil" label="编辑该月" onClick={() => loadRecord(record)} />
                            <IconButton icon="trash" label="删除该月" tone="danger" onClick={() => void onDeleteRecord(record)} />
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line/70 md:hidden">
              {rows.map((record) => {
                const recordMargin = grossMargin(record.sales, record.totalExpense)
                const editing = record.id === editingId
                return (
                  <li key={record.id} className={`px-4 py-3 ${editing ? 'bg-surface-2' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium text-ink">
                        {storeName(record.storeId)} · {record.month} 月
                        {editing && <Pill tone="accent">编辑中</Pill>}
                        {isInProgress(record.year, record.month) && <Pill tone="warn">进行中</Pill>}
                      </div>
                      <span className="inline-flex items-center">
                        <IconButton icon="pencil" label="编辑该月" onClick={() => loadRecord(record)} />
                        <IconButton icon="trash" label="删除该月" tone="danger" onClick={() => void onDeleteRecord(record)} />
                      </span>
                    </div>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      <div className="flex justify-between"><dt className="text-ink-3">营业额</dt><dd className="text-ink tnum">{formatMoney(record.sales)}</dd></div>
                      <div className="flex justify-between"><dt className="text-ink-3">总支出</dt><dd className="text-ink tnum">{formatMoney(record.totalExpense)}</dd></div>
                      <div className="flex justify-between"><dt className="text-ink-3">毛利率</dt><dd className={`tnum ${record.sales > 0 && recordMargin < 0 ? 'text-bad' : 'text-ink'}`}>{record.sales > 0 ? formatPct(recordMargin) : '—'}</dd></div>
                      <div className="flex justify-between"><dt className="text-ink-3">总提现</dt><dd className="text-ink tnum">{formatMoney(record.withdraw)}</dd></div>
                    </dl>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}
