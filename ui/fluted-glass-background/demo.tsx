'use client'

import type {UiDemoProps} from '@/ui'
import FlutedGlassBackground from './files/components/mfa/FlutedGlassBackground'

export default function Demo({props}: UiDemoProps) {
  return (
    <FlutedGlassBackground
      columns={props.columns as number}
      refraction={props.refraction as number}
      glow={props.glow as number}
      speed={props.speed as number}
    />
  )
}
