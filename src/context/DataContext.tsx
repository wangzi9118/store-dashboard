import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AnnualTarget, AppData, MonthlyRecord, Store } from '../types'
import {
  deleteRecord,
  deleteStore,
  loadData,
  normalizeAppData,
  saveData,
  upsertRecord,
  upsertStore,
  upsertTarget,
} from '../lib/storage'
import { loadRemoteData, saveRemoteData } from '../lib/remoteStorage'
import { useCurrentUser } from '../lib/auth'

export type SyncStatus = 'loading' | 'online' | 'offline'

interface DataContextValue {
  data: AppData
  /** 与服务器的连接状态；offline 时页面显示的是本地缓存 */
  status: SyncStatus
  lastSyncedAt: string | null
  /** 最近一次写入服务器失败的原因 */
  saveError: string | null
  clearSaveError: () => void
  refresh: () => void
  saveStore: (store: Store) => void
  removeStore: (storeId: string) => void
  saveRecord: (record: MonthlyRecord) => void
  removeRecord: (id: string) => void
  saveTarget: (target: AnnualTarget) => void
}

const DataContext = createContext<DataContextValue | null>(null)

const EMPTY: AppData = { stores: [], records: [], targets: [], seeded: false }

export function DataProvider({ children }: { children: ReactNode }) {
  const user = useCurrentUser()
  const [data, setData] = useState<AppData>(() => (user.role === 'admin' ? loadData() : EMPTY))
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const pull = useCallback(async () => {
    try {
      const remoteData = await loadRemoteData()
      if (remoteData) {
        const normalized = normalizeAppData(remoteData)
        if (user.role === 'admin') saveData(normalized)
        setData(normalized)
      } else {
        setData(EMPTY)
      }
      setStatus('online')
      setLastSyncedAt(new Date().toISOString())
    } catch (error: unknown) {
      console.error('服务器数据暂时不可用', error)
      setStatus('offline')
      if (user.role === 'observer') setData(EMPTY)
    }
  }, [user.role])

  useEffect(() => {
    let active = true
    void pull().then(() => { if (!active) return })
    return () => { active = false }
  }, [pull])

  const commit = useCallback((mutate: (current: AppData) => AppData) => {
    setData((current) => {
      const next = mutate(current)
      void saveRemoteData(next)
        .then(() => {
          setSaveError(null)
          setStatus('online')
          setLastSyncedAt(new Date().toISOString())
        })
        .catch((error: unknown) => {
          console.error(error)
          setSaveError(error instanceof Error ? error.message : '未知错误')
        })
      return next
    })
  }, [])

  const refresh = useCallback(() => { void pull() }, [pull])
  const clearSaveError = useCallback(() => setSaveError(null), [])
  const saveStore = useCallback((store: Store) => commit((d) => upsertStore(d, store)), [commit])
  const removeStore = useCallback((storeId: string) => commit((d) => deleteStore(d, storeId)), [commit])
  const saveRecord = useCallback((record: MonthlyRecord) => commit((d) => upsertRecord(d, record)), [commit])
  const removeRecord = useCallback((id: string) => commit((d) => deleteRecord(d, id)), [commit])
  const saveTarget = useCallback((target: AnnualTarget) => commit((d) => upsertTarget(d, target)), [commit])

  const value = useMemo(
    () => ({ data, status, lastSyncedAt, saveError, clearSaveError, refresh, saveStore, removeStore, saveRecord, removeRecord, saveTarget }),
    [data, status, lastSyncedAt, saveError, clearSaveError, refresh, saveStore, removeStore, saveRecord, removeRecord, saveTarget],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
