'use client'

import {useEffect, useRef, type ReactNode} from 'react'

export type SilkGradientBackgroundProps = {
  /** deepest shadow colour */
  baseColor?: string
  /** the body of the silk */
  midColor?: string
  /** the sheen on the folds and the thin bright seam */
  highlightColor?: string
  /** flow speed; 0 = still */
  speed?: number
  /** size of the folds; higher = more, smaller folds */
  scale?: number
  /** brightness of the thin seam; 0 = none */
  seam?: number
  /** render resolution as a share of the screen's; the folds are soft, so below 1 looks the same and costs less */
  quality?: number
  children?: ReactNode
  className?: string
}

const VERTEX = `#version 300 es
in vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }`

// The plane is bent by a few rounds of sine waves, each finer and weaker
// than the last, which drapes it into long, smooth folds like silk. Two
// smooth fields are read off the bent plane: one is the cloth (base → mid →
// sheen), the other's zero line is the thin bright seam.
const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform float uScale;
uniform float uSeam;
uniform vec3 uBase;
uniform vec3 uMid;
uniform vec3 uHigh;
out vec4 outColor;

float hash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y * uScale;
  float t = uTime * 0.25;

  for (int i = 1; i < 6; i++) {
    float k = float(i);
    p += vec2(0.62 / k * sin(k * p.y + t + 0.4 * k), 0.38 / k * sin(k * p.x - 0.8 * t + 1.7 * k));
  }

  // The cloth: wide bands, deep troughs, a flat sheen on the crests.
  float cloth = 0.5 + 0.5 * sin(p.x * 0.9 + p.y * 0.55);
  float depth = 0.5 + 0.5 * sin(p.y * 0.8 - p.x * 0.35 + 1.3);
  vec3 col = mix(uBase, uMid, smoothstep(0.05, 0.85, cloth) * mix(0.35, 1.0, depth));
  col = mix(col, uHigh, smoothstep(0.82, 0.97, cloth) * depth * 0.6);

  // The seam: the zero line of a second wave, ~1.5px wide with a soft halo.
  float level = sin(p.x * 0.6 - p.y * 0.9 + 0.7);
  float w = fwidth(level);
  float seam = 1.0 - smoothstep(0.0, w * 1.5, abs(level));
  float halo = 1.0 - smoothstep(0.0, w * 12.0, abs(level));
  col = mix(col, uHigh, (seam * 0.8 + halo * 0.18) * uSeam * depth);

  // Dither: no banding in the long gradients.
  col += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`

// A slow, silky gradient on WebGL2: one fullscreen triangle and one shader.
// It renders below screen resolution (the folds are soft), pauses when it
// is off screen or the tab is hidden, and holds still for reduced motion.
export default function SilkGradientBackground({
  baseColor = '#03060f',
  midColor = '#1c3c8c',
  highlightColor = '#a9c1ff',
  speed = 1,
  scale = 2.2,
  seam = 0.8,
  quality = 0.75,
  children,
  className = '',
}: SilkGradientBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const root = rootRef.current
    const canvas = canvasRef.current
    const gl = canvas?.getContext('webgl2', {antialias: false, depth: false, stencil: false})
    if (!root || !canvas || !gl) return

    const program = link(gl)
    if (!program) return
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const u = {
      resolution: uniform('uResolution'),
      time: uniform('uTime'),
      scale: uniform('uScale'),
      seam: uniform('uSeam'),
      base: uniform('uBase'),
      mid: uniform('uMid'),
      high: uniform('uHigh'),
    }
    gl.useProgram(program)
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.uniform1f(u.scale, scale)
    gl.uniform1f(u.seam, seam)
    gl.uniform3fv(u.base, toRgb(baseColor))
    gl.uniform3fv(u.mid, toRgb(midColor))
    gl.uniform3fv(u.high, toRgb(highlightColor))

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let clock = 8 // start mid-flow, not on the first, plainer frame
    let last = 0
    let raf = 0
    let visible = true

    const draw = () => {
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.uniform2f(u.resolution, canvas.width, canvas.height)
      gl.uniform1f(u.time, clock)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    const frame = (now: number) => {
      raf = 0
      if (!visible || document.hidden) return
      clock += last ? (Math.min(now - last, 50) / 1000) * speed : 0
      last = now
      draw()
      raf = requestAnimationFrame(frame)
    }
    const wake = () => {
      last = 0
      if (!raf && !still && visible && !document.hidden) raf = requestAnimationFrame(frame)
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
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', wake)
      // Free what this run created, but keep the context: a canvas hands the
      // same context back next time, so a lost one would stay lost (React's
      // dev double-mount, or a prop change, would leave a dead canvas).
      gl.deleteBuffer(buffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [baseColor, midColor, highlightColor, speed, scale, seam, quality])

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
