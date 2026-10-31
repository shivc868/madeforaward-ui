'use client'

import {useEffect, useRef, type ReactNode} from 'react'
import * as THREE from 'three'
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js'

export type WireSphereBackgroundProps = {
  /** sphere radius */
  size?: number
  /** wireframe segments around and down the sphere */
  detail?: number
  /** how fine the noise that shapes the surface is */
  noiseScale?: number
  /** how far the noise pushes the surface in and out */
  noiseIntensity?: number
  /** how fast the noise moves */
  noiseSpeed?: number
  /** how strongly the displacement lights up the heat-map colours */
  colorIntensity?: number
  /** colour the quiet parts fade to (and the solid core) */
  baseColor?: string
  /** a solid core that hides the far side of the wireframe */
  solidCore?: boolean
  /** lens: negative folds the picture inward (pincushion), positive bulges it */
  distortion?: number
  /** lens zoom (lower shows more) */
  zoom?: number
  /** split the lens into red, green and blue fringes */
  aberration?: number
  /** drag to turn the sphere */
  draggable?: boolean
  background?: string
  children?: ReactNode
  className?: string
}

const NOISE = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
vec3 fade(vec3 t) { return t * t * t * (t * (t * 6.0 - 15.0) + 10.0); }

// classic Perlin noise
float perlin(vec3 P) {
  vec3 Pi0 = mod289(floor(P));
  vec3 Pi1 = mod289(floor(P) + 1.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - 1.0;
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + Pi0.zzzz);
  vec4 ixy1 = permute(ixy + Pi1.zzzz);

  vec4 gx0 = ixy0 * (1.0 / 7.0);
  vec4 gy0 = fract(floor(gx0) * (1.0 / 7.0)) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = 0.5 - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 * (1.0 / 7.0);
  vec4 gy1 = fract(floor(gx1) * (1.0 / 7.0)) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = 0.5 - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
  vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
  vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
  vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
  vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
  vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
  vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
  vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 f = fade(Pf0);
  vec4 nz = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), f.z);
  vec2 nyz = mix(nz.xy, nz.zw, f.y);
  return 2.2 * mix(nyz.x, nyz.y, f.x);
}
`

const SPHERE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSize;
uniform float uNoiseScale;
uniform float uNoiseIntensity;
uniform float uNoiseSpeed;
varying float vDisplacement;
varying float vLatitude;
${NOISE}
void main() {
  vec3 dir = normalize(position);
  vLatitude = acos(dir.y) / 3.14159265359; // 0 at the north pole, 1 at the south
  float d = perlin(position * uSize * uNoiseScale + uTime * uNoiseSpeed) * uNoiseIntensity;
  vDisplacement = d;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + dir * d, 1.0);
}
`

const SPHERE_FRAGMENT = /* glsl */ `
uniform vec3 uBase;
uniform float uTime;
uniform float uColorIntensity;
varying float vDisplacement;
varying float vLatitude;

// a heat map from the equator (blue) to the poles (red)
vec3 heat(float latitude) {
  float e = abs(latitude - 0.5) * 2.0;
  if (e < 0.2) return mix(vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 1.0), e * 5.0);
  if (e < 0.4) return mix(vec3(0.0, 1.0, 1.0), vec3(0.0, 1.0, 0.0), (e - 0.2) * 5.0);
  if (e < 0.6) return mix(vec3(0.0, 1.0, 0.0), vec3(1.0, 1.0, 0.0), (e - 0.4) * 5.0);
  if (e < 0.8) return mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.5, 0.0), (e - 0.6) * 5.0);
  return mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.0, 0.0), (e - 0.8) * 5.0);
}

void main() {
  // pushed-out parts light up in the heat colour, pulled-in parts fade to the base
  float d = vDisplacement * uColorIntensity;
  vec3 color = mix(uBase, heat(vLatitude), clamp(d * 2.0, 0.0, 1.0)) + d * 0.2;
  color += 0.05 * sin(uTime * 2.0) * vec3(0.5, 0.5, 1.0);
  gl_FragColor = vec4(color, 1.0);
}
`

const LENS_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

// barrel / pincushion lens over the rendered frame; past the fold the picture mirrors inward
const LENS_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uAspect;
uniform float uAmount;
uniform float uZoom;
uniform float uAberration;
varying vec2 vUv;

vec2 lens(float amount) {
  vec2 c = (vUv - 0.5) * 2.0;
  c.x *= uAspect;
  c /= uZoom;
  c *= 1.0 + amount * dot(c, c);
  c.x /= uAspect;
  return c * 0.5 + 0.5;
}

float inside(vec2 uv) {
  return step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
}

void main() {
  vec2 uvR = lens(uAmount * (1.0 + uAberration * 2.0));
  vec2 uvG = lens(uAmount);
  vec2 uvB = lens(uAmount * (1.0 - uAberration * 2.0));
  vec4 g = texture2D(tDiffuse, uvG);
  gl_FragColor = vec4(
    texture2D(tDiffuse, uvR).r * inside(uvR),
    g.g * inside(uvG),
    texture2D(tDiffuse, uvB).b * inside(uvB),
    g.a * inside(uvG)
  );
}
`

// A wireframe sphere of a few hundred thousand lines, its surface pushed in
// and out by slow 3D Perlin noise and coloured as a heat map from equator
// to poles (only where it bulges; the hollows fade to the base colour),
// seen through a pincushion lens that folds the picture back on itself
// into rings and petals. The frame is rendered without multisampling, so
// the dense lines shimmer into moiré like the reference. Drag to turn it.
// Pauses off screen; reduced motion stops the noise.
export default function WireSphereBackground({
  size = 2.7,
  detail = 350,
  noiseScale = 2.6,
  noiseIntensity = 0.4,
  noiseSpeed = 0.32,
  colorIntensity = 5,
  baseColor = '#000000',
  solidCore = true,
  distortion = -1,
  zoom = 0.68,
  aberration = 0,
  draggable = true,
  background = '#000000',
  children,
  className = '',
}: WireSphereBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({size, noiseScale, noiseIntensity, noiseSpeed, colorIntensity, baseColor, solidCore, distortion, zoom, aberration, draggable})
  const redraw = useRef<(() => void) | null>(null)

  useEffect(() => {
    live.current = {size, noiseScale, noiseIntensity, noiseSpeed, colorIntensity, baseColor, solidCore, distortion, zoom, aberration, draggable}
    redraw.current?.()
  }, [size, noiseScale, noiseIntensity, noiseSpeed, colorIntensity, baseColor, solidCore, distortion, zoom, aberration, draggable])

  useEffect(() => {
    const root = rootRef.current!
    const canvas = canvasRef.current!
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const renderer = new THREE.WebGLRenderer({canvas, antialias: false, alpha: true, powerPreference: 'high-performance'})
    renderer.setPixelRatio(ratio)
    renderer.setClearColor(0x000000, 0)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000)
    // the reference preset's view: below and to the left of the sphere
    camera.position.set(-4.589081, -4.033644, 2.17383)
    camera.lookAt(0, 0, 0)

    const segments = Math.max(4, Math.round(detail))
    const geometry = new THREE.SphereGeometry(1, segments, segments)
    const uniforms = {
      uTime: {value: 0},
      uSize: {value: 2.7},
      uNoiseScale: {value: 2.6},
      uNoiseIntensity: {value: 0.4},
      uNoiseSpeed: {value: 0.32},
      uColorIntensity: {value: 5},
      uBase: {value: new THREE.Color()},
    }
    const material = new THREE.ShaderMaterial({vertexShader: SPHERE_VERTEX, fragmentShader: SPHERE_FRAGMENT, uniforms, wireframe: true})
    const sphere = new THREE.Mesh(geometry, material)
    const coreGeometry = new THREE.SphereGeometry(0.99, segments, segments)
    const coreMaterial = new THREE.MeshBasicMaterial()
    const core = new THREE.Mesh(coreGeometry, coreMaterial)
    scene.add(core, sphere)

    // the scene renders into a target, then through the lens onto the canvas
    const target = new THREE.WebGLRenderTarget(1, 1)
    const lensUniforms = {
      tDiffuse: {value: target.texture},
      uAspect: {value: 1},
      uAmount: {value: -1},
      uZoom: {value: 0.68},
      uAberration: {value: 0},
    }
    const lensMaterial = new THREE.ShaderMaterial({vertexShader: LENS_VERTEX, fragmentShader: LENS_FRAGMENT, uniforms: lensUniforms, depthTest: false})
    const quadGeometry = new THREE.PlaneGeometry(2, 2)
    const quad = new THREE.Mesh(quadGeometry, lensMaterial)
    const lensScene = new THREE.Scene()
    lensScene.add(quad)
    const lensCamera = new THREE.Camera()

    const controls = new OrbitControls(camera, root)
    controls.enableDamping = true
    controls.enableZoom = false
    controls.enablePan = false
    root.style.touchAction = 'pan-y' // touch: horizontal drags turn it, vertical ones still scroll the page

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    let last = 0
    let visible = true

    const draw = (dt: number) => {
      const o = live.current
      // the reference steps its clock 0.01 per 1/120 s; reduced motion holds it
      if (!still) uniforms.uTime.value += dt * 1.2
      uniforms.uSize.value = o.size
      uniforms.uNoiseScale.value = o.noiseScale
      uniforms.uNoiseIntensity.value = o.noiseIntensity
      uniforms.uNoiseSpeed.value = o.noiseSpeed
      uniforms.uColorIntensity.value = o.colorIntensity
      uniforms.uBase.value.set(o.baseColor)
      coreMaterial.color.set(o.baseColor)
      core.visible = o.solidCore
      sphere.scale.setScalar(o.size)
      core.scale.setScalar(o.size)
      lensUniforms.uAmount.value = o.distortion
      lensUniforms.uZoom.value = Math.max(0.05, o.zoom)
      lensUniforms.uAberration.value = o.aberration
      controls.enabled = o.draggable
      controls.update(dt)

      renderer.setRenderTarget(target)
      renderer.clear()
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      renderer.render(lensScene, lensCamera)
    }
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      draw(last ? Math.min((now - last) / 1000, 1 / 20) : 0)
      last = now
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      last = 0
      if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    redraw.current = () => {
      if (!raf) draw(0)
    }

    const ro = new ResizeObserver(() => {
      const w = Math.max(1, root.clientWidth)
      const h = Math.max(1, root.clientHeight)
      renderer.setSize(w, h, false)
      target.setSize(Math.round(w * ratio), Math.round(h * ratio))
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      lensUniforms.uAspect.value = w / h
      draw(0)
    })
    ro.observe(root)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)
    document.addEventListener('visibilitychange', wake)

    return () => {
      cancelAnimationFrame(raf)
      redraw.current = null
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', wake)
      controls.dispose()
      geometry.dispose()
      coreGeometry.dispose()
      quadGeometry.dispose()
      material.dispose()
      coreMaterial.dispose()
      lensMaterial.dispose()
      target.dispose()
      renderer.dispose()
    }
  }, [detail])

  return (
    <div
      ref={rootRef}
      className={`relative h-full w-full overflow-hidden ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${className}`}
      style={{background}}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
      {children != null && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  )
}
