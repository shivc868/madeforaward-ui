'use client'

import type {UiDemoProps} from '@/ui'
import HalftoneHover from './files/components/mfa/HalftoneHover'

export default function Demo({props}: UiDemoProps) {
  return (
    <HalftoneHover
      mode={props.mode as never}
      threshold={props.threshold as never}
      contrast={props.contrast as never}
      dotSize={props.dotSize as never}
      spacing={props.spacing as never}
      variation={props.variation as never}
      grid={props.grid as never}
      shape={props.shape as never}
      colorMode={props.colorMode as never}
      primaryColor={props.primaryColor as never}
      accentColor={props.accentColor as never}
      accentAmount={props.accentAmount as never}
      effect={props.effect as never}
      radius={props.radius as never}
      strength={props.strength as never}
      swirl={props.swirl as never}
      grow={props.grow as never}
      ease={props.ease as never}
      fit={props.fit as never}
      imageScale={props.imageScale as never}
    />
  )
}
