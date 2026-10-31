'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import ScrollImageFly from './files/components/mfa/ScrollImageFly'

// The section scrolls inside the preview box on its own smooth scroll.
export default function Demo({props}: UiDemoProps) {
  return (
    <ScrollStage>
      {(scroller) => (
        <ScrollImageFly
          scroller={scroller}
          length={props.length as number}
          tilt={props.tilt as number}
          overlap={props.overlap as number}
          pop={props.pop as boolean}
        />
      )}
    </ScrollStage>
  )
}
