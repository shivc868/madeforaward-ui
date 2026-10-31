'use client'

import {useRef, type ReactNode, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import {SplitText} from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)

export type BlurRiseTextProps = {
  children?: ReactNode
  /** seconds per character */
  duration?: number
  /** seconds spread across all characters */
  stagger?: number
  /** which characters go first */
  from?: 'edges' | 'center' | 'start' | 'end' | 'random'
  /** how far below each character starts, in em */
  distance?: number
  /** starting blur, in em */
  blur?: number
  /** 'view' waits until the text scrolls into view; 'mount' starts at once */
  trigger?: 'view' | 'mount'
  /** ScrollTrigger start, e.g. 'top 90%' */
  start?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'p' | 'h1' | 'h2' | 'h3' | 'div'
  className?: string
}

// Characters rise out of a heavy blur and settle in, staggered from the
// edges inward on a long expo ease, so the word sharpens from its outer
// letters to its centre. Distance and blur are in em, so the motion keeps
// its proportions at any font size.
//
// With trigger 'view' it plays once, when the text reaches `start`; text
// that is already on screen when the page loads (a hero, a header) plays
// straight away.
export default function BlurRiseText({
  children = 'AFTERGLOW',
  duration = 1.5,
  stagger = 0.2,
  from = 'edges',
  distance = 1.5,
  blur = 0.25,
  trigger = 'view',
  start = 'top 90%',
  scroller,
  as: Tag = 'h2',
  className = '',
}: BlurRiseTextProps) {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current!
      gsap.set(root, {visibility: 'visible'})
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      const em = () => parseFloat(getComputedStyle(root).fontSize) || 16
      SplitText.create(root, {
        type: 'words,chars',
        autoSplit: true,
        // Returned so a re-split (resize, font load) keeps the progress.
        onSplit: (self) =>
          gsap.fromTo(
            self.chars,
            {y: () => distance * em(), filter: () => `blur(${blur * em()}px)`, opacity: 0, willChange: 'transform, filter'},
            {
              y: 0,
              filter: 'blur(0px)',
              opacity: 1,
              duration,
              ease: 'expo.out',
              stagger: {amount: stagger, from},
              clearProps: 'filter,willChange',
              scrollTrigger: trigger === 'view' ? {trigger: root, start, scroller, once: true} : undefined,
            },
          ),
      })
    },
    {scope: rootRef, dependencies: [duration, stagger, from, distance, blur, trigger, start, scroller], revertOnUpdate: true},
  )

  return (
    // Hidden until split, so the unsplit text never flashes on load.
    <Tag ref={rootRef as RefObject<never>} className={className} style={{visibility: 'hidden'}}>
      {children}
    </Tag>
  )
}
