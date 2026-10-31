'use client'

import type {UiDemoProps} from '@/ui'
import LiquidDock from './files/components/mfa/LiquidDock'

// A colourful backdrop so the dock's glass has something to blur.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#0f0f14]">
      <div aria-hidden className="absolute inset-0 opacity-70 blur-3xl">
        <div className="absolute top-[18%] left-[22%] size-72 rounded-full bg-[#ff7a59]" />
        <div className="absolute top-[30%] right-[20%] size-80 rounded-full bg-[#8b5cf6]" />
        <div className="absolute bottom-[12%] left-[40%] size-72 rounded-full bg-[#22c3a6]" />
      </div>
      <LiquidDock magnify={props.magnify as number} stretch={props.stretch as number} size={props.size as number} tooltips={props.tooltips as boolean} />
    </div>
  )
}
