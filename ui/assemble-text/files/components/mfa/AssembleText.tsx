'use client'

import {useRef, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type AssembleTextProps = {
  text?: string
  /** seconds until every character is in */
  duration?: number
  /** 'view' waits until the text scrolls into view; 'mount' starts at once */
  trigger?: 'view' | 'mount'
  /** ScrollTrigger start, e.g. 'top 85%' */
  start?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div'
  className?: string
}

// Characters arrive one by one in random order. A character that hasn't
// arrived takes no space, so the visible ones sit packed together and the
// text reflows into place as it fills in.
//
// The animated copy is laid over an invisible copy of the full text: the
// block keeps its final size from the start (nothing below it jumps), and
// screen readers and search engines read the real text.
export default function AssembleText({
  text = 'Good motion is never decoration. It guides the eye, sets the pace and tells people where to look next.',
  duration = 2.4,
  trigger = 'view',
  start = 'top 85%',
  scroller,
  as: Tag = 'p',
  className = '',
}: AssembleTextProps) {
  const rootRef = useRef<HTMLElement>(null)
  const charsRef = useRef<(HTMLSpanElement | null)[]>([])
  const chars = Array.from(text)

  useGSAP(
    () => {
      const els = charsRef.current.slice(0, chars.length).filter((el) => el !== null)
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(els, {display: 'inline'})
        return
      }
      const tl = gsap.timeline({paused: true})
      const order = gsap.utils.shuffle([...els])
      order.forEach((el, i) => tl.set(el, {display: 'inline'}, (i / order.length) * duration))

      if (trigger === 'mount') tl.play()
      else ScrollTrigger.create({trigger: rootRef.current, start, scroller, once: true, onEnter: () => tl.play()})
    },
    // Reverting on change hides every character again, so a new duration replays from empty.
    {scope: rootRef, dependencies: [text, duration, trigger, start, scroller], revertOnUpdate: true},
  )

  return (
    <Tag ref={rootRef as RefObject<never>} className={`relative ${className}`}>
      <span className="invisible">{text}</span>
      <span aria-hidden className="absolute inset-0">
        {chars.map((c, i) => (
          <span
            key={`${text}-${i}`}
            ref={(el) => {
              charsRef.current[i] = el
            }}
            style={{display: 'none'}}
          >
            {c}
          </span>
        ))}
      </span>
    </Tag>
  )
}
