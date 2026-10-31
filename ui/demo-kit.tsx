'use client'

import {useEffect, useRef, useState, type ReactNode} from 'react'
import gsap from 'gsap'
import {ScrollTrigger} from 'gsap/ScrollTrigger'
import Lenis from 'lenis'

gsap.registerPlugin(ScrollTrigger)

// Shared pieces for the /ui demos (not part of any component's files).

// A smooth-scrolled area inside the preview box, for scroll-driven
// components: they get this element as their ScrollTrigger `scroller`. Its
// own Lenis runs on GSAP's ticker and updates ScrollTrigger on every scroll,
// so pins and scrubs move in the same frame as the content. (The page's
// Lenis keeps out: `data-lenis-prevent`.) A screen of space above and below
// lets the effect run from start to finish.
export function ScrollStage({children, hint = 'Scroll'}: {children: (scroller: HTMLElement) => ReactNode; hint?: string}) {
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scroller || !contentRef.current) return
    const lenis = new Lenis({wrapper: scroller, content: contentRef.current, lerp: 0.09})
    lenis.on('scroll', ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
    }
  }, [scroller])

  return (
    <div ref={setScroller} data-lenis-prevent className="h-full w-full overflow-y-auto overscroll-contain bg-[#0d0d0f] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div ref={contentRef}>
        <div className="flex h-[clamp(520px,80svh,860px)] items-center justify-center text-xs tracking-[0.18em] text-white/40 uppercase">
          {hint} ↓
        </div>
        {scroller && children(scroller)}
        <div className="h-[clamp(520px,80svh,860px)]" />
      </div>
    </div>
  )
}

export function ReplayButton({onClick}: {onClick: () => void}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute right-6 bottom-6 rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/70 transition-colors hover:border-white/35 hover:text-white"
    >
      Replay
    </button>
  )
}
