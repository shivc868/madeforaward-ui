'use client'

import {useEffect, useRef} from 'react'

export type HalftoneHoverProps = {
  /** image URL (needs CORS for remote hosts); transparent areas get no dots */
  src?: string
  /** how the image fills the box */
  fit?: 'cover' | 'contain'
  /** extra zoom on the image */
  imageScale?: number
  /** 'light' puts dots on bright areas, 'dark' on dark ones */
  mode?: 'light' | 'dark'
  /** tone (0–100) below which no dot is drawn */
  threshold?: number
  contrast?: number
  /** largest dot radius, px */
  dotSize?: number
  /** distance between dots, px */
  spacing?: number
  /** random size jitter, 0–1 */
  variation?: number
  /** square grid, or every other row shifted (denser, print-like) */
  grid?: 'square' | 'hex'
  shape?: 'circle' | 'square' | 'diamond'
  opacity?: number
  /** 'mono' uses primary + accent colours, 'image' samples each dot's colour */
  colorMode?: 'mono' | 'image'
  primaryColor?: string
  accentColor?: string
  /** share of dots in the accent colour, 0–1 */
  accentAmount?: number
  background?: string
  /** draw no background (dots over whatever is behind) */
  transparent?: boolean
  /** 'repel' pushes dots away from the pointer, 'attract' pulls them in */
  effect?: 'repel' | 'attract'
  /** pointer reach, px */
  radius?: number
  /** how far dots move, px */
  strength?: number
  /** sideways twist around the pointer, -1–1 */
  swirl?: number
  /** dots under the pointer grow by this much (0 = no change) */
  grow?: number
  /** how fast dots follow, 0–1 (per 60fps frame) */
  ease?: number
  className?: string
}

const DEFAULT_SRC = '/mfa/halftone-hover/portrait.webp'
const MAX_DOTS = 160_000

const VERT = `#version 300 es
in vec2 aPos;
in float aBoost;
in vec4 aDot; // size, alpha, accent, unused
in vec3 aColor;
uniform vec2 uView;
uniform float uDpr;
uniform float uGrow;
uniform vec3 uPrimary;
uniform vec3 uAccent;
uniform float uImageColor;
out float vAlpha;
out vec3 vColor;
void main() {
  vec2 clip = aPos / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float size = aDot.x * (1.0 + uGrow * aBoost);
  // a dot never drops below one device pixel, like a hairline print
  gl_PointSize = max(1.0, size * 2.0 * uDpr + 1.0);
  vAlpha = aDot.y;
  vColor = mix(mix(uPrimary, uAccent, aDot.z), aColor, uImageColor);
}`

const FRAG = `#version 300 es
precision mediump float;
in float vAlpha;
in vec3 vColor;
uniform int uShape;
out vec4 outColor;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float d = uShape == 0 ? length(p) : uShape == 1 ? max(abs(p.x), abs(p.y)) : abs(p.x) + abs(p.y);
  float aa = fwidth(d);
  float a = vAlpha * (1.0 - smoothstep(1.0 - aa * 1.5, 1.0, d));
  if (a <= 0.001) discard;
  outColor = vec4(vColor * a, a);
}`

const hex = (c: string) => {
  let h = c.replace('#', '')
  if (h.length === 3) h = [...h].map((x) => x + x).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255] as const
}
const hash = (x: number, y: number, a: number, b: number, k: number) => {
  const s = Math.sin(x * a + y * b) * k
  return s - Math.floor(s)
}

type Dots = {count: number; origin: Float32Array; live: Float32Array}

// An image redrawn as a halftone of dots that scatter around the pointer
// and drift back. Brightness picks each dot's size (after contrast and a
// threshold), a little hashed jitter keeps it from looking mechanical,
// and a share of dots can take an accent colour, or every dot can take
// the image's own colour.
//
// Every dot is one WebGL point drawn in a single call, so tens of
// thousands stay smooth. Each dot eases toward its own target (its home,
// pushed or pulled by the pointer), frame-rate independent; the loop only
// runs while something moves, and not at all off screen or in a hidden
// tab. Works with mouse and touch; reduced motion keeps the image still.
export default function HalftoneHover({
  src = DEFAULT_SRC,
  fit = 'contain',
  imageScale = 0.9,
  mode = 'light',
  threshold = 22,
  contrast = 1.65,
  dotSize = 2.2,
  spacing = 5,
  variation = 0.28,
  grid = 'square',
  shape = 'circle',
  opacity = 1,
  colorMode = 'mono',
  primaryColor = '#ffffff',
  accentColor = '#ff6a2b',
  accentAmount = 0.11,
  background = '#000000',
  transparent = false,
  effect = 'repel',
  radius = 120,
  strength = 48,
  swirl = 0,
  grow = 0,
  ease = 0.12,
  className = '',
}: HalftoneHoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  // live settings the running loop reads without a rebuild
  const look = useRef({primaryColor, accentColor, colorMode, background, transparent, shape, grow})
  const motion = useRef({effect, radius, strength, swirl, ease})
  const engine = useRef<{rebuild: () => void; redraw: () => void; setImage: (img: HTMLImageElement | null) => void} | null>(null)
  const sampling = useRef({fit, imageScale, mode, threshold, contrast, dotSize, spacing, variation, grid, opacity, accentAmount})

  useEffect(() => {
    look.current = {primaryColor, accentColor, colorMode, background, transparent, shape, grow}
    motion.current = {effect, radius, strength, swirl, ease}
    engine.current?.redraw()
  }, [primaryColor, accentColor, colorMode, background, transparent, shape, grow, effect, radius, strength, swirl, ease])

  useEffect(() => {
    sampling.current = {fit, imageScale, mode, threshold, contrast, dotSize, spacing, variation, grid, opacity, accentAmount}
    engine.current?.rebuild()
  }, [fit, imageScale, mode, threshold, contrast, dotSize, spacing, variation, grid, opacity, accentAmount])

  // load the image (falls back to nothing on error)
  useEffect(() => {
    let cancelled = false
    const img = new Image()
    if (!src.startsWith('data:')) img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      imageRef.current = img
      engine.current?.setImage(img)
    }
    img.onerror = () => {
      if (cancelled) return
      imageRef.current = null
      engine.current?.setImage(null)
    }
    img.src = src
    return () => {
      cancelled = true
      img.onload = img.onerror = null
    }
  }, [src])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    const gl = canvas.getContext('webgl2', {antialias: false, premultipliedAlpha: true, alpha: true})
    if (!gl) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    const compile = (type: number, code: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, code)
      gl.compileShader(s)
      return s
    }
    const program = gl.createProgram()
    const vs = compile(gl.VERTEX_SHADER, VERT)
    const fs = compile(gl.FRAGMENT_SHADER, FRAG)
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.useProgram(program)
    const u = (name: string) => gl.getUniformLocation(program, name)
    const uView = u('uView')
    const uDpr = u('uDpr')
    const uGrow = u('uGrow')
    const uPrimary = u('uPrimary')
    const uAccent = u('uAccent')
    const uImageColor = u('uImageColor')
    const uShape = u('uShape')

    const vao = gl.createVertexArray()
    gl.bindVertexArray(vao)
    const liveBuf = gl.createBuffer() // x, y, boost per dot (rewritten while moving)
    const staticBuf = gl.createBuffer() // size, alpha, accent, 0, r, g, b
    const attr = (name: string, buf: WebGLBuffer, size: number, stride: number, offset: number) => {
      const loc = gl.getAttribLocation(program, name)
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride, offset)
    }
    attr('aPos', liveBuf, 2, 12, 0)
    attr('aBoost', liveBuf, 1, 12, 8)
    attr('aDot', staticBuf, 4, 28, 0)
    attr('aColor', staticBuf, 3, 28, 16)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    let width = 1
    let height = 1
    let dpr = 1
    let dots: Dots = {count: 0, origin: new Float32Array(0), live: new Float32Array(0)}
    const pointer = {x: 0, y: 0, active: false}
    let image = imageRef.current
    let raf = 0
    let last = 0
    let visible = false

    // sample the image into dots
    const sample = () => {
      const s = sampling.current
      const sampler = document.createElement('canvas')
      sampler.width = width
      sampler.height = height
      const ctx = sampler.getContext('2d', {willReadFrequently: true})
      if (!ctx) return
      let data: Uint8ClampedArray | null = null
      if (image) {
        const ia = image.naturalWidth / image.naturalHeight
        const ba = width / height
        const wide = ia > ba
        const cover = s.fit === 'cover'
        let w = (wide !== cover ? width : height * ia) * s.imageScale
        let h = (wide !== cover ? width / ia : height) * s.imageScale
        if (!Number.isFinite(w) || !Number.isFinite(h)) w = h = 0
        ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
        try {
          data = ctx.getImageData(0, 0, width, height).data
        } catch {
          data = null // a remote image without CORS can't be read
        }
      }
      const step = Math.max(2, Math.round(s.spacing))
      const cut = s.threshold / 100
      const rows = Math.ceil(height / step) + 1
      const cols = Math.ceil(width / step) + 1
      const cap = Math.min(MAX_DOTS, rows * cols)
      const origin = new Float32Array(cap * 2)
      const stat = new Float32Array(cap * 7)
      let n = 0
      if (data) {
        for (let r = 0; r < rows && n < cap; r++) {
          const y = r * step
          if (y >= height) break
          const shift = s.grid === 'hex' && r % 2 ? step / 2 : 0
          for (let c = 0; c < cols && n < cap; c++) {
            const x = c * step + shift
            if (x >= width) break
            const i = (Math.floor(y) * width + Math.floor(x)) * 4
            if (data[i + 3] / 255 < 0.08) continue
            let tone = (data[i] + data[i + 1] + data[i + 2]) / 765
            tone = Math.max(0, Math.min(1, (tone - 0.5) * s.contrast + 0.5))
            const v = s.mode === 'light' ? tone : 1 - tone
            if (v < cut) continue
            const k = (v - cut) / Math.max(0.001, 1 - cut)
            const jitter = 1 + (hash(x, y, 12.9898, 78.233, 43758.5453) - 0.5) * 2 * s.variation
            origin[n * 2] = x
            origin[n * 2 + 1] = y
            const o = n * 7
            stat[o] = s.dotSize * k ** 0.72 * Math.max(0.2, jitter)
            stat[o + 1] = k * s.opacity
            stat[o + 2] = hash(x, y, 4.112, 9.331, 9182.381) < s.accentAmount ? 1 : 0
            stat[o + 4] = data[i] / 255
            stat[o + 5] = data[i + 1] / 255
            stat[o + 6] = data[i + 2] / 255
            n++
          }
        }
      }
      // keep dots where they were if the grid didn't change, so a tweak doesn't snap
      const live = new Float32Array(n * 3)
      const keep = dots.count === n
      for (let i = 0; i < n; i++) {
        live[i * 3] = keep ? dots.live[i * 3] : origin[i * 2]
        live[i * 3 + 1] = keep ? dots.live[i * 3 + 1] : origin[i * 2 + 1]
        live[i * 3 + 2] = keep ? dots.live[i * 3 + 2] : 0
      }
      dots = {count: n, origin: origin.subarray(0, n * 2), live}
      gl.bindBuffer(gl.ARRAY_BUFFER, staticBuf)
      gl.bufferData(gl.ARRAY_BUFFER, stat.subarray(0, n * 7), gl.STATIC_DRAW)
      gl.bindBuffer(gl.ARRAY_BUFFER, liveBuf)
      gl.bufferData(gl.ARRAY_BUFFER, live, gl.DYNAMIC_DRAW)
    }

    const draw = () => {
      const l = look.current
      const [br, bg, bb] = hex(l.background)
      if (l.transparent) gl.clearColor(0, 0, 0, 0)
      else gl.clearColor(br, bg, bb, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (!dots.count) return
      gl.uniform2f(uView, width, height)
      gl.uniform1f(uDpr, dpr)
      gl.uniform1f(uGrow, l.grow)
      gl.uniform3f(uPrimary, ...hex(l.primaryColor))
      gl.uniform3f(uAccent, ...hex(l.accentColor))
      gl.uniform1f(uImageColor, l.colorMode === 'image' ? 1 : 0)
      gl.uniform1i(uShape, l.shape === 'circle' ? 0 : l.shape === 'square' ? 1 : 2)
      gl.drawArrays(gl.POINTS, 0, dots.count)
    }

    // move every dot toward its target; returns whether anything still moves
    const step = (dt: number) => {
      const m = motion.current
      const k = 1 - Math.pow(1 - Math.min(0.99, Math.max(0.005, m.ease)), dt * 60)
      const R = Math.max(1, m.radius)
      const R2 = R * R
      const sign = m.effect === 'attract' ? -1 : 1
      const {origin, live, count} = dots
      let moving = false
      for (let i = 0; i < count; i++) {
        const ox = origin[i * 2]
        const oy = origin[i * 2 + 1]
        let tx = ox
        let ty = oy
        let tb = 0
        if (pointer.active) {
          const dx = ox - pointer.x
          const dy = oy - pointer.y
          if (dx < R && dx > -R && dy < R && dy > -R) {
            const d2 = dx * dx + dy * dy
            if (d2 < R2 && d2 > 0.001) {
              const d = Math.sqrt(d2)
              const f = (1 - d / R) ** 2
              let push = f * m.strength
              if (sign < 0) push = Math.min(push, d * 0.9) // never past the pointer
              const nx = dx / d
              const ny = dy / d
              tx = ox + (nx * sign - ny * m.swirl) * push
              ty = oy + (ny * sign + nx * m.swirl) * push
              tb = f
            }
          }
        }
        const j = i * 3
        const x = live[j] + (tx - live[j]) * k
        const y = live[j + 1] + (ty - live[j + 1]) * k
        const b = live[j + 2] + (tb - live[j + 2]) * k
        if (!moving && (Math.abs(x - live[j]) > 0.01 || Math.abs(y - live[j + 1]) > 0.01 || Math.abs(b - live[j + 2]) > 0.001)) moving = true
        live[j] = x
        live[j + 1] = y
        live[j + 2] = b
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, liveBuf)
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, live)
      return moving
    }

    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000))
      last = now
      const moving = step(dt)
      draw()
      if (moving || pointer.active) raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (raf || !visible || reduced) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const redraw = () => {
      if (!raf) draw()
      wake()
    }

    const resize = () => {
      width = Math.max(1, Math.floor(root.clientWidth))
      height = Math.max(1, Math.floor(root.clientHeight))
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
      sample()
      draw()
    }

    engine.current = {
      rebuild: () => {
        sample()
        redraw()
      },
      redraw,
      setImage: (img) => {
        image = img
        dots.count = 0 // a new picture never animates in from the old dots
        sample()
        redraw()
      },
    }

    const toLocal = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      pointer.x = ((e.clientX - r.left) / r.width) * width
      pointer.y = ((e.clientY - r.top) / r.height) * height
    }
    const onMove = (e: PointerEvent) => {
      toLocal(e)
      pointer.active = true
      wake()
    }
    const onLeave = () => {
      pointer.active = false
      wake()
    }
    // a finger lifting ends the touch; a mouse stays until it leaves
    const onUp = (e: PointerEvent) => e.pointerType !== 'mouse' && onLeave()

    const ro = new ResizeObserver(resize)
    ro.observe(root)
    resize()
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) redraw()
      else {
        cancelAnimationFrame(raf)
        raf = 0
      }
    })
    io.observe(root)
    const onVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(raf)
        raf = 0
      } else wake()
    }
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerdown', onMove)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('pointercancel', onLeave)
    root.addEventListener('pointerup', onUp)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      engine.current = null
      ro.disconnect()
      io.disconnect()
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerdown', onMove)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('pointercancel', onLeave)
      root.removeEventListener('pointerup', onUp)
      document.removeEventListener('visibilitychange', onVisibility)
      // keep the context itself (React dev re-mounts reuse the canvas)
      gl.deleteBuffer(liveBuf)
      gl.deleteBuffer(staticBuf)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [])

  return (
    <div ref={rootRef} className={`relative h-full w-full touch-pan-y overflow-hidden ${className}`} style={{background: transparent ? 'transparent' : background}}>
      <canvas ref={canvasRef} className="absolute inset-0 block size-full" />
    </div>
  )
}
