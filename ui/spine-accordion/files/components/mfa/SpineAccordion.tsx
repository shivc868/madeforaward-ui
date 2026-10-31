'use client'

import {animate, motion, useMotionValue, useSpring, useTransform, type MotionValue} from 'motion/react'
import {useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore} from 'react'

export type SpineItem = {
  title: string
  description?: string
  /** artwork, ideally a transparent PNG/WebP; it's shown with object-fit: contain */
  image?: string
  imageAlt?: string
  /** artwork size in the open panel, 0.5–1 */
  imageScale?: number
  /** panel colour when open */
  tone?: string
  /** spine colour */
  coverColor?: string
  /** text under the rule at the bottom of the panel */
  linkLabel?: string
  href?: string
  newTab?: boolean
}

export type SpineAccordionProps = {
  items?: SpineItem[]
  /** 1-based index of the panel open at start; 0 starts with all closed (when collapsible) */
  initialOpen?: number
  /** clicking the open panel closes it */
  collapsible?: boolean
  /** a resting mouse opens a spine after a short intent delay */
  hoverToOpen?: boolean
  /** moves to the next panel on a timer, with a progress ring and pause button */
  autoplay?: boolean
  /** seconds per panel (min 2) */
  interval?: number
  /** panel height in the horizontal layout, px */
  cardHeight?: number
  /** spine width in the horizontal layout, px */
  closedWidth?: number
  /** header height in the stacked layout, px */
  mobileHeaderHeight?: number
  /** container width from which spines sit side by side, px */
  breakpoint?: number
  /** narrowest the open panel may get before the row scrolls, px */
  minOpenWidth?: number
  gap?: number
  radius?: number
  /** how far the artwork follows the pointer, px */
  artTravel?: number
  /** artwork floats, tilts and follows the pointer on the open panel */
  hoverMotion?: boolean
  textColor?: string
  secondaryColor?: string
  coverTextColor?: string
  focusColor?: string
  className?: string
}

const art = (n: number) => `/mfa/spine-accordion/art-${n}.webp`
const DEFAULT_ITEMS: SpineItem[] = [
  {
    title: 'Discover',
    description: 'We listen first. Workshops and research that turn loose ideas into a clear brief.',
    image: art(1),
    imageAlt: 'Violet chrome ribbon coiling upward',
    tone: '#B9AEF2',
    linkLabel: 'See the process',
  },
  {
    title: 'Shape',
    description: 'Concepts and systems that give a product a voice people remember.',
    image: art(2),
    imageAlt: 'Rose metal rings wound into a coil',
    tone: '#F1B6C8',
    linkLabel: 'See the process',
  },
  {
    title: 'Craft',
    description: 'Interfaces drawn to the pixel, tested in the hand, refined until they feel obvious.',
    image: art(3),
    imageAlt: 'Mint chrome knot',
    tone: '#A9D9C7',
    linkLabel: 'See the process',
  },
  {
    title: 'Build',
    description: 'Fast, accessible front ends, engineered to stay easy to change.',
    image: art(4),
    imageAlt: 'Copper column with a half twist',
    tone: '#F1C29C',
    linkLabel: 'See the process',
  },
  {
    title: 'Launch',
    description: 'Release, measure, refine. We stay close long after go-live.',
    image: art(5),
    imageAlt: 'Stepped tower of blue metal plates',
    tone: '#AACFEF',
    linkLabel: 'See the process',
  },
]

const COVER = '#24262B'
const TITLE_SIZE = 40
const TILT = [-0.8, 0.7, -0.65, 0.9]
const OPEN_SPRING = {type: 'spring', stiffness: 260, damping: 34, mass: 1, restDelta: 0.05, restSpeed: 0.5} as const
const TICKET_H = 72 // ticket estimate before it's measured

const smooth = (v: number, a: number, b: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const finePointer = (e: React.PointerEvent) => e.pointerType !== 'touch' && matchMedia('(hover:hover) and (pointer:fine)').matches
const startIndex = (open: number, n: number, collapsible: boolean) => {
  if (!n) return -1
  const i = Math.min(n - 1, Math.max(-1, Math.round(Number.isFinite(open) ? open : 1) - 1))
  return !collapsible && i < 0 ? 0 : i
}

const subscribeReduced = (cb: () => void) => {
  const mq = matchMedia('(prefers-reduced-motion: reduce)')
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const useReducedMotion = () =>
  useSyncExternalStore(
    subscribeReduced,
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  )

// An accordion of tall spines. The open one widens into a coloured panel:
// its artwork glides out of the spine and grows into place, the copy fades
// in, and the plus turns into a progress ring when autoplay is on. A
// resting mouse opens a spine after a short intent delay; clicks, arrow
// keys, Home/End and touch work as well. Below `breakpoint` the spines
// stack and open downwards. Width, height and openness share one spring
// so every panel moves together; on the open panel the artwork floats
// and follows the pointer. Autoplay waits while the pointer is over it,
// the tab is hidden or less than a quarter of it is on screen.
export default function SpineAccordion({
  items = DEFAULT_ITEMS,
  initialOpen = 3,
  collapsible = true,
  hoverToOpen = true,
  autoplay = true,
  interval = 5,
  cardHeight = 520,
  closedWidth = 112,
  mobileHeaderHeight = 96,
  breakpoint = 820,
  minOpenWidth = 442,
  gap = 8,
  radius = 8,
  artTravel = 4,
  hoverMotion = true,
  textColor = '#24262B',
  secondaryColor = '#30343D',
  coverTextColor = '#EFEEE9',
  focusColor = '#D7D5E5',
  className = '',
}: SpineAccordionProps) {
  const n = items.length
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const triggers = useRef<(HTMLButtonElement | null)[]>([])
  const cards = useRef<(HTMLElement | null)[]>([])
  const [width, setWidth] = useState(0)
  const [minimums, setMinimums] = useState<Record<number, number>>({})
  const [open, setOpen] = useState(() => startIndex(initialOpen, n, collapsible))
  const startKey = `${initialOpen}-${n}-${collapsible}`
  const [startedFrom, setStartedFrom] = useState(startKey)
  if (startedFrom !== startKey) {
    setStartedFrom(startKey)
    setOpen(startIndex(initialOpen, n, collapsible))
  }
  const [selection, setSelection] = useState(0)
  const [paused, setPaused] = useState(false)
  const [pointerInside, setPointerInside] = useState(false)
  const [timerClicked, setTimerClicked] = useState(false)
  const [inView, setInView] = useState(false)
  const [tabVisible, setTabVisible] = useState(true)
  const [settled, setSettled] = useState(true)
  const [timerFocus, setTimerFocus] = useState(false)
  const [timerHover, setTimerHover] = useState(false)
  const progress = useMotionValue(0)
  const elapsed = useRef(0)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingHover = useRef(-1)
  const pointer = useRef({x: 0, y: 0})
  const lastOpen = useRef({x: -9999, y: -9999, index: -1, time: 0})
  const hoverBlockedUntil = useRef(0)
  const openRef = useRef(open)

  const intervalMs = Math.max(2, Number.isFinite(interval) ? interval : 5) * 1000
  const timerOn = autoplay && n > 1 && !reduced
  const running = settled && timerOn && !paused && (!pointerInside || timerClicked) && inView && tabVisible && open >= 0

  const clearHover = useCallback(() => {
    if (hoverTimer.current !== null) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    pendingHover.current = -1
  }, [])

  const select = useCallback(
    (i: number) => {
      clearHover()
      lastOpen.current = {...pointer.current, index: -1, time: 0}
      elapsed.current = 0
      setOpen(i)
      setSelection((s) => s + 1)
      setSettled(reduced)
    },
    [clearHover, reduced],
  )

  // keyboard focus sits on a body link (hover must not yank the panel away)
  const linkFocused = () => {
    const el = document.activeElement
    return el instanceof HTMLElement && !!el.dataset.bodyLink && rootRef.current?.contains(el) && el.matches(':focus-visible')
  }

  const hoverIntent = (i: number, e: React.PointerEvent<HTMLButtonElement>) => {
    if (!hoverToOpen || linkFocused() || i === open || e.pointerType === 'touch' || e.buttons || e.timeStamp < hoverBlockedUntil.current || !finePointer(e)) return
    pointer.current = {x: e.clientX, y: e.clientY}
    const last = lastOpen.current
    if (Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y) < 4 || pendingHover.current === i) return
    clearHover()
    pendingHover.current = i
    const target = e.currentTarget
    hoverTimer.current = setTimeout(() => {
      hoverTimer.current = null
      pendingHover.current = -1
      if (!target.isConnected || !target.matches(':hover') || linkFocused()) return
      select(i)
      lastOpen.current = {...pointer.current, index: i, time: performance.now()}
    }, 120)
  }

  useEffect(() => clearHover, [clearHover])
  useEffect(() => clearHover(), [hoverToOpen, n, clearHover])
  useEffect(() => {
    openRef.current = open
  }, [open])

  useLayoutEffect(() => {
    elapsed.current = 0
    progress.set(0)
  }, [open, selection, intervalMs, progress, reduced])

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === 'visible')
    onVisibility()
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting && e.intersectionRatio >= 0.25), {threshold: [0, 0.25]})
    io.observe(root)
    return () => io.disconnect()
  }, [])

  // autoplay clock: fills the ring, then opens the next panel
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      elapsed.current = Math.min(intervalMs, elapsed.current + Math.max(0, now - last))
      last = now
      progress.set(elapsed.current / intervalMs)
      if (elapsed.current >= intervalMs) return select((open + 1) % n)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running, open, selection, intervalMs, n, progress, select])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const measure = () => setWidth(root.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  const onMinimum = useCallback((i: number, min: number) => setMinimums((m) => (Math.abs((m[i] || 0) - min) > 0.5 ? {...m, [i]: min} : m)), [])
  const onSettled = useCallback((i: number, done: boolean) => {
    if (i === openRef.current || openRef.current < 0) setSettled(done)
  }, [])

  const rowGap = Math.max(0, n - 1) * gap
  const spines = Math.max(0, n - 1) * closedWidth
  const narrowest = Math.max(minOpenWidth, closedWidth + TITLE_SIZE * 7)
  const horizontal = n > 0 && width >= breakpoint
  const trackW = horizontal ? Math.max(width, spines + rowGap + narrowest) : width
  const openW = Math.max(0, trackW - rowGap - spines)
  const scrolls = horizontal && trackW > width + 0.5
  const compact = width < 600
  const panelH = Math.max(cardHeight, ...items.map((_, i) => minimums[i] || 0))
  const evenW = n ? Math.max(0, (trackW - rowGap) / n) : 0

  useEffect(() => clearHover(), [horizontal, width, clearHover])

  // keep the open (or focused) spine in view when the row scrolls
  const reveal = useCallback(
    (i: number, triggerOnly = false, instant = false) => {
      const vp = viewportRef.current
      const card = cards.current[i]
      const trigger = triggers.current[i]
      if (!scrolls || !vp || !card || !trigger) return
      const w = triggerOnly ? trigger.offsetWidth : card.offsetWidth
      const start = card.offsetLeft + (triggerOnly ? trigger.offsetLeft : 0)
      const end = start + w
      let to = vp.scrollLeft
      if (w > vp.clientWidth || start < to) to = start
      else if (end > to + vp.clientWidth) to = end - vp.clientWidth
      to = Math.max(0, Math.min(to, vp.scrollWidth - vp.clientWidth))
      if (Math.abs(to - vp.scrollLeft) > 0.5) vp.scrollTo({left: to, behavior: reduced || instant ? 'auto' : 'smooth'})
    },
    [scrolls, reduced],
  )

  useLayoutEffect(() => {
    if (!scrolls) {
      if (viewportRef.current) viewportRef.current.scrollLeft = 0
      return
    }
    if (settled && open >= 0) {
      const el = document.activeElement
      const focused = el instanceof HTMLButtonElement && el.matches(':focus-visible') ? triggers.current.indexOf(el) : -1
      if (focused >= 0 && focused !== open) reveal(focused, true, true)
      else reveal(open)
    }
  }, [scrolls, trackW, width, open, settled, reveal])

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let to = i
    if (e.key === 'ArrowDown' || (horizontal && e.key === 'ArrowRight')) to = (i + 1) % n
    else if (e.key === 'ArrowUp' || (horizontal && e.key === 'ArrowLeft')) to = (i - 1 + n) % n
    else if (e.key === 'Home') to = 0
    else if (e.key === 'End') to = n - 1
    else return
    e.preventDefault()
    triggers.current[to]?.focus({preventScroll: scrolls})
    reveal(to, true, true)
  }

  if (!n) return null

  const colors = {text: textColor, secondary: secondaryColor, coverText: coverTextColor}
  return (
    <div
      ref={rootRef}
      className={`relative min-w-0 text-base leading-[1.55em] tracking-[-0.015em] ${className}`}
      style={{'--sa-focus': focusColor, '--sa-text': textColor} as React.CSSProperties}
      data-autoplay={timerOn ? (running ? 'running' : 'paused') : 'off'}
      onPointerMoveCapture={(e) => void (pointer.current = {x: e.clientX, y: e.clientY})}
      onPointerEnter={(e) => e.pointerType !== 'touch' && setPointerInside(true)}
      onPointerLeave={() => {
        setPointerInside(false)
        setTimerClicked(false)
        clearHover()
      }}
      onPointerDownCapture={(e) => {
        if (e.pointerType === 'touch' && !(e.target instanceof Element && e.target.closest('[data-timer]'))) setPaused(true)
      }}
      onFocusCapture={(e) => {
        if (!(e.target instanceof HTMLElement) || !e.target.matches(':focus-visible')) return
        clearHover()
        setPaused(true)
        const i = triggers.current.findIndex((t) => t === (e.target as Element))
        if (i >= 0) reveal(i, true, true)
      }}
    >
      <div
        ref={viewportRef}
        className="w-full min-w-0 overscroll-x-contain"
        style={{overflowX: scrolls ? 'auto' : 'visible', overflowY: scrolls ? 'hidden' : 'visible'}}
        onScroll={(e) => {
          clearHover()
          hoverBlockedUntil.current = e.timeStamp + 160
          lastOpen.current = {...pointer.current, index: -1, time: 0}
        }}
      >
        <div className="relative flex items-start" style={{width: trackW, flexDirection: horizontal ? 'row' : 'column', gap}}>
          {width > 0 &&
            items.map((item, i) => (
              <Card
                key={i}
                item={item}
                index={i}
                open={open === i}
                collapsible={collapsible}
                horizontal={horizontal}
                compact={compact}
                width={horizontal ? (open < 0 ? evenW : open === i ? openW : closedWidth) : width}
                openW={horizontal ? openW : width}
                spine={closedWidth}
                panelH={panelH}
                headerMin={mobileHeaderHeight}
                colors={colors}
                padding={compact ? 20 : 24}
                radius={radius}
                reduced={reduced}
                hoverMotion={hoverMotion}
                artTravel={artTravel}
                motionActive={inView && tabVisible}
                id={id}
                selection={`${open}-${selection}`}
                setCard={(el) => void (cards.current[i] = el)}
                setTrigger={(el) => void (triggers.current[i] = el)}
                onToggle={(e) => {
                  clearHover()
                  const l = lastOpen.current
                  // the click that lands right after a hover opened this panel
                  if (e.detail > 0 && open === i && l.index === i && e.timeStamp - l.time < 650) return
                  if (open === i && !collapsible) return
                  if (open === i) setPaused(true)
                  select(open === i ? -1 : i)
                }}
                onKeyDown={(e) => onKeyDown(e, i)}
                onHoverIntent={(e) => hoverIntent(i, e)}
                onHoverLeave={clearHover}
                onMinimum={onMinimum}
                onSettled={onSettled}
                timer={
                  timerOn
                    ? {
                        progress,
                        paused,
                        focus: timerFocus,
                        engaged: timerHover,
                        onClick: () => {
                          clearHover()
                          setPaused((p) => !p)
                          setTimerClicked(true)
                        },
                        onFocus: setTimerFocus,
                        onHover: setTimerHover,
                      }
                    : null
                }
              />
            ))}
        </div>
      </div>
    </div>
  )
}

type Timer = {
  progress: MotionValue<number>
  paused: boolean
  focus: boolean
  engaged: boolean
  onClick: () => void
  onFocus: (v: boolean) => void
  onHover: (v: boolean) => void
}

type CardProps = {
  item: SpineItem
  index: number
  open: boolean
  collapsible: boolean
  horizontal: boolean
  compact: boolean
  width: number
  openW: number
  spine: number
  panelH: number
  headerMin: number
  colors: {text: string; secondary: string; coverText: string}
  padding: number
  radius: number
  reduced: boolean
  hoverMotion: boolean
  artTravel: number
  motionActive: boolean
  id: string
  selection: string
  setCard: (el: HTMLElement | null) => void
  setTrigger: (el: HTMLButtonElement | null) => void
  onToggle: (e: React.MouseEvent) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onHoverIntent: (e: React.PointerEvent<HTMLButtonElement>) => void
  onHoverLeave: () => void
  onMinimum: (i: number, min: number) => void
  onSettled: (i: number, done: boolean) => void
  timer: Timer | null
}

function Card({
  item,
  index,
  open,
  collapsible,
  horizontal,
  compact,
  width,
  openW,
  spine,
  panelH,
  headerMin,
  colors,
  padding: pad,
  radius,
  reduced,
  hoverMotion,
  artTravel,
  motionActive,
  id,
  selection,
  setCard,
  setTrigger,
  onToggle,
  onKeyDown,
  onHoverIntent,
  onHoverLeave,
  onMinimum,
  onSettled,
  timer,
}: CardProps) {
  const headerRef = useRef<HTMLSpanElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const copyRef = useRef<HTMLParagraphElement>(null)
  const ticketRef = useRef<HTMLSpanElement>(null)
  const [triggerHover, setTriggerHover] = useState(false)
  const [triggerFocus, setTriggerFocus] = useState(false)
  const [linkHover, setLinkHover] = useState(false)
  const [linkFocus, setLinkFocus] = useState(false)
  const [ready, setReady] = useState(true)
  const hasTicket = !!item.linkLabel
  const [m, setM] = useState({header: horizontal ? 0 : headerMin, copy: 50, ticket: hasTicket ? TICKET_H : 0})

  const motionOn = !reduced && hoverMotion
  const linkEngaged = open && (linkHover || linkFocus)
  const engaged = open && (triggerHover || linkHover || triggerFocus || linkFocus)

  // the label and its rule light up while the panel is hovered
  const link = useMotionValue(0)
  const label = useTransform(link, [0, 1], [colors.secondary, colors.text])
  useLayoutEffect(() => {
    if (!motionOn) return link.jump(+linkEngaged)
    const a = animate(link, +linkEngaged, {type: 'spring', stiffness: 230, damping: 32, mass: 1, restDelta: 0.001, restSpeed: 0.005})
    return () => a.stop()
  }, [linkEngaged, motionOn, link])

  // pointer follow, plus a slow float while the panel is engaged
  const aimX = useMotionValue(0)
  const aimY = useMotionValue(0)
  const followX = useSpring(aimX, {stiffness: 180, damping: 27, mass: 1})
  const followY = useSpring(aimY, {stiffness: 180, damping: 27, mass: 1})
  const openness = useMotionValue(+open)
  const float = useSpring(0, {stiffness: 90, damping: 21, mass: 1, restDelta: 1e-4, restSpeed: 0.001})
  const phase = useMotionValue(0)
  useLayoutEffect(() => {
    if (!motionOn) return float.jump(0)
    float.set(engaged && motionActive ? 1 : 0)
  }, [engaged, motionActive, motionOn, float])
  useEffect(() => {
    if (!motionOn || !motionActive || (!engaged && float.get() < 0.001)) return
    const a = animate(phase, phase.get() + Math.PI * 2, {duration: 6.8, ease: 'linear', repeat: Infinity})
    const off = float.on('change', (v) => !engaged && v < 0.001 && a.stop())
    return () => {
      off()
      a.stop()
    }
  }, [engaged, motionActive, motionOn, float, phase])
  const grip = () => (motionOn ? smooth(openness.get(), 0.2, 0.95) : 0)
  const drift = () => float.get() * grip()
  const hoverX = useTransform(() => followX.get() * grip() + Math.sin(phase.get()) * 0.65 * drift())
  const hoverY = useTransform(() => followY.get() * grip() + (-5 + Math.sin(phase.get()) * 1.4) * drift())
  const hoverScale = useTransform(() => 1 + 0.022 * drift())
  const hoverRotate = useTransform(
    () => (TILT[index % 4] + Math.sin(phase.get()) * 0.24) * drift() + Math.max(-0.6, Math.min(0.6, followX.get() * 0.16)) * grip(),
  )
  const ringProgress = useMotionValue(0)
  useLayoutEffect(() => {
    if (!open || !timer) return
    ringProgress.set(0)
    return timer.progress.on('change', (v) => ringProgress.set(v))
  }, [open, timer, ringProgress])

  const resetAim = () => {
    aimX.set(0)
    aimY.set(0)
  }
  const aim = (e: React.PointerEvent<HTMLElement>) => {
    if (!motionOn || !open || !ready || !finePointer(e)) return
    const r = e.currentTarget.getBoundingClientRect()
    if (!r.width || !r.height) return
    aimX.set(Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1)) * artTravel)
    aimY.set(Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1)) * artTravel * 0.65)
  }
  const panelEnter = (e: React.PointerEvent<HTMLElement>) => {
    if (!finePointer(e)) return
    setLinkHover(true)
    aim(e)
  }
  const panelLeave = () => {
    setLinkHover(false)
    resetAim()
  }
  useEffect(() => {
    aimX.set(0)
    aimY.set(0)
    if (!open) {
      setLinkHover(false)
      setLinkFocus(false)
    }
  }, [open, horizontal, aimX, aimY])

  // geometry
  const header = horizontal ? 0 : Math.max(headerMin, m.header)
  const markY = horizontal ? 40 : header / 2
  const contentW = Math.max(1, horizontal ? openW - spine : width)
  const inner = Math.max(1, contentW - pad * 2)
  const artBox = horizontal ? Math.max(220, panelH - pad * 2 - m.copy - m.ticket) : Math.max(180, Math.min(390, inner * 0.98))
  const contentH = pad + artBox + m.copy + m.ticket + pad
  const height = horizontal ? panelH : header + (open ? contentH : 0)
  const size = Math.max(1, Math.min(artBox, inner))
  const hideClosedArt = !horizontal && width < 340
  const artScale = Math.max(0.5, Math.min(1, item.imageScale ?? 0.94))

  const w = useMotionValue(width)
  const h = useMotionValue(height)
  const artX = useTransform(() => {
    const closed = horizontal ? Math.min(spine - 14, spine * 0.92) : width - pad - 22 - 12 - 24
    return lerp(closed, (horizontal ? spine : 0) + pad + inner / 2, clamp01(openness.get())) - size / 2
  })
  const artY = useTransform(() => {
    const closed = horizontal ? Math.max(h.get(), panelH) - 65 : markY
    return lerp(closed, header + pad + artBox / 2, clamp01(openness.get())) - size / 2
  })
  const artSize = useTransform(openness, (v) => lerp((horizontal ? Math.min(230, size * 0.74) : 48) / size, artScale, clamp01(v)))
  const artOpacity = useTransform(openness, (v) => (hideClosedArt ? smooth(v, 0.1, 0.8) : 1))
  const copyOpacity = useTransform(openness, (v) => (linkFocus ? 1 : smooth(v, 0.3, 0.92)))
  const toneOpacity = useTransform(openness, (v) => smooth(v, 0, 1))

  // one spring moves width, height and openness together
  const wasHorizontal = useRef(horizontal)
  useLayoutEffect(() => {
    const switched = wasHorizontal.current !== horizontal
    wasHorizontal.current = horizontal
    if (reduced || switched) {
      w.jump(width)
      h.jump(height)
      openness.jump(+open)
      setReady(true)
      onSettled(index, true)
      return
    }
    setReady(false)
    onSettled(index, false)
    let cancelled = false
    let left = 3
    const done = () => {
      if (!cancelled && --left === 0) {
        setReady(true)
        onSettled(index, true)
      }
    }
    const a = animate(w, width, {...OPEN_SPRING, onComplete: done})
    const b = animate(h, height, {...OPEN_SPRING, onComplete: done})
    const c = animate(openness, +open, {...OPEN_SPRING, restDelta: 1e-4, restSpeed: 0.001, onComplete: done})
    return () => {
      cancelled = true
      a.stop()
      b.stop()
      c.stop()
    }
  }, [selection, open, width, height, horizontal, reduced, w, h, openness, index, onSettled])

  // measure the copy, ticket, header and title so the panel can make room
  useLayoutEffect(() => {
    const head = headerRef.current
    if (!head) return
    const measure = () => {
      const copy = copyRef.current?.offsetHeight || 0
      const ticket = ticketRef.current ? ticketRef.current.offsetHeight + 20 : 0
      const next = {header: horizontal ? 0 : head.offsetHeight, copy, ticket}
      setM((p) => (Math.abs(p.header - next.header) > 0.5 || Math.abs(p.copy - next.copy) > 0.5 || Math.abs(p.ticket - next.ticket) > 0.5 ? next : p))
      onMinimum(index, Math.max(pad * 2 + copy + ticket + 220, 94 + (probeRef.current?.offsetHeight || 0) + 200))
    }
    measure()
    const ro = new ResizeObserver(measure)
    for (const el of [head, probeRef.current, copyRef.current, ticketRef.current]) if (el) ro.observe(el)
    return () => ro.disconnect()
  }, [horizontal, compact, contentW, pad, hasTicket, index, onMinimum])

  const verticalTitle: React.CSSProperties = {fontSize: TITLE_SIZE, writingMode: 'vertical-rl'}
  const titleClass = 'font-medium leading-[1.08em] tracking-[-0.045em]'
  const PanelTag = item.href ? 'a' : 'div'

  return (
    <motion.article
      ref={setCard}
      className="group/card relative min-w-0 shrink-0 overflow-hidden"
      data-open={open}
      data-trigger-engaged={triggerHover || triggerFocus || undefined}
      data-link-engaged={linkEngaged || undefined}
      style={{
        width: w,
        height: h,
        minHeight: horizontal ? panelH : header,
        borderRadius: radius,
        background: item.coverColor ?? COVER,
        color: colors.coverText,
      }}
    >
      <span
        ref={probeRef}
        aria-hidden
        className={`pointer-events-none invisible absolute top-0 left-0 h-max w-max px-[0.075em] whitespace-nowrap ${titleClass}`}
        style={{...verticalTitle, lineHeight: '1.2em'}}
      >
        {item.title}
      </span>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute right-0 bottom-0"
        style={{left: horizontal ? spine : 0, top: header, background: item.tone ?? '#ddd', opacity: toneOpacity}}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-4 rounded-[inherit] opacity-[.08] shadow-[inset_0_0_0_1px_currentColor] transition-opacity duration-240 group-data-link-engaged/card:opacity-[.22] group-data-trigger-engaged/card:opacity-[.22] motion-reduce:transition-none"
      />
      <h3 className="pointer-events-none absolute inset-0 z-2 m-0 p-0">
        <button
          ref={setTrigger}
          type="button"
          id={`${id}-trigger-${index}`}
          aria-label={item.title}
          aria-expanded={open}
          aria-disabled={open && !collapsible ? true : undefined}
          aria-controls={`${id}-panel-${index}`}
          onClick={onToggle}
          onKeyDown={onKeyDown}
          onPointerEnter={(e) => {
            if (!finePointer(e)) return
            setTriggerHover(true)
            if (!open) onHoverIntent(e)
          }}
          onPointerMove={(e) => !open && finePointer(e) && onHoverIntent(e)}
          onPointerLeave={() => {
            setTriggerHover(false)
            resetAim()
            onHoverLeave()
          }}
          onPointerCancel={() => {
            setTriggerHover(false)
            resetAim()
            onHoverLeave()
          }}
          onFocus={(e) => setTriggerFocus(e.currentTarget.matches(':focus-visible'))}
          onBlur={() => setTriggerFocus(false)}
          className="pointer-events-auto absolute top-0 left-0 cursor-pointer appearance-none border-0 bg-transparent p-0 text-left [-webkit-tap-highlight-color:transparent] focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-5 focus-visible:outline-(--sa-focus)"
          style={{width: horizontal && open ? spine : '100%', height: horizontal ? '100%' : header, borderRadius: radius}}
        >
          <span
            ref={headerRef}
            aria-hidden
            className={horizontal ? 'absolute top-0 left-0' : 'absolute top-0 left-0 box-border flex items-center gap-3'}
            style={horizontal ? {width: spine, height: panelH} : {width, minHeight: headerMin, padding: pad}}
          >
            <span
              className={`text-[11px] leading-none font-medium tracking-[0.06em] opacity-70 transition-opacity duration-220 group-data-trigger-engaged/card:opacity-100 motion-reduce:transition-none ${
                horizontal ? 'absolute top-[34px] left-[21px]' : 'w-5 shrink-0'
              }`}
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <span
              className={horizontal ? `absolute top-[94px] left-1/2 h-max w-max px-[0.075em] whitespace-nowrap ${titleClass}` : `min-w-0 flex-1 wrap-anywhere ${titleClass}`}
              style={horizontal ? {...verticalTitle, lineHeight: '1.2em', transform: 'translateX(-50%) rotate(180deg)'} : {fontSize: TITLE_SIZE * (compact ? 0.7 : 0.8)}}
            >
              {item.title}
            </span>
            {!horizontal && !hideClosedArt && item.image && <span aria-hidden className="size-12 shrink-0" />}
            {!horizontal && <span aria-hidden className="size-[22px] shrink-0" />}
          </span>
        </button>
      </h3>
      <div id={`${id}-panel-${index}`} role="region" aria-labelledby={`${id}-trigger-${index}`} aria-hidden={!open} className="pointer-events-none absolute inset-0 z-1">
        <PanelTag
          {...(item.href
            ? {
                href: item.href,
                target: item.newTab ? '_blank' : undefined,
                rel: item.newTab ? 'noopener noreferrer' : undefined,
                tabIndex: open ? 0 : -1,
                'aria-label': `${item.linkLabel || 'Explore'} — ${item.title}`,
                'data-body-link': 'true',
                onFocus: (e: React.FocusEvent<HTMLElement>) => setLinkFocus(e.currentTarget.matches(':focus-visible')),
                onBlur: () => setLinkFocus(false),
              }
            : {})}
          onPointerEnter={panelEnter}
          onPointerMove={aim}
          onPointerLeave={panelLeave}
          onPointerCancel={panelLeave}
          className="group/link absolute inset-0 block no-underline focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-3 focus-visible:outline-(--sa-text)"
          style={{borderRadius: radius, color: colors.text, pointerEvents: open ? 'auto' : 'none', cursor: item.href ? 'pointer' : 'default'}}
        >
          <motion.span
            aria-hidden={!item.imageAlt}
            className="pointer-events-none absolute top-0 left-0 origin-center"
            style={{width: size, height: size, x: artX, y: artY, scale: artSize, opacity: artOpacity}}
          >
            <motion.span className="block size-full origin-center" style={{x: hoverX, y: hoverY, scale: hoverScale, rotate: hoverRotate}}>
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.imageAlt ?? ''} draggable={false} className="block size-full object-contain select-none" />
              ) : (
                <span aria-hidden className="m-[17%] block size-[66%] rounded-[46%_54%_45%_55%] opacity-[.16]" style={{background: colors.coverText}} />
              )}
            </motion.span>
          </motion.span>
          <div className="absolute box-border" style={{left: horizontal ? spine : 0, top: header, width: contentW, height: contentH, padding: pad}}>
            <div aria-hidden className="shrink-0" style={{height: artBox}} />
            <motion.div style={{opacity: copyOpacity}}>
              <p ref={copyRef} className="m-0 whitespace-pre-wrap wrap-anywhere" style={{color: colors.secondary}}>
                {item.description}
              </p>
              {hasTicket && (
                <span ref={ticketRef} className="relative isolate mt-5 flex min-h-[52px] items-center py-[15px] pr-6 text-[.875em] leading-[1.45em] font-medium" style={{color: colors.text}}>
                  <span aria-hidden className="absolute inset-x-0 top-0 h-px opacity-[.18]" style={{background: colors.text}} />
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left opacity-[.55] transition-opacity duration-180 group-active/link:opacity-[.38] motion-reduce:transition-none"
                    style={{background: colors.text, scaleX: link}}
                  />
                  <motion.span className="block min-w-0 wrap-anywhere" style={{color: label}}>
                    {item.linkLabel}
                  </motion.span>
                </span>
              )}
            </motion.div>
          </div>
        </PanelTag>
      </div>
      <span
        aria-hidden={!timer || !open}
        className="group/mark absolute z-3 flex size-11 items-center justify-center rounded-full"
        data-timer-engaged={(open && timer?.engaged) || undefined}
        style={{left: horizontal ? spine - 56 : width - pad - 33, top: markY - 22}}
      >
        <Mark openness={openness} progress={ringProgress} timer={!!timer} paused={!!timer?.paused} reduced={reduced} />
        {timer && open && (
          <button
            type="button"
            data-timer
            aria-label={timer.paused ? 'Resume autoplay' : 'Pause autoplay'}
            title={timer.paused ? 'Resume autoplay' : 'Pause autoplay'}
            aria-controls={`${id}-panel-${index}`}
            onClick={timer.onClick}
            onFocus={(e) => timer.onFocus(e.currentTarget.matches(':focus-visible'))}
            onBlur={() => timer.onFocus(false)}
            onPointerEnter={() => timer.onHover(true)}
            onPointerLeave={() => timer.onHover(false)}
            className={`absolute inset-0 cursor-pointer rounded-full border-0 bg-transparent p-0 [-webkit-tap-highlight-color:transparent] focus:outline-none ${
              timer.focus ? 'outline-2 outline-offset-2 outline-(--sa-focus)' : ''
            }`}
          />
        )}
      </span>
    </motion.article>
  )
}

// Plus at rest. With autoplay it gives way to a progress ring with a
// pause / play glyph as the panel opens; without, the plus becomes a minus.
function Mark({openness, progress, timer, paused, reduced}: {openness: MotionValue<number>; progress: MotionValue<number>; timer: boolean; paused: boolean; reduced: boolean}) {
  const ring = useTransform(openness, (v) => smooth(v, 0.18, 0.92))
  const plus = useTransform(ring, (v) => (timer ? 1 - v : 1))
  const bar = useTransform(openness, (v) => (timer ? 1 : 1 - smooth(v, 0, 1)))
  const offset = useTransform(progress, (v) => 1 - v)
  const fade = {duration: reduced ? 0 : 0.16, ease: [0.4, 0, 0.2, 1] as const}
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden>
      <circle
        cx="18"
        cy="18"
        r="15"
        stroke="currentColor"
        strokeWidth="1.5"
        className="opacity-[.22] transition-opacity duration-220 group-data-trigger-engaged/card:opacity-50 group-data-timer-engaged/mark:opacity-50 motion-reduce:transition-none"
      />
      <motion.g style={{opacity: plus}}>
        <path d="M11 18h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <motion.path d="M18 11v14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{opacity: bar}} />
      </motion.g>
      {timer && (
        <motion.g style={{opacity: ring}}>
          <motion.circle
            cx="18"
            cy="18"
            r="15"
            pathLength="1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray="1"
            transform="rotate(-90 18 18)"
            style={{strokeDashoffset: offset}}
          />
          <motion.path initial={false} animate={{opacity: +paused}} transition={fade} d="M15 12.5 23 18l-8 5.5z" fill="currentColor" />
          <motion.path
            initial={false}
            animate={{opacity: +!paused}}
            transition={fade}
            d="M15.5 14v8M20.5 14v8"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </motion.g>
      )}
    </svg>
  )
}
