'use client'

import {useEffect, useRef} from 'react'

export type SilkCursorTrailProps = {
  /** points in the trail; more = a longer tail */
  length?: number
  /** stroke width at the head and at the tail, in px */
  headWidth?: number
  tailWidth?: number
  /** colours at the head and the tail (any CSS colour) */
  headColor?: string
  tailColor?: string
  /** 0–1: how loosely the trail follows; higher = slower, silkier */
  smoothing?: number
  /** soft glow around the trail, in px; 0 = none */
  glow?: number
  /** cover the whole viewport (default) or only the parent element */
  fixed?: boolean
  className?: string
}

// A ribbon that follows the pointer like a silk thread: the head eases
// toward the pointer and every point eases toward the one ahead of it, so
// the trail bends smoothly, tapers from head to tail and gathers back into
// the head when the pointer rests. Drawing stops once it has settled.
export default function SilkCursorTrail({
  length = 48,
  headWidth = 6,
  tailWidth = 0.6,
  headColor = '#ff8a3d',
  tailColor = '#ff3d81',
  smoothing = 0.55,
  glow = 10,
  fixed = true,
  className = '',
}: SilkCursorTrailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const head = parseColor(headColor)
    const tail = parseColor(tailColor)
    const points = Array.from({length}, () => ({x: 0, y: 0}))
    const pointer = {x: 0, y: 0}
    let started = false
    let raf = 0
    let last = 0
    let rect = canvas.getBoundingClientRect()
    let dpr = 1

    const resize = () => {
      rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(rect.width * dpr)
      canvas.height = Math.round(rect.height * dpr)
    }
    resize()

    const frame = (now: number) => {
      raf = 0
      // Frame-rate independent easing: the same feel at 60 and 120 Hz.
      const dt = last ? Math.min((now - last) / 16.67, 3) : 1
      last = now
      const lead = 1 - Math.pow(smoothing * 0.6, dt)
      const follow = 1 - Math.pow(smoothing * 0.75, dt)

      points[0].x += (pointer.x - points[0].x) * lead
      points[0].y += (pointer.y - points[0].y) * lead
      let spread = 0
      for (let i = 1; i < length; i++) {
        const p = points[i]
        const q = points[i - 1]
        p.x += (q.x - p.x) * follow
        p.y += (q.y - p.y) * follow
        spread += Math.abs(q.x - p.x) + Math.abs(q.y - p.y)
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, rect.width, rect.height)
      ctx.lineCap = 'round'
      // Segments between midpoints, bent through each point: a smooth curve.
      for (let i = 1; i < length - 1; i++) {
        const t = i / (length - 1)
        const a = points[i - 1]
        const b = points[i]
        const c = points[i + 1]
        ctx.beginPath()
        ctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2)
        ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2)
        ctx.lineWidth = headWidth + (tailWidth - headWidth) * t
        ctx.strokeStyle = mix(head, tail, t)
        ctx.stroke()
      }

      const moving = spread > 0.5 || Math.abs(pointer.x - points[0].x) + Math.abs(pointer.y - points[0].y) > 0.5
      if (moving) raf = requestAnimationFrame(frame)
      else {
        ctx.clearRect(0, 0, rect.width, rect.height)
        last = 0
      }
    }

    const onMove = (e: PointerEvent) => {
      pointer.x = e.clientX - rect.left
      pointer.y = e.clientY - rect.top
      // The first move puts the whole trail under the pointer, not at 0,0.
      if (!started) {
        started = true
        points.forEach((p) => Object.assign(p, pointer))
      }
      if (!raf) raf = requestAnimationFrame(frame)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    // The canvas moves with the page when it isn't fixed.
    const onScroll = () => (rect = canvas.getBoundingClientRect())
    window.addEventListener('pointermove', onMove, {passive: true})
    window.addEventListener('scroll', onScroll, {passive: true, capture: true})
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('scroll', onScroll, {capture: true})
    }
  }, [length, headWidth, tailWidth, headColor, tailColor, smoothing])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={`pointer-events-none inset-0 z-50 block h-full w-full ${fixed ? 'fixed' : 'absolute'} ${className}`}
      // One GPU pass for the glow, instead of a canvas shadow on every segment.
      style={glow ? {filter: `drop-shadow(0 0 ${glow}px ${headColor})`} : undefined}
    />
  )
}

type RGBA = [number, number, number, number]

// Any CSS colour → RGBA, through a 1×1 canvas.
function parseColor(color: string): RGBA {
  const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently: true})!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
  return [r, g, b, a / 255]
}

const mix = (a: RGBA, b: RGBA, t: number) =>
  `rgba(${a.map((v, i) => (i < 3 ? Math.round(v + (b[i] - v) * t) : v + (b[i] - v) * t)).join(',')})`
