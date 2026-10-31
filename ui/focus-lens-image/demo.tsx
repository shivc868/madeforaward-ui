'use client'

import type {UiDemoProps} from '@/ui'
import FocusLensImage from './files/components/mfa/FocusLensImage'

export default function Demo({props}: UiDemoProps) {
  return (
    <FocusLensImage
      blur={props.blur as number}
      lensWidth={props.lensWidth as number}
      lensHeight={props.lensHeight as number}
      smoothing={props.smoothing as number}
      crosshair={props.crosshair as boolean}
    />
  )
}
