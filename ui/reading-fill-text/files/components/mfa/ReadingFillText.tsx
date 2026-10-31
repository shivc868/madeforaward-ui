'use client'

import {Fragment, useEffect, useRef} from 'react'

export type ReadingFillTextProps = {
  /** the paragraph; `{name}` drops in an inline icon from `icons` */
  text?: string
  /** inline icons by name: an SVG path (24×24 viewBox) drawn in the text colour */
  icons?: Record<string, string>
  /** filled colour */
  color?: string
  /** colour before it is read */
  dimColor?: string
  /** where on the screen a line fills, 0 (top) – 1 (bottom) */
  readLine?: number
  /** words shy away from the pointer */
  avoid?: boolean
  /** how far words move away, px */
  avoidStrength?: number
  /** the scrolling element, when it isn't the window */
  scroller?: HTMLElement | null
  as?: 'p' | 'h2' | 'div'
  className?: string
}

const DEFAULT_TEXT =
  "We're Northline, an independent studio {sun} shaping websites and identities for founders, {spark} makers and teams who care. We pair strategy, design and engineering {bolt} to turn a brand's character into something people feel {heart} the moment they arrive. Curious by nature and hands-on {hand} by habit, we start by understanding the business, then find the quiet balance between bold ideas, careful design and code that lasts."

const DEFAULT_ICONS: Record<string, string> = {
  sun: 'M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1',
  spark: 'M12 2c.9 5.6 3.4 8.1 9 9-5.6.9-8.1 3.4-9 9-.9-5.6-3.4-8.1-9-9 5.6-.9 8.1-3.4 9-9z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  heart: 'M12 21s-8.5-5-8.5-11.2A4.8 4.8 0 0 1 12 6.9a4.8 4.8 0 0 1 8.5 2.9C20.5 16 12 21 12 21z',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6m0-3a1.5 1.5 0 0 1 3 0V15a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.7-2.3L4.4 16.3a1.6 1.6 0 0 1 2.4-2.1L8 15.5',
}

const iconMask = (d: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='${d}'/></svg>`)}")`

// A paragraph you read by scrolling. Each line fills word by word, left to
// right, as it crosses a reading line on screen (58% down by default):
// every word is painted with a hard-stop gradient clipped to its letters,
// so a word can be half filled. Inline icons sit in the text and fill the
// same way. On a mouse, words near the pointer step aside on a soft
// falloff with a slight turn and settle back when it leaves.
//
// Layout is measured once per resize (offsetTop / offsetLeft), so scroll
// and pointer frames only write custom properties.
export default function ReadingFillText({
  text = DEFAULT_TEXT,
  icons = DEFAULT_ICONS,
  color = '#1f3dff',
  dimColor = '#c3c6cf',
  readLine = 0.58,
  avoid = true,
  avoidStrength = 1,
  scroller = null,
  as: Tag = 'p',
  className = '',
}: ReadingFillTextProps) {
  const rootRef = useRef<HTMLElement>(null)
  const live = useRef({readLine, avoid, avoidStrength})

  useEffect(() => {
    live.current = {readLine, avoid, avoidStrength}
  }, [readLine, avoid, avoidStrength])

  // words, spaces and {icon} tokens
  const tokens = text.split(/(\s+)/).filter(Boolean)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const words = [...root.querySelectorAll<HTMLElement>('[data-word]')]
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const fine = matchMedia('(hover: hover) and (pointer: fine)')
    const fills = new Array(words.length).fill(-1)

    // ---- reading ----
    let lines: {index: number; middle: number}[][] = []
    let band = 1
    let typeSize = 40
    let dirty = true
    const measure = () => {
      const style = getComputedStyle(root)
      band = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.1 || 1
      typeSize = parseFloat(style.fontSize) || 40
      const byTop = new Map<number, {index: number; middle: number}[]>()
      words.forEach((w, index) => {
        const top = w.offsetTop
        if (!byTop.has(top)) byTop.set(top, [])
        byTop.get(top)!.push({index, middle: top + w.offsetHeight * 0.5})
      })
      lines = [...byTop.values()]
      for (const h of hover) {
        h.left = h.el.offsetLeft
        h.top = h.el.offsetTop
        h.width = h.el.offsetWidth
        h.height = h.el.offsetHeight
      }
      dirty = false
    }
    let readFrame = 0
    const read = () => {
      readFrame = 0
      if (dirty) measure()
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0
      const viewH = scroller ? scroller.clientHeight : innerHeight
      const line = viewTop + viewH * live.current.readLine
      const top = root.getBoundingClientRect().top
      for (const items of lines) {
        const progress = reduced.matches ? 1 : Math.max(0, Math.min(1, (line + band / 2 - top - items[0].middle) / band))
        items.forEach(({index}, position) => {
          const fill = Math.round(Math.max(0, Math.min(1, progress * items.length - position)) * 100)
          if (fills[index] !== fill) {
            words[index].style.setProperty('--fill', `${fill}%`)
            fills[index] = fill
          }
        })
      }
    }
    const scheduleRead = () => {
      if (!readFrame) readFrame = requestAnimationFrame(read)
    }

    // ---- stepping aside ----
    const hover = words.map((el) => ({el, x: 0, y: 0, left: 0, top: 0, width: 0, height: 0}))
    const pointer = {x: 0, y: 0, active: false}
    let hoverFrame = 0
    let hoverTime = 0
    const animate = (time: number) => {
      hoverFrame = 0
      if (dirty) measure()
      const s = live.current
      const rect = root.getBoundingClientRect()
      const lx = pointer.x - rect.left
      const ly = pointer.y - rect.top
      const active = pointer.active && s.avoid && lx >= 0 && lx <= rect.width && ly >= 0 && ly <= rect.height
      const radius = Math.max(140, Math.min(220, typeSize * 3.8))
      const sx = Math.max(22, Math.min(36, typeSize * 0.65)) * s.avoidStrength
      const sy = Math.max(18, Math.min(28, typeSize * 0.48)) * s.avoidStrength
      const dt = Math.min(time - hoverTime || 16.7, 40)
      hoverTime = time
      const ease = 1 - Math.exp(-dt / (active ? 75 : 230))
      let moving = false
      for (const h of hover) {
        let tx = 0
        let ty = 0
        if (active) {
          const dx = h.left + h.width * 0.5 - lx
          const dy = h.top + h.height * 0.5 - ly
          const d = Math.hypot(dx, dy)
          const falloff = Math.max(0, 1 - d / radius) ** 1.6
          tx = d > 1 ? (dx / d) * sx * falloff : 0
          ty = d > 1 ? (dy / d) * sy * falloff : -sy
        }
        const x = h.x + (tx - h.x) * ease
        const y = h.y + (ty - h.y) * ease
        if (Math.abs(x - tx) > 0.025 || Math.abs(y - ty) > 0.025) moving = true
        if (Math.abs(x) < 0.025 && Math.abs(y) < 0.025 && !tx && !ty) {
          if (h.x || h.y) h.el.style.transform = ''
          h.x = h.y = 0
        } else {
          h.x = x
          h.y = y
          h.el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${(x * 0.07).toFixed(3)}deg)`
        }
      }
      if (moving) hoverFrame = requestAnimationFrame(animate)
      else hoverTime = 0
    }
    const scheduleHover = () => {
      if (!hoverFrame && fine.matches && !reduced.matches) hoverFrame = requestAnimationFrame(animate)
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.active = true
      scheduleHover()
    }
    const onLeave = () => {
      pointer.active = false
      scheduleHover()
    }
    const onScroll = () => {
      scheduleRead()
      scheduleHover()
    }
    const invalidate = () => {
      dirty = true
      scheduleRead()
    }

    const target: HTMLElement | Window = scroller ?? window
    target.addEventListener('scroll', onScroll, {passive: true})
    window.addEventListener('resize', invalidate, {passive: true})
    root.addEventListener('pointermove', onMove, {passive: true})
    root.addEventListener('pointerleave', onLeave)
    const ro = new ResizeObserver(invalidate)
    ro.observe(root)
    document.fonts?.ready.then(invalidate)
    read()
    return () => {
      cancelAnimationFrame(readFrame)
      cancelAnimationFrame(hoverFrame)
      target.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', invalidate)
      root.removeEventListener('pointermove', onMove)
      root.removeEventListener('pointerleave', onLeave)
      ro.disconnect()
    }
  }, [text, scroller])

  const paint = {
    backgroundImage: `linear-gradient(90deg, ${color} var(--fill, 0%), ${dimColor} var(--fill, 0%))`,
  }
  const word = 'inline-block bg-clip-text text-transparent will-change-transform'
  return (
    <Tag ref={rootRef as never} className={`relative ${className}`} style={{color}} aria-label={text.replace(/\{\w+\}\s?/g, '')}>
      {tokens.map((t, i) => {
        if (/^\s+$/.test(t)) return <Fragment key={i}>{t}</Fragment>
        const icon = /^\{(\w+)\}([.,;:!?]*)$/.exec(t)
        if (icon && icons[icon[1]]) {
          const m = iconMask(icons[icon[1]])
          return (
            <span
              key={i}
              data-word
              aria-hidden
              className="inline-block size-[0.9em] align-[-0.08em] will-change-transform"
              style={{...paint, maskImage: m, WebkitMaskImage: m, maskSize: 'contain', WebkitMaskSize: 'contain', maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat'}}
            />
          )
        }
        return (
          <span key={i} data-word aria-hidden className={word} style={paint}>
            {t}
          </span>
        )
      })}
    </Tag>
  )
}
