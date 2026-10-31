'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import CardFanScroll from './files/components/mfa/CardFanScroll'

// The section scrolls inside the preview box; a chunky grotesk for the cards.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="h-full w-full [font-family:'Bricolage_Grotesque',sans-serif]">
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,300..800&display=swap"
        precedence="default"
      />
      <ScrollStage>
        {(scroller) => (
          <CardFanScroll
            scroller={scroller}
            spread={props.spread as number}
            length={props.length as number}
            fold={props.fold as boolean}
            background={props.background as string}
          />
        )}
      </ScrollStage>
    </div>
  )
}
