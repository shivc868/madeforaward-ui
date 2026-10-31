'use client'

import {useEffect, useRef} from 'react'
import {acquireStage, releaseStage} from './stage'

// A 4-point sparkle with softened tips (a bevel can't follow a knife-sharp
// point), used when no `svg` is given.
const SPARKLE =
  '<svg viewBox="0 0 24 24"><path d="M11.4 3.2C11.6 2.6 12.4 2.6 12.6 3.2C13.6 8.4 15.6 10.4 20.8 11.4C21.4 11.6 21.4 12.4 20.8 12.6C15.6 13.6 13.6 15.6 12.6 20.8C12.4 21.4 11.6 21.4 11.4 20.8C10.4 15.6 8.4 13.6 3.2 12.6C2.6 12.4 2.6 11.6 3.2 11.4C8.4 10.4 10.4 8.4 11.4 3.2Z"/></svg>'

export type PuffyIconProps = {
  /** an SVG string with filled paths (stroke-only icons have nothing to extrude) */
  svg?: string
  /** the tile */
  color?: string
  /** the raised icon */
  iconColor?: string
  /** outline from 0 = square to 1 = circle */
  roundness?: number
  /** tile thickness as a share of its width */
  puff?: number
  /** icon width as a share of the tile */
  iconScale?: number
  /** how far the icon stands out of the tile */
  iconDepth?: number
  /** resting angle in degrees, [x, y] */
  rest?: [number, number]
  /** how far the tile leans toward the pointer, in degrees; 0 = still */
  tilt?: number
  className?: string
}

export default function PuffyIcon({
  svg = SPARKLE,
  color = '#ffffff',
  iconColor = '#111111',
  roundness = 0.3,
  puff = 0.33,
  iconScale = 0.58,
  iconDepth = 0.14,
  rest = [-8, -18],
  tilt = 14,
  className = '',
}: PuffyIconProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [restX, restY] = rest

  useEffect(() => {
    const root = rootRef.current
    const target = canvasRef.current?.getContext('2d')
    if (!root || !target) return

    const stage = acquireStage()
    const icon = stage.add({svg, color, iconColor, roundness, puff, iconScale, iconDepth}, target)
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const angle = {x: restX, y: restY}
    const goal = {x: restX, y: restY}
    let raf = 0
    let visible = false

    // Ease toward the goal, rendering only while the tile is still moving.
    const tick = () => {
      raf = 0
      angle.x += (goal.x - angle.x) * 0.12
      angle.y += (goal.y - angle.y) * 0.12
      stage.draw(icon, angle.x, angle.y)
      if (Math.abs(goal.x - angle.x) + Math.abs(goal.y - angle.y) > 0.01) raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (!raf && visible) raf = requestAnimationFrame(tick)
    }

    const ro = new ResizeObserver(() => {
      icon.pixels = Math.round(root.clientWidth * Math.min(window.devicePixelRatio || 1, 2))
      stage.draw(icon, angle.x, angle.y)
    })
    ro.observe(root)

    // Offscreen tiles skip their frames.
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)

    // Lean toward the pointer, measured from the tile's centre.
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      const dx = Math.max(-1, Math.min(1, (e.clientX - r.left - r.width / 2) / (window.innerWidth / 2)))
      const dy = Math.max(-1, Math.min(1, (e.clientY - r.top - r.height / 2) / (window.innerHeight / 2)))
      goal.x = restX + dy * tilt
      goal.y = restY + dx * tilt
      wake()
    }
    if (tilt && !still) window.addEventListener('pointermove', onMove)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
      io.disconnect()
      ro.disconnect()
      stage.remove(icon)
      releaseStage()
    }
  }, [svg, color, iconColor, roundness, puff, iconScale, iconDepth, restX, restY, tilt])

  return (
    <div ref={rootRef} className={`relative aspect-square w-full ${className}`}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
    </div>
  )
}
