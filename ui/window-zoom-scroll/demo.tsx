'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import WindowZoomScroll from './files/components/mfa/WindowZoomScroll'

// A tall condensed face for the heading; the section scrolls inside the preview box.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="h-full w-full [font-family:Antonio,sans-serif]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Antonio:wght@300;400&display=swap" precedence="default" />
      <ScrollStage>
        {(scroller) => (
          <WindowZoomScroll
            scroller={scroller}
            wall={props.wall as string}
            zoom={props.zoom as number}
            length={props.length as number}
          />
        )}
      </ScrollStage>
    </div>
  )
}
