'use client'

import type {UiDemoProps} from '@/ui'
import LiquidSmokeCursor from './files/components/mfa/LiquidSmokeCursor'

// A dark stage with a heading; the trail stays inside it (area 'inside').
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="relative h-full w-full cursor-none overflow-hidden bg-[#0e1013]">
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3 text-center select-none">
        <p className="text-[11px] tracking-[0.2em] text-white/40 uppercase">Live preview</p>
        <p className="text-4xl font-medium tracking-tight text-white/85 sm:text-6xl">Move your cursor here</p>
      </div>
      <LiquidSmokeCursor
        area="inside"
        color={props.color as never}
        rainbow={props.rainbow as never}
        intensity={props.intensity as never}
        blend={props.blend as never}
        fade={props.fade as never}
        force={props.force as never}
        radius={props.radius as never}
        swirl={props.swirl as never}
        shading={props.shading as never}
        clickBurst={props.clickBurst as never}
        quality={props.quality as never}
        cursor={props.cursor as never}
        cursorSize={props.cursorSize as never}
        cursorColor={props.cursorColor as never}
      />
    </div>
  )
}
