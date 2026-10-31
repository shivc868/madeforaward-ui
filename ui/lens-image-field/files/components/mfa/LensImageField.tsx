'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type LensImageFieldProps = {
  /** image URLs; any aspect ratio, each fits its grid cell */
  images?: string[]
  /** image cell size as a share of the box height */
  size?: number
  /** gap between cells as a share of the box height */
  gap?: number
  /** lens radius as a share of the box height (images outside it are hidden) */
  reach?: number
  /** how large the image right under the lens gets */
  magnify?: number
  /** drift speed of the grid, px per second (diagonal, up and to the right) */
  speed?: number
  /** how quickly the lens catches up with the pointer */
  follow?: number
  /** content under the field; anything marked data-lens-hide clears the images while hovered */
  children?: ReactNode
  background?: string
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=70&w=500&auto=format&fit=crop`
const DEFAULT_IMAGES = [
  'photo-1534528741775-53994a69daeb',
  'photo-1506905925346-21bda4d32df4',
  'photo-1517841905240-472988babdf9',
  'photo-1507525428034-b723cf961d3e',
  'photo-1524504388940-b1c1722653e1',
  'photo-1470770841072-f978cf4d019e',
  'photo-1531123897727-8f129e1688ce',
  'photo-1433086966358-54859d0ed716',
  'photo-1506794778202-cad84cf45f1d',
  'photo-1465146344425-f00d5f5c8f07',
  'photo-1492562080023-ab3db95bfbce',
  'photo-1447752875215-b2761acb3c5d',
  'photo-1500648767791-00dcc994a43e',
  'photo-1508214751196-bcfd4ca60f91',
  'photo-1521119989659-a83eee488004',
  'photo-1549068106-b024baf5062d',
  'photo-1441974231531-c6227db76b6e',
  'photo-1501785888041-af3ef285b470',
  'photo-1472214103451-9374bd1c798e',
  'photo-1500530855697-b586d89ba3ee',
].map(unsplash)

const quadInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - 2 * (1 - x) * (1 - x))
const wrap = (min: number, max: number, v: number) => {
  const r = max - min
  return ((((v - min) % r) + r) % r) + min
}

type Picture = {bitmap: CanvasImageSource; ratio: number}

// An endless grid of images drifting diagonally, invisible except around
// a lens that trails the pointer: the closer an image sits to the lens,
// the larger it is drawn (up to `magnify`× at the centre, gone at `reach`),
// so a cluster of pictures blooms wherever you look. On touch screens
// the lens orbits the box by itself.
//
// Only images inside the lens are drawn, from bitmaps pre-scaled to the
// largest size they can reach, so each frame is a handful of drawImage
// calls. Drift and follow are frame-rate independent; the field fades in
// when it comes into view and sleeps off screen.
export default function LensImageField({
  images = DEFAULT_IMAGES,
  size = 0.075,
  gap = 0.06,
  reach = 0.3,
  magnify = 4,
  speed = 100,
  follow = 5,
  children,
  background = '#f4f3ef',
  className = '',
}: LensImageFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({size, gap, reach, magnify, speed, follow})
  const imageKey = images.join('|')

  useEffect(() => {
    live.current = {size, gap, reach, magnify, speed, follow}
  }, [size, gap, reach, magnify, speed, follow])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!root || !canvas || !ctx) return
    const touch = !matchMedia('(hover: hover) and (pointer: fine)').matches
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    let W = 1
    let H = 1
    let dpr = 1
    let pictures: Picture[] = []
    let cancelled = false
    // decode every picture once, scaled down to the largest size it is ever drawn at
    const sources = imageKey ? imageKey.split('|') : []
    Promise.all(
      sources.map(
        (src) =>
          new Promise<Picture | null>((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.decoding = 'async'
            img.onload = async () => {
              const ratio = img.naturalWidth / img.naturalHeight
              const longest = 520
              try {
                const bitmap = await createImageBitmap(img, ratio > 1 ? {resizeWidth: longest, resizeQuality: 'high'} : {resizeHeight: longest, resizeQuality: 'high'})
                resolve({bitmap, ratio})
              } catch {
                resolve({bitmap: img, ratio})
              }
            }
            img.onerror = () => resolve(null)
            img.src = src
          }),
      ),
    ).then((list) => {
      if (cancelled) return
      // shuffled once, so neighbours differ
      pictures = list.filter((p): p is Picture => !!p).sort(() => Math.random() - 0.5)
      wake()
    })

    const lens = {x: 0, y: 0}
    const pointer = {x: 0, y: 0, seen: false}
    const force = {value: 0, target: 0}
    let time = 0
    let raf = 0
    let last = 0
    let visible = false

    const draw = () => {
      const s = live.current
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, H)
      if (!pictures.length || force.value < 0.001) return
      const cell = H * s.size
      const step = cell + H * s.gap
      const maxD = H * s.reach
      const cols = Math.ceil(W / step)
      const rows = Math.ceil(H / step)
      const n = pictures.length
      for (let r = -1; r < rows + 1; r++) {
        for (let c = -1; c < cols + 1; c++) {
          const x = wrap(-step - H * s.gap, W + step, c * step + time * s.speed)
          const y = wrap(-step - H * s.gap, H + step, r * step - time * s.speed)
          const pic = pictures[(((c * cols + r) % n) + n) % n]
          const w = pic.ratio > 1 ? cell : cell * pic.ratio
          const h = pic.ratio > 1 ? cell / pic.ratio : cell
          const dx = x + cell / 2 - lens.x
          const dy = y + cell / 2 - lens.y
          const d = Math.hypot(dx, dy)
          if (d >= maxD) continue
          const k = Math.max(0, s.magnify - quadInOut(d / maxD) * s.magnify) * force.value
          if (k <= 0.001) continue
          ctx.drawImage(pic.bitmap, x + (cell - w * k) / 2, y + (cell - h * k) / 2, w * k, h * k)
        }
      }
    }

    const tick = (now: number) => {
      raf = 0
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
      last = now
      if (!reduced) time += dt
      const s = live.current
      if (touch || !pointer.seen) {
        if (touch && !reduced) {
          const A = Math.min(W, H) * 0.75
          lens.x = W / 2 + A * 0.75 * Math.cos(time * 0.75)
          lens.y = H / 2 + A * Math.sin(time * 0.75)
        }
      } else {
        const k = 1 - Math.exp(-dt * s.follow)
        lens.x += (pointer.x - lens.x) * k
        lens.y += (pointer.y - lens.y) * k
      }
      // force eases in and out over ~0.6s
      const f = force.target - force.value
      force.value = Math.abs(f) < 0.001 ? force.target : force.value + f * (1 - Math.exp(-dt * 7))
      draw()
      const settled = reduced && force.value === force.target
      if (visible && !settled) raf = requestAnimationFrame(tick)
    }
    const wake = () => {
      if (raf || !visible || document.hidden) return
      last = performance.now()
      raf = requestAnimationFrame(tick)
    }
    const sleep = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    const resize = () => {
      W = Math.max(1, root.clientWidth)
      H = Math.max(1, root.clientHeight)
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      if (!pointer.seen) {
        lens.x = pointer.x = W / 2
        lens.y = pointer.y = H / 2
      }
      draw()
      wake()
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const r = root.getBoundingClientRect()
      pointer.x = e.clientX - r.left
      pointer.y = e.clientY - r.top
      pointer.seen = true
      // hovering anything marked data-lens-hide (a button, say) clears the field
      force.target = e.target instanceof Element && e.target.closest('[data-lens-hide]') ? 0 : 1
      wake()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(root)
    resize()
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) {
        force.target = 1
        wake()
      } else {
        force.target = force.value = 0
        sleep()
      }
    })
    io.observe(root)
    const onVisibility = () => (document.hidden ? sleep() : wake())
    root.addEventListener('pointermove', onMove)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      sleep()
      ro.disconnect()
      io.disconnect()
      root.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', onVisibility)
      for (const p of pictures) if (p.bitmap instanceof ImageBitmap) p.bitmap.close()
    }
  }, [imageKey])

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} style={{background}}>
      {children}
      {/* above the content, like a lens held over the page */}
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
    </div>
  )
}
