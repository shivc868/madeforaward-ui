'use client'

import {useEffect, useRef, useState, type ReactNode} from 'react'
import * as THREE from 'three'

export type PaperFlowHeroProps = {
  /** image URLs (need CORS when remote); they repeat around the carousel */
  images?: string[]
  /** card width / height */
  aspect?: number
  /** background colour of the scene */
  background?: string
  /** content that arrives beside the wall at the end */
  aside?: ReactNode
  /** the scrolling element when it isn't the window */
  scroller?: HTMLElement | null
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=75&w=600&auto=format&fit=crop`
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
].map(unsplash)

// ---- the scene (lengths in CSS px; the screen plane is z = 0, the camera at z = V) ----
const V = 1000
// Scroll progress runs from START to 1 over SCROLL screens while the stage is
// pinned. The timeline is the reference's; the scene opens on the full carousel.
const START = 0.34
const SCROLL = 3 * (1 - START)
const PHASE = {
  carousel: [0.04, 0.34],
  land: [0.42, 0.94], // the camera zooms in while cards land on the wall
  fly: 0.16, // one card's flight to the wall
  mask: [0.7, 0.97], // the wall shrinks into its panel
  aside: [0.78, 1],
}
const SLIDES = 8 // spacings a card takes to slide off the carousel
const LEAVE_END = PHASE.land[1] - PHASE.fly
const CAROUSEL = {inner: 0.5, above: (22 * Math.PI) / 180, nearest: 2.6, wide: 0.4, high: 0.32}
const WALL = {lens: 2, twist: (35 * Math.PI) / 180, tilt: (53 * Math.PI) / 180, roll: (-6 * Math.PI) / 180, size: 0.3, gap: 0.14, slide: 240}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}
const septic = (x: number) => {
  const t = clamp(x, 0, 1)
  return t ** 4 * (35 - 84 * t + 70 * t * t - 20 * t ** 3)
}
const quintic = (x: number) => {
  const t = clamp(x, 0, 1)
  return t * t * t * (t * (6 * t - 15) + 10)
}
const easeIn3 = (e: number) => e * e * e - (e * e * e * e) / 2
const hermite = (p0: number, m0: number, p1: number, m1: number, t: number) => {
  const t2 = t * t
  const t3 = t2 * t
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * p1 + (t3 - t2) * m1
}

type V3 = [number, number, number]
type Q = [number, number, number, number]
const v3 = (v: THREE.Vector3): V3 => [v.x, v.y, v.z]
const basisQ = (x: V3, y: V3): Q => {
  const X = new THREE.Vector3(...x)
  const Y = new THREE.Vector3(...y)
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, X.clone().cross(Y)))
  return [q.x, q.y, q.z, q.w]
}
const slerp = (a: Q, b: Q, t: number): Q => {
  const q = new THREE.Quaternion(...a).slerp(new THREE.Quaternion(...b), t)
  return [q.x, q.y, q.z, q.w]
}

// The carousel turns slowly at first, then speeds up so each slot passes
// the gate just as it is due to leave, then winds down.
function schedule(L: number) {
  const step = (2 * Math.PI) / L
  const [n, r] = PHASE.carousel
  const o = (LEAVE_END - r) / (L - 1 + SLIDES)
  const s = SLIDES * o
  const c = r + s
  const leaveRate = step / o
  const u = 0.2 * (r - n)
  const gatherRate = (2 * Math.PI * 0.5) / (r - n - u / 2)
  const turn = (e: number) => {
    if (e <= n) return 0
    if (e <= n + u) return gatherRate * u * easeIn3((e - n) / u)
    let a = gatherRate * (u / 2 + Math.min(e, r) - n - u)
    if (e <= r) return a
    a += gatherRate * (Math.min(e, c) - r) + (leaveRate - gatherRate) * s * easeIn3(Math.min(1, (e - r) / s))
    if (e <= c) return a
    a += leaveRate * (Math.min(e, LEAVE_END) - c)
    if (e <= LEAVE_END) return a
    const k = Math.min(1, (e - LEAVE_END) / s)
    return a + leaveRate * s * (k - easeIn3(k))
  }
  const h = Math.round((Math.PI / 2 - turn(c)) / step)
  const goes = Array.from({length: L}, (_, k) => (((h - k) % L) + L) % L) // goes[k] = slot leaving k-th
  const slides = Array(L).fill(0)
  const lets = Array(L).fill(0)
  goes.forEach((slot, k) => {
    slides[slot] = r + k * o
    lets[slot] = c + k * o
  })
  return {slides, lets, goes, turn, gate: h * step + turn(c)}
}

type Pose = {at: V3; q: Q; hw: number; hl: number; flutter: number; picture: number; phase: number}

const VERT = /* glsl */ `
attribute vec4 aWhere;  // centre xyz, flutter phase
attribute vec4 aQuat;
attribute vec4 aShape;  // half width, half length, flutter, picture
attribute float aBlur;
uniform vec2 uCells;
varying vec2 vUv;
varying vec3 vNormal;
varying vec2 vLocal;
varying float vSize;
varying float vBlur;
vec3 rotate(vec4 q, vec3 v) { return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
vec3 sheet(vec2 p) {
  vec3 local = vec3(p.x * aShape.x, p.y * aShape.y, aShape.z * aShape.y * sin(p.y * 2.6 + aWhere.w));
  return aWhere.xyz + rotate(aQuat, local);
}
void main() {
  vec2 p = position.xy;
  vec3 pos = sheet(p);
  vNormal = normalize(normalMatrix * cross(sheet(p + vec2(0.02, 0.0)) - pos, sheet(p + vec2(0.0, 0.02)) - pos));
  float pic = aShape.w;
  vec2 cell = vec2(mod(pic, uCells.x), floor(pic / uCells.x));
  // atlas rows run top-down on the canvas; the card's +y edge is the image's top
  vUv = vec2((cell.x + p.x * 0.5 + 0.5) / uCells.x, 1.0 - (cell.y + 0.5 - p.y * 0.5) / uCells.y);
  vLocal = p;
  vSize = aShape.x / aShape.y;
  vBlur = aBlur;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
varying vec2 vUv;
varying vec3 vNormal;
varying vec2 vLocal;
varying float vSize;
varying float vBlur;
void main() {
  // rounded corners, anti-aliased through alpha to coverage
  vec2 q = abs(vLocal) * vec2(vSize, 1.0);
  vec2 box = vec2(vSize, 1.0) - 0.035;
  float d = length(max(q - box, 0.0)) - 0.035;
  float a = 1.0 - smoothstep(-fwidth(d), fwidth(d), d);
  if (a <= 0.0) discard;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  float light = 0.72 + 0.28 * max(dot(n, normalize(vec3(-0.25, 0.45, 1.0))), 0.0);
  float sheen = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), n), normalize(vec3(-0.3, 0.6, 0.75))), 0.0), 24.0) * 0.12;
  // cards close to the lens go soft, with a slight colour split
  vec2 split = vec2(0.004 * vBlur, 0.0);
  float lod = vBlur * 3.5;
  vec3 c = vec3(texture2D(uAtlas, vUv + split, lod).r, texture2D(uAtlas, vUv, lod).g, texture2D(uAtlas, vUv - split, lod).b);
  if (!gl_FrontFacing) c *= 0.82; // the back of a print, a little darker
  gl_FragColor = vec4(c * light + sheen, a);
  #include <colorspace_fragment>
}`

const DEFAULT_ASIDE = (
  <div className="flex max-w-xl flex-col gap-4 md:gap-8">
    <h2 className="text-[clamp(34px,6.5vw,112px)] leading-[0.95] font-medium tracking-[-0.045em]">
      Begin with
      <br />
      the best bit
    </h2>
    <p className="max-w-80 leading-snug font-medium md:text-lg">Hundreds of hand-tuned layouts, made by people who design for a living.</p>
    <p className="ml-auto hidden max-w-72 text-lg leading-snug font-medium md:block">Choose the motion. Drop in your work. Skip the empty canvas.</p>
    <a href="#" className="pointer-events-auto w-fit rounded-full bg-[#141414] px-6 py-3 font-medium text-white">
      Browse layouts →
    </a>
  </div>
)

// A scroll scene: a tilted carousel of upright image fins spins up as you
// scroll, then one by one the cards slide off past the rim and fly onto
// a tilted wall while the camera zooms in; the wall settles into a panel
// beside your content and its rows drift like a marquee.
//
// The stage is pinned for SCROLL screens and scrubbed by scroll (with a
// little smoothing on top). One instanced three.js mesh draws every card;
// it only renders while the scroll moves, and not off screen.
export default function PaperFlowHero({
  images = DEFAULT_IMAGES,
  aspect = 720 / 1019,
  background = '#f2f2f0',
  aside = DEFAULT_ASIDE,
  scroller = null,
  className = '',
}: PaperFlowHeroProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const asideRef = useRef<HTMLDivElement>(null)
  const [stageH, setStageH] = useState(0)
  const imageKey = images.join('|')

  // the stage is as tall as the scroller's viewport
  useEffect(() => {
    const measure = () => setStageH(scroller ? scroller.clientHeight : window.innerHeight)
    measure()
    const ro = new ResizeObserver(measure)
    if (scroller) ro.observe(scroller)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [scroller])

  useEffect(() => {
    const root = rootRef.current
    const stage = stageRef.current
    const box = canvasBoxRef.current
    if (!root || !stage || !box) return
    const pictures = imageKey ? imageKey.split('|') : []

    const renderer = new THREE.WebGLRenderer({antialias: true, alpha: true, powerPreference: 'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setClearColor(0, 0)
    const canvas = renderer.domElement
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
    box.appendChild(canvas)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 12000)
    camera.position.set(0, 0, V)

    // image atlas: one cell per picture, cover-cropped to the card aspect
    const cols = Math.max(1, Math.ceil(Math.sqrt(pictures.length)))
    const rows = Math.max(1, Math.ceil(pictures.length / cols))
    const cellW = 512
    const cellH = Math.round(cellW / aspect)
    const atlasCanvas = document.createElement('canvas')
    atlasCanvas.width = cols * cellW
    atlasCanvas.height = rows * cellH
    const ctx = atlasCanvas.getContext('2d')!
    ctx.fillStyle = '#d9d6cf' // shown until a picture loads
    ctx.fillRect(0, 0, atlasCanvas.width, atlasCanvas.height)
    const atlas = new THREE.CanvasTexture(atlasCanvas)
    atlas.colorSpace = THREE.SRGBColorSpace
    atlas.anisotropy = 4
    const loaded: HTMLImageElement[] = []
    pictures.forEach((src, i) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => {
        const s = Math.max(cellW / img.naturalWidth, cellH / img.naturalHeight)
        const w = img.naturalWidth * s
        const h = img.naturalHeight * s
        const x = (i % cols) * cellW
        const y = Math.floor(i / cols) * cellH
        ctx.save()
        ctx.beginPath()
        ctx.rect(x, y, cellW, cellH)
        ctx.clip()
        ctx.drawImage(img, x + (cellW - w) / 2, y + (cellH - h) / 2, w, h)
        ctx.restore()
        atlas.needsUpdate = true
        draw()
      }
      img.src = src
      loaded.push(img)
    })

    const MAX = 160
    const geometry = new THREE.InstancedBufferGeometry()
    const plane = new THREE.PlaneGeometry(2, 2, 2, 16)
    geometry.index = plane.index
    geometry.setAttribute('position', plane.getAttribute('position'))
    const attr = (name: string, size: number) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(MAX * size), size)
      a.setUsage(THREE.DynamicDrawUsage)
      geometry.setAttribute(name, a)
      return a
    }
    const aWhere = attr('aWhere', 4)
    const aQuat = attr('aQuat', 4)
    const aShape = attr('aShape', 4)
    const aBlur = attr('aBlur', 1)
    geometry.instanceCount = 0
    const material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      alphaToCoverage: true,
      uniforms: {uCells: {value: new THREE.Vector2(cols, rows)}, uAtlas: {value: atlas}},
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)

    let frame = {width: 1, height: 1}
    const panelOf = () =>
      frame.width < 768 ? {x: 0, y: 0, w: frame.width, h: frame.height * 0.52} : {x: 0, y: 0, w: frame.width * 0.49, h: frame.height}

    // carousel, wall and who goes where
    function build() {
      const W = frame.width
      const H = frame.height
      const radius = Math.min(CAROUSEL.wide * W, CAROUSEL.high * H, V / CAROUSEL.nearest)
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(CAROUSEL.above, 0, 0))
      const axis = v3(new THREE.Vector3(0, 1, 0).applyQuaternion(tilt))
      const front = v3(new THREE.Vector3(0, 0, 1).applyQuaternion(tilt))
      const dirAt = (a: number): V3 => [Math.sin(a), Math.cos(a) * front[1], Math.cos(a) * front[2]]
      const finW = (1 - CAROUSEL.inner) * radius
      const slotR = ((1 + CAROUSEL.inner) / 2) * radius
      const fromCyl = (angle: number, out: number): V3 => {
        const d = dirAt(angle)
        return [out * d[0], out * d[1], out * d[2]]
      }
      const finQ = (a: number) => basisQ(dirAt(a), axis)

      // wall: a tilted plane far back, seen through a 2× lens and shifted onto the panel
      const panel = panelOf()
      const shift: [number, number] = [panel.x + panel.w / 2 - W / 2, panel.y + panel.h / 2 - H / 2]
      const size = WALL.size * Math.sqrt(panel.w * panel.h)
      const cardW = size * aspect
      const pitch = cardW * (1 + WALL.gap)
      const rise = size + cardW * WALL.gap
      const wallQ = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(0, 0, WALL.roll))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-WALL.tilt, 0, 0)))
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, WALL.twist)))
      const middle = new THREE.Vector3(0, 0, V - WALL.lens * V)
      const project = (p: THREE.Vector3) => {
        const f = (V * WALL.lens) / (V - p.z)
        return [W / 2 + p.x * f + shift[0], H / 2 - p.y * f + shift[1]]
      }
      const slots: {way: number; x: number; y: number}[] = []
      for (let r = -14; r <= 14; r++) {
        for (let c = -14; c <= 14; c++) {
          const x = (c + (r % 2 ? 0.5 : 0)) * pitch
          const y = r * rise
          const [sx, sy] = project(new THREE.Vector3(x, y, 0).applyQuaternion(wallQ).add(middle))
          const m = size * 0.75
          if (sx > panel.x - m && sx < panel.x + panel.w + m && sy > panel.y - m && sy < panel.y + panel.h + m) slots.push({way: r % 2 ? -1 : 1, x, y})
        }
      }
      const L = Math.min(MAX, Math.max(2, slots.length))
      const plan = schedule(L)
      // wall seats in leaving order: nearest first to where the carousel lets go
      const [ex, ey] = project(new THREE.Vector3(...fromCyl(plan.gate, radius + finW / 2)))
      const order = slots
        .map((s, i) => {
          const [sx, sy] = project(new THREE.Vector3(s.x, s.y, 0).applyQuaternion(wallQ).add(middle))
          return {i, d: Math.hypot(sx - ex, sy - ey)}
        })
        .sort((a, b) => a.d - b.d)
        .map((o) => o.i)
      const landsOn = Array(L).fill(-1)
      plan.goes.forEach((slot, k) => k < order.length && (landsOn[slot] = order[k]))
      // pictures around the carousel, never the same one twice in a row
      const picture = (j: number) => (pictures.length ? (j * 5) % pictures.length : 0)
      return {L, plan, radius, axis, finW, slotR, fromCyl, finQ, slots, wallQ, middle, size, cardW, landsOn, picture}
    }
    type Cast = ReturnType<typeof build>
    let cast: Cast | null = null

    const wallPose = (c: Cast, j: number, w: number, p: number): Pose => {
      const s = c.slots[w]
      const slide = s.way * WALL.slide * smooth(PHASE.mask[0], 1.2, p)
      const at = new THREE.Vector3(s.x + slide, s.y, 0).applyQuaternion(c.wallQ).add(c.middle)
      return {at: v3(at), q: [c.wallQ.x, c.wallQ.y, c.wallQ.z, c.wallQ.w], hw: c.cardW / 2, hl: c.size / 2, flutter: 0, picture: c.picture(j), phase: 0}
    }
    const pose = (c: Cast, j: number, p: number): Pose => {
      const plan = c.plan
      const angle = (2 * Math.PI * j) / c.L + plan.turn(p)
      const seat: Pose = {at: c.fromCyl(angle, c.slotR), q: c.finQ(angle), hw: c.finW / 2, hl: c.finW / 2 / aspect, flutter: 0, picture: c.picture(j), phase: 0}
      const w = c.landsOn[j]
      if (w < 0 || p <= plan.slides[j]) return seat
      const rim = c.radius + c.finW / 2 + 14
      if (p < plan.lets[j]) {
        // slide out past the rim
        const t = quintic((p - plan.slides[j]) / (plan.lets[j] - plan.slides[j]))
        return {...seat, at: c.fromCyl(angle, lerp(c.slotR, rim, t))}
      }
      const t = (p - plan.lets[j]) / PHASE.fly
      const end = wallPose(c, j, w, p)
      if (t >= 1) return end
      // fly to the wall: leave along the carousel's spin, glide down onto the slot
      const exit = (2 * Math.PI * j) / c.L + plan.turn(plan.lets[j])
      const start = c.fromCyl(exit, rim)
      const ahead = c.fromCyl(exit + 0.25, rim)
      const e = quintic(t)
      const at = [0, 1, 2].map((k) => hermite(start[k], (ahead[k] - start[k]) * 2.2, end.at[k], 0, e))
      const lift = Math.sin(Math.PI * Math.min(1, t / 0.9)) * c.size * 0.9
      const n = new THREE.Vector3(0, 0, 1).applyQuaternion(c.wallQ)
      const turn = septic(t / 0.65)
      return {
        ...end,
        at: [at[0] + n.x * lift, at[1] + n.y * lift, at[2] + n.z * lift],
        q: slerp(c.finQ(exit), end.q, turn),
        hw: lerp(c.finW / 2, end.hw, turn),
        hl: lerp(c.finW / 2 / aspect, end.hl, turn),
        flutter: 0.04 * Math.sin(Math.PI * t),
        phase: j,
      }
    }

    let progress = START
    const draw = () => {
      if (!cast) cast = build()
      const p = progress
      // camera: the lens lengthens and shifts onto the panel while cards land
      const land = smooth(PHASE.land[0], PHASE.land[1], p)
      const zoom = 1 + (WALL.lens - 1) * land
      const panel = panelOf()
      const shift = [(panel.x + panel.w / 2 - frame.width / 2) * land, (panel.y + panel.h / 2 - frame.height / 2) * land]
      camera.zoom = zoom
      camera.setViewOffset(frame.width, frame.height, -shift[0], -shift[1], frame.width, frame.height)
      camera.updateProjectionMatrix()
      for (let j = 0; j < cast.L; j++) {
        const c = pose(cast, j, p)
        aWhere.setXYZW(j, c.at[0], c.at[1], c.at[2], c.phase)
        aQuat.setXYZW(j, c.q[0], c.q[1], c.q[2], c.q[3])
        aShape.setXYZW(j, c.hw, c.hl, c.flutter, c.picture)
        aBlur.setX(j, smooth(0.95, 1.45, (V * zoom) / (V - c.at[2])))
      }
      geometry.instanceCount = cast.L
      for (const at of [aWhere, aQuat, aShape, aBlur]) at.needsUpdate = true
      renderer.render(scene, camera)

      // the wall settles into its panel, the aside arrives
      const mask = smooth(PHASE.mask[0], PHASE.mask[1], p)
      box.style.clipPath =
        mask > 0 ? `inset(${lerp(0, panel.y, mask)}px ${lerp(0, frame.width - panel.x - panel.w, mask)}px ${lerp(0, frame.height - panel.y - panel.h, mask)}px ${lerp(0, panel.x, mask)}px)` : ''
      const asideIn = smooth(PHASE.aside[0], PHASE.aside[1], p)
      if (asideRef.current) {
        asideRef.current.style.opacity = String(asideIn)
        asideRef.current.style.transform = `translate3d(0, ${30 * (1 - asideIn)}px, 0)`
        asideRef.current.style.visibility = asideIn <= 0 ? 'hidden' : 'visible'
      }
    }

    const readProgress = () => {
      const r = root.getBoundingClientRect()
      const top = scroller ? scroller.getBoundingClientRect().top : 0
      const h = stage.clientHeight || 1
      return START + (1 - START) * clamp((top - r.top) / (h * SCROLL), 0, 1)
    }
    const resize = () => {
      const w = Math.max(1, stage.clientWidth)
      const h = Math.max(1, stage.clientHeight)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.fov = (2 * Math.atan(h / 2 / V) * 180) / Math.PI
      frame = {width: w, height: h}
      cast = null
      draw()
    }

    // the scene only changes with scroll, so it renders while progress moves
    let raf = 0
    let last = 0
    let running = false
    let visible = true
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop)
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
      last = now
      const target = readProgress()
      if (Math.abs(target - progress) < 1e-5) return
      progress += (target - progress) * (1 - Math.exp(-dt * 14)) // a little give on top of the scroll
      if (Math.abs(target - progress) < 1e-4) progress = target
      draw()
    }
    const start = () => {
      if (running || !visible || document.hidden) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(loop)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(raf)
    }

    progress = readProgress()
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting
      if (visible) start()
      else stop()
    })
    io.observe(root)
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()

    return () => {
      stop()
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      for (const img of loaded) img.onload = null
      geometry.dispose()
      plane.dispose()
      material.dispose()
      atlas.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [imageKey, aspect, scroller])

  const h = stageH || undefined
  return (
    <div ref={rootRef} className={`relative ${className}`} style={{height: h ? h * (SCROLL + 1) : `${(SCROLL + 1) * 100}svh`, background}}>
      <div ref={stageRef} className="sticky top-0 overflow-hidden" style={{height: h ?? '100svh'}}>
        <div ref={canvasBoxRef} className="absolute inset-0" />
        <div ref={asideRef} className="pointer-events-none invisible absolute inset-x-0 top-[54%] bottom-0 flex items-start p-6 opacity-0 md:inset-0 md:items-center md:pl-[55%]">
          {aside}
        </div>
      </div>
    </div>
  )
}
