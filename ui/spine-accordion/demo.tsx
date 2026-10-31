'use client'

import type {UiDemoProps} from '@/ui'
import SpineAccordion from './files/components/mfa/SpineAccordion'

export default function Demo({props}: UiDemoProps) {
  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[linear-gradient(140deg,#33465a_0%,#1f2a38_48%,#12161e_100%)] p-6 sm:p-10" data-lenis-prevent>
      <SpineAccordion
        className="w-full max-w-260"
        cardHeight={420}
        autoplay={props.autoplay as boolean}
        hoverToOpen={props.hoverToOpen as boolean}
        interval={props.interval as number}
        closedWidth={props.closedWidth as number}
        artTravel={props.artTravel as number}
      />
    </div>
  )
}
