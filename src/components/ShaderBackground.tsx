import { useEffect, useRef, useState } from 'react'
import { useIsMobile } from '../lib/theme'

/**
 * 氛围层：WebGL 域扭曲噪声渐变 + 胶片颗粒（移植自 Undertone // Archive Slider 的片元着色器），
 * 调色从 CSS token（--fx-*）读取，因此随主题切换。
 * 降级：不支持 WebGL 或 prefers-reduced-motion 时只渐变/只渲染一帧；手机端半分辨率；页面不可见时暂停。
 */

const VS = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); vUv = aPos * 0.5 + 0.5; }
`

const FS = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uResolution;
uniform vec2 uMouse;
uniform vec3 uBase;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD; uniform vec3 uE;
uniform float uMix;
uniform float uGrain;
uniform float uParallax;
uniform float uVignette;

float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m; m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  vec2 st = gl_FragCoord.xy / uResolution.xy;
  st.x *= uResolution.x / uResolution.y;
  st += (uMouse / uResolution) * uParallax;

  float n1 = snoise(st * 1.2 + uTime * 0.06);
  float n2 = snoise(st * 1.7 - uTime * 0.09 + n1);
  vec2 w = st + vec2(n1, n2) * 0.45;

  float d1 = length(w - vec2(0.15, 0.85));
  float d2 = length(w - vec2(0.9, 0.15));
  float d3 = length(w - vec2(0.55, 0.5));

  vec3 col = mix(uD, uC, smoothstep(0.0, 1.3, d1));
  col = mix(col, uB, smoothstep(0.2, 1.6, d3));
  col = mix(col, uA, smoothstep(0.35, 2.0, d2));
  float pop = snoise(st * 2.6 + uTime * 0.04);
  col = mix(col, uE, smoothstep(0.55, 1.0, pop) * 0.45);

  // 压到底色上，让前景卡片保持可读
  vec3 fin = mix(uBase, col, uMix);
  // 亮部向中心渐弱，边缘更暗，形成暗角
  float vig = smoothstep(1.35, 0.25, length(vUv - 0.5) * 1.15);
  fin = mix(uBase, fin, mix(1.0, 0.55 + 0.45 * vig, uVignette));

  float grain = random(vUv * (uTime * 0.001 + 100.0));
  fin += (grain - 0.5) * uGrain;
  gl_FragColor = vec4(fin, 1.0);
}
`

function hexToVec(hex: string): [number, number, number] {
  const clean = hex.trim().replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return [0.06, 0.06, 0.06]
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

function readFx() {
  const style = getComputedStyle(document.documentElement)
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
  return {
    base: hexToVec(get('--fx-base', '#0F0F0F')),
    a: hexToVec(get('--fx-a', '#1D3557')),
    b: hexToVec(get('--fx-b', '#B9C9E1')),
    c: hexToVec(get('--fx-c', '#E3B6D8')),
    d: hexToVec(get('--fx-d', '#E85D04')),
    e: hexToVec(get('--fx-e', '#2A9D8F')),
    mix: Number.parseFloat(get('--fx-mix', '0.4')) || 0.4,
    grain: Number.parseFloat(get('--fx-grain', '0.1')) || 0.1,
  }
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

interface Props {
  className?: string
  /** ambient：页面背景，混入量低、带暗角；vivid：登录页等无前景信息的区域，颜色更足、视差更大 */
  variant?: 'ambient' | 'vivid'
}

export function ShaderBackground({ className = '', variant = 'ambient' }: Props) {
  const vivid = variant === 'vivid'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mobile = useIsMobile()
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl || gl.isContextLost()) { setSupported(false); return }

    const vs = compile(gl, gl.VERTEX_SHADER, VS)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS)
    const program = gl.createProgram()
    if (!vs || !fs || !program) { setSupported(false); return }
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { setSupported(false); return }
    gl.useProgram(program)

    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, 1, -1, 1, 1, -1, -1, -1]), gl.STATIC_DRAW)
    const aPos = gl.getAttribLocation(program, 'aPos')
    gl.enableVertexAttribArray(aPos)
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(program, name)
    const uTime = u('uTime'), uRes = u('uResolution'), uMouse = u('uMouse')
    const fx = readFx()
    gl.uniform3fv(u('uBase'), fx.base)
    gl.uniform3fv(u('uA'), fx.a); gl.uniform3fv(u('uB'), fx.b); gl.uniform3fv(u('uC'), fx.c)
    gl.uniform3fv(u('uD'), fx.d); gl.uniform3fv(u('uE'), fx.e)
    gl.uniform1f(u('uMix'), vivid ? Math.min(1, fx.mix * 1.9) : fx.mix)
    gl.uniform1f(u('uGrain'), vivid ? fx.grain * 1.2 : fx.grain)
    gl.uniform1f(u('uParallax'), vivid ? 0.22 : 0.08)
    gl.uniform1f(u('uVignette'), vivid ? 0.7 : 1.0)

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    // 桌面按 CSS 像素分辨率渲染（dpr 2 时为半分辨率），手机再减半：省电且颗粒不至于成块
    const scale = mobile ? 0.5 : Math.min(window.devicePixelRatio || 1, 2) * 0.5
    let mouseX = 0, mouseY = 0, targetX = 0, targetY = 0
    let raf = 0
    let running = true
    const start = performance.now()

    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * scale))
      const h = Math.max(1, Math.floor(canvas.clientHeight * scale))
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
      gl.viewport(0, 0, w, h)
    }
    const draw = (now: number) => {
      resize()
      mouseX += (targetX - mouseX) * (vivid ? 0.06 : 0.04)
      mouseY += (targetY - mouseY) * (vivid ? 0.06 : 0.04)
      gl.uniform1f(uTime, reduced ? 12 : (now - start) * 0.001 + 12)
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform2f(uMouse, mouseX * scale, mouseY * scale)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const loop = (now: number) => {
      if (!running) return
      draw(now)
      if (!reduced) raf = requestAnimationFrame(loop)
    }
    const onMove = (event: PointerEvent) => {
      targetX = event.clientX - canvas.clientWidth / 2
      targetY = canvas.clientHeight / 2 - event.clientY
    }
    const onVisibility = () => {
      running = document.visibilityState === 'visible'
      if (running && !reduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop) }
    }
    const onResize = () => { if (reduced) draw(performance.now()) }

    raf = requestAnimationFrame(loop)
    if (!mobile) window.addEventListener('pointermove', onMove, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('resize', onResize)
    return () => {
      running = false
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('resize', onResize)
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [mobile, vivid])

  return (
    <div className={`fx-layer ${className}`} aria-hidden="true">
      {/* 主题/断点切换时换一块新画布：旧上下文在 cleanup 里已被 loseContext，复用会拿到失效上下文 */}
      {supported ? <canvas key={`${mobile ? 'm' : 'd'}-${variant}`} ref={canvasRef} className="fx-canvas" /> : <div className="fx-fallback" />}
      <div className="fx-grid" />
      {!vivid && <div className="fx-vignette" />}
    </div>
  )
}
