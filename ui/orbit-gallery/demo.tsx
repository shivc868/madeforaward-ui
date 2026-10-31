'use client'

import type {UiDemoProps} from '@/ui'
import OrbitGallery from './files/components/mfa/OrbitGallery'

export default function Demo({props}: UiDemoProps) {
  return (
    <div className="h-full w-full bg-[#0d0d0f]">
      <OrbitGallery
        ringSize={props.ringSize as number}
        cardSize={props.cardSize as number}
        drift={props.drift as number}
        wheelSpin={props.wheelSpin as boolean}
      />
    </div>
  )
}
