'use client'

import type {UiDemoProps} from '@/ui'
import DotSwingButton from './files/components/mfa/DotSwingButton'

// A crisp grotesk on a pale blue page.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="grid h-full w-full place-items-center bg-[#e6ebff] text-[17px] font-semibold [font-family:'Instrument_Sans',sans-serif]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@600&display=swap" precedence="default" />
      <DotSwingButton
        background={props.background as string}
        ink={props.ink as string}
        dots={[props.dot as string, props.third as string, props.second as string, props.first as string]}
      />
    </div>
  )
}
