'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import ScrollStepsText from './files/components/mfa/ScrollStepsText'

// A neo-grotesk close to the reference's Haas Unica; the section scrolls inside the preview box.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="h-full w-full [font-family:'Inter_Tight',sans-serif] tracking-[-0.01em]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400&display=swap" precedence="default" />
      <ScrollStage>
        {(scroller) => (
          <ScrollStepsText
            scroller={scroller}
            accent={props.accent as string}
            ink={props.ink as string}
            background={props.background as string}
            dim={props.dim as number}
            settle={props.settle as number}
            length={props.length as number}
          />
        )}
      </ScrollStage>
    </div>
  )
}
