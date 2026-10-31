'use client'

import {useEffect, useRef} from 'react'

export type LiquidSmokeCursorProps = {
  /** smoke colour (ignored with rainbow) */
  color?: string
  /** cycle the hue on its own */
  rainbow?: boolean
  /** how dense the smoke looks, 0.1–3 */
  intensity?: number
  /** screen for dark sites, multiply for dark ink on light ones */
  blend?: 'normal' | 'screen' | 'multiply' | 'difference'
  /** how fast the trail fades, 0.2–12 */
  fade?: number
  /** how hard the pointer pushes the fluid */
  force?: number
  /** splat size, 0.02–1 */
  radius?: number
  /** vorticity: how much the smoke curls, 0–50 */
  swirl?: number
  /** soft light on the smoke's folds */
  shading?: boolean
  /** a click (or tap) puffs smoke out in a ring */
  clickBurst?: boolean
  /** 'page' follows the pointer over the whole window (pin the component full screen); 'inside' keeps it in this box */
  area?: 'page' | 'inside'
  quality?: 'low' | 'medium' | 'high'
  /** draw a dot or ring at the pointer, or keep the system cursor */
  cursor?: 'system' | 'dot' | 'ring'
  cursorSize?: number
  cursorColor?: string
  /** dot / ring grows over links and buttons and steps aside over text fields (area 'page') */
  hoverDetection?: boolean
  /** turn it off for visitors who ask for less motion */
  respectReducedMotion?: boolean
  className?: string
}

type Settings = {tint: [number, number, number]; rainbow: boolean; intensity: number; fade: number; force: number; radius: number; swirl: number; shading: boolean}
type Fluid = {place: (x: number, y: number) => void; move: (x: number, y: number) => void; burst: (x: number, y: number) => void; destroy: () => void}

const QUALITY = {
  low: {sim: 64, dye: 512, iterations: 10},
  medium: {sim: 128, dye: 768, iterations: 16},
  high: {sim: 128, dye: 1024, iterations: 20},
}

// boxes of 'inside' instances, so a page-wide trail steps around them
const insideBoxes = new Set<HTMLElement>()
const overInside = (self: HTMLElement, x: number, y: number) => {
  for (const el of insideBoxes) {
    if (el === self) continue
    const r = el.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true
  }
  return false
}

const hexRgb = (c: string): [number, number, number] => {
  let h = c.replace('#', '')
  if (h.length === 3) h = [...h].map((x) => x + x).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
const hsv = (h: number) => {
  const i = Math.floor(h * 6)
  const f = h * 6 - i
  const q = 1 - f
  return [
    [1, f, 0],
    [q, 1, 0],
    [0, 1, f],
    [0, q, 1],
    [f, 0, 1],
    [1, 0, q],
  ][((i % 6) + 6) % 6]
}

// Shaders follow WebGL Fluid Simulation by Pavel Dobryakov:
// https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
// Copyright (c) 2017 Pavel Dobryakov. MIT License: permission is granted,
// free of charge, to use, copy, modify, merge, publish and distribute
// it, provided this notice is kept. THE SOFTWARE IS PROVIDED "AS IS",
// WITHOUT WARRANTY OF ANY KIND.
const VERT = `precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`
const HEAD = `precision highp float;
precision highp sampler2D;
varying vec2 vUv, vL, vR, vT, vB;
`
const COPY = `${HEAD}uniform sampler2D uTexture;
void main () { gl_FragColor = texture2D(uTexture, vUv); }`
const CLEAR = `${HEAD}uniform sampler2D uTexture; uniform float value;
void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`
const SPLAT = `${HEAD}uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
void main () {
  vec2 p = vUv - point;
  p.x *= aspectRatio;
  gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.0);
}`
const ADVECT = `${HEAD}uniform sampler2D uVelocity, uSource; uniform vec2 texelSize; uniform float dt, dissipation;
void main () {
  vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
  gl_FragColor = texture2D(uSource, coord) / (1.0 + dissipation * dt);
}`
const DIVERGENCE = `${HEAD}uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x;
  float T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
  vec2 C = texture2D(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x;
  if (vR.x > 1.0) R = -C.x;
  if (vT.y > 1.0) T = -C.y;
  if (vB.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`
const CURL = `${HEAD}uniform sampler2D uVelocity;
void main () {
  float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y;
  float T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`
const VORTICITY = `${HEAD}uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
void main () {
  float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x;
  float T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x;
  float C = texture2D(uCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 0.0001;
  force *= curl * C;
  force.y *= -1.0;
  vec2 v = texture2D(uVelocity, vUv).xy + force * dt;
  gl_FragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
}`
const PRESSURE = `${HEAD}uniform sampler2D uPressure, uDivergence;
void main () {
  float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
  gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
}`
const GRADIENT = `${HEAD}uniform sampler2D uPressure, uVelocity;
void main () {
  float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x;
  float T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
  gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
}`
// dye → colour: density gives coverage; tint or the dye's own hue (rainbow)
const DISPLAY = `${HEAD}uniform sampler2D uTexture; uniform vec2 texelSize; uniform vec3 uTint; uniform float uGain, uRainbow, uShading;
void main () {
  vec3 dye = texture2D(uTexture, vUv).rgb;
  float light = 1.0;
  if (uShading > 0.5) {
    float dx = length(texture2D(uTexture, vR).rgb) - length(texture2D(uTexture, vL).rgb);
    float dy = length(texture2D(uTexture, vT).rgb) - length(texture2D(uTexture, vB).rgb);
    vec3 n = normalize(vec3(dx, dy, length(texelSize)));
    light = clamp(n.z + 0.7, 0.7, 1.0);
  }
  float density = max(dye.r, max(dye.g, dye.b));
  float coverage = 1.0 - exp(-density * uGain);
  vec3 color = mix(uTint * coverage, dye / max(density, 0.0001) * coverage, uRainbow) * light;
  gl_FragColor = vec4(color, coverage);
}`

// software WebGL (no GPU) would make the page crawl, so it gets no smoke
const isSoftware = (gl: WebGL2RenderingContext) => {
  const ext = gl.getExtension('WEBGL_debug_renderer_info')
  return /swiftshader|llvmpipe|software/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)))
}

function createFluid(canvas: HTMLCanvasElement, quality: (typeof QUALITY)['medium'], settings: () => Settings): Fluid | null {
  const gl = canvas.getContext('webgl2', {alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true})
  if (!gl || isSoftware(gl)) return null
  gl.getExtension('EXT_color_buffer_float')
  const HALF = gl.HALF_FLOAT

  const renderable = (internal: number, format: number) => {
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, HALF, null)
    const f = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, f)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.deleteFramebuffer(f)
    gl.deleteTexture(t)
    return ok
  }
  const pick = (formats: [number, number][]) => formats.find(([i, f]) => renderable(i, f)) ?? null
  const rgba = pick([[gl.RGBA16F, gl.RGBA]])
  const rg = pick([
    [gl.RG16F, gl.RG],
    [gl.RGBA16F, gl.RGBA],
  ])
  const r = pick([
    [gl.R16F, gl.RED],
    [gl.RG16F, gl.RG],
    [gl.RGBA16F, gl.RGBA],
  ])
  if (!rgba || !rg || !r) return null

  const shaders: WebGLShader[] = []
  const programs: WebGLProgram[] = []
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader failed')
    shaders.push(s)
    return s
  }
  const vert = shader(gl.VERTEX_SHADER, VERT)
  const program = (frag: string) => {
    const p = gl.createProgram()
    gl.attachShader(p, vert)
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, frag))
    gl.bindAttribLocation(p, 0, 'aPosition')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link failed')
    programs.push(p)
    const u: Record<string, WebGLUniformLocation | null> = {}
    for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(p, i)!.name
      u[name] = gl.getUniformLocation(p, name)
    }
    return {p, u}
  }
  const copyP = program(COPY)
  const clearP = program(CLEAR)
  const splatP = program(SPLAT)
  const advectP = program(ADVECT)
  const divergenceP = program(DIVERGENCE)
  const curlP = program(CURL)
  const vorticityP = program(VORTICITY)
  const pressureP = program(PRESSURE)
  const gradientP = program(GRADIENT)
  const displayP = program(DISPLAY)
  const bind = (prog: {p: WebGLProgram; u: Record<string, WebGLUniformLocation | null>}) => {
    gl.useProgram(prog.p)
    return prog.u
  }

  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW)
  const index = gl.createBuffer()
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index)
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)

  type Target = {texture: WebGLTexture; fbo: WebGLFramebuffer; width: number; height: number; tx: number; ty: number; attach: (unit: number) => number}
  type Double = {read: Target; write: Target; width: number; height: number; tx: number; ty: number; swap: () => void}
  const blit = (target: Target | null) => {
    if (target) {
      gl.viewport(0, 0, target.width, target.height)
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
  }
  const target = (w: number, h: number, [internal, format]: [number, number], filter: number): Target => {
    gl.activeTexture(gl.TEXTURE0)
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, HALF, null)
    const fbo = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    return {
      texture,
      fbo,
      width: w,
      height: h,
      tx: 1 / w,
      ty: 1 / h,
      attach: (unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit)
        gl.bindTexture(gl.TEXTURE_2D, texture)
        return unit
      },
    }
  }
  const free = (t: Target) => {
    gl.deleteFramebuffer(t.fbo)
    gl.deleteTexture(t.texture)
  }
  const double = (w: number, h: number, f: [number, number], filter: number): Double => {
    const d: Double = {read: target(w, h, f, filter), write: target(w, h, f, filter), width: w, height: h, tx: 1 / w, ty: 1 / h, swap: () => ([d.read, d.write] = [d.write, d.read])}
    return d
  }
  // keep the contents when the canvas resizes
  const resizeDouble = (d: Double, w: number, h: number, f: [number, number], filter: number) => {
    if (d.width === w && d.height === h) return d
    const next = target(w, h, f, filter)
    gl.uniform1i(bind(copyP).uTexture, d.read.attach(0))
    blit(next)
    free(d.read)
    free(d.write)
    return Object.assign(d, {read: next, write: target(w, h, f, filter), width: w, height: h, tx: 1 / w, ty: 1 / h})
  }
  const size = (res: number) => {
    let aspect = gl.drawingBufferWidth / gl.drawingBufferHeight
    if (aspect < 1) aspect = 1 / aspect
    const lo = Math.round(res)
    const hi = Math.round(res * aspect)
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? {w: hi, h: lo} : {w: lo, h: hi}
  }

  let dye: Double | null = null
  let velocity: Double | null = null
  let divergence: Target | null = null
  let curl: Target | null = null
  let pressure: Double | null = null
  const allocate = () => {
    const sim = size(quality.sim)
    const d = size(quality.dye)
    gl.disable(gl.BLEND)
    dye = dye ? resizeDouble(dye, d.w, d.h, rgba, gl.LINEAR) : double(d.w, d.h, rgba, gl.LINEAR)
    velocity = velocity ? resizeDouble(velocity, sim.w, sim.h, rg, gl.LINEAR) : double(sim.w, sim.h, rg, gl.LINEAR)
    for (const t of [divergence, curl, pressure?.read, pressure?.write]) if (t) free(t)
    divergence = target(sim.w, sim.h, r, gl.NEAREST)
    curl = target(sim.w, sim.h, r, gl.NEAREST)
    pressure = double(sim.w, sim.h, r, gl.NEAREST)
  }
  const fitCanvas = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr))
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr))
    if (canvas.width === w && canvas.height === h) return false
    canvas.width = w
    canvas.height = h
    return true
  }
  fitCanvas()
  allocate()

  const step = (dt: number, s: Settings) => {
    if (!dye || !velocity || !divergence || !curl || !pressure) return
    gl.disable(gl.BLEND)
    let u = bind(curlP)
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty)
    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    blit(curl)

    u = bind(vorticityP)
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty)
    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    gl.uniform1i(u.uCurl, curl.attach(1))
    gl.uniform1f(u.curl, s.swirl)
    gl.uniform1f(u.dt, dt)
    blit(velocity.write)
    velocity.swap()

    u = bind(divergenceP)
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty)
    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    blit(divergence)

    u = bind(clearP)
    gl.uniform1i(u.uTexture, pressure.read.attach(0))
    gl.uniform1f(u.value, 0.8)
    blit(pressure.write)
    pressure.swap()

    u = bind(pressureP)
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty)
    gl.uniform1i(u.uDivergence, divergence.attach(0))
    for (let i = 0; i < quality.iterations; i++) {
      gl.uniform1i(u.uPressure, pressure.read.attach(1))
      blit(pressure.write)
      pressure.swap()
    }

    u = bind(gradientP)
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty)
    gl.uniform1i(u.uPressure, pressure.read.attach(0))
    gl.uniform1i(u.uVelocity, velocity.read.attach(1))
    blit(velocity.write)
    velocity.swap()

    u = bind(advectP)
    gl.uniform2f(u.texelSize, velocity.tx, velocity.ty)
    const v = velocity.read.attach(0)
    gl.uniform1i(u.uVelocity, v)
    gl.uniform1i(u.uSource, v)
    gl.uniform1f(u.dt, dt)
    gl.uniform1f(u.dissipation, 1.2)
    blit(velocity.write)
    velocity.swap()

    gl.uniform1i(u.uVelocity, velocity.read.attach(0))
    gl.uniform1i(u.uSource, dye.read.attach(1))
    gl.uniform1f(u.dissipation, s.fade)
    blit(dye.write)
    dye.swap()
  }

  const render = (s: Settings) => {
    if (!dye) return
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const u = bind(displayP)
    gl.uniform2f(u.texelSize, 1 / gl.drawingBufferWidth, 1 / gl.drawingBufferHeight)
    gl.uniform1i(u.uTexture, dye.read.attach(0))
    gl.uniform3f(u.uTint, ...s.tint)
    gl.uniform1f(u.uGain, 6 * s.intensity)
    gl.uniform1f(u.uRainbow, s.rainbow ? 1 : 0)
    gl.uniform1f(u.uShading, s.shading ? 1 : 0)
    blit(null)
  }

  const aspect = () => canvas.width / canvas.height
  const splat = (x: number, y: number, dx: number, dy: number, color: number[], radius: number) => {
    if (!dye || !velocity) return
    const a = aspect()
    const u = bind(splatP)
    gl.uniform1i(u.uTarget, velocity.read.attach(0))
    gl.uniform1f(u.aspectRatio, a)
    gl.uniform2f(u.point, x, y)
    gl.uniform3f(u.color, dx, dy, 0)
    gl.uniform1f(u.radius, (radius / 100) * (a > 1 ? a : 1))
    blit(velocity.write)
    velocity.swap()
    gl.uniform1i(u.uTarget, dye.read.attach(0))
    gl.uniform3f(u.color, color[0], color[1], color[2])
    blit(dye.write)
    dye.swap()
  }

  let hue = Math.random()
  const dyeColor = (s: Settings) => (s.rainbow ? hsv(hue).map((c) => c * 0.15) : [0.15, 0.15, 0.15])
  const pointer = {x: 0, y: 0, dx: 0, dy: 0, moved: false, placed: false}
  const toUv = (x: number, y: number) => ({u: x / Math.max(1, canvas.clientWidth), v: 1 - y / Math.max(1, canvas.clientHeight)})

  let raf = 0
  let last = 0
  let lastInput = 0
  let dead = false
  // the loop runs until the dye has faded to nothing (fade → 1/512 of its strength)
  const lifetime = (s: Settings) => (s.fade <= 0 ? Infinity : Math.log(512) / s.fade + 0.5)
  const tick = (now: number) => {
    raf = 0
    if (dead) return
    const s = settings()
    const dt = Math.min((now - last) / 1000, 1 / 60)
    last = now
    if (fitCanvas()) allocate()
    if (s.rainbow) hue = (hue + dt * 0.35) % 1
    if (pointer.moved) {
      pointer.moved = false
      splat(pointer.x, pointer.y, pointer.dx * s.force, pointer.dy * s.force, dyeColor(s), s.radius)
      pointer.dx = pointer.dy = 0
    }
    step(dt, s)
    render(s)
    if ((now - lastInput) / 1000 < lifetime(s)) raf = requestAnimationFrame(tick)
  }
  const wake = () => {
    lastInput = performance.now()
    if (raf || dead) return
    last = lastInput
    raf = requestAnimationFrame(tick)
  }
  const place = (x: number, y: number) => {
    const {u, v} = toUv(x, y)
    Object.assign(pointer, {x: u, y: v, dx: 0, dy: 0, moved: false, placed: true})
  }

  return {
    place,
    move: (x, y) => {
      if (!pointer.placed) return place(x, y)
      const {u, v} = toUv(x, y)
      const a = aspect()
      let dx = u - pointer.x
      let dy = v - pointer.y
      if (a < 1) dx *= a
      if (a > 1) dy /= a
      pointer.x = u
      pointer.y = v
      pointer.dx += dx
      pointer.dy += dy
      if (dx || dy) {
        pointer.moved = true
        wake()
      }
    },
    burst: (x, y) => {
      const s = settings()
      const {u, v} = toUv(x, y)
      const c = dyeColor(s).map((k) => k * 1.6)
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2 + Math.random() * 0.5
        const f = s.force * 0.08
        splat(u, v, Math.cos(angle) * f, Math.sin(angle) * f, c, s.radius)
      }
      wake()
    },
    destroy: () => {
      dead = true
      cancelAnimationFrame(raf)
      for (const t of [dye?.read, dye?.write, velocity?.read, velocity?.write, divergence, curl, pressure?.read, pressure?.write]) if (t) free(t)
      programs.forEach((p) => gl.deleteProgram(p))
      shaders.forEach((s) => gl.deleteShader(s))
      gl.deleteBuffer(quad)
      gl.deleteBuffer(index)
    },
  }
}

// A smoke trail that follows the pointer: a real fluid simulation on the
// GPU (velocity, pressure, vorticity, dye), pushed by every movement and
// fading out behind it. Pin it full screen (area 'page'; clicks pass
// through) or keep it inside one box (area 'inside'). Optional dot or
// ring cursor, click bursts and rainbow hue.
//
// It sleeps once the trail has faded, pauses off screen, skips machines
// without a GPU (software WebGL) and stays off for reduced motion.
export default function LiquidSmokeCursor({
  color = '#FF7A3D',
  rainbow = false,
  intensity = 1,
  blend = 'normal',
  fade = 2.5,
  force = 6000,
  radius = 0.25,
  swirl = 10,
  shading = true,
  clickBurst = true,
  area = 'page',
  quality = 'medium',
  cursor = 'system',
  cursorSize = 12,
  cursorColor = '#FFFFFF',
  hoverDetection = false,
  respectReducedMotion = true,
  className = '',
}: LiquidSmokeCursorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)
  const shapeRef = useRef<HTMLDivElement>(null)
  const settings = useRef<Settings>({tint: hexRgb(color), rainbow, intensity, fade, force, radius, swirl, shading})
  const live = useRef({clickBurst, hoverDetection})

  useEffect(() => {
    settings.current = {tint: hexRgb(color), rainbow, intensity, fade, force, radius, swirl, shading}
    live.current = {clickBurst, hoverDetection}
  }, [color, rainbow, intensity, fade, force, radius, swirl, shading, clickBurst, hoverDetection])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    if (!root || !canvas) return
    if (respectReducedMotion && matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let fluid: Fluid | null = null
    try {
      fluid = createFluid(canvas, QUALITY[quality] ?? QUALITY.medium, () => settings.current)
    } catch (e) {
      console.warn('[LiquidSmokeCursor] WebGL setup failed, the trail is off:', e instanceof Error ? e.message : e)
    }
    if (!fluid) return
    const sim = fluid

    let onScreen = true
    const io = new IntersectionObserver(([e]) => (onScreen = e.isIntersecting))
    io.observe(canvas)
    if (area === 'inside') insideBoxes.add(canvas)

    // dot / ring cursor, written once per frame
    const drawsCursor = cursor === 'dot' || cursor === 'ring'
    const dotEl = dotRef.current
    const dot = {x: 0, y: 0, visible: false, hover: false, pressed: false}
    let dotFrame = 0
    const paintDot = () => {
      dotFrame = 0
      const el = dotRef.current
      const shape = shapeRef.current
      if (!el || !shape) return
      if (dot.visible) el.style.transform = `translate3d(${dot.x}px, ${dot.y}px, 0)`
      el.style.opacity = dot.visible ? '1' : '0'
      shape.style.transform = `scale(${(dot.hover ? 1.8 : 1) * (dot.pressed ? 0.8 : 1)})`
    }
    const queueDot = () => {
      if (drawsCursor && !dotFrame) dotFrame = requestAnimationFrame(paintDot)
    }

    const local = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect()
      const x = cx - r.left
      const y = cy - r.top
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height
      return {x, y, inside, ok: area === 'page' || inside}
    }
    let fresh = true // next point starts a new stroke (no jump from the last one)
    const feed = (cx: number, cy: number) => {
      if (!onScreen) return
      const p = local(cx, cy)
      if (!p.ok || (area === 'page' && overInside(canvas, cx, cy))) {
        fresh = true
        return
      }
      if (fresh) {
        fresh = false
        sim.place(p.x, p.y)
      } else sim.move(p.x, p.y)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
        dot.visible = false
        queueDot()
      } else {
        const p = local(e.clientX, e.clientY)
        if (p.inside) {
          if (live.current.hoverDetection && area === 'page' && e.target instanceof Element) {
            if (e.target.closest('input, textarea, select, [contenteditable="true"]')) dot.visible = false
            else {
              dot.hover = !!e.target.closest('a, button, [role="button"], [role="link"], label, summary, [data-smoke-hover]')
              dot.visible = true
            }
          } else {
            dot.hover = false
            dot.visible = true
          }
          dot.x = p.x
          dot.y = p.y
        } else dot.visible = false
        queueDot()
      }
      feed(e.clientX, e.clientY)
    }
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t || !onScreen) return
      const p = local(t.clientX, t.clientY)
      if (p.ok) {
        fresh = false
        sim.place(p.x, p.y)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) feed(t.clientX, t.clientY)
    }
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') {
        dot.pressed = true
        queueDot()
      }
      if (!live.current.clickBurst || !onScreen) return
      const p = local(e.clientX, e.clientY)
      if (area === 'page' && overInside(canvas, e.clientX, e.clientY)) return
      if (p.ok) sim.burst(p.x, p.y)
    }
    const onUp = () => {
      dot.pressed = false
      queueDot()
    }
    const onLeave = (e: Event) => {
      if (area === 'page' && (e as MouseEvent).relatedTarget) return
      fresh = true
      dot.visible = false
      queueDot()
    }

    const target: Window | HTMLElement = area === 'page' ? window : root
    const opts = {passive: true}
    const events: [string, EventListener][] = [
      ['pointermove', onMove as EventListener],
      ['pointerdown', onDown as EventListener],
      ['pointerup', onUp],
      ['touchstart', onTouchStart as EventListener],
      ['touchmove', onTouchMove as EventListener],
      [area === 'page' ? 'mouseout' : 'pointerleave', onLeave],
    ]
    for (const [name, fn] of events) target.addEventListener(name, fn, opts)
    return () => {
      for (const [name, fn] of events) target.removeEventListener(name, fn)
      io.disconnect()
      cancelAnimationFrame(dotFrame)
      if (dotEl) dotEl.style.opacity = '0'
      insideBoxes.delete(canvas)
      sim.destroy()
    }
  }, [area, quality, respectReducedMotion, cursor])

  const shapeSize = cursor === 'ring' ? cursorSize * 2.8 : cursorSize
  return (
    <div
      ref={rootRef}
      aria-hidden
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{pointerEvents: area === 'inside' ? 'auto' : 'none'}}
    >
      <canvas ref={canvasRef} className="block size-full" style={{mixBlendMode: blend}} />
      {(cursor === 'dot' || cursor === 'ring') && (
        <div ref={dotRef} className="pointer-events-none absolute top-0 left-0 z-1 size-0 opacity-0 transition-opacity duration-150 will-change-transform">
          <div
            ref={shapeRef}
            className="absolute box-border rounded-full transition-transform duration-180"
            style={{
              left: -shapeSize / 2,
              top: -shapeSize / 2,
              width: shapeSize,
              height: shapeSize,
              background: cursor === 'dot' ? cursorColor : 'transparent',
              border: cursor === 'ring' ? `1.5px solid ${cursorColor}` : 'none',
            }}
          />
        </div>
      )}
    </div>
  )
}
