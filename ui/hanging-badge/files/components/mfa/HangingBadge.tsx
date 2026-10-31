'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'

export type HangingBadgeProps = {
  name?: string
  role?: string
  /** badge number, printed bottom right and encoded on the back */
  code?: string
  /** small label at the top of the front */
  label?: string
  accent?: string
  cardColor?: string
  backColor?: string
  strapColor?: string
  /** text repeated along the strap */
  strapText?: string
  className?: string
}

// World units. The strap hangs from ANCHOR_Y in ROPE links of LINK length.
const ANCHOR_Y = 2.05
const ROPE = 3
const LINK = 0.82
const CARD_W = 1.58
const CARD_H = 2.12
const CARD_D = 0.05
const HANG = CARD_H / 2 - 0.09 // card centre below the last rope node
const DT = 1 / 60 // fixed physics step
const GRAVITY = -22
const DAMPING = 0.986
const SOLVES = 18

type Node = {x: number; y: number; z: number; ox: number; oy: number; oz: number; pinned: boolean}
const node = (x: number, y: number, z: number, pinned = false): Node => ({
  x,
  y,
  z,
  ox: x,
  oy: y,
  oz: z,
  pinned,
})

// A 3D event badge on a lanyard. Grab it, drag it (sideways drags turn it),
// throw it, let it swing; a fast throw spins it until a spring settles it.
//
// The strap is a short verlet rope: links may slacken but not stretch
// (rope, not rod), and a minimum spacing stops them bunching. The card
// hangs from the last node, tipping a little with how far it is pulled out
// and over, and turns about its vertical axis on its own spring. Both faces
// are painted on canvases from the props, so there is nothing to load.
export default function HangingBadge({
  name = 'Your Name',
  role = 'Creative Developer',
  code = 'MFA-0001',
  label = 'ALL ACCESS · 2026',
  accent = '#ff6a2b',
  cardColor = '#141318',
  backColor = '#ff6a2b',
  strapColor = '#ff6a2b',
  strapText = 'MADEFORAWARD',
  className = '',
}: HangingBadgeProps) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    const canvas = renderer.domElement
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y'
    root.appendChild(canvas)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const room = new RoomEnvironment()
    scene.environment = pmrem.fromScene(room, 0.04).texture
    scene.environmentIntensity = 0.28
    room.dispose()
    pmrem.dispose()
    const key = new THREE.DirectionalLight(0xffffff, 1.15)
    key.position.set(2.5, 3.5, 5)
    const rim = new THREE.DirectionalLight(0xffc7a8, 1.2)
    rim.position.set(-3, 1.5, -3)
    scene.add(key, rim, new THREE.AmbientLight(0xffffff, 0.08))

    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80)
    camera.position.set(0.7, -0.7, 7.1)
    camera.lookAt(0, -1.05, 0)

    // The card: a rounded slab with both faces painted from canvases.
    const anisotropy = renderer.capabilities.getMaxAnisotropy()
    const face = (paint: (c: CanvasRenderingContext2D, w: number, h: number) => void) => {
      const c = document.createElement('canvas')
      c.width = 1024
      c.height = Math.round((1024 * CARD_H) / CARD_W)
      paint(c.getContext('2d')!, c.width, c.height)
      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = anisotropy
      return t
    }
    const frontMap = face((c, w, h) =>
      paintFront(c, w, h, {name, role, code, label, accent, cardColor}),
    )
    const backMap = face((c, w, h) => paintBack(c, w, h, {backColor, ink: cardColor, code}))
    const edge = new THREE.MeshPhysicalMaterial({color: cardColor, roughness: 0.5, metalness: 0.1})
    // A satin laminate: a soft sheen that moves with the card, never a white
    // glare washing out a dark design when it faces the camera.
    // A flat face catches a directional light's specular evenly all over, so
    // the dark front keeps that low: the sheen shows only at grazing angles.
    const front = new THREE.MeshPhysicalMaterial({
      map: frontMap,
      roughness: 0.55,
      specularIntensity: 0.25,
      clearcoat: 0.25,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.45,
    })
    const back = new THREE.MeshPhysicalMaterial({
      map: backMap,
      roughness: 0.62,
      clearcoat: 0.4,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.45,
    })
    const card = new THREE.Mesh(new RoundedBoxGeometry(CARD_W, CARD_H, CARD_D, 4, 0.06), [
      edge,
      edge,
      edge,
      edge,
      front,
      back,
    ])
    // The metal clip the strap goes through.
    const clip = new THREE.Mesh(
      new RoundedBoxGeometry(0.3, 0.16, 0.08, 3, 0.03),
      new THREE.MeshPhysicalMaterial({color: 0xd9d9de, metalness: 0.95, roughness: 0.22}),
    )
    clip.position.y = CARD_H / 2 + 0.02
    card.add(clip)
    scene.add(card)

    // The strap: a flat ribbon rebuilt each frame along a curve through the rope.
    const SAMPLES = 64
    const strapGeo = new THREE.BufferGeometry()
    const strapPos = new Float32Array((SAMPLES + 1) * 2 * 3)
    const strapUv = new Float32Array((SAMPLES + 1) * 2 * 2)
    const strapIdx: number[] = []
    for (let i = 0; i <= SAMPLES; i++) {
      strapUv.set([0, i / SAMPLES, 1, i / SAMPLES], i * 4)
      if (i < SAMPLES) strapIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2)
    }
    strapGeo.setAttribute('position', new THREE.BufferAttribute(strapPos, 3))
    strapGeo.setAttribute('uv', new THREE.BufferAttribute(strapUv, 2))
    strapGeo.setIndex(strapIdx)
    const strapMap = paintStrap(strapText, strapColor)
    strapMap.anisotropy = anisotropy
    const strap = new THREE.Mesh(
      strapGeo,
      new THREE.MeshStandardMaterial({map: strapMap, roughness: 0.75, side: THREE.DoubleSide}),
    )
    strap.frustumCulled = false
    scene.add(strap)

    // The rope.
    const anchor = node(0, ANCHOR_Y, 0, true)
    const rope = Array.from({length: ROPE}, (_, i) => node(0, ANCHOR_Y - LINK * (i + 1), 0))
    const chain = [anchor, ...rope]
    const end = rope[ROPE - 1]
    let spin = 0 // card turn about its vertical axis, rad
    let spinV = 0
    let clock = 0
    let carry = 0
    const grab = {on: false, id: -1, ox: 0, oy: 0, oz: 0, vx: 0, vy: 0, vz: 0, t: 0, ndcX: 0}

    // Drop in: start swung out to one side.
    if (!still)
      rope.forEach((p, i) => {
        p.x = p.ox = -Math.sin(1.25) * LINK * (i + 1)
        p.y = p.oy = ANCHOR_Y - Math.cos(1.25) * LINK * (i + 1)
      })

    const step = () => {
      for (const p of chain) {
        if (p.pinned) {
          ;[p.ox, p.oy, p.oz] = [p.x, p.y, p.z]
          continue
        }
        const vx = (p.x - p.ox) * DAMPING
        const vy = (p.y - p.oy) * DAMPING
        const vz = (p.z - p.oz) * DAMPING
        ;[p.ox, p.oy, p.oz] = [p.x, p.y, p.z]
        p.x += vx
        p.y += vy + GRAVITY * DT * DT
        p.z += vz
      }
      for (let n = 0; n < SOLVES; n++)
        for (let i = 0; i < ROPE; i++) {
          correct(chain[i], chain[i + 1], LINK, true)
          correct(chain[i], chain[i + 1], LINK * 0.34, false)
        }
      // Never above the anchor, never far below the rest length, back toward the plane.
      for (const p of rope) {
        p.y = Math.min(ANCHOR_Y - 0.03, Math.max(ANCHOR_Y - LINK * ROPE * 1.45, p.y))
        p.z *= 0.92
      }
      clock += DT
      if (!grab.on) {
        // Fast spins coast; slow ones spring to the nearest whole turn, with a faint idle sway.
        const rest = Math.round(spin / (Math.PI * 2)) * Math.PI * 2 + Math.sin(clock * 0.55) * 0.07
        if (Math.abs(spinV) > 1.6) spinV *= 0.985
        else spinV = (spinV + (rest - spin) * 6 * DT) * 0.9
        spin += spinV * DT
        if (!still) end.x += Math.sin(clock * 0.7) * 4.5e-4
      }
    }

    const top = new THREE.Vector3()
    const curvePts = Array.from({length: 5}, () => new THREE.Vector3())
    const curve = new THREE.CatmullRomCurve3(curvePts, false, 'catmullrom', 0.45)
    const tangent = new THREE.Vector3()
    const side = new THREE.Vector3()
    const toCam = new THREE.Vector3()
    const point = new THREE.Vector3()
    const pose = () => {
      const len = LINK * ROPE
      const out = Math.max(-1, Math.min(1, end.x / len))
      const pulled = Math.max(-1, Math.min(1, (ANCHOR_Y - len - end.y) / len))
      card.position.set(end.x, end.y - HANG, end.z)
      card.rotation.set(-0.18 + pulled * 0.22, spin, out * 0.12)
      card.updateMatrixWorld(true)
      // Strap: from above the frame, through the anchor and rope, to the clip.
      top.set(0, CARD_H / 2 + 0.02, 0).applyMatrix4(card.matrixWorld)
      curvePts[0].set(anchor.x, anchor.y + 2, anchor.z)
      curvePts[1].set(anchor.x, anchor.y, anchor.z)
      curvePts[2].set(rope[0].x, rope[0].y, rope[0].z)
      curvePts[3].set(rope[1].x, rope[1].y, rope[1].z)
      curvePts[4].copy(top)
      for (let i = 0; i <= SAMPLES; i++) {
        const t = i / SAMPLES
        curve.getPoint(t, point)
        curve.getTangent(t, tangent)
        toCam.subVectors(camera.position, point).normalize()
        side.crossVectors(tangent, toCam).normalize().multiplyScalar(0.075)
        strapPos.set(
          [
            point.x - side.x,
            point.y - side.y,
            point.z - side.z,
            point.x + side.x,
            point.y + side.y,
            point.z + side.z,
          ],
          i * 6,
        )
      }
      strapGeo.attributes.position.needsUpdate = true
      strapGeo.computeVertexNormals()
    }

    // Grab the card where it was pressed and drag it on a plane facing the camera.
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const plane = new THREE.Plane()
    const hit = new THREE.Vector3()
    const aim = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
    }
    const onDown = (e: PointerEvent) => {
      aim(e)
      const hits = raycaster.intersectObject(card, true)
      if (!hits.length) return
      e.preventDefault()
      canvas.setPointerCapture(e.pointerId)
      const p = hits[0].point
      Object.assign(grab, {
        on: true,
        id: e.pointerId,
        ox: card.position.x - p.x,
        oy: card.position.y - p.y,
        oz: card.position.z - p.z,
        vx: 0,
        vy: 0,
        vz: 0,
        t: performance.now(),
        ndcX: ndc.x,
      })
      plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), p)
      end.pinned = true
      canvas.style.cursor = 'grabbing'
    }
    const onMove = (e: PointerEvent) => {
      aim(e)
      if (!grab.on) {
        if (e.pointerType === 'mouse')
          canvas.style.cursor = raycaster.intersectObject(card, true).length ? 'grab' : ''
        return
      }
      if (e.pointerId !== grab.id || !raycaster.ray.intersectPlane(plane, hit)) return
      // Keep the card within reach of where it rests.
      const reach = LINK * ROPE * 0.85 * 1.28
      const restY = ANCHOR_Y - LINK * ROPE - HANG
      let x = hit.x + grab.ox
      let y = hit.y + grab.oy
      const z = Math.max(-0.4, Math.min(0.4, hit.z + grab.oz))
      const d = Math.hypot(x, y - restY)
      if (d > reach) [x, y] = [(x / d) * reach, restY + ((y - restY) / d) * reach]
      const now = performance.now()
      const dt = Math.max(DT, (now - grab.t) / 1000)
      const ty = y + HANG
      ;[grab.vx, grab.vy, grab.vz] = [(x - end.x) / dt, (ty - end.y) / dt, (z - end.z) / dt]
      // Sideways drags turn the card.
      const turn = (ndc.x - grab.ndcX) * 3.4
      spin += turn
      spinV = turn / dt
      grab.ndcX = ndc.x
      grab.t = now
      Object.assign(end, {x, y: ty, z, ox: x, oy: ty, oz: z})
    }
    const onUp = (e: PointerEvent) => {
      if (!grab.on || e.pointerId !== grab.id) return
      grab.on = false
      end.pinned = false
      canvas.releasePointerCapture(e.pointerId)
      canvas.style.cursor = 'grab'
      // Throw: the drag's speed becomes the node's verlet velocity.
      const vx = Math.max(-10, Math.min(10, grab.vx * 0.55))
      const vy = Math.max(-12, Math.min(12, grab.vy * 0.55))
      const vz = Math.max(-4, Math.min(4, grab.vz * 0.55))
      ;[end.ox, end.oy, end.oz] = [end.x - vx * DT, end.y - vy * DT, end.z - vz * DT]
      spinV += Math.max(-8, Math.min(8, -vx * 0.28))
    }

    let raf = 0
    let last = 0
    let running = false
    let visible = true
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      carry += Math.min(0.05, (now - last) / 1000)
      last = now
      // Fixed steps, at most two a frame so a slow frame never snowballs.
      for (let n = 0; carry >= DT && n < 2; n++) {
        step()
        carry -= DT
      }
      if (carry >= DT) carry = 0
      pose()
      renderer.render(scene, camera)
    }
    const run = () => {
      const should = visible && !document.hidden
      if (should && !running) {
        running = true
        last = performance.now()
        raf = requestAnimationFrame(frame)
      } else if (!should && running) {
        running = false
        cancelAnimationFrame(raf)
      }
    }
    const resize = () => {
      const w = Math.max(1, root.clientWidth)
      const h = Math.max(1, root.clientHeight)
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      pose()
      renderer.render(scene, camera)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(root)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      run()
    })
    io.observe(root)
    document.addEventListener('visibilitychange', run)
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    run()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', run)
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      scene.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        o.geometry.dispose()
        for (const m of [o.material].flat()) m.dispose()
      })
      for (const t of [frontMap, backMap, strapMap]) t.dispose()
      scene.environment?.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [name, role, code, label, accent, cardColor, backColor, strapColor, strapText])

  return <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} />
}

// Rope links: `shorten` pulls a stretched link back to `length`; otherwise
// a link closer than `length` is pushed apart. Pinned nodes don't move.
function correct(a: Node, b: Node, length: number, shorten: boolean) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const dz = b.z - a.z
  const d = Math.hypot(dx, dy, dz)
  if (d < 1e-8 || (shorten ? d <= length : d >= length) || (a.pinned && b.pinned)) return
  const k = (d - length) / d
  const share = a.pinned || b.pinned ? 1 : 0.5
  if (!a.pinned)
    [a.x, a.y, a.z] = [a.x + dx * k * share, a.y + dy * k * share, a.z + dz * k * share]
  if (!b.pinned)
    [b.x, b.y, b.z] = [b.x - dx * k * share, b.y - dy * k * share, b.z - dz * k * share]
}

const FONT = '"Space Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif'

function paintFront(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: {name: string; role: string; code: string; label: string; accent: string; cardColor: string},
) {
  c.fillStyle = p.cardColor
  c.fillRect(0, 0, w, h)
  // A soft glow and a gradient disc for colour.
  const glow = c.createRadialGradient(w * 0.8, h * 0.2, 0, w * 0.8, h * 0.2, w)
  glow.addColorStop(0, hexAlpha(p.accent, 0.35))
  glow.addColorStop(1, hexAlpha(p.accent, 0))
  c.fillStyle = glow
  c.fillRect(0, 0, w, h)
  const disc = c.createLinearGradient(w * 0.08, h * 0.2, w * 0.48, h * 0.44)
  disc.addColorStop(0, p.accent)
  disc.addColorStop(0.55, '#ff3d81')
  disc.addColorStop(1, '#5b3bff')
  c.fillStyle = disc
  c.beginPath()
  c.arc(w * 0.27, h * 0.34, w * 0.19, 0, Math.PI * 2)
  c.fill()
  // Punched slot at the top.
  c.fillStyle = 'rgba(0,0,0,0.6)'
  c.beginPath()
  c.roundRect(w / 2 - 70, 46, 140, 26, 13)
  c.fill()

  c.fillStyle = 'rgba(255,255,255,0.55)'
  c.font = `600 34px ${FONT}`
  c.fillText(p.label, 80, 160)
  c.fillStyle = '#fff'
  c.font = `700 110px ${FONT}`
  c.fillText(p.name, 80, h * 0.66)
  c.fillStyle = 'rgba(255,255,255,0.6)'
  c.font = `500 46px ${FONT}`
  c.fillText(p.role, 80, h * 0.66 + 76)
  // Barcode.
  c.fillStyle = '#fff'
  for (let i = 0, x = 80; i < 40; i++) {
    const bw = [3, 5, 8][(i * 7 + 3) % 3]
    c.fillRect(x, h - 190, bw, 90)
    x += bw + [4, 6, 9][(i * 5 + 1) % 3]
  }
  c.fillStyle = p.accent
  c.font = `700 40px ${FONT}`
  c.textAlign = 'right'
  c.fillText(p.code, w - 80, h - 108)
}

function paintBack(
  c: CanvasRenderingContext2D,
  w: number,
  h: number,
  p: {backColor: string; ink: string; code: string},
) {
  c.fillStyle = p.backColor
  c.fillRect(0, 0, w, h)
  // A QR-like grid seeded from the code, so each badge gets its own.
  const cells = 21
  const size = w * 0.5
  const cell = size / cells
  const ox = (w - size) / 2
  const oy = h * 0.28
  let seed = [...p.code].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) % 2147483647, 7)
  const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647
  c.fillStyle = p.ink
  for (let y = 0; y < cells; y++)
    for (let x = 0; x < cells; x++) {
      const cx = x > 13 ? x - 14 : x
      const cy = y > 13 ? y - 14 : y
      const finder = (x < 7 || x > 13) && (y < 7 || y > 13) && !(x > 13 && y > 13)
      const on = finder
        ? cx === 0 || cx === 6 || cy === 0 || cy === 6 || (cx > 1 && cx < 5 && cy > 1 && cy < 5)
        : rand() > 0.5
      if (on) c.fillRect(ox + x * cell, oy + y * cell, cell + 0.5, cell + 0.5)
    }
  c.textAlign = 'center'
  c.font = `700 58px ${FONT}`
  c.fillText('ALL ACCESS', w / 2, oy + size + 120)
  c.globalAlpha = 0.7
  c.font = `500 36px ${FONT}`
  c.fillText(p.code, w / 2, oy + size + 178)
  c.globalAlpha = 1
}

function paintStrap(text: string, color: string) {
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 1024
  const g = c.getContext('2d')!
  g.fillStyle = color
  g.fillRect(0, 0, c.width, c.height)
  // Stitched edges.
  g.fillStyle = 'rgba(0,0,0,0.14)'
  g.fillRect(0, 0, 8, c.height)
  g.fillRect(c.width - 8, 0, 8, c.height)
  // The text runs along the strap.
  g.save()
  g.translate(c.width / 2, 0)
  g.rotate(Math.PI / 2)
  g.fillStyle = 'rgba(255,255,255,0.92)'
  g.font = `700 60px ${FONT}`
  g.textBaseline = 'middle'
  const unit = `${text}  ·  `
  const step = g.measureText(unit).width
  for (let x = 0; x < c.height; x += step) g.fillText(unit, x, 0)
  g.restore()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.wrapT = THREE.RepeatWrapping
  t.repeat.set(1, 3)
  return t
}

// '#rrggbb' + alpha → rgba(), for canvas gradient stops.
function hexAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}
