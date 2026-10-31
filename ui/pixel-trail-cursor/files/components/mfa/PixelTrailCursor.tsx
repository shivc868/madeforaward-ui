'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type PixelTrailCursorProps = {
  /** background colour */
  background?: string
  /** colour of the dots */
  color?: string
  /** grid cell in CSS px; each cell holds a 4×4 pattern of dots */
  cellSize?: number
  /** how wide the stroke under the cursor is (share of the height) */
  radius?: number
  /** how much each mouse move adds */
  strength?: number
  /** how fast the trail fades (higher = longer trail) */
  persistence?: number
  children?: ReactNode
  className?: string
}

const QUAD = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = 0.5 * (a_position + 1.0);
  gl_Position = vec4(a_position, 0.0, 1.0);
}`

// a mouse move adds its own velocity to the field, in a gaussian round the cursor
const INJECT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_velocity;
uniform vec2 u_vector;
uniform vec2 u_cursor;
uniform vec2 u_resolution;
uniform float u_strength;
uniform float u_radius;
out vec4 FragColor;
void main() {
  vec2 velocity = texture(u_velocity, v_uv).rg;
  vec2 d = u_cursor / u_resolution - v_uv;
  d.x *= u_resolution.x / u_resolution.y;
  float influence = exp(-dot(d, d) / (u_radius * u_radius));
  FragColor = vec4(velocity + influence * u_vector * u_strength, 0.0, 1.0);
}`

// every frame the field fades a little (by elapsed milliseconds)
const DECAY = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_previous;
uniform float u_delta;
uniform float u_persistence;
out vec4 FragColor;
void main() {
  FragColor = vec4(texture(u_previous, v_uv).rg * (1.0 - min(0.5, u_delta / u_persistence)), 0.0, 1.0);
}`

// the screen: each cell reads the field's strength at its centre and lights that many of
// seven fixed dots in its 4×4 pattern, so a fast stroke is dense and its edges thin out
const GRID = `#version 300 es
precision highp float;
uniform sampler2D u_cursor;
uniform vec2 u_size;
uniform float u_ratio;
uniform float u_cell;
uniform vec3 u_color;
out vec4 FragColor;

float on(float x, float y, float px, float py) {
  return step(abs(x - px) + abs(y - py), 0.5);
}

void main() {
  vec2 p = gl_FragCoord.xy / u_ratio;
  vec2 cells = u_size / u_cell;
  vec2 rect = p / u_cell;
  vec2 uv = p / u_size;
  vec2 rounded = round(uv * cells) / cells;
  float o = length(texture(u_cursor, rounded).rg);

  float x = mod(round(fract(rect.x) * 4.0 + 1.5), 4.0);
  float y = mod(round(fract(rect.y) * 4.0 + 0.5), 4.0);
  float k = 1.0 / 7.0;
  float a = 0.0;
  a += step(1.0 - o, 0.0) * on(x, y, 0.0, 0.0);
  a += step(1.0 - o, k) * on(x, y, 0.0, 2.0);
  a += step(1.0 - o, 2.0 * k) * on(x, y, 2.0, 1.0);
  a += step(1.0 - o, 3.0 * k) * on(x, y, 3.0, 3.0);
  a += step(1.0 - o, 4.0 * k) * on(x, y, 1.0, 3.0);
  a += step(1.0 - o, 5.0 * k) * on(x, y, 0.0, 1.0);
  a += step(1.0 - o, 6.0 * k) * on(x, y, 2.0, 0.0);
  a = min(1.0, a);
  FragColor = vec4(u_color * a, a);
}`

const toRgb = (hex: string) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? [...h].map((c) => c + c).join('') : h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// A cursor that paints with pixels: moving the mouse stirs a low-resolution
// velocity field (a gaussian of the move added round the pointer, fading
// every frame), and the screen draws it as a grid of 8px cells, each lit
// with up to seven 2px dots in a fixed pattern by how strong the field is
// there. A quick sweep leaves a dense, dithered streak that thins and
// breaks up at its edges as it fades. Raw WebGL2; it only renders while the
// trail is alive, and leaves touch screens alone.
export default function PixelTrailCursor({
  background = '#1a1c1c',
  color = '#f9f4eb',
  cellSize = 8,
  radius = 0.04,
  strength = 0.04,
  persistence = 250,
  children,
  className = '',
}: PixelTrailCursorProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({color, cellSize, radius, strength, persistence})

  useEffect(() => {
    live.current = {color, cellSize, radius, strength, persistence}
  }, [color, cellSize, radius, strength, persistence])

  useEffect(() => {
    const root = rootRef.current!
    const canvas = canvasRef.current!
    const gl = canvas.getContext('webgl2', {premultipliedAlpha: true, antialias: false})
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const compile = (frag: string) => {
      const program = gl.createProgram()
      for (const [type, src] of [
        [gl.VERTEX_SHADER, QUAD],
        [gl.FRAGMENT_SHADER, frag],
      ] as const) {
        const s = gl.createShader(type)!
        gl.shaderSource(s, src)
        gl.compileShader(s)
        gl.attachShader(program, s)
        gl.deleteShader(s)
      }
      gl.bindAttribLocation(program, 0, 'a_position')
      gl.linkProgram(program)
      const loc = (name: string) => gl.getUniformLocation(program, name)
      return {program, loc}
    }
    const inject = compile(INJECT)
    const decay = compile(DECAY)
    const grid = compile(GRID)

    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    // the velocity field: two half-float targets, a 36th of the screen's pixels, bilinear
    let fields: {tex: WebGLTexture; fbo: WebGLFramebuffer}[] = []
    let simW = 1
    let simH = 1
    const makeFields = () => {
      fields.forEach((f) => {
        gl.deleteTexture(f.tex)
        gl.deleteFramebuffer(f.fbo)
      })
      fields = [0, 1].map(() => {
        const tex = gl.createTexture()!
        gl.bindTexture(gl.TEXTURE_2D, tex)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, simW, simH, 0, gl.RGBA, gl.HALF_FLOAT, null)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        const fbo = gl.createFramebuffer()!
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
        gl.clearColor(0, 0, 0, 0)
        gl.clear(gl.COLOR_BUFFER_BIT)
        return {tex, fbo}
      })
    }
    let read = 0
    const pass = (p: ReturnType<typeof compile>) => {
      const write = 1 - read
      gl.bindFramebuffer(gl.FRAMEBUFFER, fields[write].fbo)
      gl.viewport(0, 0, simW, simH)
      gl.useProgram(p.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, fields[read].tex)
      return () => {
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        read = write
      }
    }

    let w = 1
    let h = 1
    let ratio = 1
    const ro = new ResizeObserver(() => {
      ratio = Math.min(window.devicePixelRatio || 1, 2)
      w = Math.max(1, root.clientWidth)
      h = Math.max(1, root.clientHeight)
      canvas.width = Math.round(w * ratio)
      canvas.height = Math.round(h * ratio)
      simW = Math.max(1, Math.round((w * ratio) / 36))
      simH = Math.max(1, Math.round((h * ratio) / 36))
      makeFields()
      draw()
    })

    const draw = () => {
      const o = live.current
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.useProgram(grid.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, fields[read].tex)
      gl.uniform2f(grid.loc('u_size'), w, h)
      gl.uniform1f(grid.loc('u_ratio'), ratio)
      gl.uniform1f(grid.loc('u_cell'), Math.max(2, o.cellSize))
      gl.uniform3fv(grid.loc('u_color'), toRgb(o.color))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }

    let raf = 0
    let lastTime = 0
    let lastMove = -Infinity
    let last: [number, number] | null = null
    const frame = (now: number) => {
      raf = 0
      const delta = lastTime ? now - lastTime : 16
      lastTime = now
      const run = pass(decay)
      gl.uniform1f(decay.loc('u_delta'), delta)
      gl.uniform1f(decay.loc('u_persistence'), Math.max(20, live.current.persistence))
      run()
      draw()
      // the trail has faded out 1.5s after the last move; stop until the next one
      if (now - lastMove < 1500) raf = requestAnimationFrame(frame)
      else lastTime = 0
    }

    const move = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return
      const r = root.getBoundingClientRect()
      const current: [number, number] = [e.clientX - r.left, r.height - (e.clientY - r.top)]
      const prev = last
      last = current
      if (!prev) return
      const o = live.current
      const run = pass(inject)
      gl.uniform2f(inject.loc('u_vector'), current[0] - prev[0], current[1] - prev[1])
      gl.uniform2f(inject.loc('u_cursor'), current[0], current[1])
      gl.uniform2f(inject.loc('u_resolution'), w, h)
      gl.uniform1f(inject.loc('u_strength'), o.strength)
      gl.uniform1f(inject.loc('u_radius'), Math.max(0.005, o.radius))
      run()
      lastMove = performance.now()
      if (!raf) raf = requestAnimationFrame(frame)
    }
    const leave = () => {
      last = null
    }

    ro.observe(root)
    window.addEventListener('pointermove', move, {passive: true})
    document.addEventListener('pointerleave', leave)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      fields.forEach((f) => {
        gl.deleteTexture(f.tex)
        gl.deleteFramebuffer(f.fbo)
      })
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      ;[inject, decay, grid].forEach((p) => gl.deleteProgram(p.program))
    }
  }, [])

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} style={{background}}>
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 block h-full w-full" />
      {children != null && <div className="relative h-full w-full">{children}</div>}
    </div>
  )
}
