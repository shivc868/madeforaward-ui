'use client'

import {useRef, type CSSProperties} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

/** a hand nudge for one letter, in em / degrees */
export type LetterTweak = {dx?: number; dy?: number; dr?: number}

export type ArcPokeTextProps = {
  /** one string per line */
  lines?: string[]
  /** how far the middle of each line dips, in em */
  arcDrop?: number
  /** how far the outer letters lean out, degrees */
  arcTilt?: number
  /** per-letter nudges keyed `line:index` (both 0-based), on top of the arc */
  tweaks?: Record<string, LetterTweak>
  /** letters near the pointer lift, swell and lean away */
  poke?: boolean
  /** seconds per letter in the entrance */
  duration?: number
  /** seconds between letters (in random order) */
  stagger?: number
  /** seconds before the entrance starts */
  delay?: number
  /** 'view' plays when it scrolls into view; 'mount' at once */
  trigger?: 'view' | 'mount'
  /** ScrollTrigger start */
  start?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  /** extra space between letters, em (negative tightens) */
  tracking?: number
  /** line height; tight, so the arcs nest */
  lineHeight?: number
  as?: 'h1' | 'h2' | 'div'
  className?: string
  style?: CSSProperties
}

const DEFAULT_LINES = ['HOLD', 'ON TIGHT']
// hand nudges in the reference's spirit: the outer letters lean a touch
// more and the last ones tuck in, so the arc reads as lettering, not maths
const DEFAULT_TWEAKS: Record<string, LetterTweak> = {
  '0:0': {dx: -0.05, dr: 1.5},
  '0:3': {dx: 0.02, dr: -1},
  '1:0': {dy: -0.01, dr: 2.5},
  '1:1': {dy: 0.015},
  '1:6': {dx: -0.034},
  '1:7': {dx: -0.03, dr: -0.5},
}

const shuffle = <T,>(list: T[]) => {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

// A big poster headline set on a gentle arc: every letter sits in its own
// clip, the middle of each line dips and the outer letters lean out. When
// it comes into view the letters rise out of their clips in random order.
// Then the pointer pokes it: letters within ~0.8em lift, swell and lean
// away from the cursor, and on leave they spring back with an elastic
// wobble, from the centre out. Touch screens get the poke on tap.
export default function ArcPokeText({
  lines = DEFAULT_LINES,
  arcDrop = 0.059,
  arcTilt = 7,
  tweaks = DEFAULT_TWEAKS,
  poke = true,
  duration = 0.6,
  stagger = 0.025,
  delay = 0.3,
  trigger = 'view',
  start = 'top 75%',
  scroller,
  tracking = -0.015,
  lineHeight = 0.73,
  as: Tag = 'h1',
  className = '',
  style,
}: ArcPokeTextProps) {
  const rootRef = useRef<HTMLHeadingElement>(null)
  const charRefs = useRef<(HTMLSpanElement | null)[]>([])
  // index of each line's first letter across the whole headline
  const offsets = lines.map((_, li) => lines.slice(0, li).reduce((s, l) => s + [...l].length, 0))
  const total = lines.reduce((s, l) => s + [...l].length, 0)

  useGSAP(
    (_, contextSafe) => {
      const root = rootRef.current!
      gsap.set(root, {visibility: 'visible'})
      const chars = charRefs.current.slice(0, total).filter((c): c is HTMLSpanElement => !!c)
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        gsap.set(chars, {yPercent: 0})
        return
      }
      // ---- entrance: out of the clips, in random order ----
      gsap.set(chars, {yPercent: 130})
      const reveal = gsap.to(shuffle(chars), {yPercent: 0, duration, stagger, delay, ease: 'power3.out', paused: true})
      if (trigger === 'mount') reveal.play()
      else ScrollTrigger.create({trigger: root, start, scroller, once: true, onEnter: () => reveal.play()})

      if (!poke || !contextSafe) return
      const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
      // ---- the poke ----
      const index = new Map(chars.map((c, i) => [c, i]))
      const ready = new Set<HTMLSpanElement>()
      let centres: {x: number; y: number}[] = []
      let size = 16
      let measured = false
      let pointer: {x: number; y: number} | null = null
      let frame = 0
      let tapTimer = 0
      const apply = contextSafe(() => {
        frame = 0
        if (!pointer) return
        // only letters that have finished their entrance join in
        for (const c of chars)
          if (!ready.has(c) && !gsap.isTweening(c) && gsap.getProperty(c, 'yPercent') === 0) {
            ready.add(c)
            c.parentElement!.style.overflow = 'visible'
          }
        if (!ready.size) return
        const box = root.getBoundingClientRect()
        if (!measured) {
          size = parseFloat(getComputedStyle(root).fontSize) || 16
          centres = chars.map((c) => {
            const r = c.parentElement!.getBoundingClientRect()
            return {x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2}
          })
          measured = true
        }
        const px = pointer.x - box.left
        const py = pointer.y - box.top
        const reach = 0.8 * size
        const pull = (i: number) => {
          const t = clamp(1 - Math.hypot(px - centres[i].x, py - centres[i].y) / reach, 0, 1)
          return t * t * (3 - 2 * t)
        }
        gsap.to([...ready], {
          y: (_i: number, c: HTMLSpanElement) => -0.08 * size * pull(index.get(c)!),
          rotate: (_i: number, c: HTMLSpanElement) => {
            const i = index.get(c)!
            return -11 * pull(i) * clamp((px - centres[i].x) / (0.5 * reach), -1, 1)
          },
          scale: (_i: number, c: HTMLSpanElement) => 1 + 0.08 * pull(index.get(c)!),
          transformOrigin: '50% 100%',
          duration: 0.45,
          ease: 'power3.out',
          overwrite: 'auto',
        })
      })
      const release = contextSafe(() => {
        pointer = null
        if (!ready.size) return
        gsap.to([...ready], {
          y: 0,
          rotate: 0,
          scale: 1,
          duration: 0.9,
          ease: 'elastic.out(1, 0.45)',
          stagger: {each: 0.014, from: 'center'},
          overwrite: 'auto',
          onComplete: () => {
            measured = false
            ready.forEach((c) => (c.parentElement!.style.overflow = ''))
            ready.clear()
          },
        })
      })
      const onMove = (e: PointerEvent) => {
        pointer = {x: e.clientX, y: e.clientY}
        if (!frame) frame = requestAnimationFrame(apply)
      }
      const onTap = (e: PointerEvent) => {
        pointer = {x: e.clientX, y: e.clientY}
        apply()
        clearTimeout(tapTimer)
        tapTimer = window.setTimeout(release, 350)
      }
      const onResize = () => (measured = false)
      if (fine) {
        root.addEventListener('pointermove', onMove)
        root.addEventListener('pointerleave', release)
      } else root.addEventListener('pointerdown', onTap)
      window.addEventListener('resize', onResize)
      return () => {
        cancelAnimationFrame(frame)
        clearTimeout(tapTimer)
        root.removeEventListener('pointermove', onMove)
        root.removeEventListener('pointerleave', release)
        root.removeEventListener('pointerdown', onTap)
        window.removeEventListener('resize', onResize)
      }
    },
    {scope: rootRef, dependencies: [total, lines.join('\n'), poke, duration, stagger, delay, trigger, start, scroller], revertOnUpdate: true},
  )

  return (
    // hidden until the letters are tucked into their clips, so nothing flashes on load
    <Tag ref={rootRef} aria-label={lines.join(' ')} className={`m-0 ${className}`} style={{lineHeight, ...style, visibility: 'hidden'}}>
      {lines.map((line, li) => {
        const letters = [...line]
        return (
          <span key={li} aria-hidden className="flex items-end justify-center">
            {letters.map((ch, i) => {
              const u = letters.length > 1 ? (2 * i) / (letters.length - 1) - 1 : 0
              const n = offsets[li] + i
              const tw = tweaks[`${li}:${i}`] ?? {}
              return (
                <span
                  key={i}
                  className="block flex-none overflow-hidden"
                  style={{
                    // room on every side so a glyph never clips: the tight line height leaves its
                    // foot below the box, and a lean or a poke swings the corners out
                    margin: `-0.2em ${(-0.12 + tracking / 2).toFixed(3)}em -0.12em`,
                    padding: '0.2em 0.12em 0.12em',
                    transformOrigin: '50% 100%',
                    transform: `translate(${tw.dx ?? 0}em, ${(arcDrop * (1 - u * u) + (tw.dy ?? 0)).toFixed(4)}em) rotate(${(-arcTilt * u + (tw.dr ?? 0)).toFixed(3)}deg)`,
                  }}
                >
                  <span ref={(el) => void (charRefs.current[n] = el)} className="block">
                    {ch === ' ' ? ' ' : ch}
                  </span>
                </span>
              )
            })}
          </span>
        )
      })}
    </Tag>
  )
}
