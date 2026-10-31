'use client'

import type {UiDemoProps} from '@/ui'
import LiquidImageHover from './files/components/mfa/LiquidImageHover'

export default function Demo({props}: UiDemoProps) {
  return (
    <div className="grid h-full w-full place-items-center bg-[#f4f2ee] p-6 sm:p-10">
      <div className="aspect-[3/2] w-full max-w-4xl overflow-hidden rounded-lg">
        <LiquidImageHover
          alt="A phone held in a hand"
          refraction={props.refraction as number}
          dispersion={props.dispersion as number}
          shade={props.shade as number}
          gloss={props.gloss as number}
          caustics={props.caustics as number}
          damping={props.damping as number}
          speed={props.speed as number}
          dropSize={props.dropSize as number}
          dropForce={props.dropForce as number}
        />
      </div>
    </div>
  )
}
