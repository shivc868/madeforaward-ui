'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type InkBlobCursorProps = {
  /** background colour */
  background?: string
  /** colour of the blob */
  ink?: string
  /** blob diameter, share of the width */
  size?: number
  /** how far the blob follows the cursor (1 = all the way, 0 = stays centred) */
  follow?: number
  /** how quickly it catches up (higher = snappier) */
  ease?: number
  /** how ragged the edge is */
  turbulence?: number
  /** how fine the ink splashes are */
  noiseScale?: number
  /** how fast the edge wobbles */
  wobble?: number
  /** film-grain dither over the background */
  grain?: boolean
  /** open with the blob filling the screen and shrinking to size */
  intro?: boolean
  /** content over the blob; it's set in white with a difference blend, so it reads dark on the page and light on the ink */
  children?: ReactNode
  className?: string
}

const VERT = `#version 300 es
in vec2 a_position;
out vec2 vUv;
void main() {
  vUv = 0.5 * (a_position + 1.0);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

const FRAG = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
uniform vec2 uRes;
uniform vec2 uMouse;
uniform float uWidth;
uniform float uFollow;
uniform float uTime;
uniform float uTurbulence;
uniform float uScale;
uniform vec3 uBg;
uniform vec3 uInk;
uniform float uGrain;
uniform float uSeed;
out vec4 fragColor;

const float PI = 3.14159265359;
mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }

vec3 hash3(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}

// smooth voronoi noise (Inigo Quilez's voronoise with u = v = 1), cells drifting on a slow sine
float voronoise(vec2 uv) {
  uv *= vec2(0.5) * 2.91;
  vec2 p = floor(uv);
  vec2 f = fract(uv);
  float va = 0.0;
  float wt = 0.0;
  for (int j = -2; j <= 2; j++)
    for (int i = -2; i <= 2; i++) {
      vec2 g = vec2(float(i), float(j));
      vec3 o = hash3(p + g);
      o.xy += 0.5 * vec2(sin(uTime * 0.1 + o.x * 6.28));
      vec2 r = g - f + o.xy;
      float w = 1.0 - smoothstep(0.0, 1.414, sqrt(dot(r, r)));
      va += o.z * w;
      wt += w;
    }
  return va / wt;
}

// the blob: a circle that trails the cursor, read through a noise field fixed to the screen,
// so its edge breaks into splashes that change as it moves
float blob(vec2 uv) {
  float aspect = uRes.x / uRes.y;
  vec2 st = (uv - vec2(0.5, 0.5016)) * vec2(aspect, 1.0) * 12.0 * uScale;
  st = rot(0.0216 * -2.0 * PI) * st;
  vec2 n = vec2(voronoise(st), voronoise(st + vec2(9.2, 1.2)));
  vec2 s = mix(uv, n, uTurbulence) - (uMouse - 0.5) * uFollow;
  vec2 px = vec2(s.x * uRes.x, (1.0 - s.y) * uRes.y);
  float r = uWidth * uRes.x * 0.5;
  float d = length(px - vec2(0.5002, 0.5025) * uRes) - r;
  return 1.0 - smoothstep(0.0, max(fwidth(d), 0.75), d);
}

uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.y * 1664525u + 1013904223u;
  v.y += v.x * v.x * 1664525u + 1013904223u;
  v ^= v >> 16;
  v.x += v.y * v.y * 1664525u + 1013904223u;
  v.y += v.x * v.x * 1664525u + 1013904223u;
  return v;
}
float randFibo(vec2 p) {
  uvec2 v = pcg2d(floatBitsToUint(p));
  return float(v.x ^ v.y) / float(0xffffffffu);
}

void main() {
  // the page: its colour quantised to ~14 levels with a per-pixel random threshold (grain)
  vec3 bg = uBg;
  if (uGrain > 0.5) {
    vec2 offset = vec2(randFibo(vec2(123, 16) + uSeed), randFibo(vec2(56, 96) + uSeed));
    float levels = 1.0 / 0.07;
    bg = floor(bg * levels + randFibo(vUv + offset) - 0.005) / levels;
  }
  fragColor = vec4(mix(bg, uInk, blob(vUv)), 1.0);
}`

const toRgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// in-out expo and quart, for the opening
const expoInOut = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2)
const quartInOut = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2)

// An ink blot that follows the cursor: a circle trailing the pointer, read
// through a slowly drifting voronoi noise field pinned to the screen, so
// its edge tears into splashes and droplets that reshape as it travels.
// Text over it is white with a difference blend, so it reads dark on the
// grainy page and light where the ink passes. It opens filling the screen
// and draws back to size. Raw WebGL2, one pass.
export default function InkBlobCursor({
  background = '#eeeeee',
  ink = '#000000',
  size = 0.27,
  follow = 0.87,
  ease = 0.08,
  turbulence = 0.15,
  noiseScale = 1.166,
  wobble = 0.5,
  grain = true,
  intro = true,
  children,
  className = '',
}: InkBlobCursorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({background, ink, size, follow, ease, turbulence, noiseScale, wobble, grain})

  useEffect(() => {
    live.current = {background, ink, size, follow, ease, turbulence, noiseScale, wobble, grain}
  }, [background, ink, size, follow, ease, turbulence, noiseScale, wobble, grain])

  useEffect(() => {
    const root = rootRef.current!
    const canvas = canvasRef.current!
    const gl = canvas.getContext('webgl2', {antialias: false})
    if (!gl) return
    const program = gl.createProgram()
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, FRAG],
    ] as const) {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      gl.attachShader(program, s)
      gl.deleteShader(s)
    }
    gl.bindAttribLocation(program, 0, 'a_position')
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
    gl.useProgram(program)
    const u = (name: string) => gl.getUniformLocation(program, name)
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const mouse = {x: 0.5, y: 0.5, tx: 0.5, ty: 0.5}
    let w = 1
    let h = 1
    let time = 0
    let start = -1
    let last = 0
    let raf = 0
    let visible = true

    const draw = (now: number) => {
      const o = live.current
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 0
      last = now
      if (start < 0) start = now
      // the opening: the blob shrinks from the full width while it starts to follow
      const t = intro && !still ? (now - start) / 1000 : 99
      const width = 1 + (o.size - 1) * expoInOut(Math.min(1, Math.max(0, (t - 0.1) / 2)))
      const followNow = o.follow * quartInOut(Math.min(1, Math.max(0, (t - 0.15) / 2)))
      const k = 1 - (1 - o.ease) ** (dt * 60)
      mouse.x += (mouse.tx - mouse.x) * k
      mouse.y += (mouse.ty - mouse.y) * k
      time += dt * 60 * o.wobble

      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(u('uRes'), w, h)
      gl.uniform2f(u('uMouse'), mouse.x, mouse.y)
      gl.uniform1f(u('uWidth'), width)
      gl.uniform1f(u('uFollow'), followNow)
      gl.uniform1f(u('uTime'), time)
      gl.uniform1f(u('uTurbulence'), o.turbulence)
      gl.uniform1f(u('uScale'), o.noiseScale)
      gl.uniform3fv(u('uBg'), toRgb(o.background))
      gl.uniform3fv(u('uInk'), toRgb(o.ink))
      gl.uniform1f(u('uGrain'), o.grain ? 1 : 0)
      gl.uniform1f(u('uSeed'), Math.floor(now / 1000))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      draw(now)
      if (!still) raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      last = 0
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }

    const ro = new ResizeObserver(() => {
      // a fixed 1.5x buffer, like the reference: fine grain without a 4x cost on retina
      w = Math.max(1, root.clientWidth)
      h = Math.max(1, root.clientHeight)
      canvas.width = Math.round(w * 1.5)
      canvas.height = Math.round(h * 1.5)
      wake()
    })
    ro.observe(root)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)
    document.addEventListener('visibilitychange', wake)
    const move = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      mouse.tx = (e.clientX - r.left) / r.width
      mouse.ty = 1 - (e.clientY - r.top) / r.height
      if (still) wake()
    }
    window.addEventListener('pointermove', move, {passive: true})

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('pointermove', move)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [intro])

  return (
    <div ref={rootRef} className={`relative isolate h-full w-full overflow-hidden ${className}`} style={{background}}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
      {children != null && <div className="relative h-full w-full text-white mix-blend-difference">{children}</div>}
    </div>
  )
}
