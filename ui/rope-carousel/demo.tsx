'use client'

import type {UiDemoProps} from '@/ui'
import RopeCarousel from './files/components/mfa/RopeCarousel'

export default function Demo({props}: UiDemoProps) {
  return (
    <RopeCarousel
      sag={props.sag as number}
      speed={props.speed as number}
      sway={props.sway as number}
      gap={props.gap as number}
      direction={props.direction as 'left' | 'right'}
      clipColor={props.clipColor as string}
    />
  )
}
