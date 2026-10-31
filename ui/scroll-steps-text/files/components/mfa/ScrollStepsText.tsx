'use client'

import {useEffect, useRef, useState} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import {SplitText} from 'gsap/SplitText'

gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText)

export type ScrollStepsTextProps = {
  /** the paragraphs, read one after another in the same place */
  paragraphs?: string[]
  /** the flash each letter lights up in before it settles */
  accent?: string
  /** settled text colour */
  ink?: string
  background?: string
  /** opacity of letters not yet read */
  dim?: number
  /** seconds a letter takes to settle from the accent to the ink */
  settle?: number
  /** section height in screens (the stage stays pinned through it) */
  length?: number
  /** the scrolling element, when it isn't the window */
  scroller?: HTMLElement | null
  className?: string
}

const PARAGRAPHS = [
  'Live data from every site: sensors, meters and machines, gathered and cleaned in one place.',
  'Remote control of physical equipment: scheduling, early fault warnings, tuning and integration.',
  'Clear reports for every team: trends, alerts and the numbers that matter, ready to share.',
]

// A pinned scroll section that reads its text to you: letter by letter, as
// you scroll, each one brightens from faint to full, flashing in the accent
// colour the moment it lights and settling to the ink over a second, so a
// soft coloured wake trails the reading point. Several paragraphs take
// turns in the same place; each new one rises in line by line.
export default function ScrollStepsText({
  paragraphs = PARAGRAPHS,
  accent = '#1800d1',
  ink = '#ffffff',
  background = '#292929',
  dim = 0.2,
  settle = 1,
  length = 7,
  scroller = null,
  className = '',
}: ScrollStepsTextProps) {
  const rootRef = useRef<HTMLElement>(null)
  const textRefs = useRef<HTMLParagraphElement[]>([])
  const [stageH, setStageH] = useState(0)
  const [active, setActive] = useState(0)

  // the stage is as tall as the scroller's viewport
  useEffect(() => {
    const measure = () => setStageH(scroller ? scroller.clientHeight : window.innerHeight)
    measure()
    const ro = new ResizeObserver(measure)
    if (scroller) ro.observe(scroller)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [scroller])

  useGSAP(
    () => {
      const texts = textRefs.current.slice(0, paragraphs.length)
      const n = texts.length
      let st: ScrollTrigger | null = null
      let split = 0
      const build = () => {
        st?.kill(true)
        const tl = gsap.timeline()
        texts.forEach((p, k) => {
          const chars = [...p.querySelectorAll<HTMLElement>('.char')]
          gsap.set(chars, {opacity: dim, color: ink})
          // each letter takes a tenth of its paragraph's stretch; together they fill it
          const step = chars.length > 1 ? 0.9 / (chars.length - 1) : 0
          chars.forEach((c, i) =>
            tl.to(
              c,
              {
                opacity: 1,
                duration: 0.1,
                onStart: () => {
                  gsap.killTweensOf(c, 'color')
                  gsap.set(c, {color: accent})
                  gsap.to(c, {color: ink, duration: settle, delay: 0.1})
                },
              },
              k + step * i,
            ),
          )
        })
        st = ScrollTrigger.create({
          trigger: rootRef.current,
          scroller: scroller ?? undefined,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          animation: tl,
          onUpdate: (self) => setActive(Math.min(n - 1, Math.floor(self.progress * n))),
        })
      }
      // re-split (and rebuild) on resize and once the font has loaded; build after the last one
      const splits = texts.map((p) =>
        SplitText.create(p, {
          type: 'lines,chars',
          mask: 'lines',
          linesClass: 'line',
          charsClass: 'char',
          autoSplit: true,
          onSplit: (self) => {
            self.lines.forEach((l, i) => (l as HTMLElement).style.setProperty('--index', String(i)))
            if (++split >= texts.length) build()
          },
        }),
      )
      return () => {
        st?.kill()
        splits.forEach((s) => s.revert())
      }
    },
    {scope: rootRef, dependencies: [paragraphs.join('\n'), accent, ink, dim, settle, scroller, stageH, length], revertOnUpdate: true},
  )

  return (
    <section ref={rootRef} className={`relative ${className}`} style={{height: stageH ? stageH * length : `${length * 100}svh`, background, color: ink}}>
      <div className="sticky top-0 flex items-center overflow-hidden px-[6%]" style={{height: stageH || '100svh'}}>
        <div className="grid w-full">
          {paragraphs.map((text, i) => (
            <p
              key={i}
              ref={(el) => {
                if (el) textRefs.current[i] = el
              }}
              data-active={i === active || undefined}
              aria-hidden={i !== active}
              className="col-start-1 row-start-1 max-w-[20em] text-[clamp(2.5rem,1.86rem+1.63vw,5rem)] leading-[1.1] opacity-0 data-active:opacity-100 [&_.line]:translate-y-[110%] [&_.line]:[transition:transform_1s_cubic-bezier(.19,1,.22,1)] data-active:[&_.line]:translate-y-0 data-active:[&_.line]:[transition-delay:calc(var(--index)*75ms)]"
            >
              {text}
            </p>
          ))}
        </div>
      </div>
    </section>
  )
}
