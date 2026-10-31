'use client'

import type {UiDemoProps} from '@/ui'
import WireSphereBackground from './files/components/mfa/WireSphereBackground'

export default function Demo({props}: UiDemoProps) {
  return (
    <WireSphereBackground
      size={props.size as number}
      detail={props.detail as number}
      noiseScale={props.noiseScale as number}
      noiseIntensity={props.noiseIntensity as number}
      noiseSpeed={props.noiseSpeed as number}
      colorIntensity={props.colorIntensity as number}
      baseColor={props.baseColor as string}
      solidCore={props.solidCore as boolean}
      distortion={props.distortion as number}
      zoom={props.zoom as number}
      aberration={props.aberration as number}
      draggable={props.draggable as boolean}
      background={props.background as string}
    />
  )
}
