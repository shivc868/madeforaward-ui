'use client'

import type {UiDemoProps} from '@/ui'
import DotHighwayBackground from './files/components/mfa/DotHighwayBackground'

export default function Demo({props}: UiDemoProps) {
  return (
    <DotHighwayBackground
      color={props.color as string}
      accent={props.accent as string}
      from={props.from as string}
      to={props.to as string}
      speed={props.speed as number}
      curve={props.curve as number}
      dotSize={props.dotSize as number}
      opacity={props.opacity as number}
      pulses={props.pulses as number}
      hover={props.hover as number}
      radius={props.radius as number}
      parallax={props.parallax as boolean}
    />
  )
}
