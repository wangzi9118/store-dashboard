/** 毛利率 = (营业额实收 - 订货支出) / 营业额实收 */
export function grossMargin(sales: number, expense: number): number {
  if (sales <= 0) return 0
  return (sales - expense) / sales
}

/**
 * 数字格式规则（全站统一）：
 * - 汇总金额（KPI、表格）：取整 + 千分位            formatMoney
 * - 明细与渠道单项：两位小数                        formatMoneyExact
 * - 图表轴与标签：以“万”为单位，最多一位小数        formatWan
 * - 比率：一位小数，最多两位                        formatPct
 */
export function formatMoney(n: number): string {
  return Math.round(n).toLocaleString('zh-CN')
}

export function formatMoneyExact(n: number): string {
  return n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function formatPct(ratio: number): string {
  return `${(ratio * 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  })}%`
}

export function formatWan(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 10000) {
    const wan = n / 10000
    return `${wan.toLocaleString('zh-CN', { maximumFractionDigits: Math.abs(wan) >= 100 ? 0 : 1 })}万`
  }
  return Math.round(n).toLocaleString('zh-CN')
}

/** 带符号的金额差值：+12,300 / -4,500 / 0 */
export function formatSignedMoney(delta: number): string {
  const rounded = Math.round(delta)
  if (rounded === 0) return '0'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('zh-CN')}`
}

/** 相对变化率；上期为 0 或负数时无法计算，返回 null */
export function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null
  return (current - previous) / previous
}

export function formatSignedPct(ratio: number): string {
  const value = ratio * 100
  const rounded = Math.round(value * 10) / 10
  if (rounded === 0) return '0%'
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** 比率类指标的差值，以“个百分点”表示 */
export function formatPoints(deltaRatio: number): string {
  const points = Math.round(deltaRatio * 1000) / 10
  if (points === 0) return '0 个百分点'
  return `${points > 0 ? '+' : '−'}${Math.abs(points).toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} 个百分点`
}
