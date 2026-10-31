'use client'

import {useEffect, useRef, useState} from 'react'

export type RopeItem = {src: string; title?: string; caption?: string; href?: string}

export type RopeCarouselProps = {
  items?: RopeItem[]
  /** card width in px (scaled down on small containers) */
  cardWidth?: number
  /** photo width / height */
  ratio?: number
  /** space between cards, px */
  gap?: number
  /** how far the rope hangs in the middle, px */
  sag?: number
  /** autoplay speed, px per second (0 = still) */
  speed?: number
  direction?: 'left' | 'right'
  /** how much cards swing when the line moves, 0–2 */
  sway?: number
  pauseOnHover?: boolean
  ropeColor?: string
  clipColor?: string
  background?: string
  /** width of the soft fade at both edges, px */
  edgeFade?: number
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=80&w=700&auto=format&fit=crop`
const DEFAULT_ITEMS: RopeItem[] = [
  ['photo-1506905925346-21bda4d32df4', 'Dolomites', 'Above the cloud line'],
  ['photo-1507525428034-b723cf961d3e', 'Tulum', 'First swim, 7am'],
  ['photo-1441974231531-c6227db76b6e', 'Black Forest', 'Light through pines'],
  ['photo-1470770841072-f978cf4d019e', 'Hallstatt', 'Lake house, dusk'],
  ['photo-1465146344425-f00d5f5c8f07', 'Provence', 'Wild meadow'],
  ['photo-1501785888041-af3ef285b470', 'Banff', 'Still water'],
  ['photo-1433086966358-54859d0ed716', 'Skógafoss', 'Mist and noise'],
  ['photo-1472214103451-9374bd1c798e', 'Tuscany', 'Long evening'],
  ['photo-1447752875215-b2761acb3c5d', 'Kyoto', 'Moss path'],
  ['photo-1500530855697-b586d89ba3ee', 'Patagonia', 'Road north'],
].map(([id, title, caption]) => ({src: unsplash(id), title, caption}))

const DEG = 180 / Math.PI
const SHAPE = 1.1 // catenary curvature; 0 would be a parabola
const FOLLOW = 0.55 // how much cards lean with the rope's slope
const FRICTION = 1.9 // how fast a throw settles back to the autoplay speed
const SWING_K = 26 // pendulum stiffness
const SWING_DAMP = 1.5 // pendulum damping
const ROPE_K = 70 // rope bounce stiffness
const ROPE_DAMP = 6 // rope bounce damping
// clip artwork (viewBox 0 0 20 34): the rope runs through the wire loop at
// y = 4.5 and the jaws bite the card from y = 22
const CLIP_ROPE = 4.5
const CLIP_BITE = 22

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const hash = (i: number) => {
  const s = Math.sin(i * 91.7 + 47.3) * 43758.5453
  return s - Math.floor(s)
}

// Photos clipped to a hanging rope that loops past forever. The rope is a
// catenary; each card rides it, leans with its slope and swings as its own
// damped pendulum, kicked by the line's acceleration and by the pointer
// brushing past. Throwing the line also makes the rope bounce.
//
// Everything runs on one rAF loop that writes transforms only, and the loop
// sleeps once the line is still (no autoplay, nothing swinging) and while
// the carousel is off screen or the tab is hidden. Drag with momentum on
// mouse and touch (vertical swipes still scroll the page), horizontal wheel
// or trackpad, arrow keys.
export default function RopeCarousel({
  items = DEFAULT_ITEMS,
  cardWidth = 240,
  ratio = 0.8,
  gap = 36,
  sag = 90,
  speed = 30,
  direction = 'left',
  sway = 0.8,
  pauseOnHover = true,
  ropeColor = '#9b9184',
  clipColor = '#ff6a2b',
  background = '#0e0d0c',
  edgeFade = 80,
  className = '',
}: RopeCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const ropeRefs = useRef<(SVGPathElement | null)[]>([])
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const kickRef = useRef<((slot: number, dx: number) => void) | null>(null)
  const movedRef = useRef(0)
  const [size, setSize] = useState({w: 0, h: 0})

  const n = items.length
  const fit = size.w > 0 ? clamp(size.w / 1100, 0.62, 1) : 1
  const cw = cardWidth * fit
  const pad = cw * 0.055
  const photoH = (cw - pad * 2) / ratio
  const band = cw * 0.2
  const cardH = pad + photoH + band
  const clipS = (cw * 0.085) / 20 // clip units → px
  const step = cw + gap * fit
  const slots = n * Math.max(1, Math.ceil((size.w + step * 4) / (n * step)))

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () =>
      setSize((s) => (s.w === root.clientWidth && s.h === root.clientHeight ? s : {w: root.clientWidth, h: root.clientHeight}))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  // physics state that survives prop changes
  const sim = useRef({
    pos: 0,
    vel: 0,
    velSmooth: 0,
    pending: 0, // wheel / key distance still to travel
    bounce: 0,
    bounceVel: 0,
    swing: new Float32Array(0),
    spin: new Float32Array(0),
    primed: false,
  })

  useEffect(() => {
    const root = rootRef.current
    if (!root || !size.w || !n) return
    const s = sim.current
    if (s.swing.length !== slots) {
      s.swing = new Float32Array(slots)
      s.spin = new Float32Array(slots)
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const swayAmt = reduced ? 0 : Math.max(0, sway)
    const cruise = reduced ? 0 : (direction === 'right' ? 1 : -1) * Math.max(0, speed)
    const total = slots * step
    const w = size.w
    const lowX = w / 2
    const half = w / 2
    const sagPx = sag * clamp(w / 1280, 0.45, 1)
    // centre the rope + hanging cards vertically
    const drop = (CLIP_BITE - CLIP_ROPE) * clipS
    const top = Math.max(CLIP_ROPE * clipS + 8, (size.h - (sagPx + drop + cardH)) / 2)
    const coshA = Math.cosh(SHAPE) - 1
    const ropeY = (x: number, depth: number) => {
      const u = clamp((x - lowX) / half, -1.4, 1.4)
      return top + depth * (1 - (Math.cosh(SHAPE * u) - 1) / coshA)
    }
    const ropeTilt = (x: number, depth: number) => {
      const u = clamp((x - lowX) / half, -1.4, 1.4)
      return Math.atan((depth * -SHAPE * Math.sinh(SHAPE * u)) / coshA / half) * DEG
    }
    const rest = Array.from({length: n}, (_, i) => (hash(i + 1) * 2 - 1) * 1.3)

    const drawRope = (depth: number) => {
      let d = ''
      for (let i = 0; i <= 64; i++) {
        const x = -0.04 * w + (1.08 * w * i) / 64
        d += `${i ? 'L' : 'M'}${x.toFixed(1)} ${ropeY(x, depth).toFixed(1)}`
      }
      for (const p of ropeRefs.current) p?.setAttribute('d', d)
    }

    const paint = () => {
      const depth = sagPx * (1 + s.bounce)
      const lean = clamp(s.velSmooth * 0.004 * swayAmt, -7, 7)
      for (let i = 0; i < slots; i++) {
        const el = slotRefs.current[i]
        if (!el) continue
        let o = (i * step + s.pos + total / 2) % total
        if (o < 0) o += total
        const x = w / 2 + o - total / 2
        const a = ropeTilt(x, depth) * FOLLOW + rest[i % n] + s.swing[i] + lean
        el.style.transform = `translate3d(${(x - cw / 2).toFixed(2)}px,${ropeY(x, depth).toFixed(2)}px,0) rotate(${a.toFixed(3)}deg)`
      }
    }

    const drag = {on: false, id: -1, x: 0, captured: false, samples: [] as {x: number; t: number}[]}
    let raf = 0
    let last = 0
    let visible = false
    let hover = false
    let lastBounce = NaN
    const tick = (now: number) => {
      raf = 0
      const dt = clamp((now - last) / 1000, 0.001, 0.05)
      last = now
      const target = hover && pauseOnHover ? 0 : cruise
      const before = s.pos
      if (!drag.on) {
        s.vel += (target - s.vel) * (1 - Math.exp(-dt * FRICTION))
        s.pos += s.vel * dt
      }
      if (s.pending) {
        const m = s.pending * (1 - Math.exp(-dt * 12))
        s.pos += m
        s.pending = Math.abs(s.pending - m) < 0.05 ? 0 : s.pending - m
      }
      // what the line actually did this frame, whatever moved it
      const v = (s.pos - before) / dt
      const prev = s.velSmooth
      s.velSmooth += (v - s.velSmooth) * Math.min(1, dt * 9)
      const accel = (s.velSmooth - prev) / dt
      const push = clamp(accel * 0.05 * swayAmt, -600, 600)
      let busy = drag.on || s.pending !== 0 || Math.abs(target) > 0.01 || Math.abs(s.vel - target) > 0.4
      for (let i = 0; i < slots; i++) {
        let a = s.swing[i]
        let sp = s.spin[i]
        sp += (-SWING_K * a - SWING_DAMP * sp + push) * dt
        a = clamp(a + sp * dt, -18, 18)
        if (Math.abs(a) < 0.01 && Math.abs(sp) < 0.03 && !push) a = sp = 0
        else busy = true
        s.swing[i] = a
        s.spin[i] = sp
      }
      // the rope dips and bounces when the line is yanked
      s.bounceVel += (-ROPE_K * s.bounce - ROPE_DAMP * s.bounceVel) * dt + Math.abs(s.velSmooth - prev) * 0.0003 * swayAmt
      s.bounce = clamp(s.bounce + s.bounceVel * dt, -0.15, 0.15)
      if (Math.abs(s.bounce) < 1e-4 && Math.abs(s.bounceVel) < 1e-3) s.bounce = s.bounceVel = 0
      else busy = true
      if (s.bounce !== lastBounce) {
        drawRope(sagPx * (1 + s.bounce))
        lastBounce = s.bounce
      }
      if (!busy) s.vel = s.velSmooth = target
      if (total) s.pos %= total
      paint()
      if (busy) raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (raf || !visible) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const sleep = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    drawRope(sagPx * (1 + s.bounce))
    lastBounce = s.bounce
    paint()

    // pointer drag; capture only once it really moves, so taps still click
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return
      if (e.pointerType === 'mouse') e.preventDefault()
      drag.on = true
      drag.id = e.pointerId
      drag.x = e.clientX
      drag.captured = false
      drag.samples = [{x: e.clientX, t: e.timeStamp}]
      movedRef.current = 0
      s.vel = 0
      s.pending = 0
      wake()
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x
      drag.x = e.clientX
      movedRef.current += Math.abs(dx)
      if (!drag.captured && movedRef.current > 5) {
        drag.captured = true
        root.setPointerCapture(e.pointerId)
        root.style.cursor = 'grabbing'
      }
      s.pos += dx
      drag.samples.push({x: e.clientX, t: e.timeStamp})
      while (drag.samples.length > 2 && e.timeStamp - drag.samples[0].t > 100) drag.samples.shift()
      wake()
    }
    const onUp = (e: PointerEvent) => {
      if (!drag.on || e.pointerId !== drag.id) return
      drag.on = false
      if (drag.captured && root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
      root.style.cursor = ''
      // release speed over the last ~100ms; a pause before letting go means no throw
      const first = drag.samples[0]
      const span = e.timeStamp - first.t
      s.vel = span > 0 && e.timeStamp - drag.samples[drag.samples.length - 1].t < 60 ? clamp(((drag.x - first.x) / span) * 1000, -3000, 3000) : 0
      wake()
    }
    // horizontal wheel / trackpad only, so vertical scrolling stays the page's
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      s.pending -= e.deltaX * (e.deltaMode === 1 ? 16 : 1)
      wake()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      s.pending += e.key === 'ArrowLeft' ? step : -step
      wake()
    }
    const onEnter = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      hover = true
      wake()
    }
    const onLeave = () => {
      hover = false
      wake()
    }
    kickRef.current = (slot, dx) => {
      if (drag.on || !swayAmt || slot >= slots) return
      s.spin[slot] -= clamp(dx * 6, -70, 70) * swayAmt
      wake()
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && !document.hidden
        if (visible && !s.primed && swayAmt) {
          // a little swing as the line first comes into view
          s.primed = true
          for (let i = 0; i < slots; i++) s.spin[i] = (hash(i * 3 + 7) > 0.5 ? 1 : -1) * (24 + hash(i + 19) * 28) * swayAmt
        }
        if (visible) wake()
        else sleep()
      },
      {rootMargin: '60px'},
    )
    io.observe(root)
    const onVisibility = () => {
      if (document.hidden) {
        visible = false
        sleep()
      } else {
        io.unobserve(root)
        io.observe(root)
      }
    }

    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('pointerenter', onEnter)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('wheel', onWheel, {passive: false})
    root.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      sleep()
      io.disconnect()
      kickRef.current = null
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('pointerenter', onEnter)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [size.w, size.h, n, slots, step, cw, cardH, clipS, sag, speed, direction, sway, pauseOnHover])

  const fade = edgeFade > 0 ? `linear-gradient(90deg,transparent,#000 ${edgeFade}px,#000 calc(100% - ${edgeFade}px),transparent)` : undefined

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Photos on a line"
      tabIndex={0}
      className={`relative h-full w-full cursor-grab touch-pan-y overflow-hidden outline-none select-none ${className}`}
      style={{background}}
    >
      <div className="absolute inset-0" style={{maskImage: fade, WebkitMaskImage: fade}}>
        {size.w > 0 && (
          <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
            <path ref={(el) => void (ropeRefs.current[0] = el)} fill="none" stroke="rgba(0,0,0,0.3)" strokeWidth={3} strokeLinecap="round" transform="translate(0 6)" />
            <path ref={(el) => void (ropeRefs.current[1] = el)} fill="none" stroke={ropeColor} strokeWidth={1.8} strokeLinecap="round" />
            <path ref={(el) => void (ropeRefs.current[2] = el)} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={0.9} strokeDasharray="2.4 3" />
          </svg>
        )}
        {size.w > 0 &&
          Array.from({length: slots}, (_, i) => {
            const item = items[i % n]
            const copy = i >= n
            const Card = item.href ? 'a' : 'div'
            return (
              <div
                key={i}
                ref={(el) => void (slotRefs.current[i] = el)}
                className="absolute top-0 left-0 origin-top will-change-transform"
                style={{width: cw}}
                aria-hidden={copy || undefined}
                onPointerEnter={(e) => kickRef.current?.(i, e.movementX)}
              >
                <Card
                  {...(item.href ? {href: item.href, draggable: false, tabIndex: copy ? -1 : undefined} : {})}
                  onClick={(e) => movedRef.current > 6 && e.preventDefault()}
                  className="group absolute left-0 block w-full overflow-hidden rounded-[3px] bg-[#f3efe7] shadow-[0_1px_2px_rgba(0,0,0,0.35),0_18px_30px_-12px_rgba(0,0,0,0.6),0_40px_70px_-30px_rgba(0,0,0,0.7)]"
                  style={{top: (CLIP_BITE - CLIP_ROPE) * clipS, padding: `${pad}px ${pad}px 0`}}
                >
                  <div className="overflow-hidden bg-[#d9d3c7]" style={{height: photoH}}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.src}
                      alt={item.title ?? ''}
                      draggable={false}
                      decoding="async"
                      className="h-full w-full object-cover transition-transform duration-700 ease-[cubic-bezier(.2,.7,.2,1)] group-hover:scale-[1.04]"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-2 text-[#1d1b18]" style={{height: band, paddingTop: band * 0.2, fontSize: cw * 0.05}}>
                    <div className="min-w-0 leading-tight">
                      {item.title && <div className="truncate font-semibold tracking-tight">{item.title}</div>}
                      {item.caption && <div className="truncate opacity-55" style={{fontSize: cw * 0.042}}>{item.caption}</div>}
                    </div>
                    <span className="shrink-0 font-mono opacity-40" style={{fontSize: cw * 0.04}}>
                      {String((i % n) + 1).padStart(2, '0')}
                    </span>
                  </div>
                </Card>
                <svg
                  viewBox="0 0 20 34"
                  className="absolute left-1/2 -translate-x-1/2 overflow-visible drop-shadow-[0_3px_3px_rgba(0,0,0,0.45)]"
                  style={{top: -CLIP_ROPE * clipS, width: 20 * clipS, height: 34 * clipS}}
                  aria-hidden
                >
                  <path d="M4.5 14 L8.2 4.6 Q10 2.6 11.8 4.6 L15.5 14" fill="none" stroke="#d8d4cc" strokeWidth={1.3} strokeLinejoin="round" strokeLinecap="round" />
                  <path d="M3.5 12 H16.5 L18 30.5 Q18 32 16.5 32 H3.5 Q2 32 2 30.5 Z" fill={clipColor} />
                  <path d="M3.5 12 H16.5 L16.8 15.5 H3.2 Z" fill="#fff" opacity={0.28} />
                  <rect x={4.5} y={27.5} width={11} height={1.2} rx={0.6} fill="#000" opacity={0.25} />
                </svg>
              </div>
            )
          })}
      </div>
    </div>
  )
}
