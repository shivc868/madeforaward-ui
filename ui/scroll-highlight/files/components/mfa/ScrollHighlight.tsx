'use client'

import {useRef, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type ScrollHighlightProps = {
  text?: string
  /** opacity of words not yet reached */
  dim?: number
  /** blur in px on words not yet reached; 0 = none */
  blur?: number
  /** ScrollTrigger start and end of the read-through */
  start?: string
  end?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div'
  className?: string
}

// The paragraph is read in by the scroll: words light up one after another
// as it moves through the viewport, and dim again when scrolling back.
export default function ScrollHighlight({
  text = 'We build interfaces that feel inevitable. Fewer decisions for the people using them, more care in every one we make on their behalf.',
  dim = 0.15,
  blur = 0,
  start = 'top 80%',
  end = 'bottom 45%',
  scroller,
  as: Tag = 'p',
  className = '',
}: ScrollHighlightProps) {
  const rootRef = useRef<HTMLElement>(null)
  const wordsRef = useRef<(HTMLSpanElement | null)[]>([])
  const words = text.split(/\s+/).filter(Boolean)

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      // A filter on every word costs paint time, so it is only set when asked for.
      const blurred = blur > 0
      gsap.fromTo(
        wordsRef.current.slice(0, words.length),
        {opacity: dim, ...(blurred && {filter: `blur(${blur}px)`})},
        {
          opacity: 1,
          ...(blurred && {filter: 'blur(0px)'}),
          ease: 'none',
          stagger: 0.1,
          scrollTrigger: {trigger: rootRef.current, start, end, scroller, scrub: true},
        },
      )
    },
    {scope: rootRef, dependencies: [text, dim, blur, start, end, scroller], revertOnUpdate: true},
  )

  return (
    <Tag ref={rootRef as RefObject<never>} className={className}>
      {words.map((w, i) => (
        <span
          key={`${text}-${i}`}
          ref={(el) => {
            wordsRef.current[i] = el
          }}
        >
          {w}
          {i < words.length - 1 && ' '}
        </span>
      ))}
    </Tag>
  )
}
