import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { logout, useCurrentUser } from '../lib/auth'
import { useData } from '../context/DataContext'
import { ShaderBackground } from './ShaderBackground'
import { VersionFooter } from './VersionFooter'
import { Banner } from './ui/Banner'
import { Button, IconButton } from './ui/Button'
import { Icon, type IconName } from './ui/Icon'

interface NavItem { to: string; label: string; short: string; icon: IconName; end?: boolean }

const viewLinks: NavItem[] = [
  { to: '/', label: '数据看板', short: '看板', icon: 'dashboard', end: true },
  { to: '/pk', label: '门店 PK', short: 'PK', icon: 'compare' },
]
const manageLinks: NavItem[] = [
  { to: '/data', label: '月度录入', short: '录入', icon: 'edit' },
  { to: '/stores', label: '门店管理', short: '门店', icon: 'store' },
  { to: '/users', label: '权限管理', short: '权限', icon: 'users' },
]

function formatSynced(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
}

function isActivePath(link: NavItem, pathname: string): boolean {
  return link.end ? pathname === link.to : pathname.startsWith(link.to)
}

/**
 * 一级导航：悬浮玻璃胶囊（Nodum OS 的 os-bar），选中项由一枚滑动的亮面指示器标出。
 * 与页面内的二级筛选（平铺、方角、mono 芯片）在形状、层级、动效上都拉开。
 */
function PrimaryNav({ links, pathname }: { links: NavItem[]; pathname: string }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null)

  useLayoutEffect(() => {
    const track = trackRef.current
    if (!track) return
    const measure = () => {
      const active = track.querySelector<HTMLElement>('.nav-item.active')
      if (!active) { setIndicator(null); return }
      setIndicator({ x: active.offsetLeft, w: active.offsetWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    return () => observer.disconnect()
  }, [pathname, links.length])

  return (
    <nav ref={trackRef} className="nav-track hidden min-w-0 sm:flex" aria-label="主导航">
      <span className="nav-indicator" style={indicator ? { transform: `translateX(${indicator.x}px)`, width: indicator.w, opacity: 1 } : { opacity: 0 }} aria-hidden="true" />
      {links.map((link) => (
        <NavLink key={link.to} to={link.to} end={link.end} className={`nav-item ${isActivePath(link, pathname) ? 'active' : ''}`}>
          <Icon name={link.icon} size={15} className="hidden lg:block" />
          <span className="hidden md:inline">{link.label}</span>
          <span className="md:hidden">{link.short}</span>
        </NavLink>
      ))}
    </nav>
  )
}

/**
 * 应用骨架：
 * - 顶部 12px 处悬浮一条玻璃导航胶囊（品牌 | 一级导航 | 用户 / 退出），滚动时始终悬浮
 * - < 640px 导航收进底部悬浮玻璃胶囊
 * - 氛围层固定在最底，内容层 z-10
 */
export function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useCurrentUser()
  const { status, lastSyncedAt, saveError, clearSaveError, refresh } = useData()
  const isAdmin = user.role === 'admin'
  const links = isAdmin ? [...viewLinks, ...manageLinks] : viewLinks
  const current = links.find((link) => isActivePath(link, location.pathname))

  async function handleLogout() {
    await logout().catch(() => undefined)
    navigate('/login', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen flex-col text-ink">
      <ShaderBackground />

      <header className="sticky-bar sticky-bar-nofade safe-top top-0 z-40 px-3 pt-3 pb-1 sm:px-6">
        <div className="glass nav-bar mx-auto flex max-w-7xl items-center gap-3 pl-2 pr-2 sm:gap-5 sm:pl-2.5 sm:pr-2.5">
          <NavLink to="/" className="flex min-w-0 shrink-0 items-center gap-2.5 pl-1" aria-label="回到看板">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-[13px] font-bold text-accent-ink" aria-hidden="true">财</span>
            <span className="hidden text-[13px] font-semibold tracking-tight lg:block">门店财务运营看板</span>
            <span className="text-[13px] font-semibold tracking-tight sm:hidden">{current?.label ?? '门店财务运营看板'}</span>
          </NavLink>

          <PrimaryNav links={links} pathname={location.pathname} />

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <span className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-ink-2 lg:inline-flex">
              <span className="status-dot" style={{ animation: 'none' }} aria-hidden="true" />
              <span className="font-medium text-ink">{user.username}</span>
              <span className="text-ink-3">{isAdmin ? '管理员' : '观察者'}</span>
            </span>
            <span className="hidden sm:inline-flex">
              <Button variant="ghost" size="sm" icon="logout" className="!rounded-full" onClick={() => void handleLogout()}>退出</Button>
            </span>
            <span className="sm:hidden">
              <IconButton icon="logout" label="退出登录" className="!rounded-full" onClick={() => void handleLogout()} />
            </span>
          </div>
        </div>
      </header>

      {(status === 'offline' || saveError) && (
        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
          {saveError ? (
            <Banner tone="error" onDismiss={clearSaveError} action={<Button size="sm" variant="secondary" onClick={() => { clearSaveError(); refresh() }}>重新同步</Button>}>
              <strong className="font-medium">保存到服务器失败。</strong> {saveError} 你的修改仍在本页显示，但其他设备看不到。
            </Banner>
          ) : (
            <Banner tone="warn" action={<Button size="sm" variant="secondary" icon="refresh" onClick={refresh}>重试</Button>}>
              <strong className="font-medium">无法连接服务器。</strong> 当前显示的是本地缓存{lastSyncedAt ? `（上次同步 ${formatSynced(lastSyncedAt)}）` : ''}，新的修改暂时不会同步。
            </Banner>
          )}
        </div>
      )}

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pb-28 sm:px-6 sm:pb-10">
        <Outlet />
      </main>
      <div className="relative z-10 hidden sm:block"><VersionFooter /></div>

      <nav
        aria-label="底部导航"
        className="glass fixed inset-x-3 z-40 rounded-full sm:hidden"
        style={{ bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="grid p-1" style={{ gridTemplateColumns: `repeat(${links.length}, minmax(0, 1fr))` }}>
          {links.map((link) => {
            const active = isActivePath(link, location.pathname)
            return (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={`flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-full text-[11px] transition-colors ${active ? 'bg-white/10 text-ink font-medium' : 'text-ink-3'}`}
              >
                <Icon name={link.icon} size={18} />
                {link.short}
              </NavLink>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
