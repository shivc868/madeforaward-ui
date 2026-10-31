'use client'

import {useEffect, useMemo, useRef, useState, type ReactNode} from 'react'

export type TearTicketProps = {
  /** content of the ticket body (over the artwork's footer) */
  children?: ReactNode
  /** content of the tear-off stub */
  stub?: ReactNode
  /** artwork on the body; it turns grey once the ticket is used */
  image?: string
  imageAlt?: string
  width?: number
  height?: number
  /** stub width, px */
  stubSize?: number
  radius?: number
  /** perforation holes along the tear line */
  holes?: number
  holeSize?: number
  /** radius of the half-moon notches at both ends of the tear line */
  notch?: number
  /** how far the stub may swing before it must come free, degrees */
  tearAngle?: number
  /** how far a paper bridge stretches before it snaps, px */
  stretch?: number
  /** how hard the intact paper holds the stub back, 0–0.95 */
  resistance?: number
  /** resting rotation, degrees */
  rotate?: number
  /** 3D tilt toward the pointer, degrees (0 = off) */
  tilt?: number
  /** how far from the ticket the pointer still tilts it, px */
  tiltReach?: number
  /** artwork shift against the tilt, px */
  parallax?: number
  paper?: string
  ink?: string
  onTear?: () => void
  className?: string
}

const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?q=80&w=1000&auto=format&fit=crop'
const GRAVITY = 2600
const RETRACT = 0.22 // s for a snapped fibre to curl back

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const n2 = (v: number) => v.toFixed(2)
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

// The ticket's outline, split along the perforation into two pieces that
// fit exactly: half-moon notches at both ends, and between them round
// holes with paper "bridges" in between. The body keeps the left half of
// every hole, the stub the right half, so each torn edge is scalloped and
// clean. Paths are in ticket pixels, for clip-path: path().
function geometry(W: number, H: number, S: number, R: number, holes: number, hole: number, notch: number) {
  const x = W - S
  const hr = hole / 2
  const n = Math.max(1, Math.round(holes))
  const bridge = Math.max(2, (H - 2 * notch - n * hole) / (n + 1))
  const bridges = Array.from({length: n + 1}, (_, i) => {
    const y0 = notch + i * (bridge + hole)
    return {y0, y1: y0 + bridge, mid: y0 + bridge / 2}
  })
  const arc = (r: number, sweep: 0 | 1, px: number, py: number) => `A${n2(r)},${n2(r)} 0 0 ${sweep} ${n2(px)},${n2(py)}`
  let body = `M${R},0 L${n2(x - notch)},0 ${arc(notch, 0, x, notch)}`
  bridges.forEach((b, i) => {
    body += ` L${n2(x)},${n2(b.y1)}`
    if (i < n) body += ` ${arc(hr, 0, x, b.y1 + hole)}`
  })
  body += ` ${arc(notch, 0, x - notch, H)} L${R},${H} ${arc(R, 1, 0, H - R)} L0,${R} ${arc(R, 1, R, 0)} Z`
  let stub = `M${n2(x + notch)},0 L${W - R},0 ${arc(R, 1, W, R)} L${W},${H - R} ${arc(R, 1, W - R, H)} L${n2(x + notch)},${H} ${arc(notch, 0, x, H - notch)}`
  for (let i = n; i >= 0; i--) {
    stub += ` L${n2(x)},${n2(bridges[i].y0)}`
    if (i > 0) stub += ` ${arc(hr, 0, x, bridges[i].y0 - hole)}`
  }
  stub += ` ${arc(notch, 0, x + notch, 0)} Z`
  // the outer outline of each piece, for a crisp hairline (the torn side is left open)
  const bodyLine = `M${n2(x)},${n2(H - notch)} ${arc(notch, 0, x - notch, H)} L${R},${H} ${arc(R, 1, 0, H - R)} L0,${R} ${arc(R, 1, R, 0)} L${n2(x - notch)},0 ${arc(notch, 0, x, notch)}`
  const stubLine = `M${n2(x)},${n2(notch)} ${arc(notch, 0, x + notch, 0)} L${W - R},0 ${arc(R, 1, W, R)} L${W},${H - R} ${arc(R, 1, W - R, H)} L${n2(x + notch)},${H} ${arc(notch, 0, x, H - notch)}`
  return {x, bridges, body, stub, bodyLine, stubLine, ends: [notch, H - notch]}
}

// A ticket whose stub tears off by hand. Grab the stub and pull: it swings
// about the far end of the perforation, held back by the paper still
// joined; each bridge between two holes stretches into a pair of fibres
// and snaps once its gap passes `stretch` (the bridges nearest your hand
// go first), giving the body a little jolt each time, while the snapped
// fibres curl back. When the last one goes the stub hangs from your hand;
// let go and it falls with your throw, spinning and fading. The ticket
// then settles to the centre, greys out and is stamped. Let go before it
// is free and the stub springs back. The ticket tilts toward the pointer
// with a little parallax on the artwork.
//
// One rAF loop writes transforms and fibre paths, and sleeps when still.
export default function TearTicket({
  children,
  stub,
  image = DEFAULT_IMAGE,
  imageAlt = '',
  width = 460,
  height = 250,
  stubSize = 150,
  radius = 16,
  holes = 12,
  holeSize = 6,
  notch = 9,
  tearAngle = 30,
  stretch = 30,
  resistance = 0.45,
  rotate = -3,
  tilt = 9,
  tiltReach = 260,
  parallax = 6,
  paper = '#f3eee4',
  ink = '#1b1a17',
  onTear,
  className = '',
}: TearTicketProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const planeRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const stubRef = useRef<HTMLDivElement>(null)
  const artRef = useRef<HTMLImageElement>(null)
  const fibreRefs = useRef<(SVGPathElement | null)[]>([])
  const [used, setUsed] = useState(false)
  const [fit, setFit] = useState(1)
  const geo = useMemo(() => geometry(width, height, stubSize, radius, holes, holeSize, notch), [width, height, stubSize, radius, holes, holeSize, notch])
  const live = useRef({geo, tearAngle, stretch, resistance, tilt, tiltReach, parallax, onTear})

  useEffect(() => {
    live.current = {geo, tearAngle, stretch, resistance, tilt, tiltReach, parallax, onTear}
  }, [geo, tearAngle, stretch, resistance, tilt, tiltReach, parallax, onTear])

  // scale down to fit a narrow parent
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => setFit(Math.min(1, (wrap.clientWidth - 32) / width)))
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [width])

  useEffect(() => {
    const plane = planeRef.current
    const bodyEl = bodyRef.current
    const stubEl = stubRef.current
    if (!plane || !bodyEl || !stubEl) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const count = live.current.geo.bridges.length

    const s = {
      phase: 'idle' as 'idle' | 'held' | 'free' | 'drop' | 'return' | 'gone',
      theta: 0, // the stub's swing about the hinge, radians
      thetaV: 0,
      sign: 1,
      hinge: {x: 0, y: 0},
      a0: 0,
      grab: {x: 0, y: 0},
      start: {x: 0, y: 0},
      point: {x: 0, y: 0},
      sx: 0, // stub slack, then its follow offset
      sy: 0,
      vx: 0,
      vy: 0,
      spin: 0,
      fade: 1,
      age: 0,
      pvx: 0,
      bx: 0, // the body's jolt
      bv: 0,
      snapped: Array<boolean>(count).fill(false),
      snapAt: Array<number>(count).fill(0),
      span: Array<number>(count).fill(0),
      shift: 0, // the body recentres once the stub is gone
      tiltX: 0,
      tiltY: 0,
      tiltToX: 0,
      tiltToY: 0,
      last: 0,
      samples: [] as {x: number; y: number; t: number}[],
    }
    let raf = 0

    // ticket-local coordinates of a client point (undoing the fit scale and the resting rotation)
    const local = (cx: number, cy: number) => {
      const r = plane.getBoundingClientRect()
      const a = (-rotate * Math.PI) / 180
      const dx = (cx - (r.left + r.width / 2)) / fit
      const dy = (cy - (r.top + r.height / 2)) / fit
      return {x: width / 2 + dx * Math.cos(a) - dy * Math.sin(a), y: height / 2 + dx * Math.sin(a) + dy * Math.cos(a)}
    }

    const paint = (now: number) => {
      const c = live.current
      const g = c.geo
      plane.style.transform = `rotate(${rotate}deg) rotateX(${n2(s.tiltX)}deg) rotateY(${n2(s.tiltY)}deg)`
      if (artRef.current) artRef.current.style.transform = `translate3d(${n2(-s.tiltY * c.parallax * 0.11)}px, ${n2(s.tiltX * c.parallax * 0.11)}px, 0) scale(1.06)`
      bodyEl.style.transform = `translate3d(${n2(s.bx + s.shift)}px, 0, 0)`
      if (s.phase === 'gone') {
        stubEl.style.visibility = 'hidden'
        for (const f of fibreRefs.current) if (f) f.style.opacity = '0'
        return false
      }
      const th = s.theta * s.sign
      stubEl.style.transformOrigin = `${n2(s.hinge.x)}px ${n2(s.hinge.y)}px`
      stubEl.style.transform = `translate3d(${n2(s.sx)}px, ${n2(s.sy)}px, 0) rotate(${th.toFixed(4)}rad)`
      stubEl.style.opacity = s.fade.toFixed(3)
      // fibres: each intact bridge is two slack threads between the body edge and its place on the stub
      const cos = Math.cos(th)
      const sin = Math.sin(th)
      const active = (s.phase === 'held' || s.phase === 'free' || s.phase === 'return') && !reduced
      let busy = false
      g.bridges.forEach((b, i) => {
        const near = fibreRefs.current[i * 2]
        const far = fibreRefs.current[i * 2 + 1]
        if (!near || !far) return
        const dx = g.x - s.hinge.x
        const dy = b.mid - s.hinge.y
        const tx = s.hinge.x + dx * cos - dy * sin + s.sx
        const ty = s.hinge.y + dx * sin + dy * cos + s.sy
        const ox = g.x + s.bx
        const oy = b.mid
        const gx = tx - ox
        const gy = ty - oy
        const gap = Math.hypot(gx, gy)
        if (!s.snapped[i]) {
          if (!active || gap < 0.35) {
            near.style.opacity = far.style.opacity = '0'
            return
          }
          const k = clamp(gap / c.stretch, 0, 1)
          const sag = gap * 0.18
          const off = Math.min(1.6, (b.y1 - b.y0) * 0.3)
          near.setAttribute('d', `M${n2(ox)},${n2(oy - off)}Q${n2(ox + gx / 2)},${n2(oy - off + gy / 2 + sag)} ${n2(tx)},${n2(ty - off)}`)
          far.setAttribute('d', `M${n2(ox)},${n2(oy + off)}Q${n2(ox + gx / 2)},${n2(oy + off + gy / 2 + sag)} ${n2(tx)},${n2(ty + off)}`)
          near.style.strokeWidth = far.style.strokeWidth = (1.7 - 1.15 * k).toFixed(2)
          near.style.opacity = far.style.opacity = '1'
          s.span[i] = gap
          return
        }
        const t = (now - s.snapAt[i]) / 1000 / RETRACT
        if (!active || t >= 1 || !s.snapAt[i]) {
          near.style.opacity = far.style.opacity = '0'
          return
        }
        // a snapped fibre curls back to each edge
        busy = true
        const left = (1 - t) * (1 - t)
        const len = (s.span[i] || c.stretch) * 0.5 * left
        const ux = gap > 0.01 ? gx / gap : 1
        const uy = gap > 0.01 ? gy / gap : 0
        near.setAttribute('d', `M${n2(ox)},${n2(oy)}L${n2(ox + ux * len)},${n2(oy + uy * len)}`)
        far.setAttribute('d', `M${n2(tx)},${n2(ty)}L${n2(tx - ux * len)},${n2(ty - uy * len)}`)
        near.style.strokeWidth = far.style.strokeWidth = '0.9'
        near.style.opacity = far.style.opacity = left.toFixed(2)
      })
      return busy
    }

    const step = (now: number) => {
      raf = 0
      const c = live.current
      const dt = clamp((now - s.last) / 1000, 0.001, 0.034)
      s.last = now
      const limit = (c.tearAngle * Math.PI) / 180
      if (s.phase === 'held') {
        // the intact paper holds the swing back
        const intact = s.snapped.filter((v) => !v).length
        const hold = count ? intact / count : 0
        const follow = 0.92 * (1 - clamp(c.resistance, 0, 0.95) * hold)
        const a = Math.atan2(s.point.y - s.hinge.y, s.point.x - s.hinge.x)
        const want = clamp(wrapAngle(a - s.a0) * s.sign * follow, 0, limit + 0.1)
        s.theta += (want - s.theta) * (1 - Math.exp(-dt / 0.035))
        const away = clamp((s.point.x - s.start.x) * 0.05, -2, 4)
        const side = clamp((s.point.y - s.start.y) * 0.05, -3, 3)
        s.sx += (away - s.sx) * (1 - Math.exp(-dt / 0.05))
        s.sy += (side - s.sy) * (1 - Math.exp(-dt / 0.05))
        const slack = Math.hypot(s.sx, s.sy)
        let left = 0
        c.geo.bridges.forEach((b, i) => {
          if (s.snapped[i]) return
          const d = Math.abs(b.mid - s.hinge.y)
          if (2 * d * Math.sin(s.theta / 2) + slack > c.stretch || s.theta >= limit) {
            s.snapped[i] = true
            s.snapAt[i] = now
            s.bv -= 560 / count
          } else left++
        })
        if (left === 0) {
          s.phase = 'free'
          s.bv -= 150
        }
      } else if (s.phase === 'free') {
        // the stub hangs from the hand
        const cos = Math.cos(s.theta * s.sign)
        const sin = Math.sin(s.theta * s.sign)
        const gx = s.grab.x - s.hinge.x
        const gy = s.grab.y - s.hinge.y
        const wx = s.point.x - s.hinge.x - (gx * cos - gy * sin)
        const wy = s.point.y - s.hinge.y - (gx * sin + gy * cos)
        s.sx += (wx - s.sx) * (1 - Math.exp(-dt / 0.045))
        s.sy += (wy - s.sy) * (1 - Math.exp(-dt / 0.045))
        const hang = limit * 0.55 + clamp(s.pvx * 0.0009 * s.sign, -0.3, 0.3)
        s.theta += (hang - s.theta) * (1 - Math.exp(-dt / 0.12))
      } else if (s.phase === 'drop') {
        s.age += dt
        s.vy += GRAVITY * dt
        s.sx += s.vx * dt
        s.sy += s.vy * dt
        s.theta += s.spin * dt
        if (s.age > 0.16) s.fade = clamp(1 - (s.age - 0.16) / 0.42, 0, 1)
        if (s.fade <= 0) {
          s.phase = 'gone'
          setUsed(true)
          c.onTear?.()
        }
      } else if (s.phase === 'return') {
        s.thetaV += (-300 * s.theta - 24 * s.thetaV) * dt
        s.theta += s.thetaV * dt
        s.sx += (0 - s.sx) * (1 - Math.exp(-dt / 0.07))
        s.sy += (0 - s.sy) * (1 - Math.exp(-dt / 0.07))
        if (Math.abs(s.theta) < 0.0008 && Math.abs(s.thetaV) < 0.01 && Math.hypot(s.sx, s.sy) < 0.05) {
          s.theta = s.thetaV = s.sx = s.sy = 0
          s.snapped.fill(false)
          s.phase = 'idle'
        }
      }
      // the body's jolt, the recentring, the tilt
      s.bv += (-520 * s.bx - 30 * s.bv) * dt
      s.bx += s.bv * dt
      const shiftTo = s.phase === 'gone' ? stubSize / 2 : 0
      s.shift += (shiftTo - s.shift) * (1 - Math.exp(-dt * 8))
      const kt = 1 - Math.exp(-dt * 9)
      s.tiltX += (s.tiltToX - s.tiltX) * kt
      s.tiltY += (s.tiltToY - s.tiltY) * kt
      const busy = paint(now)
      const moving =
        Math.abs(s.bx) > 0.02 ||
        Math.abs(s.bv) > 0.5 ||
        Math.abs(shiftTo - s.shift) > 0.05 ||
        Math.abs(s.tiltToX - s.tiltX) + Math.abs(s.tiltToY - s.tiltY) > 0.01
      const settled = s.phase === 'idle' || s.phase === 'gone'
      if (!settled || moving || busy) raf = requestAnimationFrame(step)
    }
    const wake = () => {
      if (raf) return
      s.last = performance.now()
      raf = requestAnimationFrame(step)
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || s.phase === 'drop' || s.phase === 'gone') return
      e.preventDefault()
      stubEl.setPointerCapture(e.pointerId)
      const g = live.current.geo
      const p = local(e.clientX, e.clientY)
      // the stub swings about the end of the perforation away from the hand
      const top = p.y < height / 2
      s.hinge = {x: g.x, y: top ? g.ends[1] : g.ends[0]}
      s.sign = top ? 1 : -1
      s.a0 = Math.atan2(p.y - s.hinge.y, p.x - s.hinge.x)
      s.grab = p
      s.start = p
      s.point = p
      s.samples = [{...p, t: e.timeStamp}]
      s.phase = 'held'
      wake()
    }
    const onMove = (e: PointerEvent) => {
      const c = live.current
      if (!reduced && c.tilt > 0) {
        const r = plane.getBoundingClientRect()
        const dx = e.clientX - (r.left + r.width / 2)
        const dy = e.clientY - (r.top + r.height / 2)
        const reach = Math.max(1, c.tiltReach) + Math.max(r.width, r.height) / 2
        // the tilt rests while the stub is in hand, so the tear reads straight
        const near = Math.hypot(dx, dy) < reach && s.phase !== 'held' && s.phase !== 'free'
        s.tiltToY = near ? clamp(dx / reach, -1, 1) * c.tilt : 0
        s.tiltToX = near ? -clamp(dy / reach, -1, 1) * c.tilt : 0
      }
      if (s.phase === 'held' || s.phase === 'free') {
        const p = local(e.clientX, e.clientY)
        s.point = p
        s.samples.push({...p, t: e.timeStamp})
        while (s.samples.length > 2 && e.timeStamp - s.samples[0].t > 90) s.samples.shift()
        const a = s.samples[0]
        const b = s.samples[s.samples.length - 1]
        s.pvx = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0
      }
      wake()
    }
    const onUp = (e: PointerEvent) => {
      if (stubEl.hasPointerCapture(e.pointerId)) stubEl.releasePointerCapture(e.pointerId)
      if (s.phase === 'held') {
        s.phase = 'return'
        s.thetaV = 0
      } else if (s.phase === 'free') {
        const a = s.samples[0]
        const b = s.samples[s.samples.length - 1]
        const span = Math.max(16, b.t - a.t) / 1000
        s.vx = clamp((b.x - a.x) / span, -1400, 1800)
        s.vy = clamp((b.y - a.y) / span, -900, 1400) - 150
        s.spin = clamp(s.vx * 0.004, -6, 6) + 1.5 * s.sign
        s.age = 0
        s.phase = 'drop'
      }
      wake()
    }

    paint(performance.now())
    stubEl.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      cancelAnimationFrame(raf)
      stubEl.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [width, height, stubSize, rotate, fit])

  const shadow = 'drop-shadow(0 18px 26px rgba(0,0,0,0.35)) drop-shadow(0 2px 3px rgba(0,0,0,0.25))'
  return (
    <div ref={wrapRef} className={`flex w-full items-center justify-center ${className}`}>
      <div style={{width: width * fit, height: height * fit}}>
        <div style={{width, height, transform: `scale(${fit})`, transformOrigin: '0 0', perspective: 1000}}>
          <div ref={planeRef} className="relative will-change-transform" style={{width, height, transform: `rotate(${rotate}deg)`, color: ink}}>
            {/* body */}
            <div ref={bodyRef} className="absolute inset-0 will-change-transform" style={{filter: shadow}}>
              <div className="absolute inset-0" style={{clipPath: `path('${geo.body}')`, background: paper}}>
                <div className="absolute overflow-hidden" style={{left: 10, top: 10, width: geo.x - 20, bottom: 54, borderRadius: Math.max(0, radius - 8)}}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={artRef}
                    src={image}
                    alt={imageAlt}
                    draggable={false}
                    className="size-full object-cover transition-[filter] duration-700"
                    style={{filter: used ? 'grayscale(1) contrast(0.9) brightness(1.05)' : 'none'}}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2" style={{background: `linear-gradient(to top, ${paper}cc, transparent)`}} />
                </div>
                <div className="absolute bottom-3.5 left-4" style={{width: geo.x - 32}}>
                  {children ?? <DefaultBody />}
                </div>
                {used && (
                  <div className="pointer-events-none absolute right-5 bottom-12 -rotate-8 rounded-md border-2 border-[#d6452f] bg-[#f3eee4]/85 px-2.5 py-0.5 font-mono text-xs font-bold tracking-[0.25em] text-[#d6452f] uppercase [animation:stamp_.45s_cubic-bezier(.2,1.6,.4,1)_both]">
                    Admitted
                  </div>
                )}
              </div>
              <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
                <path d={geo.bodyLine} fill="none" stroke={ink} strokeOpacity={0.14} strokeWidth={1} />
              </svg>
            </div>
            {/* fibres across the tear */}
            <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
              <g fill="none" stroke={paper} strokeLinecap="round">
                {geo.bridges.flatMap((_, i) =>
                  [0, 1].map((k) => <path key={`${i}-${k}`} ref={(el) => void (fibreRefs.current[i * 2 + k] = el)} style={{opacity: 0}} />),
                )}
              </g>
            </svg>
            {/* stub: the whole ticket box clipped to its piece, so it can turn about any point on the tear line */}
            <div ref={stubRef} className="pointer-events-none absolute inset-0 will-change-transform" style={{filter: shadow}}>
              <div className="pointer-events-auto absolute inset-0 cursor-grab touch-none select-none active:cursor-grabbing" style={{clipPath: `path('${geo.stub}')`, background: paper}}>
                <div className="absolute top-0 bottom-0 p-4 pl-6" style={{left: geo.x, width: stubSize}}>
                  {stub ?? <DefaultStub />}
                </div>
              </div>
              <svg className="pointer-events-none absolute inset-0 overflow-visible" width={width} height={height} aria-hidden>
                <path d={geo.stubLine} fill="none" stroke={ink} strokeOpacity={0.14} strokeWidth={1} />
              </svg>
            </div>
            <style>{'@keyframes stamp{from{opacity:0;scale:1.8}}'}</style>
          </div>
        </div>
      </div>
    </div>
  )
}

function DefaultBody() {
  return (
    <div className="flex items-end justify-between">
      <div>
        <p className="text-[17px] leading-tight font-semibold tracking-tight">Neon Tide</p>
        <p className="text-[11px] opacity-60">Live at Pier 9 · Doors 8 PM</p>
      </div>
      <p className="font-mono text-[11px] opacity-60">22 NOV</p>
    </div>
  )
}

function DefaultStub() {
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <p className="font-mono text-[10px] tracking-[0.2em] opacity-50">ADMIT</p>
        <p className="text-2xl leading-none font-bold tracking-tight">ONE</p>
      </div>
      <div className="grid grid-cols-2 gap-y-1 font-mono text-[10px] leading-tight">
        <span className="opacity-50">ROW</span>
        <span className="opacity-50">SEAT</span>
        <span className="font-semibold">F</span>
        <span className="font-semibold">14</span>
      </div>
      <div className="flex h-7 items-stretch gap-[2px]" aria-hidden>
        {Array.from({length: 22}, (_, i) => (
          <span key={i} className="bg-current" style={{width: [1, 2, 1, 3, 1][i % 5], opacity: 0.85}} />
        ))}
      </div>
    </div>
  )
}
