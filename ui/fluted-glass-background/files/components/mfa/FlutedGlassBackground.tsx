'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type FlutedGlassBackgroundProps = {
  /** the gradient behind the glass: up to four colours that drift around */
  colors?: string[]
  /** colour of the light that follows the pointer */
  glowColor?: string
  /** number of vertical flutes */
  columns?: number
  /** how strongly each flute bends what's behind it; 0 = flat panes */
  refraction?: number
  /** strength of the light; 0 = none */
  glow?: number
  /** how fast the gradient drifts; 0 = still */
  speed?: number
  /** how far the light trails the pointer, 0–0.98 */
  smoothing?: number
  children?: ReactNode
  className?: string
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`

// A soft, drifting mesh gradient seen through ribbed glass.
//
// Behind the glass: four colour points wander on slow, separate orbits and
// every pixel blends them by inverse distance, a gradient with no seams.
// The glass: each flute is a cylinder, so it looks up the gradient at a
// position bent toward its centre (refraction), shades gently toward its
// far side, and catches a thin highlight along its near edge. A soft light
// follows the pointer through the glass.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uLight;
uniform float uTime;
uniform float uColumns;
uniform float uRefraction;
uniform float uGlow;
uniform vec3 uColors[4];
uniform vec3 uGlowColor;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

vec3 behind(vec2 p, float aspect) {
  vec3 sum = vec3(0.0);
  float total = 0.0;
  for (int i = 0; i < 4; i++) {
    float k = float(i);
    vec2 c = vec2(0.5 + 0.42 * sin(uTime * (0.11 + 0.03 * k) + k * 1.9),
                  0.5 + 0.38 * cos(uTime * (0.09 + 0.025 * k) + k * 2.7));
    vec2 d = (p - c) * vec2(aspect, 1.0);
    float w = 1.0 / pow(dot(d, d) + 0.02, 1.6);
    sum += uColors[i] * w;
    total += w;
  }
  return sum / total;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  float aspect = uResolution.x / uResolution.y;
  float x = uv.x * uColumns;
  float f = fract(x);
  float s = f * 2.0 - 1.0; // -1..1 across the flute

  // Refraction: a cylinder bends the view toward its centre.
  vec2 seen = vec2(uv.x - s * abs(s) * uRefraction * 0.5 / uColumns, uv.y);
  vec3 col = behind(seen, aspect);

  // The light behind the glass, bent the same way.
  vec2 d = (seen - uLight) * vec2(aspect, 1.0);
  col += uGlowColor * uGlow * exp(-dot(d, d) * 6.0) * 0.55;

  // Curved shading, a thin highlight on the near edge and a soft line
  // between flutes; the seam is antialiased over a pixel.
  float px = fwidth(x);
  float shade = 0.82 + 0.18 * cos(s * 1.5708);
  float rim = smoothstep(0.0, 0.06, f) * (1.0 - smoothstep(0.06, 0.2, f));
  float seam = 1.0 - smoothstep(0.0, px * 1.5, min(f, 1.0 - f));
  col = col * shade * (1.0 - 0.18 * smoothstep(0.55, 1.0, f));
  col += rim * 0.06;
  col *= 1.0 - seam * 0.35;

  // Fine grain: no banding in the long gradients, a printed feel.
  col += (hash(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5) * 0.025;
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`

export default function FlutedGlassBackground({
  colors = ['#0d0b2b', '#5b3bff', '#ff6a2b', '#ffc49a'],
  glowColor = '#fff1e6',
  columns = 12,
  refraction = 0.5,
  glow = 0.6,
  speed = 1,
  smoothing = 0.92,
  children,
  className = '',
}: FlutedGlassBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const palette = colors.slice(0, 4).join(',')

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', {antialias: false, depth: false, stencil: false})
    if (!root || !canvas || !gl) return

    const program = link(gl)
    if (!program) return
    const u = (name: string) => gl.getUniformLocation(program, name)
    const uLight = u('uLight')
    const uTime = u('uTime')
    const uResolution = u('uResolution')
    gl.useProgram(program)
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1f(u('uColumns'), columns)
    gl.uniform1f(u('uRefraction'), refraction)
    gl.uniform1f(u('uGlow'), glow)
    gl.uniform3fv(u('uGlowColor'), toRgb(glowColor))
    // Fewer than four colours repeat around the list.
    const stops = palette.split(',')
    gl.uniform3fv(u('uColors'), new Float32Array([0, 1, 2, 3].flatMap((i) => toRgb(stops[i % stops.length]))))

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    // Light position in 0–1 (y up), and where it is heading.
    const light = {x: 0.5, y: 0.6}
    const target = {x: 0.5, y: 0.6}
    let pointerInside = false
    let clock = 12 // start mid-drift
    let raf = 0
    let last = 0
    let visible = true

    const draw = () => {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(uResolution, canvas.width, canvas.height)
      gl.uniform2f(uLight, light.x, light.y)
      gl.uniform1f(uTime, clock)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60
      last = now
      clock += dt * speed
      // Without a pointer the light rests a little above the middle.
      if (!pointerInside) [target.x, target.y] = [0.5 + Math.sin(clock * 0.2) * 0.2, 0.6]
      const k = 1 - Math.pow(smoothing, dt * 60)
      light.x += (target.x - light.x) * k
      light.y += (target.y - light.y) * k
      draw()
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      if (!raf && !still && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(frame)
      }
    }

    const ro = new ResizeObserver(() => {
      // The gradient is soft; 1.5x is plenty even on 2x screens.
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.max(1, Math.round(root.clientWidth * ratio))
      canvas.height = Math.max(1, Math.round(root.clientHeight * ratio))
      draw()
    })
    ro.observe(root)
    // Window-level, so content laid over the background never blocks the light.
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      pointerInside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (pointerInside) {
        target.x = (e.clientX - r.left) / r.width
        target.y = 1 - (e.clientY - r.top) / r.height
      }
    }
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      wake()
    })
    io.observe(root)
    window.addEventListener('pointermove', onMove, {passive: true})
    document.addEventListener('visibilitychange', wake)
    wake()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      window.removeEventListener('pointermove', onMove)
      document.removeEventListener('visibilitychange', wake)
      // Free this run's objects but keep the context: a lost one would stay lost on remount.
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [palette, glowColor, columns, refraction, glow, speed, smoothing])

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`}>
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 block h-full w-full" />
      {children != null && <div className="relative z-10 h-full w-full">{children}</div>}
    </div>
  )
}

function link(gl: WebGL2RenderingContext) {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.bindAttribLocation(program, 0, 'aPosition')
  gl.linkProgram(program)
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null
}

// Any CSS colour → 0–1 RGB for the shader.
function toRgb(color: string): [number, number, number] {
  const ctx = document.createElement('canvas').getContext('2d', {willReadFrequently: true})!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, 1, 1)
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}
