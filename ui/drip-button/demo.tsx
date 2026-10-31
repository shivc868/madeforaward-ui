'use client'

import type {UiDemoProps} from '@/ui'
import DripButton from './files/components/mfa/DripButton'

// The button in the middle of the stage, nudged up a little so its drips
// have room to run.
export default function Demo({props}: UiDemoProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0d0d0f] pb-24">
      <DripButton
        color={props.color as string}
        drips={props.drips as number}
        length={props.length as number}
        duration={props.duration as number}
        drops={props.drops as boolean}
        className="px-10 py-5 text-xl"
      >
        Let’s talk with us
      </DripButton>
    </div>
  )
}
