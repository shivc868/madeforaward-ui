'use client'

import type {UiDemoProps} from '@/ui'
import FlowDistortText from './files/components/mfa/FlowDistortText'

// A wide, heavy face; the word is drawn once the font has loaded.
export default function Demo({props}: UiDemoProps) {
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Syne:wght@800&display=swap" precedence="default" />
      <FlowDistortText
        color={props.color as string}
        background={props.background as string}
        grain={props.grain as boolean}
        distortion={props.distortion as number}
        aberration={props.aberration as number}
        spread={props.spread as number}
        falloff={props.falloff as number}
        dissipation={props.dissipation as number}
        motionBlur={props.motionBlur as number}
        velocityScale={props.velocityScale as number}
      />
    </>
  )
}
