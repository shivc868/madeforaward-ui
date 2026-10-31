'use client'

import {useEffect, useId, useMemo, useRef, useState, type ReactNode} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'

gsap.registerPlugin(useGSAP)

export type DripButtonProps = {
  children?: ReactNode
  /** paint colour: the button and its drips */
  color?: string
  textColor?: string
  /** number of drips (sags along the edge are added between them) */
  drips?: number
  /** longest drip, in px */
  length?: number
  /** seconds for the drips to run down */
  duration?: number
  /** drops keep falling from the longest drips while hovered */
  drops?: boolean
  /** changes the drip pattern */
  seed?: number
  /** corner radius in px */
  radius?: number
  href?: string
  onClick?: () => void
  className?: string
}

type Run = {
  x: number
  width: number
  tip: number
  reach: number
  delay: number
  time: number
  sag: boolean
}

// A button that melts on hover. Paint sags along its lower edge and runs
// down in a few uneven drips, each at its own place, pace and length; the
// longest keep creeping and shedding drops while hovered, and it all climbs
// back up when the pointer leaves.
//
// The paint is plain SVG shapes under a "goo" filter (blur, then a hard
// alpha threshold), which melts them into the button's edge and into each
// other with soft, liquid curves. At rest nothing is drawn below the button.
export default function DripButton({
  children = 'Let’s talk',
  color = '#ff6a2b',
  textColor = '#ffffff',
  drips = 4,
  length = 90,
  duration = 0.9,
  drops = true,
  seed = 11,
  radius = 14,
  href,
  onClick,
  className = '',
}: DripButtonProps) {
  const rootRef = useRef<HTMLElement>(null)
  const layerRef = useRef<SVGSVGElement>(null)
  const bodyRefs = useRef<(SVGRectElement | null)[]>([])
  const tipRefs = useRef<(SVGCircleElement | null)[]>([])
  const dropRefs = useRef<(SVGCircleElement | null)[]>([])
  const [width, setWidth] = useState(0)
  const goo = `goo${useId().replace(/[^a-zA-Z0-9]/g, '')}`

  // Drips need the button's real width to stay clear of its rounded corners.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver(() => setWidth(root.offsetWidth))
    ro.observe(root)
    return () => ro.disconnect()
  }, [])

  // The same pattern on the server and the client: it comes from the seed.
  const runs = useMemo<Run[]>(() => {
    if (!width) return []
    const rand = mulberry32(seed)
    const left = radius + 6
    const span = width - 2 * left
    const out: Run[] = []
    // Drips at uneven places: random gaps, then stretched to the edge.
    const gaps = Array.from({length: drips + 1}, () => 0.4 + rand())
    const total = gaps.reduce((a, b) => a + b, 0)
    let at = 0
    for (let i = 0; i < drips; i++) {
      at += gaps[i] / total
      const w = 6 + rand() * 10
      out.push({
        x: left + at * span,
        width: w,
        tip: w * (0.7 + rand() * 0.2),
        reach: (0.3 + rand() ** 1.4 * 0.7) * length,
        delay: rand() * 0.35,
        time: duration * (0.7 + rand() * 0.9),
        sag: false,
      })
    }
    // Wide, shallow sags where the paint only bulges, between and beside the drips.
    for (let i = 0; i < drips + 1; i++) {
      const w = 22 + rand() * 30
      out.push({
        x: left + rand() * span,
        width: w,
        tip: w * 0.45,
        reach: 4 + rand() * 12,
        delay: rand() * 0.25,
        time: duration * (0.5 + rand() * 0.5),
        sag: true,
      })
    }
    return out
  }, [width, drips, length, duration, seed, radius])

  // Drops fall from the two longest drips.
  const droppers = useMemo(
    () =>
      drops
        ? [...runs.keys()]
            .filter((i) => !runs[i].sag)
            .sort((a, b) => runs[b].reach - runs[a].reach)
            .slice(0, 2)
        : [],
    [runs, drops],
  )

  useGSAP(
    (_, contextSafe) => {
      const root = rootRef.current!
      const layer = layerRef.current!
      const bodies = bodyRefs.current.slice(0, runs.length)
      const tips = tipRefs.current.slice(0, runs.length)
      const falling = dropRefs.current.slice(0, droppers.length)
      let tl: gsap.core.Timeline | null = null

      const melt = contextSafe!(() => {
        tl?.kill()
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        tl = gsap.timeline().set(layer, {visibility: 'visible'})
        runs.forEach((r, i) => {
          const at = still ? 0 : r.delay
          const time = still ? 0 : r.time
          // Paint gathers, then runs: slow start, quick middle, a soft stop.
          const ease = r.sag ? 'power2.out' : 'power3.inOut'
          tl!.to(bodies[i], {attr: {height: r.reach}, duration: time, ease}, at)
          tl!.to(tips[i], {attr: {cy: r.reach - 8 - r.tip * 0.25}, duration: time, ease}, at)
          // Drips keep creeping a little while the pointer stays.
          if (!r.sag && !still) {
            tl!.to(
              bodies[i],
              {attr: {height: r.reach * 1.12}, duration: 2.4, ease: 'sine.inOut'},
              at + time,
            )
            tl!.to(
              tips[i],
              {attr: {cy: r.reach * 1.12 - 8 - r.tip * 0.25}, duration: 2.4, ease: 'sine.inOut'},
              at + time,
            )
          }
        })
        if (!still)
          droppers.forEach((i, n) => {
            const r = runs[i]
            tl!.fromTo(
              falling[n],
              {attr: {cy: r.reach - 8, r: r.tip * 0.75}, opacity: 1},
              {
                // Not before its drip has run: no drop hanging in the air at the start.
                immediateRender: false,
                attr: {cy: r.reach + 70 + n * 30, r: r.tip * 0.45},
                opacity: 0,
                duration: 0.85,
                ease: 'power2.in',
                repeat: -1,
                repeatDelay: 0.6 + n * 0.5,
              },
              r.delay + r.time + n * 0.3,
            )
          })
      })

      const dry = contextSafe!(() => {
        tl?.kill()
        tl = gsap
          .timeline()
          .to(bodies, {attr: {height: 0}, duration: 0.5, ease: 'power3.inOut'}, 0)
          .to(
            tips,
            {attr: {cy: (i: number) => -runs[i].tip - 8}, duration: 0.5, ease: 'power3.inOut'},
            0,
          )
          .to(falling, {opacity: 0, duration: 0.2}, 0)
          .set(layer, {visibility: 'hidden'})
      })

      root.addEventListener('mouseenter', melt)
      root.addEventListener('mouseleave', dry)
      root.addEventListener('focus', melt)
      root.addEventListener('blur', dry)
      return () => {
        root.removeEventListener('mouseenter', melt)
        root.removeEventListener('mouseleave', dry)
        root.removeEventListener('focus', melt)
        root.removeEventListener('blur', dry)
      }
    },
    {scope: rootRef, dependencies: [runs, droppers], revertOnUpdate: true},
  )

  const Tag = href ? 'a' : 'button'
  const depth = length * 1.2 + 120
  return (
    <Tag
      ref={rootRef as never}
      href={href}
      type={href ? undefined : 'button'}
      onClick={onClick}
      className={`relative inline-flex items-center justify-center px-8 py-4 text-center text-lg leading-none font-medium tracking-tight ${className}`}
      style={{background: color, color: textColor, borderRadius: radius}}
    >
      <span className="relative z-10">{children}</span>
      <svg
        ref={layerRef}
        aria-hidden
        className="pointer-events-none absolute top-full left-0 overflow-visible"
        width={width}
        height={depth}
        style={{visibility: 'hidden'}}
      >
        <defs>
          {/* A fixed region (not the shapes' box), so falling drops are never clipped. */}
          <filter
            id={goo}
            filterUnits="userSpaceOnUse"
            x="0"
            y="-40"
            width={width}
            height={depth + 40}
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 24 -10" />
          </filter>
        </defs>
        <g filter={`url(#${goo})`} fill={color}>
          {/* A strip of paint inside the button's lower edge (clear of the
              rounded corners) for the paint to run out of. It stays above
              the edge, so nothing shows below the button at rest. */}
          <rect x={radius} y="-30" width={Math.max(0, width - 2 * radius)} height="24" />
          {runs.map((r, i) => (
            <g key={i}>
              <rect
                ref={(el) => {
                  bodyRefs.current[i] = el
                }}
                x={r.x - r.width / 2}
                y="-8"
                width={r.width}
                height="0"
                rx={r.width / 2}
              />
              {/* The bulb at the end of the drip; tucked inside the button at rest. */}
              <circle
                ref={(el) => {
                  tipRefs.current[i] = el
                }}
                cx={r.x}
                cy={-r.tip - 8}
                r={r.tip}
              />
            </g>
          ))}
          {droppers.map((i, n) => (
            <circle
              key={`drop${i}`}
              ref={(el) => {
                dropRefs.current[n] = el
              }}
              cx={runs[i].x}
              cy="0"
              r="0"
              opacity="0"
            />
          ))}
        </g>
      </svg>
    </Tag>
  )
}

// A tiny seeded random generator, so the drip pattern is stable.
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
