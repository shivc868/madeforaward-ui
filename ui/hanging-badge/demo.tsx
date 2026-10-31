'use client'

import type {UiDemoProps} from '@/ui'
import HangingBadge from './files/components/mfa/HangingBadge'

export default function Demo({props}: UiDemoProps) {
  return (
    <div className="relative h-full w-full bg-[radial-gradient(ellipse_at_50%_35%,#1f1c27,#0b0a0e_70%)]">
      <p className="pointer-events-none absolute right-6 bottom-6 text-[11px] tracking-[0.2em] text-white/35 uppercase">
        Drag · Throw · Spin
      </p>
      <HangingBadge
        accent={props.accent as string}
        backColor={props.backColor as string}
        strapColor={props.strapColor as string}
      />
    </div>
  )
}
