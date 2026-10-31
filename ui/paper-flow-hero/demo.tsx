'use client'

import {useEffect, useRef, useState} from 'react'
import Lenis from 'lenis'
import type {UiDemoProps} from '@/ui'
import PaperFlowHero from './files/components/mfa/PaperFlowHero'

// The whole scene scrolls inside the preview box on its own Lenis.
export default function Demo({props}: UiDemoProps) {
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!scroller || !contentRef.current) return
    const lenis = new Lenis({wrapper: scroller, content: contentRef.current, lerp: 0.09})
    let raf = requestAnimationFrame(function tick(time) {
      lenis.raf(time)
      raf = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [scroller])

  return (
    <div ref={setScroller} data-lenis-prevent className="h-full w-full overflow-y-auto overscroll-contain text-[#141414] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div ref={contentRef}>
        {scroller && (
          <PaperFlowHero
            scroller={scroller}
            background={props.background as string}
          />
        )}
      </div>
    </div>
  )
}
