'use client'

import type {UiDemoProps} from '@/ui'
import LensImageField from './files/components/mfa/LensImageField'

export default function Demo({props}: UiDemoProps) {
  return (
    <LensImageField
      size={props.size as number}
      reach={props.reach as number}
      magnify={props.magnify as number}
      speed={props.speed as number}
      follow={props.follow as number}
      className="text-[#1a1915]"
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-10 px-6 text-center">
        <h2 className="text-[clamp(28px,4.4vw,60px)] leading-[1.12] tracking-[-0.02em]">
          No feeds. No noise. No doomscroll.
          <br />
          Just picks from{' '}
          <span className="relative inline-block px-[0.35em]">
            <svg viewBox="0 0 328 67" fill="none" preserveAspectRatio="none" className="absolute inset-0 size-full" aria-hidden>
              <path
                d="M314.698 65.9968C322.707 56.4457 327 45.1096 327 33.5C327 21.8872 322.71 10.5512 314.698 1H13.3018C5.28961 10.5512 1 21.8872 1 33.5C1 45.1128 5.28961 56.4488 13.3018 66H314.702Z"
                stroke="currentColor"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            people you trust.
          </span>
        </h2>
        <a data-lens-hide href="#" className="rounded-full bg-[#1a1915] px-6 py-3 font-mono text-xs tracking-[0.12em] text-[#f4f3ef] uppercase">
          Join the list
        </a>
      </div>
    </LensImageField>
  )
}
