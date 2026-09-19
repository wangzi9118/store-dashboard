import { useMemo, useState, type FormEvent } from 'react'
import { Button, IconButton } from '../components/ui/Button'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { PageHeader, SectionHeader } from '../components/ui/PageHeader'
import { Pill } from '../components/ui/Pill'
import { useToast } from '../components/ui/Toast'
import { useData } from '../context/DataContext'
import { newId } from '../lib/storage'
import type { Store } from '../types'
import { useCurrentUser } from '../lib/auth'

interface StoreStats {
  count: number
  range: string
}

export function Stores() {
  const { data, saveStore, removeStore } = useData()
  const user = useCurrentUser()
  const confirm = useConfirm()
  const toast = useToast()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<Store | null>(null)
  const managedStores = useMemo(
    () => user.role === 'admin' ? data.stores : data.stores.filter((store) => store.ownerUserId === user.id),
    [data.stores, user.id, user.role],
  )

  const stats = useMemo(() => {
    const map = new Map<string, StoreStats>()
    for (const store of managedStores) {
      const records = data.records.filter((record) => record.storeId === store.id).sort((a, b) => a.year - b.year || a.month - b.month)
      const first = records[0]
      const last = records[records.length - 1]
      map.set(store.id, {
        count: records.length,
        range: first && last ? (first === last ? `${first.year}年${first.month}月` : `${first.year}年${first.month}月 – ${last.year}年${last.month}月`) : '',
      })
    }
    return map
  }, [managedStores, data.records])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    const observerPrefix = `${user.username}-`
    const finalName = user.role === 'observer'
      ? `${observerPrefix}${trimmed.toLocaleLowerCase().startsWith(observerPrefix.toLocaleLowerCase()) ? trimmed.slice(observerPrefix.length) : trimmed}`
      : trimmed
    const duplicate = data.stores.some((store) => store.name.trim().toLocaleLowerCase() === finalName.toLocaleLowerCase() && store.id !== editing?.id)
    if (duplicate) { toast.error(`已经有一家叫「${finalName}」的门店。`); return }
    if (editing) {
      saveStore({ ...editing, name: finalName })
      toast.success(`门店已重命名为「${finalName}」`)
      setEditing(null)
    } else {
      saveStore({ id: newId('store'), name: finalName, createdAt: new Date().toISOString(), ownerUserId: user.role === 'observer' ? user.id : undefined })
      toast.success(`已新增门店「${finalName}」`)
    }
    setName('')
  }

  function startEdit(store: Store) {
    setEditing(store)
    setName(store.name)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditing(null)
    setName('')
  }

  async function onDelete(store: Store) {
    const stat = stats.get(store.id)
    const ok = await confirm({
      title: `删除门店「${store.name}」？`,
      description: stat && stat.count > 0
        ? `将同时删除该门店 ${stat.count} 个月的月度记录（${stat.range}）和年度目标。此操作不能撤销。`
        : '该门店还没有月度记录。删除后不能撤销。',
      confirmLabel: '删除门店',
      cancelLabel: '保留',
      danger: true,
    })
    if (!ok) return
    removeStore(store.id)
    if (editing?.id === store.id) cancelEdit()
    toast.success(`已删除门店「${store.name}」`)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="门店管理" description={user.role === 'observer' ? '你只能管理自己添加的门店；门店名称会自动加上你的账号前缀。' : '新增、重命名或删除门店。删除门店会一并删除它的月度记录。'} />

      <form onSubmit={onSubmit} className="surface flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label={editing ? `重命名「${editing.name}」` : '新门店名称'} htmlFor="store-name" className="flex-1">
          <input id="store-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：徐汇店" className="control" required maxLength={40} autoComplete="off" />
        </Field>
        <div className="flex gap-2">
          {editing && <Button variant="secondary" onClick={cancelEdit}>取消</Button>}
          <Button type="submit" variant="primary" icon={editing ? 'check' : 'plus'} disabled={!name.trim()}>{editing ? '保存名称' : '添加门店'}</Button>
        </div>
      </form>

      <section className="surface overflow-hidden">
        <SectionHeader title={user.role === 'admin' ? '全部门店' : '我添加的门店'} count={`${managedStores.length} 家`} />
        {managedStores.length === 0 ? (
          <EmptyState icon="store" title="还没有门店" description="添加第一家门店后，就可以在月度录入中填写数据，或直接导入 Excel（导入会自动创建 Excel 里出现的门店）。" />
        ) : (
          <ul className="divide-y divide-line/70">
            {managedStores.map((store) => {
              const stat = stats.get(store.id)
              return (
                <li key={store.id} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 ${editing?.id === store.id ? 'bg-surface-2' : ''}`}>
                  <div className="min-w-0 flex-1 basis-40">
                    <div className="flex items-center gap-2 font-medium text-ink">
                      {store.name}
                      {editing?.id === store.id && <Pill tone="accent">正在重命名</Pill>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-3">
                      {stat && stat.count > 0 ? `${stat.count} 个月记录 · ${stat.range}` : '暂无月度记录'} · 创建于 {new Date(store.createdAt).toLocaleDateString('zh-CN')}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <IconButton icon="pencil" label={`重命名 ${store.name}`} onClick={() => startEdit(store)} />
                    <IconButton icon="trash" label={`删除 ${store.name}`} tone="danger" onClick={() => void onDelete(store)} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
