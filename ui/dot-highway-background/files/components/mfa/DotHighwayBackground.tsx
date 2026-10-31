'use client'

import {useEffect, useRef, type ReactNode} from 'react'
import * as THREE from 'three'

export type DotHighwayBackgroundProps = {
  /** dot colour */
  color?: string
  /** colour of the passing pulses and the pointer's pocket */
  accent?: string
  /** background gradient, top to bottom */
  from?: string
  to?: string
  /** travel speed (1 = the reference) */
  speed?: number
  /** how far the road bends up into the distance */
  curve?: number
  /** dot size */
  dotSize?: number
  /** dot opacity */
  opacity?: number
  /** strength of the faint accent pulses travelling down the lanes (0 = none) */
  pulses?: number
  /** how high dots near the pointer lift (0 = no hover) */
  hover?: number
  /** size of the pointer's pocket, in screen halves */
  radius?: number
  /** tilt the view as the section scrolls through the viewport */
  parallax?: boolean
  children?: ReactNode
  className?: string
}

const ROWS = 180
const LANES = 52
const DEPTH = ROWS * 0.48

const VERTEX = /* glsl */ `
attribute float aLane;
uniform float uScroll;
uniform float uTime;
uniform float uDotSize;
uniform float uPixelRatio;
uniform float uCurve;
uniform float uPulses;
uniform vec2 uPointer;
uniform float uPointerOn;
uniform float uInfluence;
uniform float uHoverStrength;
uniform float uPress;
varying float vGlow;
varying float vFade;

const float DEPTH = ${DEPTH.toFixed(2)};
const float NEAR_Z = 2.0;
const vec2 VANISH = vec2(0.0, 0.55);

void main() {
  // rows recycle from the far horizon; sampled densely near the camera, sparsely far away
  float t = mod(position.z - uScroll, 1.0);
  float distFrac = pow(t, 3.0);
  float zd = DEPTH * distFrac;
  vec3 pos = vec3(position.x, uCurve * distFrac * distFrac, NEAR_Z - zd);

  vec4 clip0 = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  vec2 ndc = clip0.xy / max(clip0.w, 0.0001);

  // dots in the pointer's pocket wobble, lift and grow; a press widens and swells it
  float radius = uInfluence * (1.0 + uPress * 0.35);
  float infl = (1.0 - smoothstep(radius * 0.15, radius, distance(ndc, uPointer))) * uPointerOn;
  float wob = sin(uTime * 4.0 + position.z * 1.7 + aLane * 30.0);
  float wob2 = cos(uTime * 3.0 + aLane * 17.0);
  float hoverAmt = uHoverStrength * (1.0 + uPress * 0.9);
  pos.y += infl * hoverAmt * (0.7 + 0.3 * wob);
  pos.x += infl * hoverAmt * wob2 * 0.4;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mv;

  // fade out at the horizon and where the lanes converge
  vFade = (1.0 - smoothstep(0.82, 1.0, distFrac)) * smoothstep(0.112, 0.4, distance(ndc, VANISH));

  // faint accent pulses travelling down the lanes; the pointer's pocket glows fully
  float pulse = 0.5 + 0.5 * sin(zd * 0.5 - uTime * 3.0 + aLane * 6.2831853 * 3.0);
  vGlow = clamp(max(pow(pulse, 8.0) * uPulses, infl * (1.0 + uPress * 0.7)), 0.0, 1.0);

  // perspective size, capped so near dots stay a fine matrix
  float size = clamp(uDotSize * (42.0 / -mv.z), uDotSize * 0.375, uDotSize * 1.5);
  gl_PointSize = size * uPixelRatio * (1.0 + infl * (0.3 + uPress * 0.6));
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uBaseColor;
uniform vec3 uActiveColor;
uniform float uOpacity;
varying float vGlow;
varying float vFade;

void main() {
  float disc = 1.0 - smoothstep(0.46, 0.5, length(gl_PointCoord - 0.5));
  float alpha = disc * vFade * uOpacity;
  if (alpha <= 0.003) discard;
  gl_FragColor = vec4(mix(uBaseColor, uActiveColor, vGlow), alpha);
}
`

// A road of dots running towards a vanishing point: 52 lanes of particles
// stream out from the horizon under a low camera, curving up into the
// distance, while faint accent pulses travel down the lanes. Under the
// pointer the dots lift, wobble and turn to the accent colour; a click
// sends a pulse through the pocket. One three.js point cloud; every
// setting changes live; it pauses off screen and holds still for reduced
// motion.
export default function DotHighwayBackground({
  color = '#efefef',
  accent = '#ee421b',
  from = '#dedede',
  to = '#222222',
  speed = 1,
  curve = 14,
  dotSize = 1.6,
  opacity = 0.55,
  pulses = 0.45,
  hover = 0.4,
  radius = 0.44,
  parallax = true,
  children,
  className = '',
}: DotHighwayBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({color, accent, speed, curve, dotSize, opacity, pulses, hover, radius, parallax})
  const redraw = useRef<(() => void) | null>(null)

  useEffect(() => {
    live.current = {color, accent, speed, curve, dotSize, opacity, pulses, hover, radius, parallax}
    redraw.current?.()
  }, [color, accent, speed, curve, dotSize, opacity, pulses, hover, radius, parallax])

  useEffect(() => {
    const root = rootRef.current!
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: true})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(82, 1, 0.1, 200)
    camera.position.set(0, 1.5, 1.5)

    // the grid: one dot per lane per row; z holds the row's place along the road (0..1)
    const positions = new Float32Array(ROWS * LANES * 3)
    const lanes = new Float32Array(ROWS * LANES)
    for (let r = 0, i = 0; r < ROWS; r++)
      for (let a = 0; a < LANES; a++, i++) {
        positions[i * 3] = -11.73 + 0.46 * a
        positions[i * 3 + 2] = r / ROWS
        lanes[i] = a / LANES
      }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aLane', new THREE.BufferAttribute(lanes, 1))

    const uniforms = {
      uScroll: {value: 0},
      uTime: {value: 0},
      uDotSize: {value: 1.6},
      uPixelRatio: {value: renderer.getPixelRatio()},
      uCurve: {value: 14},
      uPulses: {value: 0.45},
      uPointer: {value: new THREE.Vector2()},
      uPointerOn: {value: 0},
      uInfluence: {value: 0.44},
      uHoverStrength: {value: 0.4},
      uPress: {value: 0},
      uOpacity: {value: 0.55},
      uBaseColor: {value: new THREE.Color()},
      uActiveColor: {value: new THREE.Color()},
    }
    const material = new THREE.ShaderMaterial({vertexShader: VERTEX, fragmentShader: FRAGMENT, uniforms, transparent: true})
    const points = new THREE.Points(geometry, material)
    points.frustumCulled = false
    scene.add(points)

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    const s = {scroll: 0, px: 0, py: 0, tx: 0, ty: 0, on: 0, targetOn: 0, press: Infinity, tilt: 0}
    let raf = 0
    let last = 0
    let visible = true

    const draw = (dt: number) => {
      const o = live.current
      s.on += (s.targetOn - s.on) * Math.min(1, 8 * dt)
      if (s.targetOn > 0) {
        const k = Math.min(1, 16 * dt)
        s.px += (s.tx - s.px) * k
        s.py += (s.ty - s.py) * k
      }
      s.scroll += (2 / DEPTH) * o.speed * dt
      s.press += dt
      // the press pulse: up over 0.22s, back down over 0.6s
      let press = 0
      if (s.press < 0.22) {
        const e = s.press / 0.22
        press = e * e * (3 - 2 * e)
      } else if (s.press < 0.82) {
        const e = 1 - (s.press - 0.22) / 0.6
        press = e * e * (3 - 2 * e)
      }
      // tilt the view as the section moves through the viewport
      let aim = 0
      if (o.parallax) {
        const r = root.getBoundingClientRect()
        const vh = window.innerHeight || 1
        aim = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh))
      }
      s.tilt += (aim - s.tilt) * Math.min(1, 6 * dt)
      camera.lookAt(0, 0.35 + 0.9 * s.tilt, -18)

      uniforms.uScroll.value = s.scroll
      uniforms.uTime.value += dt
      uniforms.uPointer.value.set(s.px, s.py)
      uniforms.uPointerOn.value = s.on
      uniforms.uPress.value = press
      uniforms.uDotSize.value = o.dotSize
      uniforms.uCurve.value = o.curve
      uniforms.uPulses.value = o.pulses
      uniforms.uHoverStrength.value = o.hover
      uniforms.uInfluence.value = o.radius
      uniforms.uOpacity.value = o.opacity
      uniforms.uBaseColor.value.set(o.color)
      uniforms.uActiveColor.value.set(o.accent)
      renderer.render(scene, camera)
    }
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      draw(last ? Math.min((now - last) / 1000, 1 / 30) : 0)
      last = now
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      last = 0
      if (!raf && !still && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    redraw.current = () => {
      if (!raf) draw(0)
    }

    const ro = new ResizeObserver(() => {
      const w = Math.max(1, root.clientWidth)
      const h = Math.max(1, root.clientHeight)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      draw(0)
    })
    ro.observe(root)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)
    document.addEventListener('visibilitychange', wake)

    // the pointer's pocket, for mice and pens only
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches
    const aimAt = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      s.tx = ((e.clientX - r.left) / r.width) * 2 - 1
      s.ty = -(((e.clientY - r.top) / r.height) * 2 - 1)
    }
    const move = (e: PointerEvent) => {
      aimAt(e)
      s.targetOn = 1
    }
    const leave = () => {
      s.targetOn = 0
    }
    const down = (e: PointerEvent) => {
      aimAt(e)
      s.px = s.tx
      s.py = s.ty
      s.targetOn = 1
      s.press = 0
    }
    if (fine && !still) {
      root.addEventListener('pointermove', move)
      root.addEventListener('pointerleave', leave)
      root.addEventListener('pointerdown', down)
    }

    return () => {
      cancelAnimationFrame(raf)
      redraw.current = null
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', wake)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerleave', leave)
      root.removeEventListener('pointerdown', down)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{background: `linear-gradient(${from} 14.5%, ${to})`}}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
      {children != null && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  )
}
