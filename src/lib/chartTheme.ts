import { useMemo } from 'react'
import { formatWan } from './formulas'

/**
 * 图表 token：从 CSS 变量读取，保证图表与页面同一套颜色、同一套主题切换。
 * 借鉴 Liveline 的表达方式：一个主色派生线、面积渐变、发光与标签色。
 */
export interface ChartTokens {
  income: string
  expense: string
  storeA: string
  storeB: string
  ink: string
  ink2: string
  ink3: string
  grid: string
  surface: string
  line: string
  good: string
  bad: string
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

export function useChartTokens(): ChartTokens {
  return useMemo(() => ({
    income: cssVar('--income', '#3987e5'),
    expense: cssVar('--expense', '#d95926'),
    storeA: cssVar('--income', '#3987e5'),
    storeB: cssVar('--expense', '#d95926'),
    ink: cssVar('--ink', '#ECE8E3'),
    ink2: cssVar('--ink-2', '#b4bcc9'),
    ink3: cssVar('--ink-3', '#8a94a6'),
    grid: cssVar('--grid', '#262d3b'),
    surface: cssVar('--surface-solid', '#171615'),
    line: cssVar('--line', '#2a3140'),
    good: cssVar('--good', '#3ecf8e'),
    bad: cssVar('--bad', '#f37b7b'),
  }), [])
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return [57, 135, 229]
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** 线下方从主色到透明的面积渐变（Liveline 风格） */
export function areaGradient(color: string, top = 0.32) {
  return {
    type: 'linear',
    x: 0, y: 0, x2: 0, y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(color, top) },
      { offset: 1, color: withAlpha(color, 0) },
    ],
  }
}

export function glow(color: string) {
  return { shadowBlur: 14, shadowColor: withAlpha(color, 0.45), shadowOffsetY: 4 }
}

export function baseGrid(tokens: ChartTokens, mobile: boolean) {
  return {
    grid: { left: mobile ? 8 : 12, right: mobile ? 12 : 20, top: mobile ? 12 : 16, bottom: 8, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      axisLine: { lineStyle: { color: tokens.line } },
      axisTick: { show: false },
      axisLabel: { color: tokens.ink3, fontSize: mobile ? 11 : 12, hideOverlap: true, fontFamily: 'JetBrains Mono, monospace' },
    },
    yAxis: {
      type: 'value',
      scale: false,
      splitNumber: 4,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: tokens.grid, type: 'dashed' } },
      axisLabel: { color: tokens.ink3, fontSize: mobile ? 11 : 12, formatter: (v: number) => formatWan(v), fontFamily: 'JetBrains Mono, monospace' },
    },
    tooltip: {
      trigger: 'axis',
      confine: true,
      backgroundColor: tokens.surface,
      borderColor: tokens.line,
      borderWidth: 1,
      borderRadius: 12,
      padding: [10, 14],
      textStyle: { color: tokens.ink, fontSize: 12 },
      axisPointer: { type: 'line', lineStyle: { color: tokens.line, type: 'dashed' } },
    },
  }
}

export function emptyGraphic(text: string, tokens: ChartTokens) {
  return {
    type: 'text',
    left: 'center',
    top: 'middle',
    style: { text, fill: tokens.ink3, fontSize: 13 },
  }
}
