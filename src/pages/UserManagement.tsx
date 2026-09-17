import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, IconButton } from '../components/ui/Button'
import { useConfirm } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { Field } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { Modal } from '../components/ui/Modal'
import { PageHeader, SectionHeader } from '../components/ui/PageHeader'
import { Pill } from '../components/ui/Pill'
import { useToast } from '../components/ui/Toast'
import { useData } from '../context/DataContext'
import { useCurrentUser } from '../lib/auth'

interface ManagedUser { id: string; username: string; role: 'admin' | 'observer'; allowedStoreIds?: string[]; lastLoginAt?: string | null }

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')

function formatLastLogin(value: string | null | undefined): string {
  if (!value) return '从未登录'
  return new Date(value).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

async function readError(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => ({}))) as { message?: string }
  return payload.message || fallback
}

function StoreCheckboxes({ storeIds, storeNames, selected, onChange }: { storeIds: string[]; storeNames: Map<string, string>; selected: string[]; onChange: (ids: string[]) => void }) {
  const allSelected = storeIds.length > 0 && storeIds.every((id) => selected.includes(id))
  function toggle(storeId: string) {
    onChange(selected.includes(storeId) ? selected.filter((id) => id !== storeId) : [...selected, storeId])
  }
  if (!storeIds.length) return <p className="text-sm text-ink-3">还没有门店，可以先创建账号，之后再分配。</p>
  return (
    <div className="space-y-1">
      <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[var(--r-sm)] px-3 text-sm font-medium text-ink hover:bg-surface-2">
        <input type="checkbox" className="h-4 w-4" checked={allSelected} onChange={() => onChange(allSelected ? [] : storeIds)} />
        全部门店
      </label>
      <div className="border-t border-line" />
      {storeIds.map((storeId) => (
        <label key={storeId} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-[var(--r-sm)] px-3 text-sm text-ink-2 hover:bg-surface-2">
          <input type="checkbox" className="h-4 w-4" checked={selected.includes(storeId)} onChange={() => toggle(storeId)} />
          {storeNames.get(storeId) || storeId}
        </label>
      ))}
    </div>
  )
}

export function UserManagement() {
  const { data } = useData()
  const me = useCurrentUser()
  const confirm = useConfirm()
  const toast = useToast()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const storeIds = data.stores.map((store) => store.id)
  const storeNames = new Map(data.stores.map((store) => [store.id, store.name]))

  // 新建观察者
  const [createOpen, setCreateOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [createStores, setCreateStores] = useState<string[]>([])
  const [createError, setCreateError] = useState('')
  const [creating, setCreating] = useState(false)

  // 编辑门店权限
  const [permUser, setPermUser] = useState<ManagedUser | null>(null)
  const [permStores, setPermStores] = useState<string[]>([])
  const [savingPerm, setSavingPerm] = useState(false)

  // 修改密码
  const [pwdUser, setPwdUser] = useState<ManagedUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [savingPwd, setSavingPwd] = useState(false)

  // 数据库导出 / 导入
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${apiBase}/users`, { credentials: 'include' })
      if (response.ok) setUsers(((await response.json()) as { users: ManagedUser[] }).users)
      else toast.error(await readError(response, '读取用户列表失败'))
    } catch {
      toast.error('无法连接服务器，用户列表暂时不可用。')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadUsers() }, [])

  function openCreate() {
    setUsername(''); setPassword(''); setCreateStores(storeIds); setCreateError(''); setCreateOpen(true)
  }

  async function createUser(event: FormEvent) {
    event.preventDefault()
    setCreateError('')
    if (username.trim().length < 2) { setCreateError('账号至少 2 个字符。'); return }
    if (password.length < 6) { setCreateError('初始密码至少 6 位。'); return }
    setCreating(true)
    try {
      const response = await fetch(`${apiBase}/users`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password, allowedStoreIds: createStores }),
      })
      if (!response.ok) { setCreateError(await readError(response, '创建失败')); return }
      setCreateOpen(false)
      toast.success(`观察者「${username.trim()}」已创建，可查看 ${createStores.length} 家门店`)
      await loadUsers()
    } catch {
      setCreateError('无法连接服务器，请稍后重试。')
    } finally {
      setCreating(false)
    }
  }

  function openPermissions(user: ManagedUser) {
    setPermUser(user)
    setPermStores(user.allowedStoreIds || [])
  }

  async function savePermissions() {
    if (!permUser) return
    setSavingPerm(true)
    try {
      const response = await fetch(`${apiBase}/users/${permUser.id}/permissions`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allowedStoreIds: permStores }),
      })
      if (!response.ok) { toast.error(await readError(response, '保存权限失败')); return }
      setUsers((items) => items.map((item) => (item.id === permUser.id ? { ...item, allowedStoreIds: permStores } : item)))
      toast.success(`「${permUser.username}」现在可以查看 ${permStores.length} 家门店`)
      setPermUser(null)
    } catch {
      toast.error('无法连接服务器，权限未保存。')
    } finally {
      setSavingPerm(false)
    }
  }

  function openPassword(user: ManagedUser) {
    setPwdUser(user); setNewPassword(''); setNewPassword2(''); setPwdError('')
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    if (!pwdUser) return
    setPwdError('')
    if (newPassword.length < 6) { setPwdError('新密码至少 6 位。'); return }
    if (newPassword !== newPassword2) { setPwdError('两次输入的密码不一致。'); return }
    setSavingPwd(true)
    try {
      const response = await fetch(`${apiBase}/users/${pwdUser.id}/password`, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword }),
      })
      if (!response.ok) { setPwdError(await readError(response, '修改密码失败')); return }
      toast.success(`「${pwdUser.username}」的密码已修改${pwdUser.id === me.id ? '，下次登录请使用新密码' : ''}`)
      setPwdUser(null)
    } catch {
      setPwdError('无法连接服务器，请稍后重试。')
    } finally {
      setSavingPwd(false)
    }
  }

  async function removeUser(user: ManagedUser) {
    const ok = await confirm({
      title: `删除观察者「${user.username}」？`,
      description: '该账号将立即无法登录，已登录的会话也会失效。业务数据不受影响。',
      confirmLabel: '删除账号',
      cancelLabel: '保留',
      danger: true,
    })
    if (!ok) return
    try {
      const response = await fetch(`${apiBase}/users/${user.id}`, { method: 'DELETE', credentials: 'include' })
      if (!response.ok) { toast.error(await readError(response, '删除失败')); return }
      toast.success(`已删除观察者「${user.username}」`)
      await loadUsers()
    } catch {
      toast.error('无法连接服务器，账号未删除。')
    }
  }

  async function exportDatabase() {
    setExporting(true)
    try {
      const response = await fetch(`${apiBase}/database/export`, { credentials: 'include' })
      if (!response.ok) { toast.error(await readError(response, '导出失败')); return }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      const now = new Date()
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
      link.download = `store-dashboard-${stamp}.sqlite`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('数据库已导出，请妥善保存。')
    } catch {
      toast.error('无法连接服务器，导出失败。')
    } finally {
      setExporting(false)
    }
  }

  function pickImportFile() {
    fileInputRef.current?.click()
  }

  async function importDatabase(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    const ok = await confirm({
      title: '导入数据库？',
      description: `将用「${file.name}」整体替换当前数据库，覆盖全部门店、账号和权限数据。导入前系统会自动备份当前数据库。此操作不能撤销。`,
      confirmLabel: '确认导入',
      cancelLabel: '取消',
      danger: true,
    })
    if (!ok) return
    setImporting(true)
    try {
      const response = await fetch(`${apiBase}/database/import`, {
        method: 'POST',
        credentials: 'include',
        body: file,
      })
      if (!response.ok) { toast.error(await readError(response, '导入失败')); return }
      const payload = (await response.json()) as { backup?: string }
      toast.success(`数据库已导入${payload.backup ? `，原数据库已备份为 ${payload.backup}` : ''}。正在重新加载…`)
      setTimeout(() => window.location.reload(), 1200)
    } catch {
      toast.error('无法连接服务器，导入失败。')
    } finally {
      setImporting(false)
    }
  }

  function storesLabel(user: ManagedUser) {
    if (user.role === 'admin') return <Pill tone="neutral" icon="shield">全部门店</Pill>
    const ids = user.allowedStoreIds || []
    if (!ids.length) return <Pill tone="warn" icon="alert">未分配门店</Pill>
    if (storeIds.length && storeIds.every((id) => ids.includes(id))) return <Pill tone="accent">全部门店</Pill>
    return (
      <span className="flex flex-wrap gap-1">
        {ids.slice(0, 3).map((id) => <Pill key={id}>{storeNames.get(id) || '已删除的门店'}</Pill>)}
        {ids.length > 3 && <Pill>+{ids.length - 3}</Pill>}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="权限管理"
        description="观察者只能查看被分配门店的看板和门店 PK，不能录入或修改数据。"
        actions={<Button variant="primary" icon="plus" onClick={openCreate}>新建观察者</Button>}
      />

      <section className="surface overflow-hidden">
        <SectionHeader title="账号" count={loading ? '加载中…' : `${users.length} 个`} />
        {!loading && users.length === 0 ? (
          <EmptyState icon="users" title="没有读到任何账号" description="请检查与服务器的连接后刷新页面。" />
        ) : (
          <ul className="divide-y divide-line/70">
            {users.map((user) => (
              <li key={user.id} className="grid gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.6fr)_auto] sm:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium text-ink">
                    {user.username}
                    {user.id === me.id && <Pill tone="accent">当前登录</Pill>}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-3">
                    <Icon name={user.role === 'admin' ? 'shield' : 'eye'} size={12} />{user.role === 'admin' ? '管理员' : '观察者'}
                  </div>
                </div>
                <div className="text-xs text-ink-3 tnum">
                  <span className="sm:hidden">上次登录 </span>{formatLastLogin(user.lastLoginAt)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {storesLabel(user)}
                  {user.role === 'observer' && <Button variant="link" size="sm" className="text-xs" onClick={() => openPermissions(user)}>调整门店</Button>}
                </div>
                <div className="flex items-center gap-1 sm:justify-end">
                  <IconButton icon="key" label={`修改 ${user.username} 的密码`} onClick={() => openPassword(user)} />
                  {user.role === 'observer' && <IconButton icon="trash" label={`删除 ${user.username}`} tone="danger" onClick={() => void removeUser(user)} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="surface overflow-hidden">
        <SectionHeader title="数据库" description="导出或导入整个 SQLite 数据库文件（store-dashboard.sqlite）" />
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-3">
            导出会生成当前数据库的完整快照；导入会用上传的文件整体替换当前数据。导入前自动备份原数据库。
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="secondary" icon="download" loading={exporting} onClick={() => void exportDatabase()}>导出数据库</Button>
            <Button variant="secondary" icon="upload" loading={importing} onClick={pickImportFile}>导入数据库</Button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".sqlite,application/vnd.sqlite3,application/x-sqlite3"
          className="sr-only"
          onChange={(event) => void importDatabase(event)}
        />
      </section>

      <Modal
        open={createOpen}
        title="新建观察者"
        description="观察者账号只能查看分配到的门店。"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" type="submit" form="create-observer" loading={creating}>创建账号</Button>
          </>
        }
      >
        <form id="create-observer" onSubmit={createUser} className="space-y-4" noValidate>
          <Field label="账号" htmlFor="create-username">
            <input id="create-username" value={username} onChange={(e) => setUsername(e.target.value)} className="control" autoComplete="off" autoCapitalize="none" required />
          </Field>
          <Field label="初始密码" htmlFor="create-password" hint="至少 6 位。请把密码告知使用者，并建议登录后由管理员协助更换。">
            <input id="create-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="control" autoComplete="new-password" required />
          </Field>
          <div>
            <div className="mb-1.5 text-xs font-medium text-ink-2">可查看的门店</div>
            <StoreCheckboxes storeIds={storeIds} storeNames={storeNames} selected={createStores} onChange={setCreateStores} />
          </div>
          {createError && <p role="alert" className="text-sm text-bad">{createError}</p>}
        </form>
      </Modal>

      <Modal
        open={permUser !== null}
        title={`「${permUser?.username ?? ''}」可查看的门店`}
        description="未勾选的门店不会出现在该账号的看板和门店 PK 中。"
        onClose={() => setPermUser(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPermUser(null)}>取消</Button>
            <Button variant="primary" onClick={() => void savePermissions()} loading={savingPerm}>保存</Button>
          </>
        }
      >
        <StoreCheckboxes storeIds={storeIds} storeNames={storeNames} selected={permStores} onChange={setPermStores} />
      </Modal>

      <Modal
        open={pwdUser !== null}
        title={`修改「${pwdUser?.username ?? ''}」的密码`}
        onClose={() => setPwdUser(null)}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwdUser(null)}>取消</Button>
            <Button variant="primary" type="submit" form="change-password" loading={savingPwd}>更新密码</Button>
          </>
        }
      >
        <form id="change-password" onSubmit={changePassword} className="space-y-4" noValidate>
          <Field label="新密码" htmlFor="new-password" hint="至少 6 位">
            <input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="control" autoComplete="new-password" required />
          </Field>
          <Field label="再输入一次" htmlFor="new-password-2">
            <input id="new-password-2" type="password" value={newPassword2} onChange={(e) => setNewPassword2(e.target.value)} className="control" autoComplete="new-password" required />
          </Field>
          {pwdError && <p role="alert" className="text-sm text-bad">{pwdError}</p>}
        </form>
      </Modal>
    </div>
  )
}
