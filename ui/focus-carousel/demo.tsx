'use client'

import type {UiDemoProps} from '@/ui'
import FocusCarousel from './files/components/mfa/FocusCarousel'

export default function Demo({props}: UiDemoProps) {
  return (
    <FocusCarousel
      sideSize={props.sideSize as number}
      gap={props.gap as number}
      blurStep={props.blurStep as number}
      sideGrey={props.sideGrey as number}
    />
  )
}
