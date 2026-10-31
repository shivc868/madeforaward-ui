import type {CSSProperties, ReactNode} from 'react'

export type DotSwingButtonProps = {
  children?: string
  href?: string
  onClick?: () => void
  /** button colour */
  background?: string
  /** text colour */
  ink?: string
  /** colour of the label that swings in on hover */
  hoverInk?: string
  /** the dot at rest, then the three that swing in on hover (the last lands on top) */
  dots?: [string, string, string, string]
  className?: string
}

// an elastic overshoot (about 5%) that settles by 55%
const ELASTIC =
  'linear(0, 0.007 0.9%, 0.026 1.8%, 0.113 4%, 0.605 12.3%, 0.807 16.5%, 0.947 20.9%, 0.992 23.2%, 1.024 25.6%, 1.045 28.7%, 1.051 32.3%, 1.011 47.8%, 1 55.7%, 1)'

const area = 'col-start-1 row-start-1'
const dot = `${area} ml-3 block size-[.625rem] origin-[-0.75rem] rounded-full [transition:rotate_.75s_var(--elastic),scale_.75s_var(--elastic),opacity_.2s_ease-out] motion-reduce:transition-none`
// the three that swing in: tucked away at 120° and a quarter size, then round to 0° one after another
const swing =
  '[rotate:120deg] [scale:.25] opacity-0 group-hover:[rotate:0deg] group-hover:[scale:.99] group-hover:opacity-100 group-hover:[transition-delay:calc(var(--index)*.032s)] group-focus-visible:[rotate:0deg] group-focus-visible:[scale:.99] group-focus-visible:opacity-100'

// A small dashed button whose dot and label swing on hover: the dot rocks
// away round a pivot just left of it while three coloured dots swing in one
// after another (a little rainbow wheel), and the label tips back and lifts
// out to the top left as a copy swings up from below into its place. All
// on an elastic ease, CSS only; keyboard focus plays it too, and touch gets
// a press colour instead.
export default function DotSwingButton({
  children = 'Book a studio tour',
  href,
  onClick,
  background = '#f1f4ff',
  ink = '#11143a',
  hoverInk = '#2d3cff',
  dots = ['#2d3cff', '#2fd9a8', '#ff6fb5', '#2d3cff'],
  className = '',
}: DotSwingButtonProps) {
  const style = {'--elastic': ELASTIC, background, color: ink} as CSSProperties
  const cls = `group relative grid w-fit overflow-clip rounded-[.5rem] border border-dashed border-black no-underline shadow-[inset_0_0_0_4px_#00000014] outline-none select-none [-webkit-tap-highlight-color:transparent] [transform-style:preserve-3d] [transition:transform_.45s_var(--elastic)] active:[transform:scaleX(.955)_scaleY(.954)] focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 ${className}`
  const body: ReactNode = (
    <>
      <span
        aria-hidden
        className={`${area} rounded-[.5rem] [transition:scale_.45s_cubic-bezier(.32,.72,0,1),background-color_.2s_cubic-bezier(.216,.62,.356,1)] group-hover:[scale:1.065_1.095] [@media(hover:none)]:group-active:bg-black [@media(hover:none)]:group-active:duration-0`}
      />
      <span
        aria-hidden
        data-text={children}
        className={`z-1 ${area} grid items-center gap-x-2 overflow-clip rounded-[.5rem] py-3 pr-4 after:col-start-2 after:row-start-1 after:block after:origin-left after:[translate:-1rem_2em_0] after:[rotate:40deg] after:text-(--hover-ink) after:opacity-0 after:content-[attr(data-text)] after:[transition:translate_.75s_var(--elastic),rotate_.85s_var(--elastic),opacity_.2s_ease-out] group-hover:after:[translate:0_0_0] group-hover:after:[rotate:0deg] group-hover:after:opacity-100 group-focus-visible:after:[translate:0_0_0] group-focus-visible:after:[rotate:0deg] group-focus-visible:after:opacity-100`}
        style={{'--hover-ink': hoverInk} as CSSProperties}
      >
        <span className={`${area} grid`}>
          <span className={`${dot} group-hover:[rotate:-120deg] group-hover:opacity-0 group-focus-visible:[rotate:-120deg] group-focus-visible:opacity-0`} style={{background: dots[0]}} />
          {dots.slice(1).map((c, i) => (
            <span key={i} className={`${dot} ${swing}`} style={{background: c, '--index': 2 - i} as CSSProperties} />
          ))}
        </span>
        <span className="col-start-2 row-start-1 block origin-left [transition:translate_.75s_var(--elastic),rotate_.85s_var(--elastic),opacity_.2s_ease-out,color_.2s_cubic-bezier(.216,.62,.356,1)] group-hover:[translate:-1rem_-2em_0] group-hover:[rotate:-40deg] group-hover:opacity-0 group-focus-visible:[translate:-1rem_-2em_0] group-focus-visible:[rotate:-40deg] group-focus-visible:opacity-0 [@media(hover:none)]:group-active:text-[#f0ece5] [@media(hover:none)]:group-active:duration-0">
          {children}
        </span>
      </span>
    </>
  )
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
