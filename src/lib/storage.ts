import type { AnnualTarget, AppData, MonthlyRecord, Store } from '../types'
import { DATA_KEY } from '../types'
import { createSeedData } from './seed'
import { normalizeRecord, syncRecordTotals } from './moneyLines'

/** 规范化整份业务数据：补齐字段、迁移旧结构、重算渠道合计。服务器返回的数据也经过这里。 */
export function normalizeAppData(data: Partial<AppData> & { stores?: Store[]; records?: MonthlyRecord[] }): AppData {
  return normalize(data)
}

function normalize(data: Partial<AppData> & { stores?: Store[]; records?: MonthlyRecord[] }): AppData {
  const records = (data.records ?? []).map((r) =>
    normalizeRecord(r as Partial<MonthlyRecord> & Pick<MonthlyRecord, 'id' | 'storeId' | 'year' | 'month'>),
  )
  return {
    stores: data.stores ?? [],
    records,
    targets: Array.isArray(data.targets) ? data.targets : [],
    seeded: Boolean(data.seeded),
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(DATA_KEY)
    if (!raw) {
      const seed = normalize(createSeedData())
      saveData(seed)
      return seed
    }
    const parsedRaw = JSON.parse(raw) as Partial<AppData>
    const hadTargetsKey = Array.isArray(parsedRaw.targets)
    const needsRecordMigration = (parsedRaw.records ?? []).some(
      (r) =>
        !Array.isArray((r as MonthlyRecord).incomeItems) ||
        !Array.isArray((r as MonthlyRecord).expenseItems) ||
        !Array.isArray((r as MonthlyRecord).incomeChannels) ||
        !Array.isArray((r as MonthlyRecord).expenseChannels) ||
        ((r as MonthlyRecord).incomeChannels.length === 0 && Number(r.sales) !== 0) ||
        ((r as MonthlyRecord).expenseChannels.length === 0 && Number(r.totalExpense) !== 0),
    )
    const parsed = normalize(parsedRaw)
    if (!parsed.seeded || !parsed.stores?.length) {
      const seed = createSeedData()
      saveData(seed)
      return seed
    }
    // Older installs lacked `targets`: merge demo targets for known seed stores/years
    // without wiping user monthly data.
    if (!hadTargetsKey) {
      const seed = createSeedData()
      const storeIds = new Set(parsed.stores.map((s) => s.id))
      parsed.targets = seed.targets.filter((t) => storeIds.has(t.storeId))
      saveData(parsed)
    } else if (needsRecordMigration) {
      // Persist migrated detail and channel arrays so future edits use one shape.
      saveData(parsed)
    }
    return parsed
  } catch {
    const seed = normalize(createSeedData())
    saveData(seed)
    return seed
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(normalize(data)))
}

export function upsertStore(data: AppData, store: Store): AppData {
  const idx = data.stores.findIndex((s) => s.id === store.id)
  const stores = [...data.stores]
  if (idx >= 0) stores[idx] = store
  else stores.push(store)
  const next = { ...data, stores }
  saveData(next)
  return next
}

export function deleteStore(data: AppData, storeId: string): AppData {
  const next: AppData = {
    ...data,
    stores: data.stores.filter((s) => s.id !== storeId),
    records: data.records.filter((r) => r.storeId !== storeId),
    targets: data.targets.filter((t) => t.storeId !== storeId),
  }
  saveData(next)
  return next
}

export function upsertRecord(data: AppData, record: MonthlyRecord): AppData {
  const synced = syncRecordTotals(normalizeRecord(record))
  const idx = data.records.findIndex(
    (r) =>
      r.storeId === synced.storeId &&
      r.year === synced.year &&
      r.month === synced.month,
  )
  const records = [...data.records]
  if (idx >= 0) {
    records[idx] = {
      ...synced,
      id: records[idx].id,
      ledger: synced.ledger ?? records[idx].ledger,
    }
  } else {
    records.push(synced)
  }
  const next = { ...data, records }
  saveData(next)
  return next
}

export function deleteRecord(data: AppData, id: string): AppData {
  const next = { ...data, records: data.records.filter((r) => r.id !== id) }
  saveData(next)
  return next
}

export function upsertTarget(data: AppData, target: AnnualTarget): AppData {
  const idx = data.targets.findIndex(
    (t) => t.storeId === target.storeId && t.year === target.year,
  )
  const targets = [...data.targets]
  if (idx >= 0) {
    targets[idx] = { ...target, id: targets[idx].id }
  } else {
    targets.push(target)
  }
  const next = { ...data, targets }
  saveData(next)
  return next
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
