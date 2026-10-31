'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import ScrollHighlight from './files/components/mfa/ScrollHighlight'

export default function Demo({props}: UiDemoProps) {
  return (
    <ScrollStage>
      {(scroller) => (
        <div className="px-8 sm:px-14">
          <ScrollHighlight
            scroller={scroller}
            // The preview box is short, so the read-through spans more of it.
            start="top 90%"
            end="bottom 30%"
            dim={props.dim as number}
            blur={props.blur as number}
            className="max-w-4xl text-3xl leading-[1.15] font-medium tracking-tight text-white sm:text-5xl"
          />
        </div>
      )}
    </ScrollStage>
  )
}
