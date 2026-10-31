'use client'

import {useEffect, useRef} from 'react'

export type FocusLensImageProps = {
  /** the image; any URL or imported asset path */
  src?: string
  alt?: string
  /** blur of the image outside the lens, in px */
  blur?: number
  /** lens size in px */
  lensWidth?: number
  lensHeight?: number
  /** 0–1: how far the lens trails the pointer; 0 = glued to it */
  smoothing?: number
  /** colour of the lens frame and crosshair; 'transparent' hides the frame */
  frameColor?: string
  crosshair?: boolean
  className?: string
}

// A blurred image with a sharp window that follows the pointer. The window
// is a clipped box holding a second, sharp copy of the image, shifted the
// opposite way so it always lines up with the blurred one beneath: the lens
// only moves, it never has to redraw anything.
export default function FocusLensImage({
  src = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=2000&q=80',
  alt = '',
  blur = 12,
  lensWidth = 288,
  lensHeight = 360,
  smoothing = 0.85,
  frameColor = 'rgba(255,255,255,0.7)',
  crosshair = true,
  className = '',
}: FocusLensImageProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const lensRef = useRef<HTMLDivElement>(null)
  const sharpRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const lens = lensRef.current
    const sharp = sharpRef.current
    if (!root || !lens || !sharp) return

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const pos = {x: 0, y: 0}
    const target = {x: 0, y: 0}
    let moved = false
    let raf = 0
    let last = 0

    const place = () => {
      const x = pos.x - lensWidth / 2
      const y = pos.y - lensHeight / 2
      lens.style.transform = `translate3d(${x}px, ${y}px, 0)`
      sharp.style.transform = `translate3d(${-x}px, ${-y}px, 0)`
    }

    const frame = (now: number) => {
      raf = 0
      // Frame-rate independent easing: the same trail at 60 and 120 Hz.
      const dt = last ? Math.min((now - last) / 16.67, 3) : 1
      last = now
      const k = still ? 1 : 1 - Math.pow(smoothing, dt)
      pos.x += (target.x - pos.x) * k
      pos.y += (target.y - pos.y) * k
      place()
      if (Math.abs(target.x - pos.x) + Math.abs(target.y - pos.y) > 0.1) raf = requestAnimationFrame(frame)
      else last = 0
    }

    // The sharp copy matches the root's size; until the pointer arrives the lens sits in the middle.
    const ro = new ResizeObserver(() => {
      sharp.style.width = `${root.clientWidth}px`
      sharp.style.height = `${root.clientHeight}px`
      if (!moved) {
        pos.x = target.x = root.clientWidth / 2
        pos.y = target.y = root.clientHeight / 2
      }
      place()
    })
    ro.observe(root)

    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      target.x = e.clientX - r.left
      target.y = e.clientY - r.top
      moved = true
      if (!raf) raf = requestAnimationFrame(frame)
    }
    root.addEventListener('pointermove', onMove, {passive: true})
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      root.removeEventListener('pointermove', onMove)
    }
  }, [lensWidth, lensHeight, smoothing])

  return (
    <div ref={rootRef} className={`relative h-full w-full touch-pan-y overflow-hidden bg-black ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} draggable={false} className="absolute inset-0 h-full w-full object-cover select-none" style={{filter: `blur(${blur}px)`}} />
      <div
        ref={lensRef}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 overflow-hidden will-change-transform"
        style={{width: lensWidth, height: lensHeight}}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img ref={sharpRef} src={src} alt="" draggable={false} className="absolute top-0 left-0 max-w-none object-cover select-none will-change-transform" />
        {/* The frame sits on top as its own layer: a border on the lens would shift the sharp copy. */}
        <span className="absolute inset-0 border" style={{borderColor: frameColor}} />
        {crosshair && (
          <span className="absolute top-1/2 left-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2">
            <span className="absolute top-1/2 left-0 h-px w-full -translate-y-1/2" style={{background: frameColor}} />
            <span className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2" style={{background: frameColor}} />
          </span>
        )}
      </div>
    </div>
  )
}
