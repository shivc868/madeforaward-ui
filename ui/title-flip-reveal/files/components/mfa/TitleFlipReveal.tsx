'use client'

import {useRef, type RefObject} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {CustomEase} from 'gsap/CustomEase'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, CustomEase, ScrollTrigger)

export type TitleFlipRevealProps = {
  /** the headline, one entry per line */
  lines?: string[]
  /** the second headline it flips to */
  altLines?: string[]
  /** what flips it: a click (tap), hovering, or nothing */
  flipOn?: 'click' | 'hover' | 'none'
  /** seconds for each line to rise in */
  duration?: number
  /** seconds between lines */
  stagger?: number
  /** seconds before the first line */
  delay?: number
  /** the whole headline grows from this scale as the lines rise (1 = no zoom) */
  scaleFrom?: number
  /** seconds for that zoom */
  scaleDuration?: number
  /** 'view' plays each time it scrolls into view; 'mount' once at once */
  trigger?: 'view' | 'mount'
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  as?: 'h1' | 'h2' | 'div'
  className?: string
}

// fast out of the gate, a long soft landing
const REVEAL = CustomEase.create('mfa-title-reveal', '.4,0,0,1')
const FLIP = 2 // seconds for an incoming line in a flip

// lines lean in from alternate sides
const side = (i: number) => (i % 2 ? '-5%' : '5%')

// A big headline whose lines rise out of masks one after another, each
// sliding in from 5% to the side (alternating left and right), on a sharp
// ease that settles slowly, while the whole headline zooms up from 45% on
// a slow-fast-slow expo curve. A click swaps it for a second headline: line
// by line the old words drop back into their masks and, a beat later,
// the new ones rise in their place; click again to swap back.
export default function TitleFlipReveal({
  lines = ['Make it', 'move with', 'purpose'],
  altLines = ['Then', 'make it', 'sing'],
  flipOn = 'click',
  duration = 1,
  stagger = 0.115,
  delay = 0.115,
  scaleFrom = 0.45,
  scaleDuration = 0.8,
  trigger = 'view',
  scroller,
  as: Tag = 'h2',
  className = '',
}: TitleFlipRevealProps) {
  const rootRef = useRef<HTMLElement>(null)
  const zoomRef = useRef<HTMLSpanElement>(null)
  const maskRefs = useRef<HTMLSpanElement[]>([])
  const altMaskRefs = useRef<HTMLSpanElement[]>([])
  const lineRefs = useRef<HTMLSpanElement[]>([])
  const altLineRefs = useRef<HTMLSpanElement[]>([])

  useGSAP(
    (_, contextSafe) => {
      const root = rootRef.current!
      const masks = maskRefs.current.slice(0, lines.length)
      const altMasks = altMaskRefs.current.slice(0, altLines.length)
      const main = lineRefs.current.slice(0, lines.length)
      const alt = altLineRefs.current.slice(0, altLines.length)
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      gsap.set(root, {visibility: 'visible'})
      alt.forEach((el, i) => gsap.set(el, {y: '100%', x: side(i), force3D: true}))

      // the entrance: the headline zooms up while both layers' masks rise (the hidden layer's words stay tucked inside)
      const intro = gsap.timeline({paused: true})
      intro.fromTo(
        zoomRef.current,
        {scale: scaleFrom},
        {scale: 1, duration: scaleDuration, ease: 'expo.inOut', transformOrigin: '50% 50%', force3D: true},
        0,
      )
      ;[masks, altMasks].forEach((set) =>
        set.forEach((el, i) =>
          intro.fromTo(el, {y: '100%', x: side(i)}, {y: '0%', x: '0%', ease: REVEAL, duration, force3D: true}, delay + i * stagger),
        ),
      )
      if (still) intro.progress(1)
      else if (trigger === 'mount') intro.play()
      else
        ScrollTrigger.create({
          trigger: root,
          scroller,
          start: 'top bottom',
          onEnter: () => intro.restart(true),
          onLeaveBack: () => intro.pause(0),
        })

      let flipped = false
      let flip: gsap.core.Timeline | null = null
      const swap = contextSafe!((to: boolean) => {
        if (to === flipped) return
        flipped = to
        flip?.kill()
        const [out, into, outSide] = to ? [main, alt, side] : [alt, main, (i: number) => (i % 2 ? '5%' : '-5%')]
        const tl = gsap.timeline()
        const k = still ? 0 : 1
        out.forEach((el, i) =>
          tl.to(el, {y: '100%', x: outSide(i), ease: 'power4.inOut', duration: FLIP * 0.75 * k, force3D: true}, i * 0.115 * k),
        )
        into.forEach((el, i) =>
          tl.to(el, {y: '0%', x: '0%', ease: REVEAL, duration: FLIP * k, force3D: true}, (i * 0.1 + FLIP * 0.315) * k),
        )
        flip = tl
      })

      if (flipOn === 'none') return
      const click = () => swap(!flipped)
      const enter = () => swap(true)
      const leave = () => swap(false)
      if (flipOn === 'click') root.addEventListener('click', click)
      else {
        root.addEventListener('pointerenter', enter)
        root.addEventListener('pointerleave', leave)
      }
      return () => {
        root.removeEventListener('click', click)
        root.removeEventListener('pointerenter', enter)
        root.removeEventListener('pointerleave', leave)
      }
    },
    {
      scope: rootRef,
      dependencies: [lines.join('\n'), altLines.join('\n'), flipOn, duration, stagger, delay, scaleFrom, scaleDuration, trigger, scroller],
      revertOnUpdate: true,
    },
  )

  const layer = (words: string[], masksRef: RefObject<HTMLSpanElement[]>, wordsRef: RefObject<HTMLSpanElement[]>) =>
    words.map((word, i) => (
      // the outer span is the fixed mask; the middle one rises in on entrance; the inner one flips
      <span key={i} className="block overflow-hidden">
        <span
          ref={(el) => {
            if (el) masksRef.current[i] = el
          }}
          className="block overflow-hidden [backface-visibility:hidden]"
        >
          <span
            ref={(el) => {
              if (el) wordsRef.current[i] = el
            }}
            className="block [backface-visibility:hidden]"
          >
            {word}
          </span>
        </span>
      </span>
    ))

  return (
    <Tag
      ref={rootRef as RefObject<never>}
      aria-label={lines.join(' ')}
      className={`relative ${flipOn === 'click' ? 'cursor-pointer select-none' : ''} ${className}`}
      // hidden until the masks are set, so the words never flash in place on load
      style={{visibility: 'hidden'}}
    >
      <span ref={zoomRef} className="relative block">
        <span aria-hidden className="relative z-2 block [contain:paint]">
          {layer(lines, maskRefs, lineRefs)}
        </span>
        <span aria-hidden className="absolute top-1/2 left-1/2 block w-full -translate-x-1/2 -translate-y-1/2">
          {layer(altLines, altMaskRefs, altLineRefs)}
        </span>
      </span>
    </Tag>
  )
}
