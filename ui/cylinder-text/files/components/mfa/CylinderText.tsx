'use client'

import {useRef} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type CylinderTextProps = {
  lines?: string[]
  /** degrees between neighbouring lines on the drum */
  step?: number
  /** pixels of scroll per line */
  distance?: number
  /** hold the drum in place while it turns */
  pin?: boolean
  /** the scrolling element, when it isn't the window */
  scroller?: Element | string
  /** classes for the block: font, size, colour */
  className?: string
}

// Lines sit around a horizontal drum that the scroll turns: each line rises
// from below, faces you as it crosses the middle, and tips away over the top.
// The drum's radius comes from the rendered line height, so neighbouring
// lines always just touch at the front.
export default function CylinderText({
  lines = [
    'Purpose is',
    'when work',
    'feels like',
    'playing',
    'every day',
    'with ideas',
    'that keep',
    'moving you',
    'forward',
  ],
  step = 18,
  distance = 110,
  pin = true,
  scroller,
  className = '',
}: CylinderTextProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<(HTMLDivElement | null)[]>([])

  useGSAP(
    () => {
      const root = rootRef.current!
      const els = linesRef.current.slice(0, lines.length).filter((el) => el !== null)
      gsap.set(root, {visibility: 'visible'})

      // Reduced motion: a plain, readable stack.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(root, {height: 'auto'})
        gsap.set(els, {position: 'static', yPercent: 0})
        return
      }

      const rad = (d: number) => (d * Math.PI) / 180
      let radius = 0
      // Radius from the line height: neighbours touch at the front. The block
      // is as tall as the visible half of the drum.
      const measure = () => {
        radius = els[0].offsetHeight / (2 * Math.tan(rad(step / 2)))
        root.style.height = `${radius * 2 * 0.92}px`
      }
      measure()

      const drum = {angle: 0}
      const render = () =>
        els.forEach((el, i) => {
          const rel = drum.angle - i * step
          const facing = Math.cos(rad(rel))
          // Push the drum back by its radius so the front line is at true size.
          el.style.transform = `translateY(-50%) translateZ(${-radius}px) rotateX(${rel}deg) translateZ(${radius}px)`
          // Fades out before the edge, and is fully gone by the time it tips past 90°.
          el.style.opacity = String(Math.min(1, Math.max(0, (facing - 0.1) / 0.6)))
          el.style.visibility = facing > 0 ? 'visible' : 'hidden'
        })

      // Start with every line turned away below and end with every line
      // turned away over the top: before and after the pin nothing shows,
      // so no tilted line drifts along with the page.
      const lead = 90
      gsap.fromTo(
        drum,
        {angle: -lead},
        {
          angle: (lines.length - 1) * step + lead,
          ease: 'none',
          onUpdate: render,
          scrollTrigger: {
            trigger: root,
            start: pin ? 'center center' : 'top bottom',
            end: () => `+=${lines.length * distance}`,
            scrub: 0.6,
            pin,
            scroller,
          },
        },
      )
      render()

      ScrollTrigger.addEventListener('refreshInit', measure)
      return () => ScrollTrigger.removeEventListener('refreshInit', measure)
    },
    {scope: rootRef, dependencies: [lines.join('\n'), step, distance, pin, scroller], revertOnUpdate: true},
  )

  return (
    <div
      ref={rootRef}
      className={`relative overflow-hidden perspective-[1400px] ${className}`}
      style={{visibility: 'hidden'}}
    >
      <span className="sr-only">{lines.join(' ')}</span>
      {lines.map((line, i) => (
        <div
          key={`${line}-${i}`}
          aria-hidden
          ref={(el) => {
            linesRef.current[i] = el
          }}
          className="absolute inset-x-0 top-1/2 text-center whitespace-nowrap backface-hidden"
        >
          {line}
        </div>
      ))}
    </div>
  )
}
