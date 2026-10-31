'use client'

import {useRef, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type ScrambleTextProps = {
  text?: string
  /** seconds for the whole text to resolve */
  duration?: number
  /** share of the text that is scrambling at once, ahead of the resolved part */
  spread?: number
  /** glyphs used while scrambling */
  glyphs?: string
  /** 'view' plays once in view, 'mount' at once, 'hover' only on hover */
  trigger?: 'view' | 'mount' | 'hover'
  /** replay on hover after the first play */
  replayOnHover?: boolean
  /** ScrollTrigger start, e.g. 'top 85%' */
  start?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div' | 'span'
  className?: string
}

// The text resolves left to right. Ahead of the resolved part runs a band of
// random glyphs; past it, characters wait invisible. Every character keeps
// its own span holding the final glyph while hidden, so the block has its
// final size and line breaks from the start.
export default function ScrambleText({
  text = 'Signal over noise. Every detail earns its place.',
  duration = 1.4,
  spread = 0.3,
  glyphs = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=<>/\\',
  trigger = 'view',
  replayOnHover = true,
  start = 'top 85%',
  scroller,
  as: Tag = 'p',
  className = '',
}: ScrambleTextProps) {
  const rootRef = useRef<HTMLElement>(null)
  const charsRef = useRef<(HTMLSpanElement | null)[]>([])
  const tweenRef = useRef<gsap.core.Tween | null>(null)
  const chars = Array.from(text)
  const still = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const play = () => {
    const els = charsRef.current.slice(0, chars.length)
    const state = {p: 0}
    let last = 0
    tweenRef.current?.kill()
    tweenRef.current = gsap.to(state, {
      p: 1,
      duration,
      ease: 'none',
      onUpdate: () => {
        // ~20 glyph changes a second reads as scrambling, not flicker.
        const now = gsap.ticker.time
        const reshuffle = now - last > 0.05
        if (reshuffle) last = now
        const head = state.p * (1 + spread)
        els.forEach((el, i) => {
          if (!el) return
          const at = i / chars.length
          if (head >= at + spread || chars[i] === ' ') {
            el.textContent = chars[i]
            el.style.opacity = head >= at ? '1' : '0'
          } else if (head >= at) {
            if (reshuffle) {
              // Same case as the real character, so the line width barely moves.
              const g = glyphs[Math.floor(Math.random() * glyphs.length)]
              el.textContent = chars[i] === chars[i].toUpperCase() ? g : g.toLowerCase()
            }
            el.style.opacity = '0.6'
          } else {
            el.style.opacity = '0'
          }
        })
      },
    })
  }

  useGSAP(
    () => {
      if (!still() && trigger !== 'hover') {
        // Hidden until played; reverted (shown again) when the props change.
        gsap.set(charsRef.current.slice(0, chars.length), {opacity: 0})
        if (trigger === 'mount') play()
        else ScrollTrigger.create({trigger: rootRef.current, start, scroller, once: true, onEnter: play})
      }
      return () => tweenRef.current?.kill()
    },
    {scope: rootRef, dependencies: [text, duration, spread, glyphs, trigger, start, scroller], revertOnUpdate: true},
  )

  const onEnter = () => {
    if (!still() && (trigger === 'hover' || replayOnHover)) play()
  }

  return (
    <Tag ref={rootRef as RefObject<never>} className={className} onMouseEnter={onEnter}>
      <span className="sr-only">{text}</span>
      {chars.map((c, i) => (
        <span
          key={`${text}-${i}`}
          aria-hidden
          ref={(el) => {
            charsRef.current[i] = el
          }}
        >
          {c}
        </span>
      ))}
    </Tag>
  )
}
