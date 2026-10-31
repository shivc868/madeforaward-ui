'use client'

import type {UiDemoProps} from '@/ui'
import InkBlobCursor from './files/components/mfa/InkBlobCursor'

// A tight grotesk name across the page with a handwritten line under it.
export default function Demo({props}: UiDemoProps) {
  return (
    <InkBlobCursor
      background={props.background as string}
      ink={props.ink as string}
      size={props.size as number}
      follow={props.follow as number}
      ease={props.ease as number}
      turbulence={props.turbulence as number}
      noiseScale={props.noiseScale as number}
      wobble={props.wobble as number}
      grain={props.grain as boolean}
    >
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@700&family=Mrs+Saint+Delafield&display=swap"
        precedence="default"
      />
      <div className="flex h-full flex-col justify-center px-[2.5%] select-none [container-type:inline-size]">
        <h2 className="text-[19.2cqw] leading-none font-bold tracking-[-0.045em] whitespace-nowrap [font-family:'Inter_Tight',sans-serif]">
          NOVA LUND
        </h2>
        <p className="mt-[1cqw] self-end pr-[3%] text-[3.4cqw] leading-none [font-family:'Mrs_Saint_Delafield',cursive]">
          Shaping stone into stories
        </p>
      </div>
    </InkBlobCursor>
  )
}
