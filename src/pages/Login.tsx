import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShaderBackground } from '../components/ShaderBackground'
import { Button } from '../components/ui/Button'
import { Field } from '../components/ui/Field'
import { Icon } from '../components/ui/Icon'
import { getCurrentUser, login } from '../lib/auth'

/**
 * 登录页：
 * - ≥ 1024px 左右结构，左侧是氛围层 + 品牌与技术标签，右侧是表单
 * - < 1024px 氛围层铺满，表单居中成卡
 */
export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from || '/'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [checking, setChecking] = useState(true)
  useEffect(() => {
    void getCurrentUser()
      .then((user) => { if (user) navigate('/', { replace: true }) })
      .catch(() => undefined)
      .finally(() => setChecking(false))
  }, [navigate])

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-canvas text-sm text-ink-3" role="status">
        <Icon name="loading" size={16} className="animate-spin" />正在加载…
      </div>
    )
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(username.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setError(message.includes('用户名或密码') ? '用户名或密码错误，请检查后重试。' : '无法连接服务器，请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen text-ink">
      {/* 氛围层铺满全页，登录页没有前景数据，用 vivid 档：颜色更足、指针视差更大 */}
      <ShaderBackground variant="vivid" />

      {/* 四角技术标签（AURA） */}
      <div className="tech pointer-events-none absolute left-6 top-6 z-10 hidden sm:block lg:left-12 lg:top-10">SYS.CORE // ON-LINE</div>
      <div className="tech pointer-events-none absolute right-6 top-6 z-10 hidden sm:block lg:right-12 lg:top-10">V02.0 · 门店财务运营看板</div>
      <div className="tech pointer-events-none absolute bottom-6 left-6 z-10 hidden sm:block lg:bottom-10 lg:left-12">UPLINK_ESTABLISHED_</div>

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-[1440px] items-center px-4 py-16 lg:grid-cols-2 lg:gap-12 lg:px-12">
        {/* 左：品牌与标语，压在 shader 上 */}
        <div className="hidden lg:block">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink" aria-hidden="true">财</span>
            <span className="text-sm font-semibold tracking-tight">门店财务运营看板</span>
          </div>
          <h2 className="mt-10 text-[44px] font-medium leading-[1.12] tracking-[-0.03em] text-ink xl:text-[52px]">每个月的收支，<br />一眼看清。</h2>
          <p className="mt-5 max-w-[40ch] text-[15px] leading-relaxed text-ink-2">营业额、支出、毛利率与渠道分布，多门店同一口径，随录入实时更新。</p>
        </div>

        {/* 右：磨砂玻璃面板 */}
        <div className="glass glass-tint mx-auto w-full max-w-[420px] rounded-[var(--r-card)] p-6 sm:p-8 lg:ml-auto lg:mr-0">
          <div className="mb-7">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-ink" aria-hidden="true">财</span>
              <span className="text-sm font-semibold tracking-tight">门店财务运营看板</span>
            </div>
            <span className="mono inline-block rounded-full bg-white/8 px-3 py-1 text-[11px] tracking-[0.1em] text-ink">SIGN IN</span>
            <h1 className="mt-4 text-[28px] font-medium tracking-[-0.02em]">登录</h1>
            <p className="mt-1.5 text-sm text-ink-2">登录后查看门店经营数据</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <Field label="用户名" htmlFor="login-username">
              <input id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} className="control !min-h-[46px] !rounded-full !px-4" autoComplete="username" autoCapitalize="none" required />
            </Field>
            <Field label="密码" htmlFor="login-password">
              <input id="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="control !min-h-[46px] !rounded-full !px-4" autoComplete="current-password" required />
            </Field>
            {error && (
              <div role="alert" className="flex items-start gap-2 rounded-[var(--r-inner)] bg-bad-soft px-3.5 py-2.5 text-sm text-bad">
                <Icon name="alert" size={15} className="mt-0.5" />{error}
              </div>
            )}
            <Button type="submit" variant="primary" icon={submitting ? undefined : 'arrowRight'} className="btn-glow w-full !min-h-[50px] !rounded-full" loading={submitting} disabled={!username.trim() || !password}>
              {submitting ? '正在登录…' : '登录'}
            </Button>
            <p className="text-center text-xs text-ink-3">管理员和观察者使用同一入口登录。忘记密码请联系管理员重置。</p>
          </form>
        </div>
      </div>
    </div>
  )
}
