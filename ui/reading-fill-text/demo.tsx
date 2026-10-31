'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import ReadingFillText from './files/components/mfa/ReadingFillText'

export default function Demo({props}: UiDemoProps) {
  return (
    <div className="h-full w-full bg-white [&_[data-lenis-prevent]]:bg-white">
      <ScrollStage>
        {(scroller) => (
          <div className="px-6 sm:px-10">
            <ReadingFillText
              scroller={scroller}
              color={props.color as string}
              dimColor={props.dimColor as string}
              readLine={props.readLine as number}
              avoid={props.avoid as boolean}
              avoidStrength={props.avoidStrength as number}
              className="text-[clamp(28px,4vw,64px)] leading-[1.07] font-semibold tracking-[-0.05em]"
            />
          </div>
        )}
      </ScrollStage>
    </div>
  )
}
