'use client'

import type {UiDemoProps} from '@/ui'
import SpiralShaderBackground from './files/components/mfa/SpiralShaderBackground'

export default function Demo({props}: UiDemoProps) {
  return (
    <SpiralShaderBackground
      innerColor={props.innerColor as never}
      midColor={props.midColor as never}
      outerColor={props.outerColor as never}
      background={props.background as never}
      speed={props.speed as never}
      arms={props.arms as never}
      twist={props.twist as never}
      thickness={props.thickness as never}
      softness={props.softness as never}
      size={props.size as never}
      glow={props.glow as never}
      halo={props.halo as never}
    />
  )
}
