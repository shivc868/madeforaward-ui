'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'

export type WheelProject = {title: string; client: string; year: string; image: string; mark: string; color: string; href?: string}

export type ProjectWheelsProps = {
  projects?: WheelProject[]
  /** take over the mouse wheel / trackpad while the pointer is over it */
  captureWheel?: boolean
  /** how much cards bend with speed, 0–3 */
  bend?: number
  background?: string
  textColor?: string
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=75&w=1200&auto=format&fit=crop`
const DEFAULT_PROJECTS: WheelProject[] = [
  ['Lumen', 'w/Northline', '2026', 'photo-1470770841072-f978cf4d019e', 'L', '#FF8A5C'],
  ['Kestrel', 'w/Ardent', '2026', 'photo-1506905925346-21bda4d32df4', 'K', '#7CB8FF'],
  ['Halcyon Bay', 'w/Mareo', '2025', 'photo-1507525428034-b723cf961d3e', 'H', '#5EE0C0'],
  ['Fieldnote', 'w/Odd Atlas', '2025', 'photo-1465146344425-f00d5f5c8f07', 'F', '#FFC94D'],
  ['Orrery', 'w/Studio Vale', '2025', 'photo-1433086966358-54859d0ed716', 'O', '#A78BFA'],
  ['Tidewater', 'w/Saltworks', '2024', 'photo-1501785888041-af3ef285b470', 'T', '#7CE0FF'],
  ['Mossgrove', 'w/Verdant', '2024', 'photo-1447752875215-b2761acb3c5d', 'M', '#9BE15D'],
  ['Arden', 'w/Kiln & Co', '2024', 'photo-1472214103451-9374bd1c798e', 'A', '#FF7AB0'],
  ['Northwind', 'w/Polar', '2024', 'photo-1500530855697-b586d89ba3ee', 'N', '#C9B6FF'],
  ['Pinecrest', 'w/Ridge', '2023', 'photo-1441974231531-c6227db76b6e', 'P', '#FFB070'],
  ['Saltmarsh', 'w/Lowtide', '2023', 'photo-1469474968028-56623f02e42e', 'S', '#6EE7B7'],
  ['Emberly', 'w/Hearth', '2023', 'photo-1490750967868-88aa4486c946', 'E', '#FF6B6B'],
].map(([title, client, year, id, mark, color]) => ({title, client, year, image: unsplash(id), mark, color}))

// ---- tuning (the reference's own numbers) ----
const C = {
  radius: 1.14, // wheel radius, world units
  overlap: 0.42, // share of the radius inside the viewport
  slots: 9, // stations per turn
  cardW: 0.7,
  focusS: 1.6, // the active card's size
  dieRatio: 2 / 3,
  plateW: 0.3,
  tiltX: -5,
  tiltY: 14,
  camZ: 3.2,
  damp: 0.08, // how tightly the angle follows its target
  vmax: 0.09, // the governor: the angle never turns faster (rad per 60fps frame)
  land: 0.24, // critically damped settle onto a station
  momentum: 0.6,
  inject: 0.28,
  wheel: 0.0011, // rad per wheel px
  stepIn: 0.05, // a fresh wheel gesture's first step, in stations
  drag: 0.0034, // rad per dragged px
  lean: 0.6,
  sway: 1,
  throwDim: 0.7,
  dim: 0.22,
  bend: 1.5,
  shear: 0.5,
  trail: 1,
  warp: 1,
  push: 1,
  restWarp: 0.35,
  arc: 0.022,
  drift: 0.15,
  jerk: 1,
  cornerR: 4,
  grain: 0.06,
  lurch: 0.42,
  huntA: 0.18,
  huntF: 11,
  press: 1,
  reelTurns: 3,
  reelDur: 1.6,
  reelEach: 0.04,
  reelDelay: 0.2,
  reelLine: 0.08,
  reelIn: 0.2,
  idle: 2,
}
const TAU = Math.PI * 2
const ASPECT = 16 / 9
const rad = (d: number) => (d * Math.PI) / 180
const follow = (e: number, n: number) => 1 - (1 - e) ** n // per-60fps-frame rate → this frame
const smoothstep = (e: number) => e * e * (3 - 2 * e)
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const expoOut = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t))
const power3Out = (t: number) => 1 - (1 - clamp(t, 0, 1)) ** 3
// a spring stepped in 60fps frames: stiffness k, damping c
type Spring = {x: number; v: number}
const springStep = (s: Spring, target: number, k: number, c: number, n: number) => {
  s.v += (k * (target - s.x) - c * s.v) * n
  s.x += s.v * n
  return Math.abs(target - s.x) + Math.abs(s.v)
}
const seeded = (i: number) => {
  const n = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return n - Math.floor(n)
}

// the cloth: travel wave, bow, shear, trailing curl, in-plane warp, ribbon arc
const CLOTH = /* glsl */ `
uniform float uVel, uJerk, uBend, uShear, uTrail, uWarp, uPush, uRestWarp, uFocus, uDrift, uArc, uTravelX, uIdleT, uIdle;
vec3 sheetWarp(vec3 p, vec2 uv) {
  float PI = 3.141592653589793;
  // the active card breathes a little at rest
  p.z += uIdle * (sin(uv.x * PI * 1.3 + uIdleT) * sin(uv.y * PI * 1.1 - uIdleT * 0.7) * 0.6 + sin((uv.x + uv.y) * PI * 1.9 + uIdleT * 1.3) * 0.4);
  p.x += uDrift * uFocus;
  p.z += uArc * sin(uv.x * PI) * (0.35 + 0.65 * uFocus);
  float w = (uVel + uJerk * 0.5) * uBend;
  p.z += sin(uv.x * PI * 1.6 + uVel * 5.0) * sin(uv.y * PI) * w * 0.9;
  p.z += sin(uv.y * PI) * w * 0.7;
  p.x += (uv.y - 0.5) * uVel * uShear;
  float tv = mix(uv.y, uv.x, uTravelX) - 0.5;
  float behind = clamp(-sign(uVel) * tv * 2.0, 0.0, 1.0);
  p.z -= behind * behind * abs(uVel) * uTrail;
  float across = sin(mix(uv.x, uv.y, uTravelX) * PI);
  float along = across * (tv * 2.0 * (abs(uVel) * uWarp + uRestWarp * uFocus) + uVel * uPush);
  if (uTravelX > 0.5) p.x += along; else p.y += along;
  return p;
}`

const CARD_VERT = /* glsl */ `
${CLOTH}
uniform vec2 uSize;
varying vec2 vUv;
varying vec2 vPos;
void main() {
  vUv = uv;
  vPos = position.xy;
  vec3 p = sheetWarp(position, 0.5 + position.xy / uSize);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`

const CARD_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uImageAspect, uLoaded, uFocus, uDim, uGrain, uTime, uRadius, uPress;
uniform vec2 uSize;
uniform vec3 uPaper, uLine;
varying vec2 vUv;
varying vec2 vPos;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main() {
  float d = sdRound(vPos, uSize * 0.5, uRadius);
  float aa = fwidth(d);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) discard;
  // cover-crop the picture into 16:9
  vec2 uv = vUv;
  float cardAspect = uSize.x / uSize.y;
  if (uImageAspect > cardAspect) uv.x = 0.5 + (uv.x - 0.5) * cardAspect / uImageAspect;
  else uv.y = 0.5 + (uv.y - 0.5) * uImageAspect / cardAspect;
  vec3 img = texture2D(uMap, uv).rgb;
  // until it arrives: a wireframe proof, then a pixel dissolve into the picture
  vec2 cell = vUv * vec2(16.0, 9.0);
  vec2 g = abs(fract(cell) - 0.5);
  float line = 1.0 - smoothstep(0.47, 0.5, max(g.x, g.y));
  vec3 proof = mix(uPaper, uLine, line * 0.85 + (1.0 - smoothstep(0.0, 0.02, abs(d + 0.004))) );
  float px = hash(floor(vUv * vec2(48.0, 27.0)));
  vec3 c = mix(proof, img, step(px, uLoaded * 1.15 - 0.05));
  // away from the detent a card dims
  c *= 1.0 - uDim * (1.0 - uFocus);
  // a press on landing flashes the sheet a touch
  c += uPress * 0.6;
  // film grain
  c += (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
  gl_FragColor = vec4(c, mask);
  #include <colorspace_fragment>
}`

const DIE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uFocus, uVel, uTime, uRadius, uSheen;
uniform vec2 uSize;
varying vec2 vUv;
varying vec2 vPos;
float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  float d = sdRound(vPos, uSize * 0.5, uRadius);
  float aa = fwidth(d);
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask <= 0.0) discard;
  vec3 c = texture2D(uMap, vUv).rgb;
  // a glancing band of light that sweeps the face with the wheel's speed
  float band = (vUv.x + vUv.y) * 0.7 + uSheen;
  float sweep = exp(-pow(fract(band) - 0.5, 2.0) * 60.0) * (0.12 + abs(uVel) * 0.5);
  // a bevel rim
  float rim = 1.0 - smoothstep(0.0, uSize.x * 0.05, -d);
  c += sweep + rim * 0.12;
  c *= 0.55 + 0.45 * uFocus;
  c += (hash(vUv * 900.0 + uTime) - 0.5) * 0.04;
  gl_FragColor = vec4(c, mask);
  #include <colorspace_fragment>
}`

const DIE_VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vPos;
void main() {
  vUv = uv;
  vPos = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

// the plate on the second wheel: the project's mark, glassy and dark
function paintDie(p: WheelProject) {
  const s = 512
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  const bg = g.createLinearGradient(0, 0, s, s)
  bg.addColorStop(0, '#2a2a2e')
  bg.addColorStop(1, '#0d0d10')
  g.fillStyle = bg
  g.fillRect(0, 0, s, s)
  const glow = g.createRadialGradient(s * 0.5, s * 0.5, 0, s * 0.5, s * 0.5, s * 0.5)
  glow.addColorStop(0, p.color + '55')
  glow.addColorStop(1, '#00000000')
  g.fillStyle = glow
  g.fillRect(0, 0, s, s)
  g.strokeStyle = p.color
  g.lineWidth = s * 0.02
  g.beginPath()
  g.arc(s / 2, s / 2, s * 0.26, 0, TAU)
  g.stroke()
  g.fillStyle = p.color
  g.font = `600 ${s * 0.3}px ui-sans-serif, system-ui, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(p.mark, s / 2, s / 2 + s * 0.015)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

// Two wheels of work turning against each other: project cards ride the
// left wheel, each project's mark rides the right, and whichever sits at
// the nip between them is in focus — larger, brighter, its title rolling
// in at the centre like an odometer, each letter spinning in on landing.
//
// Scroll, drag, flick or use the arrow keys: the angle chases its target
// under a speed governor, then settles onto a station on a critically
// damped spring, carrying a flick's momentum. The cards are cloth — they
// bow, shear and trail with the wheel's speed and jerk, and settle flat.
// On load the wheels slide and spin in, overshoot a little and settle;
// pictures arrive as a wire proof that dissolves into the image.
export default function ProjectWheels({
  projects = DEFAULT_PROJECTS,
  captureWheel = true,
  bend = 1,
  background = '#161616',
  textColor = '#f2f1ee',
  className = '',
}: ProjectWheelsProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const linesRef = useRef<(HTMLDivElement | null)[]>([])
  const live = useRef({bend})
  const key = JSON.stringify(projects)

  useEffect(() => {
    live.current = {bend}
  }, [bend])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const list: WheelProject[] = JSON.parse(key)
    const A = list.length
    if (!A) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0, 0)
    const canvas = renderer.domElement
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    root.prepend(canvas)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, 1, 0.6, 12)
    camera.position.set(0, 0, C.camZ)

    const cardsWheel = new THREE.Group()
    const diesWheel = new THREE.Group()
    scene.add(cardsWheel, diesWheel)
    const paper = new THREE.Color(background)
    const lineCol = new THREE.Color(textColor).lerp(paper, 0.72)

    const loader = new THREE.TextureLoader()
    loader.setCrossOrigin('anonymous')
    const cardH = C.cardW / ASPECT
    const cardGeo = new THREE.PlaneGeometry(C.cardW, cardH, 32, 18)
    const dieGeo = new THREE.PlaneGeometry(1, 1)
    const blank = new THREE.DataTexture(new Uint8Array([22, 22, 22, 255]), 1, 1)
    blank.needsUpdate = true

    type Card = {mesh: THREE.Mesh; mat: THREE.ShaderMaterial; sway: Spring; press: Spring; seed: number; loadedAt: number}
    type Die = {mesh: THREE.Mesh; mat: THREE.ShaderMaterial; foc: Spring; wob: Spring; rock: Spring; seed: number}
    const textures: THREE.Texture[] = [blank]
    const cards: Card[] = list.map((p, i) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: CARD_VERT,
        fragmentShader: CARD_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uMap: {value: blank},
          uImageAspect: {value: ASPECT},
          uLoaded: {value: 0},
          uSize: {value: new THREE.Vector2(C.cardW, cardH)},
          uRadius: {value: (C.cornerR / 100) * cardH},
          uPaper: {value: paper.clone().offsetHSL(0, 0, 0.03)},
          uLine: {value: lineCol},
          uDim: {value: C.dim},
          uGrain: {value: C.grain},
          uTime: {value: 0},
          uPress: {value: 0},
          ...Object.fromEntries(['uVel', 'uJerk', 'uBend', 'uShear', 'uTrail', 'uWarp', 'uPush', 'uRestWarp', 'uFocus', 'uDrift', 'uArc', 'uTravelX', 'uIdleT', 'uIdle'].map((k) => [k, {value: 0}])),
        },
      })
      const mesh = new THREE.Mesh(cardGeo, mat)
      cardsWheel.add(mesh)
      const card: Card = {mesh, mat, sway: {x: 0, v: 0}, press: {x: 0, v: 0}, seed: seeded(i + 1), loadedAt: -1}
      loader.load(p.image, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        textures.push(tex)
        const img = tex.image as HTMLImageElement
        mat.uniforms.uMap.value = tex
        mat.uniforms.uImageAspect.value = img.naturalWidth / img.naturalHeight
        card.loadedAt = clock
      })
      return card
    })
    const dies: Die[] = list.map((p, i) => {
      const tex = paintDie(p)
      textures.push(tex)
      const mat = new THREE.ShaderMaterial({
        vertexShader: DIE_VERT,
        fragmentShader: DIE_FRAG,
        transparent: true,
        depthWrite: false,
        uniforms: {uMap: {value: tex}, uFocus: {value: 0}, uVel: {value: 0}, uTime: {value: 0}, uSheen: {value: 0}, uRadius: {value: 0.08}, uSize: {value: new THREE.Vector2(1, 1)}},
      })
      const mesh = new THREE.Mesh(dieGeo, mat)
      diesWheel.add(mesh)
      return {mesh, mat, foc: {x: 0, v: 0}, wob: {x: 0, v: 0}, rock: {x: 0, v: 0}, seed: seeded(i + 41)}
    })

    // ---- the wheel's state (angles in radians) ----
    const B = TAU / Math.min(A, Math.max(3, Math.round(C.slots))) // one station
    const period = A * B
    const wrap = (e: number) => {
      const t = ((e % period) + period) % period
      return t > period / 2 ? t - period : t
    }
    let V = 0 // the angle
    let H = 0 // its target
    let Y = 0 // input still to inject
    let Q: number | null = null // a station asked for outright
    let un = 0 // landing spring velocity
    let landing = false
    let landTarget = 0
    let ft = 0 // velocity, rad per frame
    let pt = 0 // smoothed velocity
    let mt = 0 // jerk
    let ht = 0
    let gt = 0 // throw dimming
    let lastInput = -1e9
    let quietFor = 160
    let dragging = false
    let settled = true
    // the entrance: wheels slide in (dt), spin past by a lurch and back (off)
    const intro = {dt: reduced ? 0 : 1, off: reduced ? 0 : -1.62, t: 0}
    // a small hunt once a station is reached
    let hunt = 3
    let huntSign = 1
    let St = 0
    let clock = 0
    let idleT = 0

    // ---- layout ----
    let vh = 1
    let vw = 1
    let G = 1
    let stacked = false
    let Pt = 1
    let It = 1
    let Mt = 1
    const layout = () => {
      const w = Math.max(1, root.clientWidth)
      const h = Math.max(1, root.clientHeight)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      vh = 2 * Math.tan(rad(camera.fov) / 2) * C.camZ
      vw = vh * camera.aspect
      stacked = camera.aspect < 1.2
      const across = stacked ? vh : vw
      const d = ((stacked ? vw : vh) * 0.92) / ((stacked ? C.cardW : cardH) * C.focusS)
      const f = (across * 0.67) / (2 * C.radius * C.overlap + (stacked ? cardH : C.cardW) * C.focusS)
      G = Math.min(1, d, f)
      const R = C.radius * G
      const t = R * C.overlap
      Mt = across / 2 - t
      Pt = R
      It = t + (stacked ? cardH : C.cardW) * G * C.focusS + 0.2
      if (stacked) {
        cardsWheel.rotation.set(rad(C.tiltY), rad(C.tiltX), -Math.PI / 2)
        diesWheel.rotation.set(-rad(C.tiltY), rad(C.tiltX), -Math.PI / 2)
      } else {
        cardsWheel.rotation.set(rad(C.tiltX), rad(C.tiltY), 0)
        diesWheel.rotation.set(rad(C.tiltX), -rad(C.tiltY), 0)
      }
      for (const c of cards) c.mat.uniforms.uTravelX.value = stacked ? 1 : 0
    }
    const placeWheels = () => {
      const e = Mt + Pt + It * intro.dt
      if (stacked) {
        cardsWheel.position.set(0, e, 0)
        diesWheel.position.set(0, -e, 0)
      } else {
        cardsWheel.position.set(-e, 0, 0)
        diesWheel.position.set(e, 0, 0)
      }
    }

    // ---- the centre copy: odometer lines + per-letter reels ----
    type Reel = {el: HTMLSpanElement; turns: number; delay: number; r: number}
    type Line = {win: HTMLDivElement; copies: HTMLDivElement[]; st: number[]; reels: Reel[][]; h: number; text: (i: number) => string}
    const texts = [(i: number) => `N°${String(i + 1).padStart(2, '0')} / ${String(A).padStart(2, '0')}`, (i: number) => list[i].title, (i: number) => `${list[i].client.toUpperCase()}  ${list[i].year}`]
    const lines: Line[] = []
    linesRef.current.forEach((win, n) => {
      if (!win) return
      win.replaceChildren()
      const copies = [0, 1].map(() => {
        const d = document.createElement('div')
        d.style.cssText = 'position:absolute;inset:0 auto auto 0;width:100%;white-space:nowrap;will-change:transform'
        win.appendChild(d)
        return d
      })
      lines.push({win, copies, st: [-1, -1], reels: [[], []], h: 0, text: texts[n]})
    })
    const station = (e: number) => ((e % A) + A) % A
    const writeCopy = (line: Line, k: number, i: number) => {
      const d = line.copies[k]
      d.replaceChildren()
      line.reels[k] = []
      for (const ch of line.text(i)) {
        const outer = document.createElement('span')
        outer.style.cssText = 'display:inline-block;overflow:hidden;vertical-align:top;white-space:pre'
        const inner = document.createElement('span')
        inner.style.cssText = 'display:flex;flex-direction:column;will-change:transform'
        const a = document.createElement('span')
        a.textContent = ch
        inner.append(a, a.cloneNode(true))
        outer.appendChild(inner)
        d.appendChild(outer)
        line.reels[k].push({el: inner, turns: 0, delay: 0, r: 0})
        outer.style.height = '1.1em'
      }
    }
    let reelAt = -1
    let reelEnd = 0
    const startReels = () => {
      if (reduced) return
      const e = Math.round(-V / B)
      reelAt = 0
      reelEnd = 0
      lines.forEach((line, n) => {
        for (const k of [0, 1]) {
          if (line.st[k] !== e) continue
          const order = line.reels[k].map((_, j) => j).sort(() => Math.random() - 0.5)
          line.reels[k].forEach((reel, j) => {
            reel.turns = Math.max(1, Math.round(C.reelTurns + (Math.random() * 2 - 1)))
            reel.delay = C.reelDelay + n * C.reelLine + order[j] * C.reelEach
            reelEnd = Math.max(reelEnd, reel.delay + C.reelDur)
          })
        }
      })
    }
    const stopReels = () => {
      reelAt = -1
      for (const line of lines)
        for (const k of [0, 1])
          for (const reel of line.reels[k])
            if (reel.r !== 0) {
              reel.r = 0
              reel.el.style.transform = ''
            }
    }
    const drawLines = () => {
      const th = -V / B
      for (const line of lines) {
        const r = Math.floor(th)
        for (const e of [r, r + 1]) {
          const k = ((e % 2) + 2) % 2
          if (line.st[k] !== e) {
            line.st[k] = e
            writeCopy(line, k, station(e))
          }
        }
        if (!line.h) line.h = Math.max(line.copies[0].offsetHeight, line.copies[1].offsetHeight) + 4
        line.win.style.height = `${line.h}px`
        for (const e of [r, r + 1]) line.copies[((e % 2) + 2) % 2].style.transform = `translate3d(0, ${((e - th) * line.h).toFixed(2)}px, 0)`
        if (reelAt >= 0)
          for (const k of [0, 1])
            for (const reel of line.reels[k]) {
              const e = reelAt - reel.delay
              let v = 0
              if (e > 0 && e < C.reelDur) {
                const r = e / C.reelDur
                const ease = C.reelIn > 0 ? Math.sin((Math.min(r / C.reelIn, 1) * Math.PI) / 2) : 1
                v = reel.turns * (1 - 2 ** (-10 * r)) * ease
              }
              const f = e >= C.reelDur || e <= 0 ? 0 : v - Math.floor(v)
              if (f !== reel.r) {
                reel.r = f
                reel.el.style.transform = f === 0 ? '' : `translate3d(0, ${(-f * 50).toFixed(2)}%, 0)`
              }
            }
      }
      if (reelAt > reelEnd + 0.05) stopReels()
    }

    // ---- input ----
    const aim = (station: number) => {
      Q = station
      H = station
      lastInput = performance.now()
    }
    let lastWheel = 0
    let wheelDiscrete = false
    const onWheel = (e: WheelEvent) => {
      if (!captureWheel || e.ctrlKey) return
      e.preventDefault()
      const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1) || e.deltaX
      if (!px) return
      const now = performance.now()
      const gap = now - lastWheel
      lastWheel = now
      const sign = Math.sign(px)
      // a mouse wheel notch moves exactly one station
      const fresh = gap > 40
      if (fresh && (wheelDiscrete || Math.abs(px) >= 60)) {
        wheelDiscrete = true
        aim(Math.round((Q ?? H) / B - sign) * B)
        Y = 0
        return
      }
      wheelDiscrete = fresh ? false : wheelDiscrete
      // a smooth scroll carries on from wherever a notch was heading
      if (Q !== null) H = Q
      Q = null
      landing = false
      quietFor = gap < 30 ? 60 : 160
      const c = -px * C.wheel
      const limit = fresh ? B * C.stepIn : Infinity
      const u = clamp(c, -limit, limit)
      H += u
      Y += c - u
      lastInput = now
    }
    let lastX = 0
    let lastY = 0
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target instanceof Element && e.target.closest('a,button'))) return
      dragging = true
      Q = null
      landing = false
      lastX = e.clientX
      lastY = e.clientY
      root.setPointerCapture(e.pointerId)
      root.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      // cards travel vertically past the nip (sideways when the wheels stack)
      const d = stacked ? e.clientX - lastX : -(e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
      H += d * C.drag
      lastInput = performance.now()
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging) return
      dragging = false
      root.style.cursor = ''
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
      lastInput = performance.now()
      quietFor = 0
    }
    const onKey = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      e.preventDefault()
      aim(Math.round((Q ?? H) / B - step) * B)
    }

    // ---- frame ----
    const frame = (dtMs: number) => {
      const n = Math.min(dtMs, 50) / 16.667
      clock += dtMs / 1000
      // entrance
      if (intro.t < 3) {
        intro.t += dtMs / 1000
        const t = intro.t
        intro.dt = reduced ? 0 : 1 - expoOut(t / 1.5)
        intro.off = reduced ? 0 : t < 0.05 ? -1.62 : t < 1.3 ? -1.62 + (B * C.lurch + 1.62) * power3Out((t - 0.05) / 1.25) : B * C.lurch * (1 - expoOut((t - 1.3) / 1.1))
      }
      const now = performance.now()
      if (Math.abs(Y) > 5e-5) {
        const e = Y * follow(C.inject, n)
        H += e
        Y -= e
      } else Y = 0
      if (!dragging && Q === null && !landing) {
        const e = C.vmax / follow(C.damp, 1)
        H = clamp(H, V - e, V + e)
      }
      const before = V
      const quiet = !dragging && (Q !== null || (Math.abs(Y) < B * 0.08 && now - lastInput > quietFor))
      if (quiet) {
        if (!landing) {
          landing = true
          H += Y
          Y = 0
          const carry = clamp(((ft / C.land) * C.momentum) / B, -6, 6) * B
          landTarget = Q ?? Math.round((H + carry) / B) * B
          un = ft
        }
        if (Q !== null && landTarget !== Q) landTarget = Q
        H = landTarget
        un += (-C.land * C.land * (V - landTarget) - 2 * C.land * un) * n
        un = clamp(un, -C.vmax, C.vmax)
        V += un * n
        if (Math.abs(V - landTarget) < 3e-4 && Math.abs(un) < 4e-5) {
          V = landTarget
          un = 0
          Q = null
        }
      } else {
        landing = false
        V += clamp((H - V) * follow(C.damp, n), -C.vmax * n, C.vmax * n)
      }
      ft = (V - before) / Math.max(n, 1e-3)
      pt += (ft - pt) * follow(0.16, n)
      const vel = Math.tanh(pt * 16)
      mt += ((ft - ht) / Math.max(n, 0.25) - mt) * follow(0.2, n)
      ht = ft
      const jerk = Math.tanh(mt * 260) * C.jerk
      const speed = Math.abs(vel)
      gt += (speed - gt) * follow(speed > gt ? 0.3 : landing ? 0.14 : 0.06, n)
      // landed: the letters spin in, the card takes a press, the wheel hunts a touch
      const atStation = Math.abs(H - Math.round(H / B) * B) < 5e-4 && Math.abs(H - V) < 0.004 && !dragging && Math.abs(Y) < 0.001
      if (atStation && !settled) {
        settled = true
        startReels()
        hunt = 0
        huntSign = pt < 0 ? -1 : 1
        cards[station(Math.round(-V / B))].press.v -= 0.009 * C.press
      } else if (!atStation && Math.abs(H - V) > 0.03) {
        settled = false
        if (reelAt >= 0) stopReels()
      }
      if (hunt < 3) {
        hunt += Math.min(dtMs, 50) / 1000
        St = reduced ? 0 : huntSign * rad(C.huntA) * Math.exp(-hunt * 5) * Math.sin(hunt * C.huntF)
      } else St = 0
      if (reelAt >= 0) reelAt += dtMs / 1000
      // keep the angle small
      if (Math.abs(V) > 400) {
        const e = Math.round(V / period) * period
        V -= e
        H -= e
        landTarget -= e
        if (Q !== null) Q -= e
      }
      const idle = !reduced && now - lastInput > 2000 && speed < 0.02 ? C.idle : 0
      if (idle) idleT += (dtMs / 1000) * 1

      placeWheels()
      const b = live.current.bend
      const g = stacked ? Math.PI / 2 : 0
      cards.forEach((card, t) => {
        const r = wrap(t * B + V + intro.off + St)
        const focus = smoothstep(Math.max(0, 1 - Math.abs(r) / B)) * (1 - C.throwDim * gt)
        const lean = pt * C.lean * (7 + card.seed * 5)
        const k = (0.11 + card.seed * 0.05) * C.sway
        springStep(card.sway, lean, k, 2 * Math.sqrt(k), n)
        springStep(card.press, 0, 0.16, 0.5, n)
        const ang = r + card.sway.x
        const bob = idle ? Math.sin(idleT * 0.55 + t * 1.7) * 0.0022 * G * idle : 0
        card.mesh.position.set(Math.cos(ang) * Pt, Math.sin(ang) * Pt + bob, focus * 0.06 * G)
        card.mesh.rotation.set(0, 0, ang + g)
        card.mesh.scale.setScalar((0.9 + (C.focusS - 0.9) * focus) * (1 + card.press.x) * G)
        card.mesh.visible = Math.abs(r) < Math.PI * 0.72
        card.mesh.renderOrder = Math.round(focus * 10)
        const u = card.mat.uniforms
        u.uVel.value = vel
        u.uJerk.value = jerk
        u.uBend.value = C.bend * 0.02 * b
        u.uShear.value = C.shear * 0.06 * b
        u.uTrail.value = C.trail * 0.03 * b
        u.uWarp.value = C.warp * 0.03 * b
        u.uPush.value = C.push * 0.03 * b
        u.uRestWarp.value = C.restWarp * C.warp * 0.03 * b
        u.uFocus.value = focus
        u.uDrift.value = stacked ? 0 : C.drift
        u.uArc.value = C.arc * (focus > 0.5 && clock < 4.3 ? 1 + Math.sin(clock * 2.4 + 1.7) * 0.3 * (1 - clock / 4.3) : 1)
        u.uIdle.value = focus > 0.6 ? idle * 0.045 * 0.22 * 0.1 : 0
        u.uIdleT.value = idleT * 2
        u.uTime.value = clock
        u.uPress.value = Math.max(0, -card.press.x) * 4
        u.uLoaded.value = card.loadedAt < 0 ? 0 : reduced ? 1 : clamp((clock - card.loadedAt) / 0.8, 0, 1)

        // the mark on the other wheel runs the opposite way (up while the cards go down), a little behind
        const die = dies[t]
        springStep(die.foc, focus, 0.08, 2 * Math.sqrt(0.08), n)
        const f = clamp(die.foc.x, 0, 1)
        const wob = pt * C.lean * 1.6 * (6 + die.seed * 4)
        springStep(die.wob, wob, 0.13 + die.seed * 0.04, 0.34, n)
        springStep(die.rock, jerk * 0.12 * 1.2 * (0.7 + die.seed * 0.6), 0.16 + die.seed * 0.05, 0.55, n)
        const O = Math.PI + r
        const side = C.dieRatio * cardH * G * (0.9 + (C.focusS - 0.9) * f)
        die.mesh.position.set(Math.cos(O) * Pt, Math.sin(O) * Pt + bob, f * 0.06 * G)
        die.mesh.rotation.set(die.rock.x, die.wob.x * 0.3, O - Math.PI + g - die.wob.x)
        die.mesh.scale.setScalar(side)
        die.mesh.visible = card.mesh.visible
        die.mesh.renderOrder = card.mesh.renderOrder
        die.mat.uniforms.uFocus.value = f
        die.mat.uniforms.uVel.value = vel
        die.mat.uniforms.uSheen.value = V * 0.6 + die.seed
        die.mat.uniforms.uTime.value = clock
      })
      drawLines()
      renderer.render(scene, camera)
    }

    let raf = 0
    let last = 0
    let visible = true
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.max(0, now - last)
      last = now
      frame(dt)
    }
    const start = () => {
      if (raf || !visible || document.hidden) return
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      cancelAnimationFrame(raf)
      raf = 0
    }

    layout()
    placeWheels()
    const ro = new ResizeObserver(() => {
      layout()
      for (const line of lines) line.h = 0
    })
    ro.observe(root)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start()
      else stop()
    })
    io.observe(root)
    const onVisibility = () => (document.hidden ? stop() : start())
    root.addEventListener('wheel', onWheel, {passive: false})
    root.addEventListener('pointerdown', onDown)
    root.addEventListener('pointermove', onMove)
    root.addEventListener('pointerup', onUp)
    root.addEventListener('pointercancel', onUp)
    root.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      root.removeEventListener('wheel', onWheel)
      root.removeEventListener('pointerdown', onDown)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerup', onUp)
      root.removeEventListener('pointercancel', onUp)
      root.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVisibility)
      cardGeo.dispose()
      dieGeo.dispose()
      for (const c of cards) c.mat.dispose()
      for (const d of dies) d.mat.dispose()
      for (const t of textures) t.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [key, captureWheel, background, textColor])

  return (
    <div
      ref={rootRef}
      // a page-level Lenis must leave the wheel to us
      data-lenis-prevent={captureWheel || undefined}
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Selected work"
      className={`relative h-full w-full cursor-grab touch-pan-y overflow-hidden outline-none select-none ${className}`}
      style={{background, color: textColor}}
    >
      <div className="pointer-events-none absolute inset-0 z-1 flex flex-col items-center justify-center gap-3 text-center">
        <div ref={(el) => void (linesRef.current[0] = el)} className="relative w-[min(60%,22rem)] overflow-hidden font-mono text-[11px] tracking-[0.12em] opacity-60" />
        <div ref={(el) => void (linesRef.current[1] = el)} className="relative w-[min(60%,22rem)] overflow-hidden text-[clamp(28px,3vw,44px)] leading-[1.1] font-medium tracking-[-0.02em]" />
        <div ref={(el) => void (linesRef.current[2] = el)} className="relative w-[min(60%,22rem)] overflow-hidden font-mono text-[11px] tracking-[0.12em] opacity-60" />
        <a href="#" className="pointer-events-auto mt-3 rounded-full border border-current/25 px-4 py-2 text-xs font-medium">
          View project
        </a>
      </div>
    </div>
  )
}
