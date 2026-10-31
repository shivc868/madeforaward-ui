'use client'

import {useRef, type ReactNode, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import {SplitText} from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)

export type MaskedLineRevealProps = {
  children?: ReactNode
  /** seconds per line */
  duration?: number
  /** seconds between lines */
  stagger?: number
  /** 'view' waits until the text scrolls into view; 'mount' starts at once */
  trigger?: 'view' | 'mount'
  /** ScrollTrigger start, e.g. 'top 85%' */
  start?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div'
  className?: string
}

// Each rendered line rises out of its own mask, one after another. Lines
// are measured after layout (SplitText) and re-measured when fonts load or
// the width changes, so the reveal always follows the real line breaks.
export default function MaskedLineReveal({
  children = 'Design is the quiet part of every great product. You only notice it when it is missing.',
  duration = 1.1,
  stagger = 0.1,
  trigger = 'view',
  start = 'top 85%',
  scroller,
  as: Tag = 'p',
  className = '',
}: MaskedLineRevealProps) {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current!
      gsap.set(root, {visibility: 'visible'})
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      SplitText.create(root, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        // Returned so a re-split (resize, font load) keeps the progress.
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration,
            stagger,
            ease: 'expo.out',
            scrollTrigger: trigger === 'view' ? {trigger: root, start, scroller, once: true} : undefined,
          }),
      })
    },
    {scope: rootRef, dependencies: [duration, stagger, trigger, start, scroller], revertOnUpdate: true},
  )

  return (
    // Hidden until split, so the unsplit text never flashes on load.
    <Tag ref={rootRef as RefObject<never>} className={className} style={{visibility: 'hidden'}}>
      {children}
    </Tag>
  )
}
