'use client'

import {useEffect, useRef, useState} from 'react'

export type FocusItem = {src: string; title?: string; caption?: string}

export type FocusCarouselProps = {
  items?: FocusItem[]
  /** focused card width in px (scaled down to fit small containers) */
  cardWidth?: number
  /** card width / height */
  ratio?: number
  /** side card size relative to the focused one */
  sideSize?: number
  /** space between cards, px */
  gap?: number
  /** visible cards on each side */
  sideCount?: number
  /** blur added per step away from the focus, px */
  blurStep?: number
  /** grayscale on side cards, 0–1 */
  sideGrey?: number
  background?: string
  textColor?: string
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=80&w=800&auto=format&fit=crop`
const DEFAULT_ITEMS: FocusItem[] = [
  ['photo-1534528741775-53994a69daeb', 'Marrow', 'Quiet studio hours'],
  ['photo-1517841905240-472988babdf9', 'Iris', 'Window light'],
  ['photo-1524504388940-b1c1722653e1', 'Mara', 'Afternoon in Lisbon'],
  ['photo-1531123897727-8f129e1688ce', 'June', 'Portrait in green'],
  ['photo-1506794778202-cad84cf45f1d', 'Ezra', 'Black and white study'],
  ['photo-1492562080023-ab3db95bfbce', 'Otis', 'Evening, rooftop'],
  ['photo-1500648767791-00dcc994a43e', 'Theo', 'Soft shadow'],
  ['photo-1508214751196-bcfd4ca60f91', 'Wren', 'Golden hour'],
  ['photo-1521119989659-a83eee488004', 'Cal', 'Street light'],
  ['photo-1549068106-b024baf5062d', 'Noor', 'Edge and shadow'],
  ['photo-1470071459604-3b5ec3a7fe05', 'Ines', 'Open field'],
].map(([id, title, caption]) => ({src: unsplash(id), title, caption}))

const FADE_STEP = 0.86 // opacity kept per step beyond the first neighbour
const BLUR_MAX = 12
const DIM = 0.92 // brightness of side cards
const SNAP = 6 // snap speed, 1–10
const WHEEL_STEP = 110 // wheel distance per card, px
const THROW_CUTOFF = 70 // a single wheel delta this large throws instead of stepping
const DRAG_SPAN = 240 // drag distance per card, px (before fit scaling)

// A row of images around one in focus. The focused card is large and in
// colour; cards further out shrink, grey, blur and fade, and the row loops.
// Drag (with momentum), the wheel, the arrow keys or a click on a side card
// bring another into focus; its title and caption sit under it.
//
// Position is one continuous number. Steps run on a critically damped
// spring to the target card; throws glide with friction, then snap. Every
// image has exactly one element (it only moves), so each loads once, and
// cards are sized with transforms, never layout, so nothing reflows.
export default function FocusCarousel({
  items = DEFAULT_ITEMS,
  cardWidth = 320,
  ratio = 0.75,
  sideSize = 0.52,
  gap = 24,
  sideCount = 5,
  blurStep = 2.5,
  sideGrey = 1,
  background = '#ffffff',
  textColor = '#111111',
  className = '',
}: FocusCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const captionRef = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(0)
  const [fit, setFit] = useState(1)
  const n = items.length
  const cardHeight = cardWidth / ratio

  useEffect(() => {
    const root = rootRef.current
    if (!root || !n) return
    const cards = cardRefs.current.slice(0, n)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const state = {
      pos: 0,
      vel: 0,
      aim: 0 as number | null,
      stiff: 0,
      held: false,
      moved: false,
      grabX: 0,
      grabPos: 0,
    }
    const trail: {x: number; t: number}[] = []
    let scale = 1
    let shown = 0
    let raf = 0
    let last = 0
    let visible = true

    // Layout of a card `o` places from the focus (o can be fractional).
    const near = sideSize
    const first = (cardWidth * (1 + near)) / 2 + gap // centre of the first neighbour
    const next = cardWidth * near + gap // spacing beyond it
    const slot = (o: number) => {
      const s = Math.abs(o)
      const size = s <= 1 ? 1 + (near - 1) * s : near
      const x = (s <= 1 ? first * s : first + next * (s - 1)) * Math.sign(o)
      const reach = Math.min(1, Math.max(0, sideCount + 0.5 - s))
      const fade = s <= 1 ? 1 : FADE_STEP ** (s - 1)
      return {
        x,
        size,
        alpha: fade * reach,
        grey: sideGrey * Math.min(1, s),
        dim: 1 - (1 - DIM) * Math.min(1, s),
        blur: Math.min(BLUR_MAX, blurStep * Math.max(0, s - 1)),
        s,
      }
    }
    // Offset of item i from the focus, wrapped so the row loops.
    const offset = (i: number) => {
      let o = (i - state.pos) % n
      if (o > n / 2) o -= n
      if (o < -n / 2) o += n
      return o
    }

    const paint = () => {
      cards.forEach((el, i) => {
        if (!el) return
        const l = slot(offset(i))
        const k = l.size * scale
        const filters = [
          l.grey > 0.005 && `grayscale(${l.grey.toFixed(3)})`,
          l.dim < 0.995 && `brightness(${l.dim.toFixed(3)})`,
          // Blur applies before the scale, so it's divided back out.
          l.blur > 0.05 && `blur(${(l.blur / k).toFixed(2)}px)`,
        ].filter(Boolean)
        el.style.transform = `translate3d(${(l.x * scale).toFixed(2)}px, 0, 0) translate(-50%, -50%) scale(${k.toFixed(4)})`
        el.style.opacity = l.alpha.toFixed(3)
        el.style.filter = filters.length ? filters.join(' ') : 'none'
        el.style.zIndex = String(400 - Math.round(l.s * 12))
        el.style.visibility = l.alpha <= 0.001 ? 'hidden' : 'visible'
      })
      const now = ((Math.round(state.pos) % n) + n) % n
      if (now !== shown) {
        shown = now
        setFocus(now)
      }
    }

    const frame = (now: number) => {
      raf = 0
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60
      last = now
      if (!state.held) {
        if (still) {
          state.pos = state.aim ?? Math.round(state.pos)
          state.vel = 0
        } else if (state.aim === null) {
          // A throw glides with friction, then picks the card it would reach.
          state.vel *= 0.955 ** (dt * 60)
          state.pos += state.vel * dt
          if (Math.abs(state.vel) < 0.75) {
            state.aim = Math.round(state.pos + state.vel * 0.2)
            state.stiff = SNAP * 24 + 80
          }
        } else {
          const damping = 2 * Math.sqrt(state.stiff)
          state.vel += (-state.stiff * (state.pos - state.aim) - damping * state.vel) * dt
          state.pos += state.vel * dt
        }
      }
      paint()
      if (
        !state.held &&
        state.aim !== null &&
        Math.abs(state.vel) < 0.02 &&
        Math.abs(state.pos - state.aim) < 0.0015
      ) {
        state.pos = state.aim
        state.vel = 0
        last = 0
        paint()
        return
      }
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf && visible) raf = requestAnimationFrame(frame)
    }
    const go = (target: number, quick: boolean) => {
      state.aim = target
      state.stiff = quick ? SNAP * 40 + 200 : 120
      wake()
    }
    const target = () => (state.aim === null ? Math.round(state.pos) : state.aim)

    // Fit the focused card (and its caption) into the container.
    const ro = new ResizeObserver(() => {
      const caption = captionRef.current?.offsetHeight ?? 0
      const room = Math.max(60, root.clientHeight - 2 * (caption + 26))
      scale = Math.max(0.2, Math.min(1, root.clientWidth / cardWidth, room / cardHeight))
      setFit(scale)
      paint()
    })
    ro.observe(root)

    // Wheel: small deltas step one card per WHEEL_STEP; a big one throws.
    let wheelSum = 0
    let throwing = false
    let throwTimer = 0
    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * unit
      if (!d) return
      e.preventDefault()
      if (Math.abs(d) >= THROW_CUTOFF) {
        throwing = true
        clearTimeout(throwTimer)
        throwTimer = window.setTimeout(() => ([throwing, wheelSum] = [false, 0]), 320)
      }
      if (throwing) {
        state.aim = null
        state.vel = Math.max(-26, Math.min(26, state.vel + d * 0.06))
        wake()
      } else if (Math.abs((wheelSum += d)) >= WHEEL_STEP) {
        const dir = Math.sign(wheelSum)
        wheelSum -= dir * WHEEL_STEP
        go(target() + dir, true)
      }
    }

    // Drag: the row follows the pointer; release keeps its speed.
    const span = () => Math.max(40, DRAG_SPAN * scale)
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      Object.assign(state, {
        held: true,
        moved: false,
        grabX: e.clientX,
        grabPos: state.pos,
        vel: 0,
        aim: null,
      })
      trail.length = 0
      trail.push({x: e.clientX, t: e.timeStamp})
      root.setPointerCapture(e.pointerId)
      wake()
    }
    const onMove = (e: PointerEvent) => {
      if (!state.held) return
      const dx = e.clientX - state.grabX
      if (Math.abs(dx) > 4) state.moved = true
      state.pos = state.grabPos - dx / span()
      trail.push({x: e.clientX, t: e.timeStamp})
      while (trail.length > 2 && e.timeStamp - trail[0].t > 110) trail.shift()
      wake()
    }
    const onUp = (e: PointerEvent) => {
      if (!state.held) return
      state.held = false
      root.releasePointerCapture(e.pointerId)
      if (!state.moved) {
        // A click on a side card brings it into focus.
        const r = root.getBoundingClientRect()
        const px = e.clientX - (r.left + r.width / 2)
        let best: number | null = null
        let bestDist = Infinity
        for (let i = 0; i < n; i++) {
          const o = offset(i)
          const l = slot(o)
          const d = Math.abs(px - l.x * scale)
          if (l.alpha > 0.02 && d <= (cardWidth * l.size * scale) / 2 + 6 && d < bestDist)
            [best, bestDist] = [state.pos + o, d]
        }
        go(best !== null ? Math.round(best) : Math.round(state.pos), best === null)
        return
      }
      const a = trail[0]
      const b = trail[trail.length - 1]
      const vel = b && a && b.t > a.t ? (-(b.x - a.x) / span()) * (1000 / (b.t - a.t)) : 0
      trail.length = 0
      state.vel = Math.max(-26, Math.min(26, vel))
      state.aim = Math.abs(state.vel) < 0.75 ? Math.round(state.pos) : null
      if (state.aim !== null) state.stiff = SNAP * 40 + 200
      wake()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') go(target() + 1, true)
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') go(target() - 1, true)
      else return
      e.preventDefault()
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })

    root.addEventListener('wheel', onWheel, {passive: false})
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('keydown', onKey)
    io.observe(root)
    paint()
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(throwTimer)
      ro.disconnect()
      io.disconnect()
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('keydown', onKey)
    }
  }, [n, cardWidth, cardHeight, sideSize, gap, sideCount, blurStep, sideGrey])

  const item = items[focus]
  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Image carousel"
      data-lenis-prevent
      className={`relative h-full w-full touch-pan-y overflow-hidden outline-none select-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-inset ${className}`}
      style={{background, color: textColor}}
    >
      {items.map((it, i) => (
        <button
          key={i}
          type="button"
          tabIndex={-1}
          ref={(el) => {
            cardRefs.current[i] = el
          }}
          aria-label={it.title ?? `Image ${i + 1}`}
          className="absolute top-1/2 left-1/2 block cursor-pointer overflow-hidden p-0 will-change-transform"
          style={{width: cardWidth, height: cardHeight, opacity: 0}}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={it.src}
            alt={it.title ?? ''}
            draggable={false}
            loading="eager"
            className="block h-full w-full object-cover"
          />
        </button>
      ))}
      {/* Title left, caption right, a small marker between: under the focused card. */}
      <div
        ref={captionRef}
        aria-live="polite"
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-start justify-between text-sm"
        style={{width: cardWidth * fit, top: `calc(50% + ${(cardHeight * fit) / 2 + 14}px)`}}
      >
        <span key={`t${focus}`} className="animate-[focus-caption_0.4s_ease-out] font-medium">
          {item?.title}
        </span>
        <span
          aria-hidden
          className="mt-1.5 h-0 w-0 border-x-[5px] border-b-8 border-x-transparent border-b-current"
        />
        <span key={`c${focus}`} className="animate-[focus-caption_0.4s_ease-out] opacity-60">
          {item?.caption}
        </span>
      </div>
      <style>{'@keyframes focus-caption{from{opacity:0;transform:translateY(6px)}}'}</style>
    </div>
  )
}
