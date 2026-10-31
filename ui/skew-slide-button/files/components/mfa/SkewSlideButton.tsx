import type {CSSProperties, ReactNode} from 'react'

export type SkewSlideButtonProps = {
  children?: string
  href?: string
  onClick?: () => void
  /** button colour */
  color?: string
  /** text colour */
  ink?: string
  /** show the double chevron after the label */
  arrow?: boolean
  /** seconds between letters */
  stagger?: number
  className?: string
}

// one letter (or chevron) of either copy: the shared transition, and its place in the stagger
const piece =
  '[transition:translate_.6s_var(--ease),transform_.25s_ease-out,opacity_.15s_ease-out] motion-reduce:[transition:none]'
// the resting copy: on hover each piece leans back and slides out to the left
const out =
  'group-hover:[translate:-1.35rem] group-hover:[transform:skewX(-28deg)] group-hover:opacity-0 group-hover:[transition-delay:calc((var(--char)-1)*var(--stagger)+.05s)] group-focus-visible:[translate:-1.35rem] group-focus-visible:[transform:skewX(-28deg)] group-focus-visible:opacity-0'
// the hover copy: waits off to the right, leaning, then slides in upright, a beat later
const inn =
  '[translate:1.35rem] [transform:skewX(-28deg)] opacity-0 group-hover:[translate:0] group-hover:[transform:none] group-hover:opacity-100 group-hover:[transition-delay:calc((var(--char)-1)*var(--stagger)+.2s)] group-focus-visible:[translate:0] group-focus-visible:[transform:none] group-focus-visible:opacity-100'

function Copy({label, arrow, kind}: {label: string; arrow: boolean; kind: 'out' | 'in'}) {
  const cls = `${piece} ${kind === 'out' ? out : inn}`
  const chars = [...label]
  return (
    <span aria-hidden className="col-start-1 row-start-1 flex items-center gap-2">
      <span className="whitespace-pre">
        {chars.map((c, i) => (
          <span key={i} className={`inline-block ${cls}`} style={{'--char': i + 1} as CSSProperties}>
            {c}
          </span>
        ))}
      </span>
      {arrow && (
        <svg viewBox="0 0 15 14" fill="none" className="w-[0.9em] overflow-visible">
          {['M1.25 12.25L6.25 6.75L1.25 1.25', 'M8.25 12.25L13.25 6.75L8.25 1.25'].map((d, k) => (
            <path
              key={d}
              d={d}
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`origin-center [transform-box:fill-box] ${cls}`}
              style={{'--char': chars.length + 1 + k} as CSSProperties}
            />
          ))}
        </svg>
      )}
    </span>
  )
}

// A button whose label swaps on hover letter by letter: the resting copy
// leans back and slides out to the left, one letter after another, while a
// second copy follows in from the right and straightens up; the chevrons
// go with it. The plate swells a touch on hover and squashes on press.
// Pure CSS transitions on transforms and opacity (no JS), so it runs on
// the compositor; keyboard focus plays it too.
export default function SkewSlideButton({
  children = 'Book a ride',
  href,
  onClick,
  color = '#ff5a1f',
  ink = '#140b06',
  arrow = true,
  stagger = 0.018,
  className = '',
}: SkewSlideButtonProps) {
  const style = {'--ease': 'cubic-bezier(.19,1,.22,1)', '--stagger': `${stagger}s`, color: ink} as CSSProperties
  const body: ReactNode = (
    <>
      <span
        aria-hidden
        className="col-start-1 row-start-1 rounded-[0.25rem] [transition:scale_.75s_var(--ease)] group-hover:[scale:1.025_1.035] group-hover:[transition-delay:.05s] group-focus-visible:[scale:1.025_1.035]"
        style={{background: color}}
      />
      <span className="pointer-events-none z-1 col-start-1 row-start-1 grid overflow-hidden px-4 py-3">
        <Copy label={children} arrow={arrow} kind="out" />
        <Copy label={children} arrow={arrow} kind="in" />
      </span>
    </>
  )
  const cls = `group relative inline-grid leading-none uppercase no-underline outline-none select-none [-webkit-tap-highlight-color:transparent] [transition:scale_.15s_cubic-bezier(.4,0,.2,1)] active:[scale:0.955_0.925] focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 ${className}`
  return href ? (
    <a href={href} aria-label={children} className={cls} style={style}>
      {body}
    </a>
  ) : (
    <button type="button" aria-label={children} onClick={onClick} className={cls} style={style}>
      {body}
    </button>
  )
}
