import { useEffect, useState } from 'react'

/**
 * 产品只保留深色主题（见 index.css）。这里只留下视口相关的 hook。
 */

/** 视口是否为手机宽度（< 640px），用于图表尺寸与标签密度 */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const listener = (event: MediaQueryListEvent) => setMobile(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])
  return mobile
}
