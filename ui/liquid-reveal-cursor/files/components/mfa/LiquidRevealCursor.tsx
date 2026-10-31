'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type LiquidRevealCursorProps = {
  /** what the blob reveals (a gradient, an image, a second design). Without it the blob shows the page through `filter` and `tint`. */
  children?: ReactNode
  /** blob radius at rest, in px */
  size?: number
  /** 0–1.5: how long the trail lives, in seconds */
  trail?: number
  /** 0–1: how far the trail keeps sliding after the pointer */
  smear?: number
  /** 0–1: how much the trail swirls, swells and breaks into drops */
  flow?: number
  /** 0–1: how much speed swells and stretches the blob */
  speed?: number
  /** seconds the pointer must rest before the trail gathers back */
  delay?: number
  /** press for a splash of drops; hold to open the window wider */
  splash?: boolean
  /** over links and buttons the blob morphs around them */
  lens?: boolean
  /** CSS filter applied to the page inside the blob */
  filter?: string
  /** colour laid over the revealed page (lighten blend); 'transparent' = none */
  tint?: string
  /** fine film grain inside the blob */
  grain?: boolean
  /** hide the native cursor */
  hideCursor?: boolean
  /** follow the pointer over the whole page (default) or only inside the parent */
  fixed?: boolean
  zIndex?: number
}

const LENS_TARGETS = 'a[href], button, [role="button"], [data-cursor-lens]'
const LENS_PAD = 10
const MAX_BLOBS = 64
const CELL_BUDGET = 8000
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.09 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
const HIDDEN = 'path("M0 0")'

// A liquid cursor that is a window onto another version of the page: two
// full-size layers (the page through a backdrop filter, and a tint) are cut
// to one clip-path, rebuilt each frame from a metaball field.
//
// The head chases the pointer on a critically damped spring and stamps soft
// discs along its path. Each disc slides on (smear), swirls on curl noise
// and swells mid-life (flow), then shrinks away; when the pointer rests the
// young discs are pulled back into the head and the head fades out. All
// discs (plus a rounded box when hovering a link) are melted together with a
// smooth union and traced with marching squares into a smooth path.
export default function LiquidRevealCursor({
  children,
  size = 80,
  trail = 0.7,
  smear = 0.4,
  flow = 0.5,
  speed = 0.6,
  delay = 0.15,
  splash = true,
  lens = true,
  filter = 'invert(1) hue-rotate(180deg)',
  tint = '#2a0f3f',
  grain = true,
  hideCursor = false,
  fixed = true,
  zIndex = 9999,
}: LiquidRevealCursorProps) {
  // The clipped layers: the page through a filter plus a tint, or the children.
  const layersRef = useRef<(HTMLDivElement | null)[]>([])
  const custom = children != null

  useEffect(() => {
    const layers = layersRef.current.filter((el) => el !== null)
    // Mouse and pen only: there is no hovering pointer to follow on touch.
    if (!layers.length || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return

    const host = fixed ? document.documentElement : layers[0].parentElement!
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const blobs: Blob[] = []
    const shapes: Shape[] = []
    const grid: Grid = {field: new Float32Array(0), links: new Int32Array(0), seen: new Uint8Array(0)}
    const swirl = {x: 0, y: 0}

    const head = {x: spring(), y: spring()}
    const pace = spring() // 0–1 speed
    const shown = spring() // head visibility
    const hold = spring() // press and hold
    const lensMix = spring()
    const lensBox = {x: spring(), y: spring(), w: spring(), h: spring()}
    const client = {x: 0, y: 0}
    let dirX = 1
    let dirY = 0
    let emitX = 0
    let emitY = 0
    let started = false
    let inside = false
    let moved = false
    let lastMove = -Infinity
    let paceAtMove = 0
    let wasIdle = true
    let pulseAt = -1
    let pressed = false
    let pressAt = 0
    let lensEl: Element | null = null
    const splashes: {x: number; y: number}[] = []
    let raf = 0
    let last = 0
    let clip = HIDDEN

    let cursorStyle: HTMLStyleElement | null = null
    if (hideCursor) {
      cursorStyle = document.createElement('style')
      cursorStyle.textContent = fixed ? '*{cursor:none!important}' : '[data-liquid-cursor-host],[data-liquid-cursor-host] *{cursor:none!important}'
      document.head.append(cursorStyle)
      if (!fixed) host.setAttribute('data-liquid-cursor-host', '')
    }

    const addBlob = (born: number, x: number, y: number, r0: number, extra: Partial<Blob> = {}) => {
      blobs.push({x, y, r0, born, vx: 0, vy: 0, ux: 1, uy: 0, energy: 0, life: 1, jitter: 0, grow: 0, growFrom: 0, trail: false, pull: false, pvx: 0, pvy: 0, ...extra})
      if (blobs.length > MAX_BLOBS) blobs.shift()
    }

    const frame = (now: number) => {
      raf = 0
      const ms = last ? Math.min(64, now - last) : 16.7
      last = now
      const f = ms / 16.7
      const lifeMs = Math.max(200, trail * 1000)
      const box = fixed ? {left: 0, top: 0, width: window.innerWidth, height: window.innerHeight} : host.getBoundingClientRect()
      const tx = client.x - box.left
      const ty = client.y - box.top

      if (moved) {
        moved = false
        if (!started) {
          started = true
          head.x.x = emitX = tx
          head.y.x = emitY = ty
        }
        lastMove = now
        paceAtMove = pace.x
      }

      // Head: a critically damped spring after the pointer.
      step(head.x, tx, 1225, 70, ms)
      step(head.y, ty, 1225, 70, ms)
      const vx = head.x.v / 60
      const vy = head.y.v / 60
      const sp = Math.hypot(vx, vy)
      if (sp > 0.5) [dirX, dirY] = [vx / sp, vy / sp]
      step(pace, Math.min(1, sp / 40), 260, 32, ms)
      const holding = pressed && now - pressAt > 180
      step(hold, holding ? 1 : 0, holding ? 120 : 520, holding ? 22 : 46, ms)
      const holdScale = 1 + 1.2 * clamp01(hold.x)
      // Head and trail give way while the blob wraps a link.
      const room = (1 - clamp01(lensMix.x)) ** 2
      const radius = size * (1 + speed * (0.6 * pace.x - 0.3)) * holdScale

      // Stamp discs along the path the head travelled.
      if (started && !still) {
        const gap = Math.max(4, radius * 0.36)
        const scatter = Math.min(1, flow * 2)
        let dist = Math.hypot(head.x.x - emitX, head.y.x - emitY)
        while (dist >= gap) {
          emitX += ((head.x.x - emitX) / dist) * gap
          emitY += ((head.y.x - emitY) / dist) * gap
          dist -= gap
          addBlob(now, emitX, emitY, radius, {
            vx: vx * smear * 0.35,
            vy: vy * smear * 0.35,
            energy: pace.x,
            ux: dirX,
            uy: dirY,
            life: 1 + (Math.random() - 0.5) * 0.6 * scatter,
            jitter: (Math.random() - 0.5) * 0.3 * scatter,
            grow: 140,
            growFrom: 0.55,
            trail: true,
          })
        }
      }

      // Once the pointer rests after a quick move, the young trail gathers back.
      const idle = now - lastMove > Math.max(50, delay * 1000)
      if (idle && !wasIdle && paceAtMove > 0.3)
        for (const b of blobs) if (b.trail && (lastMove - b.born) / (lifeMs * b.life) < 0.4) b.pull = true
      wasIdle = idle

      // A click: one big disc ahead of the motion and a burst of drops.
      for (const s of splashes) {
        const x = s.x - box.left
        const y = s.y - box.top
        const moving = sp > 6
        addBlob(now, x + (moving ? dirX : 0) * size * 0.25, y + (moving ? dirY : 0) * size * 0.25, size * 1.6, {grow: 220, life: 1.2})
        const angle = Math.atan2(dirY, dirX)
        for (let i = 0; i < 5; i++) {
          const a = moving ? angle + ((i / 4) * 2 - 1) * (50 * Math.PI / 180) + (Math.random() - 0.5) * 0.2 : (i / 5) * Math.PI * 2 + Math.random() * 0.6
          const v = 8 + Math.random() * 4 + (moving ? 0.6 * sp : 0)
          addBlob(now, x, y, size * 0.42, {vx: Math.cos(a) * v, vy: Math.sin(a) * v, ux: Math.cos(a), uy: Math.sin(a), grow: 120, life: 0.9 + 0.3 * Math.random()})
        }
      }
      splashes.length = 0

      // Age every disc and turn it into a shape.
      shapes.length = 0
      const drag = 0.92 ** f
      const noiseScale = 1 / (3 * size)
      for (let i = blobs.length - 1; i >= 0; i--) {
        const b = blobs[i]
        const age = now - b.born
        const span = lifeMs * b.life
        if (age >= span) {
          blobs.splice(i, 1)
          continue
        }
        const t = age / span
        const drift = flow * 1.4 * Math.min(1, t * 2)
        if (drift > 0 && !still) {
          curl(b.x * noiseScale + now * 5e-5, b.y * noiseScale - now * 3e-5, swirl)
          b.x += swirl.x * drift * f
          b.y += swirl.y * drift * f
        }
        b.x += b.vx * f
        b.y += b.vy * f
        b.vx *= drag
        b.vy *= drag
        if (b.pull) {
          const k = 120 * clamp01(1 - Math.hypot(head.x.x - b.x, head.y.x - b.y) / (4 * size))
          if (k > 0) {
            const sx = {x: b.x, v: b.pvx}
            const sy = {x: b.y, v: b.pvy}
            step(sx, head.x.x, k, 2 * Math.sqrt(k), ms)
            step(sy, head.y.x, k, 2 * Math.sqrt(k), ms)
            ;[b.x, b.pvx, b.y, b.pvy] = [sx.x, sx.v, sy.x, sy.v]
          }
        }
        const grown = b.grow ? b.growFrom + (1 - b.growFrom) * easeOut(Math.min(1, age / b.grow)) : 1
        const fade = t < 0.2 ? 1 : (1 - (t - 0.2) / 0.8) ** 1.4
        const r = b.r0 * (1 + b.jitter * Math.min(1, t * 2)) * grown * fade * (1 + 0.9 * flow * t * (1 - t)) * room
        const stretch = 1 + 0.5 * b.energy * speed * Math.max(0, 1 - t / 0.4)
        if (r > 0.5) shapes.push(lobe(b.x, b.y, r, b.ux, b.uy, stretch))
      }

      // The head shows while the pointer moves and fades out once it rests,
      // with a little pop each time it appears.
      const active = inside && now - lastMove < Math.max(80, delay * 1000)
      if (active && shown.x < 0.05 && pulseAt < 0) pulseAt = now
      const settle = 6000 / lifeMs
      if (active || pressed) step(shown, 1, 625, 50, ms)
      else step(shown, 0, settle * settle, 2 * settle, ms)
      let pulse = 1
      if (pulseAt >= 0) {
        const t = now - pulseAt
        if (t < 260) pulse = 1 + 0.4 * easeOut(t / 260)
        else if (t < 620) pulse = 1 + 0.4 * (1 - easeOut((t - 260) / 360))
        else pulseAt = -1
      }
      if (shown.x > 0.002)
        shapes.push(lobe(head.x.x, head.y.x, size * (1 + speed * (0.6 * pace.x - 0.3)) * clamp01(shown.x) * pulse * holdScale * room, dirX, dirY, 1 + 0.5 * pace.x * speed))

      // Lens: melt into a rounded box around the hovered link or button.
      const lensOn = inside && lensEl !== null
      if (lensEl) {
        const r = lensEl.getBoundingClientRect()
        const target = [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top, r.width / 2 + LENS_PAD, r.height / 2 + LENS_PAD]
        const parts = [lensBox.x, lensBox.y, lensBox.w, lensBox.h]
        parts.forEach((p, i) => (lensMix.x > 0.3 ? step(p, target[i], 420, 40, ms) : ((p.x = target[i]), (p.v = 0))))
      }
      step(lensMix, lensOn ? 1 : 0, lensOn ? 320 : 900, lensOn ? 34 : 60, ms)
      if (lensMix.x > 0.002) {
        const e = clamp01(lensMix.x)
        const w = Math.max(1, lensBox.w.x * e)
        const h = Math.max(1, lensBox.h.x * e)
        shapes.push(pill(head.x.x + (lensBox.x.x - head.x.x) * e, head.y.x + (lensBox.y.x - head.y.x) * e, w, h))
      }

      const d = outline(shapes, box.width, box.height, size, grid)
      const next = d ? `path(evenodd, "${d}")` : HIDDEN
      if (next !== clip) {
        clip = next
        for (const el of layers) el.style.clipPath = clip
      }

      const busy =
        blobs.length > 0 ||
        Math.abs(head.x.v) + Math.abs(head.y.v) > 1 ||
        shown.x + Math.abs(shown.v) > 0.002 ||
        pace.x + Math.abs(pace.v) > 0.002 ||
        Math.abs(lensMix.x - (lensOn ? 1 : 0)) + Math.abs(lensMix.v) > 0.002 ||
        Math.abs(hold.x - (holding ? 1 : 0)) + Math.abs(hold.v) > 0.002 ||
        pulseAt >= 0 ||
        pressed
      if (busy) raf = requestAnimationFrame(frame)
      else last = 0
    }

    const wake = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      client.x = e.clientX
      client.y = e.clientY
      moved = true
      inside = true
      // Leaving a link drops the target; the lens box keeps its last place while it melts away.
      lensEl = lens && e.target instanceof Element ? e.target.closest(LENS_TARGETS) : null
      wake()
    }
    const onLeave = () => {
      inside = false
      pressed = false
      lensEl = null
      for (const b of blobs) if (b.trail) b.pull = true
      wake()
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || e.button !== 0 || !splash || still) return
      pressed = true
      pressAt = e.timeStamp
      splashes.push({x: e.clientX, y: e.clientY})
      wake()
    }
    const onUp = () => {
      pressed = false
      wake()
    }

    host.addEventListener('pointermove', onMove, {passive: true})
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('pointerdown', onDown, {passive: true})
    window.addEventListener('pointerup', onUp)
    return () => {
      cancelAnimationFrame(raf)
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      cursorStyle?.remove()
      if (!fixed) host.removeAttribute('data-liquid-cursor-host')
    }
  }, [size, trail, smear, flow, speed, delay, splash, lens, hideCursor, fixed, custom])

  const layer = {
    position: fixed ? 'fixed' : 'absolute',
    inset: 0,
    pointerEvents: 'none',
    overflow: 'hidden',
    clipPath: HIDDEN,
    zIndex,
  } as const
  const ref = (i: number) => (el: HTMLDivElement | null) => {
    layersRef.current[i] = el
  }

  if (custom)
    return (
      <div ref={ref(0)} aria-hidden style={layer}>
        {children}
      </div>
    )
  return (
    <>
      <div ref={ref(0)} aria-hidden style={{...layer, backdropFilter: filter, WebkitBackdropFilter: filter}} />
      <div
        ref={ref(1)}
        aria-hidden
        style={{...layer, zIndex: zIndex + 1, backgroundColor: tint, backgroundImage: grain ? GRAIN : undefined, mixBlendMode: 'lighten'}}
      />
    </>
  )
}

type Spring = {x: number; v: number}
const spring = (): Spring => ({x: 0, v: 0})

// A damped spring, integrated in 4 ms steps so stiff springs stay stable at
// any frame rate.
function step(s: Spring, to: number, stiffness: number, damping: number, ms: number) {
  for (let t = ms / 1000; t > 0; t -= 0.004) {
    const h = Math.min(t, 0.004)
    s.v += (stiffness * (to - s.x) - damping * s.v) * h
    s.x += s.v * h
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const easeOut = (t: number) => 1 - (1 - clamp01(t)) ** 3

type Blob = {
  x: number
  y: number
  r0: number
  born: number
  vx: number
  vy: number
  ux: number
  uy: number
  energy: number
  life: number
  jitter: number
  grow: number
  growFrom: number
  trail: boolean
  pull: boolean
  pvx: number
  pvy: number
}

// A disc stretched by `s` along (ux, uy), or a rounded box of half size hx × hy.
type Shape = {x: number; y: number; r: number; ux: number; uy: number; s: number; hx: number; hy: number; box: boolean}
const lobe = (x: number, y: number, r: number, ux: number, uy: number, s: number): Shape => ({x, y, r, ux, uy, s, hx: 0, hy: 0, box: false})
const pill = (x: number, y: number, hx: number, hy: number): Shape => ({x, y, r: Math.min(hx, hy), ux: 1, uy: 0, s: 1, hx, hy, box: true})

function distance(s: Shape, x: number, y: number) {
  const dx = x - s.x
  const dy = y - s.y
  if (!s.box) return Math.hypot((dx * s.ux + dy * s.uy) / s.s, dy * s.ux - dx * s.uy) - s.r
  const qx = Math.abs(dx) - (s.hx - s.r)
  const qy = Math.abs(dy) - (s.hy - s.r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - s.r
}

// Smooth value noise and its curl: a divergence-free swirl for the trail.
function hash(x: number, y: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function noise(x: number, y: number) {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const u = fx * fx * (3 - 2 * fx)
  const v = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
function curl(x: number, y: number, out: {x: number; y: number}) {
  const e = 0.35
  out.x = (noise(x, y + e) - noise(x, y - e)) / (2 * e)
  out.y = -(noise(x + e, y) - noise(x - e, y)) / (2 * e)
}

type Grid = {field: Float32Array; links: Int32Array; seen: Uint8Array}

// The outline of all shapes melted together, as SVG path data.
//
// Each shape adds exp(-distance / k) to a grid; -k·ln(sum) is then a smooth
// union of their distance fields (shapes closer than ~k flow into each
// other). Marching squares traces its zero line, and the traced points are
// joined with quadratic curves through their midpoints.
function outline(shapes: Shape[], width: number, height: number, size: number, g: Grid) {
  if (!shapes.length) return ''
  const k = Math.max(2, size * 0.12)
  const reach = 6 * k
  const minCell = Math.max(4, size / 11)
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  const extent = (s: Shape) => [s.box ? s.hx : s.r * s.s, s.box ? s.hy : s.r * s.s]
  for (const s of shapes) {
    const [ex, ey] = extent(s)
    x0 = Math.min(x0, s.x - ex - reach)
    y0 = Math.min(y0, s.y - ey - reach)
    x1 = Math.max(x1, s.x + ex + reach)
    y1 = Math.max(y1, s.y + ey + reach)
  }
  x0 = Math.max(x0, -minCell)
  y0 = Math.max(y0, -minCell)
  x1 = Math.min(x1, width + minCell)
  y1 = Math.min(y1, height + minCell)
  if (x1 <= x0 || y1 <= y0) return ''

  // Coarser cells only when the area would exceed the budget.
  const cell = Math.max(minCell, Math.sqrt(((x1 - x0) * (y1 - y0)) / CELL_BUDGET))
  x0 = Math.floor(x0 / cell) * cell
  y0 = Math.floor(y0 / cell) * cell
  const cols = Math.ceil((x1 - x0) / cell) + 1
  const rows = Math.ceil((y1 - y0) / cell) + 1
  const n = cols * rows
  if (g.field.length < n) {
    g.field = new Float32Array(n)
    g.links = new Int32Array(n * 4)
    g.seen = new Uint8Array(n * 2)
  }
  const {field, links, seen} = g
  field.fill(0, 0, n)
  links.fill(-1, 0, n * 4)
  seen.fill(0, 0, n * 2)

  for (const s of shapes) {
    const [ex, ey] = extent(s)
    const c0 = Math.max(0, Math.floor((s.x - ex - reach - x0) / cell))
    const c1 = Math.min(cols - 1, Math.ceil((s.x + ex + reach - x0) / cell))
    const r0 = Math.max(0, Math.floor((s.y - ey - reach - y0) / cell))
    const r1 = Math.min(rows - 1, Math.ceil((s.y + ey + reach - y0) / cell))
    for (let j = r0; j <= r1; j++)
      for (let i = c0; i <= c1; i++) {
        const dd = distance(s, x0 + i * cell, y0 + j * cell)
        if (dd < reach) field[j * cols + i] += Math.exp(-dd / k)
      }
  }
  // Sum → signed distance; the border is forced outside so every contour closes.
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const idx = j * cols + i
      const border = i === 0 || j === 0 || i === cols - 1 || j === rows - 1
      field[idx] = border || field[idx] <= 0 ? reach : -k * Math.log(field[idx])
    }

  // Edge ids: node·2 is the edge to the right of a node, node·2+1 the edge below it.
  const link = (from: number, to: number) => {
    if (links[from * 2] < 0) links[from * 2] = to
    else links[from * 2 + 1] = to
  }
  const join = (a: number, b: number) => {
    link(a, b)
    link(b, a)
  }
  const crossing: number[] = []
  for (let j = 0; j < rows - 1; j++)
    for (let i = 0; i < cols - 1; i++) {
      const idx = j * cols + i
      const a = field[idx] < 0
      const b = field[idx + 1] < 0
      const c = field[idx + cols] < 0
      const d = field[idx + cols + 1] < 0
      if (a === b && b === c && c === d) continue
      const top = idx * 2
      const bottom = (idx + cols) * 2
      const left = idx * 2 + 1
      const right = (idx + 1) * 2 + 1
      crossing.length = 0
      if (a !== b) crossing.push(top)
      if (b !== d) crossing.push(right)
      if (c !== d) crossing.push(bottom)
      if (a !== c) crossing.push(left)
      if (crossing.length === 2) join(crossing[0], crossing[1])
      // A saddle: the centre's sign decides which corners connect.
      else if (field[idx] + field[idx + 1] + field[idx + cols] + field[idx + cols + 1] < 0 === a) {
        join(top, right)
        join(bottom, left)
      } else {
        join(top, left)
        join(right, bottom)
      }
    }

  const fmt = (v: number) => v.toFixed(1)
  let path = ''
  const xs: number[] = []
  const ys: number[] = []
  for (let start = 0; start < n * 2; start++) {
    if (seen[start] || links[start * 2] < 0) continue
    xs.length = ys.length = 0
    let prev = -1
    let edge = start
    while (edge >= 0 && !seen[edge]) {
      seen[edge] = 1
      const node = edge >> 1
      const other = edge & 1 ? node + cols : node + 1
      const t = field[node] / (field[node] - field[other])
      const px = x0 + (node % cols) * cell
      const py = y0 + Math.floor(node / cols) * cell
      xs.push(edge & 1 ? px : px + t * cell)
      ys.push(edge & 1 ? py + t * cell : py)
      const next = links[edge * 2] === prev ? links[edge * 2 + 1] : links[edge * 2]
      prev = edge
      edge = next
    }
    const m = xs.length
    if (m < 3) continue
    path += `M${fmt((xs[m - 1] + xs[0]) / 2)} ${fmt((ys[m - 1] + ys[0]) / 2)}`
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m
      path += `Q${fmt(xs[i])} ${fmt(ys[i])} ${fmt((xs[i] + xs[j]) / 2)} ${fmt((ys[i] + ys[j]) / 2)}`
    }
    path += 'Z'
  }
  return path
}
