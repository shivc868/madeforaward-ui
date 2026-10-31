'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type SpiralShaderBackgroundProps = {
  /** colour at the heart of the spiral */
  innerColor?: string
  /** colour halfway out */
  midColor?: string
  /** colour at the rim */
  outerColor?: string
  background?: string
  /** turns per second; negative turns the other way, 0 = still */
  speed?: number
  /** number of arms */
  arms?: number
  /** how tightly the arms wind */
  twist?: number
  /** arm width as a share of the gap between arms, 0–1 */
  thickness?: number
  /** edge softness of the arms */
  softness?: number
  /** spiral radius as a share of the shorter side */
  size?: number
  /** how far the fade-out reaches in from the rim, 0–1 */
  glow?: number
  /** soft light around the arms, 0–1 */
  halo?: number
  /** render resolution as a share of the screen's */
  quality?: number
  children?: ReactNode
  className?: string
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`

// The arms are the bright half of a cosine wound around the centre: its
// phase grows with the distance (the winding) and falls with the angle (the
// arms), and time turns it. The band edge is anti-aliased with fwidth, so it
// stays crisp at any size; colour runs inner → mid → outer with the radius,
// the rim fades out, a soft halo glows round the arms, and a 1/255 dither
// keeps the long gradients free of banding.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime, uArms, uTwist, uThick, uSoft, uSize, uGlow, uHalo;
uniform vec3 uInner, uMid, uOuter, uBackground;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y) * 2.0 / uSize;
  float d = length(p);
  float a = atan(p.y, p.x);
  float v = 0.5 + 0.5 * cos(6.283185307 * uTwist * d - uArms * a + uTime);

  float edge = 1.0 - uThick;
  float aa = fwidth(v) * 1.2 + uSoft;
  float arm = smoothstep(edge - aa, edge + aa, v);
  // a little depth across the arm: brightest down its spine
  float body = arm * (0.78 + 0.22 * smoothstep(edge, 1.0, v));
  float halo = pow(v, 4.0) * uHalo * 0.45;

  float t = clamp(d, 0.0, 1.0);
  vec3 tint = t < 0.5 ? mix(uInner, uMid, t * 2.0) : mix(uMid, uOuter, t * 2.0 - 1.0);
  float fade = smoothstep(0.0, max(uGlow, 0.001), 1.0 - d);
  // the very centre is a point of the winding, not a place to look
  fade *= smoothstep(0.0, 0.06, d);

  vec3 col = uBackground + tint * (body + halo) * fade;
  col += (hash(gl_FragCoord.xy + fract(uTime)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`

const toRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

// A turning spiral of light for hero backgrounds: one fullscreen triangle
// and one shader on WebGL2. The time is frame-rate independent, settings
// change live (no recompiling), and it pauses off screen and in hidden tabs;
// reduced motion holds one still frame.
export default function SpiralShaderBackground({
  innerColor = '#ff5a36',
  midColor = '#ff2e8a',
  outerColor = '#6a3dff',
  background = '#050507',
  speed = 0.35,
  arms = 1,
  twist = 1,
  thickness = 0.5,
  softness = 0.015,
  size = 0.62,
  glow = 0.55,
  halo = 0.5,
  quality = 1,
  children,
  className = '',
}: SpiralShaderBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const live = useRef({innerColor, midColor, outerColor, background, speed, arms, twist, thickness, softness, size, glow, halo})
  const redraw = useRef<(() => void) | null>(null)

  useEffect(() => {
    live.current = {innerColor, midColor, outerColor, background, speed, arms, twist, thickness, softness, size, glow, halo}
    redraw.current?.()
  }, [innerColor, midColor, outerColor, background, speed, arms, twist, thickness, softness, size, glow, halo])

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', {antialias: false, depth: false, stencil: false})
    if (!root || !canvas || !gl) return
    const program = link(gl)
    if (!program) return
    const loc = (name: string) => gl.getUniformLocation(program, name)
    const u = Object.fromEntries(
      ['uResolution', 'uTime', 'uArms', 'uTwist', 'uThick', 'uSoft', 'uSize', 'uGlow', 'uHalo', 'uInner', 'uMid', 'uOuter', 'uBackground'].map((n) => [n, loc(n)]),
    )
    gl.useProgram(program)
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    const still = matchMedia('(prefers-reduced-motion: reduce)').matches
    let phase = 0 // radians the spiral has turned
    let last = 0
    let raf = 0
    let visible = true

    const draw = () => {
      const s = live.current
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(u.uResolution, canvas.width, canvas.height)
      gl.uniform1f(u.uTime, phase)
      gl.uniform1f(u.uArms, Math.max(1, Math.round(s.arms)))
      gl.uniform1f(u.uTwist, s.twist)
      gl.uniform1f(u.uThick, Math.min(0.98, Math.max(0.02, s.thickness)))
      gl.uniform1f(u.uSoft, Math.max(0, s.softness))
      gl.uniform1f(u.uSize, Math.max(0.05, s.size))
      gl.uniform1f(u.uGlow, s.glow)
      gl.uniform1f(u.uHalo, s.halo)
      gl.uniform3fv(u.uInner, toRgb(s.innerColor))
      gl.uniform3fv(u.uMid, toRgb(s.midColor))
      gl.uniform3fv(u.uOuter, toRgb(s.outerColor))
      gl.uniform3fv(u.uBackground, toRgb(s.background))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      // wrapped to one turn (the pattern repeats every 2π), so float precision never steps the motion
      phase = (phase + (last ? (Math.min(now - last, 50) / 1000) * live.current.speed * Math.PI * 2 : 0)) % (Math.PI * 2)
      last = now
      draw()
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      last = 0
      if (!raf && !still && visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    redraw.current = () => {
      if (!raf) draw()
    }

    const ro = new ResizeObserver(() => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2) * quality
      canvas.width = Math.max(1, Math.round(root.clientWidth * ratio))
      canvas.height = Math.max(1, Math.round(root.clientHeight * ratio))
      draw()
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
      // free what this run made but keep the context (React dev re-mounts reuse the canvas)
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [quality])

  return (
    <div ref={rootRef} className={`relative h-full w-full overflow-hidden ${className}`} style={{background}}>
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
