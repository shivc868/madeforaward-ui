'use client'

import type {UiDemoProps} from '@/ui'
import SilkCursorTrail from './files/components/mfa/SilkCursorTrail'

// The trail kept inside the preview box (fixed={false}); on a real page it
// covers the viewport by default.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="relative flex h-full w-full items-center justify-center bg-[#0d0d0f]">
      <p className="text-xs tracking-[0.18em] text-white/40 uppercase">Move your cursor</p>
      <SilkCursorTrail
        fixed={false}
        length={props.length as number}
        headWidth={props.headWidth as number}
        smoothing={props.smoothing as number}
        glow={props.glow as number}
        headColor={props.headColor as string}
        tailColor={props.tailColor as string}
      />
    </div>
  )
}
