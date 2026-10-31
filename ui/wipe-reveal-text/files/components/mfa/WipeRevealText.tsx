'use client'

import {useRef, type ReactNode, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {CustomEase} from 'gsap/CustomEase'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import {SplitText} from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, CustomEase, ScrollTrigger, SplitText)

export type WipeRevealTextProps = {
  children?: ReactNode
  /** colour of the sweeping bar (defaults to the text colour) */
  barColor?: string
  /** first line indent, any CSS length (e.g. '30%', '4em') */
  indent?: string
  /** seconds for the bar to cross a line (and again to uncover it) */
  step?: number
  /** seconds after the bar starts before the text starts to show */
  reveal?: number
  /** seconds between lines */
  stagger?: number
  /** seconds before the first line */
  delay?: number
  /** 'view' plays when it scrolls into view; 'mount' at once */
  trigger?: 'view' | 'mount'
  /** ScrollTrigger start */
  start?: string
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'p' | 'h1' | 'h2' | 'div'
  className?: string
}

// slow out of the gate, fast through the middle, a long soft landing
const WIPE = CustomEase.create('mfa-wipe', 'M0,0 C0.92,0.09 0.13,0.97 1,1')

// Each line is uncovered by a solid bar: the bar sweeps across the line,
// and before it has finished its tail starts after it, and the words come
// out from behind the tail. Lines follow one another. The bar covers the
// letters' body (from 0.268em down), so it reads as ink rather than a box.
//
// Lines are found after layout (SplitText, re-split on resize and font
// load); each gets a clipped text span and a bar, both driven by two
// custom properties, --wipe-lead and --wipe-trail.
export default function WipeRevealText({
  children = "We back the people who rebuild how homes are insured, owned and cared for — with capital, a seasoned bench and the patience to see the hard problems through.",
  barColor = 'currentColor',
  indent = '0',
  step = 0.5,
  reveal = 0.44,
  stagger = 0.1,
  delay = 0.3,
  trigger = 'view',
  start = 'top 65%',
  scroller,
  as: Tag = 'p',
  className = '',
}: WipeRevealTextProps) {
  const rootRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const root = rootRef.current!
      gsap.set(root, {visibility: 'visible'})
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      let played = false
      SplitText.create(root, {
        type: 'lines',
        autoSplit: true,
        onSplit: (self) => {
          const lines = self.lines as HTMLElement[]
          lines.forEach((line, i) => {
            const text = document.createElement('span')
            text.style.cssText = 'display:block;clip-path:inset(-0.25em calc(100% - var(--wipe-trail)*100% - var(--wipe-trail)*.08em) -0.25em 0)'
            text.append(...line.childNodes)
            const bar = document.createElement('span')
            bar.setAttribute('aria-hidden', 'true')
            bar.style.cssText = `position:absolute;inset:0.268em 0 0;background:${barColor};clip-path:inset(0 calc(100% - var(--wipe-lead)*100%) 0 calc(var(--wipe-trail)*100%))`
            // the root keeps its text-indent so every split measures the first line short; the
            // lines drop it and the first one takes the indent as a margin instead
            line.style.cssText += ';position:relative;width:fit-content;white-space:nowrap;text-indent:0;--wipe-lead:0;--wipe-trail:0'
            if (i === 0) line.style.marginLeft = indent
            line.append(text, bar)
          })
          const tl = gsap.timeline({paused: true, delay})
          lines.forEach((line, i) => {
            const at = i * stagger
            tl.fromTo(line, {'--wipe-lead': 0}, {'--wipe-lead': 1, duration: step, ease: WIPE}, at)
            tl.fromTo(line, {'--wipe-trail': 0}, {'--wipe-trail': 1, duration: step, ease: WIPE}, at + reveal)
          })
          // a re-split after it has played shows the finished state
          if (played) tl.progress(1)
          else if (trigger === 'mount') {
            played = true
            tl.play()
          } else
            ScrollTrigger.create({
              trigger: root,
              start,
              scroller,
              once: true,
              onEnter: () => {
                played = true
                tl.play()
              },
            })
          return tl
        },
      })
    },
    {scope: rootRef, dependencies: [barColor, indent, step, reveal, stagger, delay, trigger, start, scroller], revertOnUpdate: true},
  )

  return (
    // hidden until split, so the unsplit text never flashes on load
    <Tag ref={rootRef as RefObject<never>} className={className} style={{visibility: 'hidden', textIndent: indent}}>
      {children}
    </Tag>
  )
}
