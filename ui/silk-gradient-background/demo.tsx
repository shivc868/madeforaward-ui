'use client'

import type {UiDemoProps} from '@/ui'
import SilkGradientBackground from './files/components/mfa/SilkGradientBackground'

export default function Demo({props}: UiDemoProps) {
  return (
    <SilkGradientBackground
      baseColor={props.baseColor as string}
      midColor={props.midColor as string}
      highlightColor={props.highlightColor as string}
      speed={props.speed as number}
      scale={props.scale as number}
      seam={props.seam as number}
    >
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <h2 className="max-w-2xl text-4xl leading-[1.05] font-semibold tracking-tight text-white sm:text-6xl">
          Calm by design.
        </h2>
        <p className="mt-4 text-sm text-white/60">A slow, silky WebGL background.</p>
      </div>
    </SilkGradientBackground>
  )
}
