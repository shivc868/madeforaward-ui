'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'

export type FlowDistortTextProps = {
  text?: string
  /** CSS font family for the word (load it on the page first) */
  fontFamily?: string
  fontWeight?: number | string
  /** colour of the word */
  color?: string
  /** background colour */
  background?: string
  /** a fine film grain over the background */
  grain?: boolean
  /** space either side of the word, CSS px */
  padding?: number
  /** how far the flow drags the word */
  distortion?: number
  /** how far apart red, green and blue split */
  aberration?: number
  /** multiplies the split */
  spread?: number
  /** size of the cursor's brush, share of the height */
  falloff?: number
  /** how long the flow lingers (closer to 1 = longer) */
  dissipation?: number
  /** how much the previous frame smears into the next on fast moves */
  motionBlur?: number
  /** how hard the cursor's speed pushes */
  velocityScale?: number
  className?: string
}

const QUAD = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// the flowmap: fades, then gains the cursor's velocity round the cursor; b = speed
const FLOW = /* glsl */ `
uniform vec2 uMouse;
uniform vec2 uVelocity;
uniform float uFalloff;
uniform float uAlpha;
uniform float uDissipation;
uniform float uAspect;
uniform sampler2D uTexture;
varying vec2 vUv;
void main() {
  vec4 color = texture2D(uTexture, vUv);
  color.rgb *= uDissipation;
  vec2 aspectUv = vUv;
  aspectUv.x *= uAspect;
  vec2 cursor = uMouse;
  cursor.x *= uAspect;
  float influence = 1.0 - smoothstep(0.0, uFalloff, distance(aspectUv, cursor));
  color.rg += vec2(uVelocity.x, -uVelocity.y) * influence * uAlpha;
  color.b = length(color.rg) * 2.0;
  gl_FragColor = color;
}
`

// the word: pushed along the flow, red / green / blue pulled apart along (and across) it,
// pure colours boosted where it moves, and a little of the last frame smeared in on fast moves
const WORD = /* glsl */ `
precision mediump float;
uniform sampler2D uLogo;
uniform sampler2D uFlowmap;
uniform sampler2D uPreviousFrame;
uniform vec2 uImageScale;
uniform float uDistortionStrength;
uniform float uChromaticAberration;
uniform float uChromaticSpread;
uniform float uMotionBlurStrength;
uniform float uMotionBlurDecay;
uniform float uMotionBlurThreshold;
uniform bool uIsFirstFrame;
varying vec2 vUv;

vec2 toImage(vec2 uv) { return (uv - 0.5) / uImageScale + 0.5; }
bool inside(vec2 uv) {
  vec2 i = toImage(uv);
  return i.x >= 0.0 && i.x <= 1.0 && i.y >= 0.0 && i.y <= 1.0;
}
vec4 logo(vec2 uv) { return inside(uv) ? texture2D(uLogo, toImage(uv)) : vec4(0.0); }

void main() {
  vec3 flow = texture2D(uFlowmap, vUv).rgb;
  float flowMagnitude = length(flow.rg);
  vec2 distortedUv = vUv + flow.rg * uDistortionStrength;

  float aberration = flow.b * uChromaticAberration;
  vec2 dir = flowMagnitude > 0.0 ? normalize(flow.rg) : vec2(0.0);
  vec2 redUv = distortedUv + dir * aberration * uChromaticSpread;
  vec2 greenUv = distortedUv + vec2(-dir.y, dir.x) * aberration * uChromaticSpread * 0.8;
  vec2 blueUv = distortedUv - dir * aberration * uChromaticSpread;

  float r = logo(redUv).r;
  float g = logo(greenUv).g;
  float b = logo(blueUv).b;
  vec4 center = logo(distortedUv);
  float alpha = 0.0;
  if (inside(redUv)) alpha = max(alpha, logo(redUv).a);
  if (inside(greenUv)) alpha = max(alpha, logo(greenUv).a);
  if (inside(blueUv)) alpha = max(alpha, logo(blueUv).a);
  if (inside(distortedUv)) alpha = max(alpha, center.a);
  if (alpha < 0.01) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 color = vec3(r, g, b);
  if (r + g + b < 0.05 && inside(distortedUv)) color = center.rgb;
  if (flowMagnitude > 0.01) {
    if (r > 0.05 && r > g + 0.1 && r > b + 0.1) { color.r = min(1.0, r * 1.8); color.g *= 0.8; color.b *= 0.8; }
    if (g > 0.05 && g > r + 0.1 && g > b + 0.1) { color.g = min(1.0, g * 1.6); color.r *= 0.8; color.b *= 0.8; }
    if (b > 0.05 && b > r + 0.1 && b > g + 0.1) { color.b = min(1.0, b * 2.0); color.r *= 0.8; color.g *= 0.8; }
    color += color * flow.b * 0.15;
  }
  vec4 current = vec4(color, alpha);

  if (!uIsFirstFrame) {
    vec4 previous = texture2D(uPreviousFrame, vUv);
    float blur = smoothstep(uMotionBlurThreshold, uMotionBlurThreshold + 0.05, flowMagnitude) * uMotionBlurStrength;
    current = vec4(mix(current.rgb, previous.rgb, blur * uMotionBlurDecay), max(current.a, previous.a * uMotionBlurDecay));
  }
  gl_FragColor = current;
}
`

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)'/%3E%3C/svg%3E\")"

// A big word that the cursor smears like wet paint: moving over it drags the
// letters along a fading flowmap and splits them into red, green and blue
// fringes that run along and across the stroke, with a touch of motion blur
// on fast moves. The word is drawn to a canvas texture and fitted across
// the width; three.js, three small passes a frame, paused off screen.
export default function FlowDistortText({
  text = 'AFTERGLOW',
  fontFamily = 'Syne, sans-serif',
  fontWeight = 800,
  color = '#ffe9cf',
  background = '#120d22',
  grain = true,
  padding = 40,
  distortion = 0.08,
  aberration = 0.004,
  spread = 1,
  falloff = 0.18,
  dissipation = 0.965,
  motionBlur = 0.35,
  velocityScale = 0.6,
  className = '',
}: FlowDistortTextProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({distortion, aberration, spread, falloff, dissipation, motionBlur, velocityScale})

  useEffect(() => {
    live.current = {distortion, aberration, spread, falloff, dissipation, motionBlur, velocityScale}
  }, [distortion, aberration, spread, falloff, dissipation, motionBlur, velocityScale])

  useEffect(() => {
    const root = rootRef.current!
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({canvas, alpha: true, antialias: false})
    renderer.setClearColor(0x000000, 0)
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2))

    const half = {minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, type: THREE.HalfFloatType}
    let flowA = new THREE.WebGLRenderTarget(128, 128, half)
    let flowB = new THREE.WebGLRenderTarget(128, 128, half)
    let frameA = new THREE.WebGLRenderTarget(1, 1, half)
    let frameB = new THREE.WebGLRenderTarget(1, 1, half)

    // the word, drawn once to a canvas (white on clear in the chosen colour)
    const word = document.createElement('canvas')
    let logo: THREE.CanvasTexture | null = null
    let gone = false
    let wordAspect = 4

    const flowMat = new THREE.ShaderMaterial({
      vertexShader: QUAD,
      fragmentShader: FLOW,
      uniforms: {
        uMouse: {value: new THREE.Vector2(-1, -1)},
        uVelocity: {value: new THREE.Vector2()},
        uFalloff: {value: 0.18},
        uAlpha: {value: 0.97},
        uDissipation: {value: 0.965},
        uAspect: {value: 1},
        uTexture: {value: null},
      },
    })
    const wordMat = new THREE.ShaderMaterial({
      vertexShader: QUAD,
      fragmentShader: WORD,
      transparent: true,
      uniforms: {
        uLogo: {value: null as THREE.Texture | null},
        uFlowmap: {value: null},
        uPreviousFrame: {value: null},
        uImageScale: {value: new THREE.Vector2(1, 1)},
        uDistortionStrength: {value: 0.08},
        uChromaticAberration: {value: 0.004},
        uChromaticSpread: {value: 1},
        uMotionBlurStrength: {value: 0.35},
        uMotionBlurDecay: {value: 0.88},
        uMotionBlurThreshold: {value: 0.5},
        uIsFirstFrame: {value: true},
      },
    })

    let w = 1
    let h = 1
    const fit = () => {
      // contain: the word spans the canvas width (or its height, if the box is very wide)
      const v = w / h
      wordMat.uniforms.uImageScale.value.set(wordAspect > v ? 1 : wordAspect / v, wordAspect > v ? v / wordAspect : 1)
    }
    const drawWord = async () => {
      const size = 240
      const font = `${fontWeight} ${size}px ${fontFamily}`
      await document.fonts?.load(font, text).catch(() => {})
      if (gone) return
      const ctx = word.getContext('2d')!
      ctx.font = font
      const m = ctx.measureText(text)
      const top = m.actualBoundingBoxAscent
      const bottom = m.actualBoundingBoxDescent
      word.width = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight) + 8
      word.height = Math.ceil(top + bottom) + 8
      ctx.font = font
      ctx.fillStyle = color
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, m.actualBoundingBoxLeft + 4, top + 4)
      wordAspect = word.width / word.height
      // a fresh texture at the canvas's final size (a texture keeps the size it was first uploaded at)
      logo?.dispose()
      logo = new THREE.CanvasTexture(word)
      logo.minFilter = THREE.LinearFilter
      wordMat.uniforms.uLogo.value = logo
      fit()
    }
    void drawWord()

    const resize = () => {
      w = Math.max(1, canvas.clientWidth)
      h = Math.max(1, canvas.clientHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
      renderer.setSize(w, h, false)
      flowMat.uniforms.uAspect.value = w / h
      frameA.setSize(Math.min(w, 512), Math.min(h, 512))
      frameB.setSize(Math.min(w, 512), Math.min(h, 512))
      fit()
    }
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // the cursor, in canvas UV (y up); it eases toward the pointer and its speed is smoothed twice
    const mouse = {
      current: new THREE.Vector2(-1, -1),
      target: new THREE.Vector2(-1, -1),
      last: new THREE.Vector2(-1, -1),
      velocity: new THREE.Vector2(),
      smooth: new THREE.Vector2(),
    }
    const step = new THREE.Vector2()
    const toUv = (x: number, y: number) => {
      const r = canvas.getBoundingClientRect()
      return [(x - r.left) / r.width, 1 - (y - r.top) / r.height] as const
    }
    const enter = (e: PointerEvent) => {
      const [x, y] = toUv(e.clientX, e.clientY)
      mouse.current.set(x, y)
      mouse.target.set(x, y)
      mouse.last.set(x, y)
    }
    const move = (e: PointerEvent) => {
      const [x, y] = toUv(e.clientX, e.clientY)
      mouse.target.set(x, y)
    }
    const leave = () => mouse.target.set(-1, -1)
    root.addEventListener('pointerenter', enter)
    root.addEventListener('pointermove', move)
    root.addEventListener('pointerleave', leave)

    let first = true
    const render = () => {
      const o = live.current
      mouse.last.copy(mouse.current)
      mouse.current.lerp(mouse.target, 0.7)
      step.subVectors(mouse.current, mouse.last).multiplyScalar(80)
      mouse.velocity.lerp(step, 0.6)
      mouse.smooth.lerp(mouse.velocity, 0.3)
      mouse.velocity.multiplyScalar(0.85)

      flowMat.uniforms.uMouse.value.copy(mouse.current)
      flowMat.uniforms.uVelocity.value.copy(mouse.smooth).multiplyScalar(o.velocityScale)
      flowMat.uniforms.uFalloff.value = o.falloff
      flowMat.uniforms.uDissipation.value = o.dissipation
      flowMat.uniforms.uTexture.value = flowB.texture
      quad.material = flowMat
      renderer.setRenderTarget(flowA)
      renderer.render(quad, camera)

      wordMat.uniforms.uFlowmap.value = flowA.texture
      wordMat.uniforms.uPreviousFrame.value = frameB.texture
      wordMat.uniforms.uIsFirstFrame.value = first
      wordMat.uniforms.uDistortionStrength.value = o.distortion
      wordMat.uniforms.uChromaticAberration.value = o.aberration
      wordMat.uniforms.uChromaticSpread.value = o.spread
      wordMat.uniforms.uMotionBlurStrength.value = o.motionBlur
      quad.material = wordMat
      renderer.setRenderTarget(frameA)
      renderer.render(quad, camera)
      renderer.setRenderTarget(null)
      renderer.render(quad, camera)
      ;[flowA, flowB] = [flowB, flowA]
      ;[frameA, frameB] = [frameB, frameA]
      first = false
    }

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let visible = true
    const frame = () => {
      raf = 0
      if (!visible || document.hidden) return
      render()
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (still) {
        render()
        return
      }
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)
    document.addEventListener('visibilitychange', wake)

    return () => {
      gone = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', wake)
      root.removeEventListener('pointerenter', enter)
      root.removeEventListener('pointermove', move)
      root.removeEventListener('pointerleave', leave)
      ;[flowA, flowB, frameA, frameB].forEach((t) => t.dispose())
      logo?.dispose()
      flowMat.dispose()
      wordMat.dispose()
      quad.geometry.dispose()
      renderer.dispose()
    }
  }, [text, fontFamily, fontWeight, color])

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} style={{background}}>
      {grain && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.12] mix-blend-screen" style={{backgroundImage: GRAIN}} />
      )}
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={text}
        className="absolute inset-y-0 block h-full"
        style={{left: padding, width: `calc(100% - ${2 * padding}px)`}}
      />
    </div>
  )
}
