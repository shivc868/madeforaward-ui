'use client'

import type {UiDemoProps} from '@/ui'
import SkewSlideButton from './files/components/mfa/SkewSlideButton'

export default function Demo({props}: UiDemoProps) {
  const stagger = props.stagger as number
  return (
    <div className="flex h-full w-full flex-wrap items-center justify-center gap-6 bg-[#f4f1ec] p-8 text-[clamp(16px,1.6vw,22px)] [font-family:Anton,sans-serif]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&display=swap" precedence="default" />
      <SkewSlideButton href="#" stagger={stagger} color={props.color as string} />
      <SkewSlideButton href="#" stagger={stagger} color="#141414" ink="#f4f1ec">
        Meet the team
      </SkewSlideButton>
      <SkewSlideButton href="#" stagger={stagger} color="#c8ff2e" arrow={false}>
        Join the grid
      </SkewSlideButton>
    </div>
  )
}
