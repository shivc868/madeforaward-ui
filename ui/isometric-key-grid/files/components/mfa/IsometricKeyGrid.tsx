'use client'

import {useEffect, useRef} from 'react'
import * as THREE from 'three'

export type IsometricKeyGridProps = {
  /** four colours for the glow that flows over raised keys and the floor */
  colors?: [string, string, string, string]
  /** colour of keys at rest */
  keyColor?: string
  background?: string
  /** how high a key under the pointer rises, in key heights */
  lift?: number
  /** radius of the raised area, in key spacings */
  radius?: number
  /** icon size as a share of a key */
  iconSize?: number
  /** space between keys, as a share of a key's width */
  gap?: number
  /** zoom on the field: 1 is the default, 2 makes every key twice as wide */
  keySize?: number
  className?: string
}

const KEY = 1 // key width
const KEY_H = 0.3 // key thickness
const BEVEL = 0.03
const FRUSTUM = 12 // ortho view height in world units
const ICON_KINDS = 8

// A field of soft keys seen from above at an angle. Keys near the pointer
// rise in a smooth dome and take on a slowly flowing gradient; the floor
// beneath glows with it; each key carries a small line icon.
//
// All keys are one instanced mesh and all icons another (the icons come
// from one canvas atlas), so the whole field is two draw calls. The raised
// shape follows the pointer with frame-rate independent smoothing, and
// rendering stops once the field has settled.
export default function IsometricKeyGrid({
  colors = ['#ff6a2b', '#ff3d81', '#7b4bff', '#ffc49a'],
  keyColor = '#16151a',
  background = '#08070a',
  lift = 1.6,
  radius = 3.4,
  iconSize = 0.52,
  gap = 0.06,
  keySize = 1.5,
  className = '',
}: IsometricKeyGridProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const palette = colors.join(',')

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const spacing = KEY * (1 + gap) // key centre to key centre
    const view = FRUSTUM / Math.max(0.5, keySize) // ortho view height; smaller = bigger keys

    const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'})
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    const canvas = renderer.domElement
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;touch-action:pan-y'
    root.appendChild(canvas)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(background)
    // Mirrored from the usual isometric view: looking in from the left.
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100)
    camera.position.set(-10, 12.5, 10)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.AmbientLight(0xffffff, 0.45))
    const sun = new THREE.DirectionalLight(0xffffff, 2)
    sun.position.set(-8, 15, 6)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    Object.assign(sun.shadow.camera, {
      left: -18,
      right: 18,
      top: 18,
      bottom: -18,
      near: 0.1,
      far: 60,
    })
    sun.shadow.bias = -0.0004
    scene.add(sun)

    // Shared uniforms: time, the eased pointer on the floor, the palette.
    const [a, b, c, d] = palette.split(',')
    const shared = {
      uTime: {value: 0},
      uPointer: {value: new THREE.Vector3()},
      uActive: {value: 0},
      uRadius: {value: radius * spacing},
      uA: {value: new THREE.Color(a)},
      uB: {value: new THREE.Color(b ?? a)},
      uC: {value: new THREE.Color(c ?? a)},
      uD: {value: new THREE.Color(d ?? a)},
    }
    // The flowing gradient: two slow travelling waves pick between the four
    // colours, so the colour drifts across a raised patch, never flickers.
    const flow = `
      vec3 flowColor(vec2 p, float t) {
        float a = 0.5 + 0.5 * sin(p.x * 0.9 + p.y * 0.4 + t * 0.9);
        float b = 0.5 + 0.5 * sin(p.y * 1.1 - p.x * 0.5 - t * 0.7 + 1.7);
        return mix(mix(uA, uB, a), mix(uC, uD, a), b);
      }`
    const sharedDecl = `uniform float uTime; uniform float uActive; uniform vec3 uPointer; uniform float uRadius; uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; uniform vec3 uD;`

    // Floor: picks up the glow under the raised patch.
    const floorMat = new THREE.MeshStandardMaterial({color: background, roughness: 0.95})
    floorMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, shared)
      s.vertexShader = `varying vec3 vWorld;\n${s.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvWorld = (modelMatrix * vec4(position, 1.0)).xyz;',
      )
      s.fragmentShader =
        `${sharedDecl}\nvarying vec3 vWorld;\n${flow}\n${s.fragmentShader}`.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
         float glow = smoothstep(uRadius * 1.6, uRadius * 0.1, distance(vWorld.xz, uPointer.xz));
         totalEmissiveRadiance += flowColor(vWorld.xz * 0.6, uTime) * glow * uActive * 1.2;`,
        )
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -KEY_H / 2 - 0.01
    floor.receiveShadow = true
    scene.add(floor)

    // Grid big enough to fill the view at any aspect.
    const aspect = Math.max(1, root.clientWidth / Math.max(1, root.clientHeight))
    const count = Math.min(44, Math.ceil((view * aspect * 1.7) / spacing) + 4)
    const cols = count
    const rows = count
    const total = cols * rows
    const ox = ((cols - 1) * spacing) / 2
    const oz = ((rows - 1) * spacing) / 2
    const keyX = (i: number) => (i % cols) * spacing - ox
    const keyZ = (i: number) => Math.floor(i / cols) * spacing - oz

    // Keys: a rounded square, extruded with a soft bevel.
    const shape = new THREE.Shape()
    const h = KEY / 2 - BEVEL
    const r = 0.24
    shape.moveTo(-h + r, -h)
    shape.lineTo(h - r, -h)
    shape.quadraticCurveTo(h, -h, h, -h + r)
    shape.lineTo(h, h - r)
    shape.quadraticCurveTo(h, h, h - r, h)
    shape.lineTo(-h + r, h)
    shape.quadraticCurveTo(-h, h, -h, h - r)
    shape.lineTo(-h, -h + r)
    shape.quadraticCurveTo(-h, -h, -h + r, -h)
    const keyGeo = new THREE.ExtrudeGeometry(shape, {
      depth: KEY_H,
      bevelEnabled: true,
      bevelSegments: 8,
      bevelSize: BEVEL,
      bevelThickness: BEVEL,
      curveSegments: 10,
    })
    keyGeo.center()
    keyGeo.rotateX(-Math.PI / 2)
    const raised = new Float32Array(total) // 0 at rest → 1 fully raised
    const raisedAttr = new THREE.InstancedBufferAttribute(raised, 1)
    keyGeo.setAttribute('aRaised', raisedAttr)
    const keyMat = new THREE.MeshStandardMaterial({color: keyColor, roughness: 0.8})
    const keyBase = new THREE.Color(keyColor)
    keyMat.onBeforeCompile = (s) => {
      Object.assign(s.uniforms, shared, {uBase: {value: keyBase}})
      s.vertexShader =
        `attribute float aRaised; varying float vRaised; varying vec3 vWorld;\n${s.vertexShader}`.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\nvRaised = aRaised;\nvWorld = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;',
        )
      s.fragmentShader =
        `${sharedDecl}\nuniform vec3 uBase; varying float vRaised; varying vec3 vWorld;\n${flow}\n${s.fragmentShader}`
          .replace(
            '#include <color_fragment>',
            `#include <color_fragment>
           vec3 lit = flowColor(vWorld.xz * 0.6 + vWorld.y * 0.3, uTime);
           diffuseColor.rgb = mix(uBase, lit, vRaised);`,
          )
          .replace(
            '#include <roughnessmap_fragment>',
            '#include <roughnessmap_fragment>\nroughnessFactor = mix(0.8, 0.25, vRaised);',
          )
          .replace(
            '#include <emissivemap_fragment>',
            '#include <emissivemap_fragment>\ntotalEmissiveRadiance += lit * vRaised * 0.9;',
          )
    }
    const keys = new THREE.InstancedMesh(keyGeo, keyMat, total)
    keys.castShadow = true
    keys.receiveShadow = true
    scene.add(keys)

    // Icons: one atlas, one instanced plane per key, picked by cell.
    const atlas = paintIcons()
    const iconGeo = new THREE.PlaneGeometry(KEY * iconSize, KEY * iconSize)
    iconGeo.rotateX(-Math.PI / 2)
    const cell = new Float32Array(total)
    for (let i = 0; i < total; i++) cell[i] = (i * 5 + Math.floor(i / cols) * 3) % ICON_KINDS
    iconGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cell, 1))
    iconGeo.setAttribute('aRaised', raisedAttr)
    const iconMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uAtlas: {value: atlas},
        uRest: {value: new THREE.Color('#8d8a96')},
        uLit: {value: new THREE.Color('#ffffff')},
      },
      vertexShader: `
        attribute float aCell; attribute float aRaised;
        varying vec2 vUv; varying float vRaised;
        void main() {
          vUv = vec2((uv.x + mod(aCell, 4.0)) / 4.0, (uv.y + floor(aCell / 4.0)) / 2.0);
          vRaised = aRaised;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D uAtlas; uniform vec3 uRest; uniform vec3 uLit;
        varying vec2 vUv; varying float vRaised;
        void main() {
          float a = texture2D(uAtlas, vUv).a;
          gl_FragColor = vec4(mix(uRest, uLit, vRaised), a * (0.75 + 0.25 * vRaised));
          #include <colorspace_fragment>
        }`,
    })
    const icons = new THREE.InstancedMesh(iconGeo, iconMat, total)
    scene.add(icons)

    const m = new THREE.Matrix4()
    const place = (i: number) => {
      const y = raised[i] * KEY_H * lift
      keys.setMatrixAt(i, m.makeTranslation(keyX(i), y, keyZ(i)))
      icons.setMatrixAt(i, m.makeTranslation(keyX(i), y + KEY_H / 2 + BEVEL + 0.004, keyZ(i)))
    }
    for (let i = 0; i < total; i++) place(i)

    // Pointer → a point on the key tops, eased. `active` fades the whole
    // raised patch in when the pointer arrives and out, in place, when it
    // leaves (the point itself stays where it was).
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const top = new THREE.Plane(new THREE.Vector3(0, 1, 0), -KEY_H / 2)
    const aim = new THREE.Vector3()
    const hit = new THREE.Vector3()
    let over = false
    let entered = false
    const active = shared.uActive
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      over = !!raycaster.ray.intersectPlane(top, hit)
      if (over) aim.copy(hit)
      wake()
    }
    const onLeave = () => {
      over = false
      wake()
    }

    let raf = 0
    let last = 0
    let visible = true
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
      last = now
      shared.uTime.value += dt
      const p = shared.uPointer.value
      // A fresh arrival starts the patch right under the pointer.
      if (over && !entered) p.copy(aim)
      entered = over || active.value > 0.001
      p.lerp(aim, 1 - Math.exp(-14 * dt))
      active.value += ((over ? 1 : 0) - active.value) * (still ? 1 : 1 - Math.exp(-6 * dt))
      const reach = radius * spacing
      const follow = still ? 1 : 1 - Math.exp(-10 * dt)
      let moving = Math.abs((over ? 1 : 0) - active.value) > 0.001
      let lit = false
      for (let i = 0; i < total; i++) {
        const dist = Math.hypot(keyX(i) - p.x, keyZ(i) - p.z)
        const goal = dist < reach ? (1 - dist / reach) ** 1.6 * active.value : 0
        const delta = goal - raised[i]
        if (Math.abs(delta) > 0.0005) {
          raised[i] += delta * follow
          place(i)
          moving = true
        } else if (raised[i] !== goal) {
          raised[i] = goal
          place(i)
        }
        if (raised[i] > 0.001) lit = true
      }
      keys.instanceMatrix.needsUpdate = true
      icons.instanceMatrix.needsUpdate = true
      raisedAttr.needsUpdate = true
      renderer.render(scene, camera)
      // Keep going while keys move or glow (the gradient flows); stop once all is dark and still.
      if (moving || lit || over) raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }

    const resize = () => {
      const w = Math.max(1, root.clientWidth)
      const hgt = Math.max(1, root.clientHeight)
      renderer.setSize(w, hgt, false)
      const ratio = w / hgt
      Object.assign(camera, {
        left: (-view * ratio) / 2,
        right: (view * ratio) / 2,
        top: view / 2,
        bottom: -view / 2,
      })
      camera.updateProjectionMatrix()
      renderer.render(scene, camera)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(root)
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', wake)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', wake)
      for (const g of [keyGeo, iconGeo, floor.geometry]) g.dispose()
      for (const mat of [keyMat, iconMat, floorMat]) mat.dispose()
      atlas.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [palette, keyColor, background, lift, radius, iconSize, gap, keySize])

  return <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} />
}

// Eight small line icons on a 4×2 canvas atlas (white strokes; the shader
// tints them). Our own simple marks: plus, ring, sparkle, triangle, arrow,
// square, wave, dot grid.
function paintIcons() {
  const size = 128
  const c = document.createElement('canvas')
  c.width = size * 4
  c.height = size * 2
  const g = c.getContext('2d')!
  g.strokeStyle = '#fff'
  g.fillStyle = '#fff'
  g.lineWidth = 9
  g.lineCap = 'round'
  g.lineJoin = 'round'
  const draws: ((cx: number, cy: number, r: number) => void)[] = [
    (x, y, r) => {
      g.beginPath()
      g.moveTo(x - r, y)
      g.lineTo(x + r, y)
      g.moveTo(x, y - r)
      g.lineTo(x, y + r)
      g.stroke()
    },
    (x, y, r) => {
      g.beginPath()
      g.arc(x, y, r * 0.8, 0, Math.PI * 2)
      g.stroke()
    },
    (x, y, r) => {
      g.beginPath()
      g.moveTo(x, y - r)
      g.quadraticCurveTo(x, y, x + r, y)
      g.quadraticCurveTo(x, y, x, y + r)
      g.quadraticCurveTo(x, y, x - r, y)
      g.quadraticCurveTo(x, y, x, y - r)
      g.fill()
    },
    (x, y, r) => {
      g.beginPath()
      g.moveTo(x, y - r * 0.85)
      g.lineTo(x + r * 0.9, y + r * 0.7)
      g.lineTo(x - r * 0.9, y + r * 0.7)
      g.closePath()
      g.stroke()
    },
    (x, y, r) => {
      g.beginPath()
      g.moveTo(x - r * 0.75, y + r * 0.75)
      g.lineTo(x + r * 0.75, y - r * 0.75)
      g.moveTo(x - r * 0.1, y - r * 0.75)
      g.lineTo(x + r * 0.75, y - r * 0.75)
      g.lineTo(x + r * 0.75, y + r * 0.1)
      g.stroke()
    },
    (x, y, r) => {
      g.beginPath()
      g.roundRect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5, r * 0.25)
      g.stroke()
    },
    (x, y, r) => {
      g.beginPath()
      g.moveTo(x - r, y)
      g.bezierCurveTo(x - r * 0.5, y - r * 0.8, x - r * 0.1, y - r * 0.8, x, y)
      g.bezierCurveTo(x + r * 0.1, y + r * 0.8, x + r * 0.5, y + r * 0.8, x + r, y)
      g.stroke()
    },
    (x, y, r) => {
      for (const dx of [-1, 0, 1])
        for (const dy of [-1, 0, 1]) {
          g.beginPath()
          g.arc(x + dx * r * 0.6, y + dy * r * 0.6, 6, 0, Math.PI * 2)
          g.fill()
        }
    },
  ]
  // Row 0 of the texture is the bottom of the canvas (flipY), so draw rows bottom-up.
  draws.forEach((draw, i) =>
    draw((i % 4) * size + size / 2, (1 - Math.floor(i / 4)) * size + size / 2, size * 0.32),
  )
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 8
  return t
}
