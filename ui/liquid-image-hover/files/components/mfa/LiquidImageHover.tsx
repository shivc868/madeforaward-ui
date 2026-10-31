'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'

export type LiquidImageHoverProps = {
  src?: string
  alt?: string
  /** how far the water bends the picture */
  refraction?: number
  /** colour split at the ripple edges, 0–1 */
  dispersion?: number
  /** light and shade on the slopes */
  shade?: number
  /** highlights on the crests */
  gloss?: number
  /** highlight sharpness */
  shine?: number
  /** bright caustic lines on the crests */
  caustics?: number
  /** ripple life, 0.95–0.995 (higher = longer) */
  damping?: number
  /** simulation steps per frame (ripple speed) */
  speed?: number
  /** drop size, as a share of the image height */
  dropSize?: number
  /** drop strength */
  dropForce?: number
  /** splash when the image first comes into view, 0 = none */
  entrySplash?: number
  className?: string
}

const DEFAULT_SRC = 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1600&auto=format&fit=crop'
const SIM = 256 // ripple field resolution
const OVERSCAN = 1.15 // the picture is drawn a little larger, so refraction never reaches past its edges
const MAX_DROPS = 16 // drops per pass

const QUAD = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

// add drops: a cosine bump per drop
const DROP = `precision highp float; varying vec2 vUv; uniform sampler2D uTexture; uniform vec4 uDrops[${MAX_DROPS}]; uniform int uCount; uniform float uAspect;
void main(){ vec4 info = texture2D(uTexture, vUv);
  for (int i = 0; i < ${MAX_DROPS}; i++) { if (i >= uCount) break; vec4 d = uDrops[i];
    float k = max(0.0, 1.0 - length((vUv - d.xy) * vec2(uAspect, 1.0)) / d.z); info.r += (0.5 - cos(k * 3.141592) * 0.5) * d.w; }
  gl_FragColor = info; }`

// one wave step: height (r) is pulled toward its 8 neighbours' average through a velocity (g), which decays
const STEP = `precision highp float; varying vec2 vUv; uniform sampler2D uTexture; uniform vec2 uDelta; uniform float uDecay;
void main(){ vec4 info = texture2D(uTexture, vUv); vec2 dx = vec2(uDelta.x, 0.0), dy = vec2(0.0, uDelta.y);
  float n4 = texture2D(uTexture, vUv - dx).r + texture2D(uTexture, vUv + dx).r + texture2D(uTexture, vUv - dy).r + texture2D(uTexture, vUv + dy).r;
  float n8 = texture2D(uTexture, vUv - dx - dy).r + texture2D(uTexture, vUv - dx + dy).r + texture2D(uTexture, vUv + dx - dy).r + texture2D(uTexture, vUv + dx + dy).r;
  float avg = (n4 * 4.0 + n8) / 20.0;
  info.g += (avg - info.r) * 2.0; info.g *= uDecay; info.r += info.g; gl_FragColor = info; }`

// the picture seen through the water: refraction with a chromatic split, slope shading,
// Blinn-Phong highlights from a light over the pointer, and caustics on the crests
const VIEW = `
precision highp float;
uniform sampler2D uTexture; uniform vec2 uTexSize; uniform vec2 uPlaneSize;
uniform sampler2D uRipple; uniform float uRippleOn; uniform vec2 uRippleDelta;
uniform float uRefr, uDisp, uShade, uSpec, uShine, uCaus; uniform vec3 uLight;
varying vec2 vUv;
vec2 frame(vec2 uv) {
  float k = 1.0 / ${OVERSCAN.toFixed(3)};
  uv = (uv - 0.5) * k + 0.5;
  float pr = uPlaneSize.x / uPlaneSize.y, tr = uTexSize.x / uTexSize.y;
  vec2 s = pr > tr ? vec2(1.0, tr / pr) : vec2(pr / tr, 1.0);
  return (uv - 0.5) * s + 0.5;
}
void main() {
  if (uRippleOn < 0.5) { gl_FragColor = vec4(texture2D(uTexture, frame(vUv)).rgb, 1.0); return; }
  vec2 dx = vec2(uRippleDelta.x, 0.0), dy = vec2(0.0, uRippleDelta.y);
  float hL = texture2D(uRipple, vUv - dx).r, hR = texture2D(uRipple, vUv + dx).r;
  float hD = texture2D(uRipple, vUv - dy).r, hU = texture2D(uRipple, vUv + dy).r;
  vec2 grad = vec2(hR - hL, hU - hD);
  // refraction fades out over the last 8% so it never drags edge pixels into smears
  vec2 off = grad * uRefr * smoothstep(0.0, 0.08, min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y)));
  vec3 col = vec3(texture2D(uTexture, frame(vUv + off * (1.0 + uDisp))).r,
                  texture2D(uTexture, frame(vUv + off)).g,
                  texture2D(uTexture, frame(vUv + off * (1.0 - uDisp))).b);
  vec3 n = normalize(vec3(-grad * 40.0, 1.0));
  vec3 lFixed = normalize(vec3(-0.4, 0.7, 0.6));
  vec3 lPointer = normalize(vec3((uLight.xy - vUv) * vec2(uPlaneSize.x / uPlaneSize.y, 1.0), 0.35));
  vec3 l = normalize(mix(lFixed, lPointer, uLight.z));
  float shadow = dot(n, l) - l.z;
  vec3 h = normalize(l + vec3(0.0, 0.0, 1.0));
  float spec = max(pow(max(dot(n, h), 0.0), uShine) - pow(h.z, uShine), 0.0) * uSpec;
  float caus = 0.0;
  if (uCaus > 0.0) caus = max(4.0 * texture2D(uRipple, vUv).r - (hL + hR + hD + hU), 0.0) * uCaus * 25.0;
  gl_FragColor = vec4(col * (1.0 + shadow * uShade) + spec + caus, 1.0);
}`

// A picture that turns to water under the pointer. A real ripple field
// (256², two half-float targets ping-ponged) takes a trail of drops along
// the pointer's path, with a little spray, and the picture is drawn
// through it: refracted with a chromatic split, shaded on the slopes,
// lit from above the pointer, with caustics on the crests. On first sight
// a splash lands in the middle with a ring of drops around it. The field
// stops simulating once the water is flat, and nothing renders off screen.
export default function LiquidImageHover({
  src = DEFAULT_SRC,
  alt = '',
  refraction = 2.4,
  dispersion = 0.6,
  shade = 0.4,
  gloss = 0.25,
  shine = 80,
  caustics = 1.4,
  damping = 0.977,
  speed = 2,
  dropSize = 0.032,
  dropForce = 0.12,
  entrySplash = 0.36,
  className = '',
}: LiquidImageHoverProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({refraction, dispersion, shade, gloss, shine, caustics, damping, speed, dropSize, dropForce, entrySplash})

  useEffect(() => {
    live.current = {refraction, dispersion, shade, gloss, shine, caustics, damping, speed, dropSize, dropForce, entrySplash}
  }, [refraction, dispersion, shade, gloss, shine, caustics, damping, speed, dropSize, dropForce, entrySplash])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const renderer = new THREE.WebGLRenderer({canvas, antialias: false, alpha: true, powerPreference: 'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.PlaneGeometry(2, 2)

    // ---- ripple field ----
    const rt = () =>
      new THREE.WebGLRenderTarget(SIM, SIM, {
        type: THREE.HalfFloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      })
    let read = rt()
    let write = rt()
    const delta = new THREE.Vector2(1 / SIM, 1 / SIM)
    const dropMat = new THREE.ShaderMaterial({
      vertexShader: QUAD,
      fragmentShader: DROP,
      depthTest: false,
      depthWrite: false,
      uniforms: {uTexture: {value: null}, uDrops: {value: Array.from({length: MAX_DROPS}, () => new THREE.Vector4())}, uCount: {value: 0}, uAspect: {value: 1}},
    })
    const stepMat = new THREE.ShaderMaterial({
      vertexShader: QUAD,
      fragmentShader: STEP,
      depthTest: false,
      depthWrite: false,
      uniforms: {uTexture: {value: null}, uDelta: {value: delta}, uDecay: {value: 0.977}},
    })
    const simMesh = new THREE.Mesh(quad, stepMat)
    simMesh.frustumCulled = false
    const simScene = new THREE.Scene().add(simMesh)
    const pass = (mat: THREE.ShaderMaterial) => {
      simMesh.material = mat
      renderer.setRenderTarget(write)
      renderer.render(simScene, camera)
      ;[read, write] = [write, read]
    }
    for (const t of [read, write]) {
      renderer.setRenderTarget(t)
      renderer.clear()
    }
    renderer.setRenderTarget(null)

    // ---- the picture ----
    const viewMat = new THREE.ShaderMaterial({
      vertexShader: QUAD,
      fragmentShader: VIEW,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uTexture: {value: null},
        uTexSize: {value: new THREE.Vector2(1, 1)},
        uPlaneSize: {value: new THREE.Vector2(1, 1)},
        uRipple: {value: read.texture},
        uRippleOn: {value: 0},
        uRippleDelta: {value: delta},
        uRefr: {value: 0},
        uDisp: {value: 0},
        uShade: {value: 0},
        uSpec: {value: 0},
        uShine: {value: 80},
        uCaus: {value: 0},
        uLight: {value: new THREE.Vector3(0.5, 0.5, 0)},
      },
    })
    const viewMesh = new THREE.Mesh(quad, viewMat)
    viewMesh.frustumCulled = false
    const viewScene = new THREE.Scene().add(viewMesh)

    let texture: THREE.Texture | null = null
    let ready = false
    let disposed = false
    new THREE.TextureLoader()
      .setCrossOrigin('anonymous')
      .loadAsync(src)
      .then((tex) => {
        if (disposed) return tex.dispose()
        tex.minFilter = THREE.LinearFilter
        tex.generateMipmaps = false
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        texture = tex
        const img = tex.image as HTMLImageElement
        viewMat.uniforms.uTexture.value = tex
        viewMat.uniforms.uTexSize.value.set(img.width || 1, img.height || 1)
        ready = true
        root.dataset.ready = 'true'
        wake()
      })
      .catch(() => {})

    // ---- state ----
    let aspect = 1
    let frames = 0 // simulation frames left before the water is called flat
    let hover: {x: number; y: number} | null = null
    let last: {x: number; y: number} | null = null
    let light = 0
    let revealed = false
    let splashed = false
    const drops: number[] = []
    const later: {f: number; g: [number, number, number, number]}[] = []
    const addDrop = (x: number, y: number, r: number, s: number) => drops.push(x, y, r, s)
    // frames until the ripples have faded to ~0.5%
    const lifetime = () => {
      const s = live.current
      return Math.min(240, Math.max(60, Math.ceil(Math.log(0.005) / (Math.max(1, Math.round(s.speed)) * Math.log(Math.min(s.damping, 0.999))))))
    }
    const flushDrops = () => {
      const u = dropMat.uniforms
      for (let i = 0; i < drops.length; i += MAX_DROPS * 4) {
        const n = Math.min(MAX_DROPS, (drops.length - i) / 4)
        for (let k = 0; k < n; k++) u.uDrops.value[k].set(drops[i + k * 4], drops[i + k * 4 + 1], drops[i + k * 4 + 2], drops[i + k * 4 + 3])
        u.uCount.value = n
        u.uAspect.value = aspect
        u.uTexture.value = read.texture
        pass(dropMat)
      }
      drops.length = 0
    }

    let raf = 0
    let visible = false
    const frame = () => {
      raf = 0
      if (!ready) return
      const s = live.current
      // the entrance splash: one big drop, then a ring a few frames later
      if (revealed && !splashed && s.entrySplash > 0) {
        splashed = true
        frames = lifetime()
        addDrop(0.5, 0.5, 0.45, s.entrySplash)
        for (let n = 0; n < 6; n++) {
          const a = (n / 6) * Math.PI * 2 + Math.random() * 0.4
          const r = 0.26 + Math.random() * 0.06
          later.push({f: 7 + (n % 3) * 3, g: [0.5 + (Math.cos(a) * r) / aspect, 0.5 + Math.sin(a) * r, 0.06 + Math.random() * 0.03, s.entrySplash * 0.4]})
        }
      }
      for (let i = later.length - 1; i >= 0; i--) if (--later[i].f <= 0) addDrop(...later.splice(i, 1)[0].g)
      // a trail of drops along the pointer's path, with spray
      if (hover) {
        if (last) {
          const d = Math.hypot((hover.x - last.x) * aspect, hover.y - last.y)
          if (d > 0.002) {
            const steps = Math.min(24, Math.max(1, Math.ceil(d / 0.012)))
            const push = Math.min(1, 0.35 + d * 6)
            for (let i = 1; i <= steps; i++) {
              const t = i / steps
              const x = last.x + (hover.x - last.x) * t
              const y = last.y + (hover.y - last.y) * t
              const r = s.dropSize * (1 + (Math.random() * 2 - 1) * 0.5 * 0.6)
              addDrop(x, y, r, s.dropForce * push * (r / s.dropSize))
              if (Math.random() < 0.35 * 0.5) {
                const a = Math.random() * Math.PI * 2
                const o = s.dropSize * (1.2 + Math.random() * 1.6)
                addDrop(x + (Math.cos(a) * o) / aspect, y + Math.sin(a) * o, s.dropSize * 0.3, s.dropForce * push * 0.5)
              }
            }
            frames = lifetime()
          }
        } else frames = Math.max(frames, 1)
        last = {...hover}
      }
      flushDrops()
      light += ((hover ? 1 : 0) - light) * 0.12
      const u = viewMat.uniforms
      if (hover) u.uLight.value.set(hover.x, hover.y, light)
      else u.uLight.value.z = light
      u.uRefr.value = s.refraction
      u.uDisp.value = s.dispersion
      u.uShade.value = s.shade
      u.uSpec.value = s.gloss
      u.uShine.value = s.shine
      u.uCaus.value = s.caustics
      if (frames > 0) {
        stepMat.uniforms.uDecay.value = s.damping
        for (let i = 0; i < Math.round(s.speed); i++) {
          stepMat.uniforms.uTexture.value = read.texture
          pass(stepMat)
        }
        frames--
        u.uRipple.value = read.texture
        u.uRippleOn.value = 1
      } else u.uRippleOn.value = 0
      renderer.setRenderTarget(null)
      renderer.render(viewScene, camera)
      if (frames > 0 || hover || later.length || Math.abs((hover ? 1 : 0) - light) > 0.002) wake()
    }
    const wake = () => {
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }

    const resize = () => {
      const w = Math.max(1, root.clientWidth)
      const h = Math.max(1, root.clientHeight)
      renderer.setSize(w, h, false)
      aspect = w / h
      viewMat.uniforms.uPlaneSize.value.set(w, h)
      wake()
    }
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      hover = {x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height}
      wake()
    }
    const onLeave = () => {
      hover = null
      last = null
      wake()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(root)
    resize()
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        if (visible) revealed = true
        wake()
      },
      {threshold: 0.2},
    )
    io.observe(root)
    const onVisibility = () => wake()
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerleave', onLeave)
    root.addEventListener('pointercancel', onLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      root.removeEventListener('pointercancel', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      delete root.dataset.ready
      texture?.dispose()
      read.dispose()
      write.dispose()
      dropMat.dispose()
      stepMat.dispose()
      viewMat.dispose()
      quad.dispose()
      renderer.dispose()
    }
  }, [src])

  return (
    <div ref={rootRef} className={`group relative h-full w-full overflow-hidden ${className}`}>
      {/* the plain picture until WebGL has it (and for reduced motion) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="absolute inset-0 size-full scale-[1.15] object-cover group-data-[ready=true]:invisible" />
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block size-full" />
    </div>
  )
}
