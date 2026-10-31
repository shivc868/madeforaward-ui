'use client'

import {useEffect, useRef, useState} from 'react'

export type OrbitItem = {src: string; title?: string; caption?: string}

export type OrbitGalleryProps = {
  items?: OrbitItem[]
  /** ring diameter as a share of the component's shorter side */
  ringSize?: number
  /** card width as a share of the shorter side */
  cardSize?: number
  /** card height / width */
  aspect?: number
  /** auto-rotation in degrees per second; 0 = still */
  drift?: number
  /** wheel and trackpad spin the ring */
  wheelSpin?: boolean
  /** width of an opened card as a share of the shorter side */
  openSize?: number
  /** corner radius of the cards, in px */
  radius?: number
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=80&w=900&auto=format&fit=crop`
const DEFAULT_ITEMS: OrbitItem[] = [
  ['photo-1469474968028-56623f02e42e', 'Ember', 'Last light over the ridge'],
  ['photo-1534528741775-53994a69daeb', 'Noor', 'Studio portrait'],
  ['photo-1500530855697-b586d89ba3ee', 'Fold', 'Valley in late summer'],
  ['photo-1476820865390-c52aeebb9891', 'Russet', 'Forest floor, October'],
  ['photo-1517841905240-472988babdf9', 'Iris', 'Window light'],
  ['photo-1509316785289-025f5b846b35', 'Dune', 'Wind-cut sand'],
  ['photo-1495616811223-4d98c6e9c869', 'Glow', 'Coast at dusk'],
  ['photo-1524504388940-b1c1722653e1', 'Mara', 'Afternoon, Lisbon'],
  ['photo-1473580044384-7ba9967e16a0', 'Mesa', 'Desert road'],
  ['photo-1508739773434-c26b3d09e071', 'Halo', 'Sun through the trees'],
  ['photo-1531123897727-8f129e1688ce', 'June', 'Portrait in green'],
  ['photo-1470071459604-3b5ec3a7fe05', 'Mist', 'Morning in the hills'],
  ['photo-1482192596544-9eb780fc7f66', 'Tide', 'Low water'],
  ['photo-1506794778202-cad84cf45f1d', 'Ezra', 'Black and white study'],
  ['photo-1506905925346-21bda4d32df4', 'Crest', 'Above the clouds'],
  ['photo-1518495973542-4542c06a5843', 'Grove', 'Light in the canopy'],
].map(([id, title, caption]) => ({src: unsplash(id), title, caption}))

const STEP = 1 / 120 // physics substep, s
const INTRO = 0.9 // s for one card to arrive
const STAGGER = 0.035 // s between cards

type Spring = {x: number; v: number; to: number}
const spring = (): Spring => ({x: 0, v: 0, to: 0})
// One damped-spring step; returns true while still moving.
function settle(s: Spring, k: number, c: number, dt: number) {
  s.v += (k * (s.to - s.x) - c * s.v) * dt
  s.x += s.v * dt
  if (Math.abs(s.to - s.x) < 5e-4 && Math.abs(s.v) < 2e-3) {
    s.x = s.to
    s.v = 0
    return false
  }
  return true
}
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
// An angle in (-180, 180]: cards on the lower half end up upside down, like the ring.
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180

// Images on a slowly turning ring. Each card faces along the ring. Hover
// lifts a card out and dims the rest; the wheel or a drag spins the ring
// (drags keep their momentum); a click turns the ring to bring the card to
// the top, then lifts it out into the middle, upright and large, with its
// caption. Esc, the arrows or a click outside close or move between cards.
//
// Cards are laid out at their open size and scaled down on the ring, so an
// opened card is sharp. All motion is springs, stepped at 120 Hz; nothing
// runs once everything has settled (or while off screen).
export default function OrbitGallery({
  items = DEFAULT_ITEMS,
  ringSize = 0.86,
  cardSize = 0.11,
  aspect = 1.25,
  drift = 5,
  wheelSpin = true,
  openSize = 0.42,
  radius = 6,
  className = '',
}: OrbitGalleryProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const backdropRef = useRef<HTMLDivElement>(null)
  const captionRef = useRef<HTMLDivElement>(null)
  const [side, setSide] = useState(0)
  const [open, setOpen] = useState(-1)
  const n = items.length

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(() => setSide(Math.min(root.clientWidth, root.clientHeight)))
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root || !side || !n) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const cards = cardRefs.current.slice(0, n)
    const scaleOnRing = cardSize / openSize
    const ringR = Math.max(0, (ringSize * side) / 2 - (cardSize * side * aspect) / 2)
    const step = 360 / n

    const turn = spring()
    const rise = items.map(spring) // 0 on the ring → 1 opened
    const lift = items.map(spring) // hover
    const glance = spring() // others dim while one is hovered
    let fling = 0
    let clock = still ? Infinity : 0
    let opened = -1
    let hovered = -1
    let raf = 0
    let last = 0
    let visible = true
    const drag = {
      on: false,
      pressed: false,
      travel: 0,
      x: 0,
      y: 0,
      angle: 0,
      t: 0,
      speed: 0,
      id: -1,
    }

    const arrival = (i: number) => clamp01((clock - i * STAGGER) / INTRO)
    const paint = () => {
      const top = Math.max(...rise.map((r) => r.x))
      cards.forEach((el, i) => {
        if (!el) return
        const intro = 1 - (1 - arrival(i)) ** 4
        const r = clamp01(rise[i].x)
        const up = Math.max(0, lift[i].x)
        const angle = step * i + turn.x - (1 - intro) * 50
        const dist = ringR * (0.18 + 0.82 * intro) + up * side * 0.025
        const rad = (angle * Math.PI) / 180
        const x = Math.sin(rad) * dist * (1 - r)
        const y = -Math.cos(rad) * dist * (1 - r) - r * side * 0.04
        const behind = Math.max(0, clamp01(top) - r) // others recede while one is open
        const small = scaleOnRing * (1 + 0.15 * up) * (0.55 + 0.45 * intro) * (1 - 0.12 * behind)
        const scale = small + (1 - small) * rise[i].x
        const dim = Math.max(behind * 0.85, 0.4 * Math.max(0, glance.x - up))
        el.style.transform = `translate(-50%, -50%) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${(wrap(angle) * (1 - r)).toFixed(2)}deg) scale(${Math.max(0.001, scale).toFixed(4)})`
        el.style.opacity = (intro * (1 - clamp01(dim))).toFixed(3)
        el.style.zIndex = String(r > 0.001 ? 1000 + Math.round(r * 100) : 10 + Math.round(up * 10))
        // Constant on-screen corners while the card scales.
        el.style.borderRadius = `${(radius / Math.max(scale, 0.01)).toFixed(2)}px`
      })
      if (backdropRef.current) backdropRef.current.style.opacity = clamp01(top).toFixed(3)
      if (captionRef.current) {
        const show = opened >= 0 ? clamp01((rise[opened].x - 0.6) / 0.4) : 0
        captionRef.current.style.opacity = show.toFixed(3)
        captionRef.current.style.transform = `translate(-50%, ${((1 - show) * 10).toFixed(1)}px)`
      }
    }

    const advance = (dt: number) => {
      let moving = false
      if (drift && opened < 0 && !drag.on && hovered < 0) {
        turn.to += drift * dt
        moving = true
      }
      if (fling) {
        turn.to += fling * dt
        fling *= Math.exp(-3.4 * dt)
        if (Math.abs(fling) < 1) fling = 0
        moving = true
      }
      if (!drag.on) moving = settle(turn, 60, 15, dt) || moving
      // Keep the numbers small on long sessions.
      if (Math.abs(turn.x) > 3600) {
        const whole = Math.round(turn.x / 360) * 360
        turn.x -= whole
        turn.to -= whole
      }
      rise.forEach((s) => (moving = settle(s, 110, 19, dt) || moving))
      lift.forEach((s) => (moving = settle(s, 190, 24, dt) || moving))
      moving = settle(glance, 190, 24, dt) || moving
      if (clock < (n - 1) * STAGGER + INTRO) {
        clock += dt
        moving = true
      }
      return moving
    }

    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return (last = 0)
      let dt = last ? Math.min((now - last) / 1000, 1 / 20) : 1 / 60
      last = now
      let moving = false
      if (still) {
        for (const s of [turn, glance, ...rise, ...lift]) [s.x, s.v] = [s.to, 0]
      } else for (; dt > 1e-6; dt -= STEP) moving = advance(Math.min(dt, STEP)) || moving
      paint()
      if (moving || drag.on) raf = requestAnimationFrame(frame)
      else last = 0
    }
    const wake = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame)
    }

    // Open card i: turn the ring so it reaches the top, then lift it out.
    const focus = (i: number) => {
      turn.to += wrap(-(step * i + turn.to))
      fling = 0
      rise.forEach((s, j) => (s.to = j === i ? 1 : 0))
      lift.forEach((s) => (s.to = 0))
      glance.to = 0
      hovered = -1
      opened = i
      setOpen(i)
      wake()
    }
    const close = () => {
      if (opened < 0) return
      rise[opened].to = 0
      opened = -1
      setOpen(-1)
      wake()
    }

    const onWheel = (e: WheelEvent) => {
      if (!wheelSpin || opened >= 0) return
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (!delta) return
      e.preventDefault()
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1
      turn.to += Math.max(-60, Math.min(60, delta * unit * 0.12))
      fling = 0
      wake()
    }

    // Drag: the ring turns with the pointer's angle around the centre.
    const centre = () => {
      const r = root.getBoundingClientRect()
      return [r.left + r.width / 2, r.top + r.height / 2]
    }
    const angleOf = (x: number, y: number) => {
      const [cx, cy] = centre()
      return (Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI
    }
    const onDown = (e: PointerEvent) => {
      if (opened >= 0 || (e.pointerType === 'mouse' && e.button !== 0)) return
      // No text selection on the page while dragging the ring (clicks still fire).
      if (e.pointerType === 'mouse') e.preventDefault()
      Object.assign(drag, {
        pressed: true,
        travel: 0,
        x: e.clientX,
        y: e.clientY,
        angle: angleOf(e.clientX, e.clientY),
        t: performance.now(),
        speed: 0,
        id: e.pointerId,
      })
      fling = 0
    }
    const onMove = (e: PointerEvent) => {
      if (!drag.pressed || e.pointerId !== drag.id) return
      drag.travel = Math.max(drag.travel, Math.hypot(e.clientX - drag.x, e.clientY - drag.y))
      if (!drag.on) {
        if (drag.travel < 6) return
        drag.on = true
        root.setPointerCapture(e.pointerId)
        if (hovered >= 0) [lift[hovered].to, hovered, glance.to] = [0, -1, 0]
      }
      const [cx, cy] = centre()
      const a = angleOf(e.clientX, e.clientY)
      // Near the centre the angle jumps about; just follow along.
      if (Math.hypot(e.clientX - cx, e.clientY - cy) > 24) {
        const d = wrap(a - drag.angle)
        turn.to += d
        turn.x += d
        turn.v = 0
        const now = performance.now()
        drag.speed = drag.speed * 0.6 + (d / Math.max((now - drag.t) / 1000, 1 / 240)) * 0.4
        drag.t = now
      }
      drag.angle = a
      wake()
    }
    const onUp = (e: PointerEvent) => {
      if (!drag.pressed) return
      drag.pressed = false
      if (drag.on) {
        drag.on = false
        // Momentum, unless the pointer had already stopped.
        if (performance.now() - drag.t < 90) fling = Math.max(-900, Math.min(900, drag.speed))
        root.releasePointerCapture(e.pointerId)
      }
      wake()
    }
    // Hover (mouse only): the card under the pointer lifts out.
    const onOver = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || opened >= 0 || drag.on) return
      const i = cards.findIndex((el) => el?.contains(e.target as Node))
      if (i === hovered) return
      if (hovered >= 0) lift[hovered].to = 0
      hovered = i
      if (i >= 0) lift[i].to = 1
      glance.to = i >= 0 ? 1 : 0
      wake()
    }
    const onLeave = () => {
      if (hovered >= 0) lift[hovered].to = 0
      hovered = -1
      glance.to = 0
      wake()
    }
    // A click that wasn't the end of a drag opens a card, or closes the open one.
    const onClick = (e: MouseEvent) => {
      if (drag.travel > 6) return
      const i = cards.findIndex((el) => el?.contains(e.target as Node))
      if (i >= 0 && i !== opened) focus(i)
      else close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (opened < 0) return
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') focus((opened + 1) % n)
      else if (e.key === 'ArrowLeft') focus((opened - 1 + n) % n)
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    const onVisibility = () => wake()

    root.addEventListener('wheel', onWheel, {passive: false})
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('pointerover', onOver)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('click', onClick)
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    io.observe(root)
    paint()
    wake()
    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('pointerover', onOver)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('click', onClick)
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [side, n, items, ringSize, cardSize, aspect, drift, wheelSpin, openSize, radius])

  const item = open >= 0 ? items[open] : null
  const w = openSize * side
  return (
    <div
      ref={rootRef}
      // Smooth-scroll libraries (Lenis) leave the wheel to the ring while the pointer is over it.
      data-lenis-prevent={wheelSpin ? '' : undefined}
      className={`relative h-full w-full touch-none overflow-hidden select-none ${className}`}
    >
      <div
        ref={backdropRef}
        className="absolute inset-0 z-900 bg-black/70 backdrop-blur-sm"
        style={{opacity: 0, pointerEvents: open >= 0 ? 'auto' : 'none'}}
      />
      {side > 0 &&
        items.map((it, i) => (
          <button
            key={i}
            type="button"
            aria-label={it.title ? `Open ${it.title}` : `Open image ${i + 1}`}
            ref={(el) => {
              cardRefs.current[i] = el
            }}
            className="absolute top-1/2 left-1/2 cursor-pointer overflow-hidden bg-white/5 p-0 will-change-transform"
            style={{width: w, height: w * aspect, opacity: 0}}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={it.src}
              alt={it.title ?? ''}
              draggable={false}
              className="block h-full w-full object-cover"
            />
          </button>
        ))}
      <div
        ref={captionRef}
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 z-1200 text-center text-white"
        style={{top: `calc(50% + ${(w * aspect) / 2 - side * 0.04 + 16}px)`, opacity: 0}}
      >
        {item?.title && <p className="text-lg font-medium tracking-tight">{item.title}</p>}
        {item?.caption && <p className="mt-1 text-sm text-white/60">{item.caption}</p>}
      </div>
    </div>
  )
}
