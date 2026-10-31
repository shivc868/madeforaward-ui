import * as THREE from 'three'
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js'
import {SVGLoader} from 'three/examples/jsm/loaders/SVGLoader.js'

// One WebGL renderer for every PuffyIcon on the page. Each icon owns a plain
// 2D canvas; the stage renders that icon's group into the corner of its own
// (hidden) WebGL canvas and copies the pixels across. So fifty icons cost one
// WebGL context, and an icon only renders when its angle or size changes.

export type IconLook = {
  svg: string
  color: string
  iconColor: string
  /** outline from 0 = square to 1 = circle */
  roundness: number
  /** tile thickness as a share of its width */
  puff: number
  /** icon width as a share of the tile */
  iconScale: number
  /** how far the icon stands out of the tile */
  iconDepth: number
}

export type StageIcon = {
  group: THREE.Group
  pixels: number
  target: CanvasRenderingContext2D
}

// The tile is 1 unit wide; the camera frames 1.4 units so a tilted tile and
// its shadow never clip.
const FOV = 20
const FRAME = 1.4
const RADIUS = 0.5

// Below 2x screens, render 1.5x larger and scale down: smooth silhouettes
// that MSAA alone leaves stepped.
const supersample = (px: number) => Math.min(2048, Math.round(px * (window.devicePixelRatio >= 2 ? 1 : 1.5)))

let stage: ReturnType<typeof createStage> | null = null
let users = 0
let idle = 0

export function acquireStage() {
  clearTimeout(idle)
  stage ??= createStage()
  users++
  return stage
}

// Freed a moment after the last icon goes, not at once: when props change,
// every icon unmounts and remounts in the same tick, and rebuilding the
// WebGL context each time would soon run into the browser's context limit.
export function releaseStage() {
  if (--users > 0) return
  idle = window.setTimeout(() => {
    stage?.dispose()
    stage = null
  }, 2000)
}

function createStage() {
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: true})
  renderer.setPixelRatio(1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  renderer.setScissorTest(true)
  renderer.setClearColor(0x000000, 0)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const room = new RoomEnvironment()
  scene.environment = pmrem.fromScene(room, 0.04).texture
  scene.environmentIntensity = 0.7
  room.dispose()
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 20)
  camera.position.z = FRAME / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))

  // Key light from the top left: the icon's shadow falls across the tile.
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(-1.5, 2, 3.5)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.radius = 6
  sun.shadow.bias = -0.0005
  sun.shadow.normalBias = 0.01
  Object.assign(sun.shadow.camera, {left: -0.8, right: 0.8, top: 0.8, bottom: -0.8, near: 0.5, far: 8})
  scene.add(sun)

  const icons = new Set<StageIcon>()
  // Icons with the same shape share one geometry, freed with its last user.
  const geometries = new Map<string, {geo: THREE.BufferGeometry; users: number}>()
  let size = 0

  const geometry = (key: string, build: () => THREE.BufferGeometry) => {
    const entry = geometries.get(key) ?? {geo: build(), users: 0}
    entry.users++
    geometries.set(key, entry)
    return entry.geo
  }
  const releaseGeometry = (geo: THREE.BufferGeometry) =>
    geometries.forEach((entry, key) => {
      if (entry.geo === geo && --entry.users === 0) {
        geo.dispose()
        geometries.delete(key)
      }
    })

  return {
    add(look: IconLook, target: CanvasRenderingContext2D): StageIcon {
      const group = new THREE.Group()
      const tile = new THREE.Mesh(
        geometry(`tile|${look.roundness}|${look.puff}`, () =>
          superellipsoid(RADIUS, look.puff * RADIUS, 0.2 + look.roundness * 0.8, 0.5),
        ),
        new THREE.MeshPhysicalMaterial({color: look.color, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3}),
      )
      tile.receiveShadow = true
      const mark = new THREE.Mesh(
        geometry(`mark|${look.iconDepth}|${look.svg}`, () => extrudeSvg(look.svg, look.iconDepth)),
        new THREE.MeshPhysicalMaterial({color: look.iconColor, roughness: 0.38, clearcoat: 0.4, clearcoatRoughness: 0.3}),
      )
      mark.castShadow = true
      mark.scale.set(look.iconScale, look.iconScale, 1)
      // Sink the icon's base slightly into the tile's crown.
      mark.position.z = look.puff * RADIUS * 0.93
      group.add(tile, mark)
      group.visible = false
      scene.add(group)
      const icon = {group, pixels: 0, target}
      icons.add(icon)
      return icon
    },

    remove(icon: StageIcon) {
      icons.delete(icon)
      scene.remove(icon.group)
      icon.group.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return
        ;(o.material as THREE.Material).dispose()
        releaseGeometry(o.geometry)
      })
    },

    // Render one icon at the given tilt (degrees) into its 2D canvas.
    draw(icon: StageIcon, tiltX: number, tiltY: number) {
      const px = icon.pixels
      if (!px) return
      // The WebGL canvas is as big as the largest icon; smaller ones use a corner.
      const largest = Math.max(...[...icons].map((i) => supersample(i.pixels)))
      if (largest !== size) renderer.setSize((size = largest), size, false)
      const rp = supersample(px)
      icons.forEach((i) => (i.group.visible = i === icon))
      icon.group.rotation.set(THREE.MathUtils.degToRad(tiltX), THREE.MathUtils.degToRad(tiltY), 0)
      renderer.setViewport(0, 0, rp, rp)
      renderer.setScissor(0, 0, rp, rp)
      renderer.clear()
      renderer.render(scene, camera)
      // WebGL's origin is bottom-left, so the viewport sits at the canvas bottom.
      const {canvas: out} = icon.target
      // Both sides: a fresh canvas is 300×150, so a 300px icon matches on width alone.
      if (out.width !== px || out.height !== px) out.width = out.height = px
      icon.target.clearRect(0, 0, px, px)
      icon.target.drawImage(canvas, 0, size - rp, rp, rp, 0, 0, px, px)
    },

    dispose() {
      scene.environment?.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}

// A rounded, puffed tile: a superellipsoid whose outline is a squircle
// (exponent `e1`) and whose side profile bulges (exponent `e2`).
function superellipsoid(radius: number, depth: number, e1: number, e2: number) {
  const pow = (v: number, e: number) => Math.sign(v) * Math.abs(v) ** e
  const around = 160
  const across = 80
  const positions: number[] = []
  const index: number[] = []
  for (let j = 0; j <= across; j++) {
    const v = -Math.PI / 2 + (j / across) * Math.PI
    const ring = pow(Math.cos(v), e2)
    const z = depth * pow(Math.sin(v), e2)
    for (let i = 0; i < around; i++) {
      const u = (i / around) * Math.PI * 2
      positions.push(radius * ring * pow(Math.cos(u), e1), radius * ring * pow(Math.sin(u), e1), z)
    }
  }
  for (let j = 0; j < across; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * around + i
      const b = j * around + ((i + 1) % around)
      index.push(a, b, b + around, a, b + around, a + around)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setIndex(index)
  geo.computeVertexNormals()
  return geo
}

// An SVG's filled paths, extruded and fitted to a 1-unit box centred on the
// origin, with its back face at z = 0.
function extrudeSvg(svg: string, depth: number) {
  const shapes = new SVGLoader().parse(svg).paths.flatMap((p) => SVGLoader.createShapes(p))
  // Bevel in proportion to the icon (SVG units vary: 24, 256, …): a soft,
  // rounded edge that catches the light, kept inside the original outline.
  const bounds = new THREE.Box2().setFromPoints(shapes.flatMap((s) => s.getPoints()))
  const w = Math.max(bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y)
  const bevel = w * 0.025
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: w * 0.1,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 8,
    curveSegments: 32,
  })
  // SVG's y axis points down; turning the shape over flips it upright
  // without mirroring the faces inside out.
  geo.rotateX(Math.PI)
  geo.computeBoundingBox()
  const box = geo.boundingBox!
  const width = Math.max(box.max.x - box.min.x, box.max.y - box.min.y)
  geo.translate(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -box.min.z)
  geo.scale(1 / width, 1 / width, depth / (box.max.z - box.min.z))
  return geo
}
