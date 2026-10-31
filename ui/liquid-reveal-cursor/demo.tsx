'use client'

import type {UiDemoProps} from '@/ui'
import LiquidRevealCursor from './files/components/mfa/LiquidRevealCursor'

// A plain surface; wherever the cursor goes, the colours beneath show
// through it. (Without children the blob shows the page inverted instead.)
const BENEATH = [
  'radial-gradient(40% 55% at 18% 30%, #ff8a3d 0%, transparent 70%)',
  'radial-gradient(45% 60% at 82% 25%, #ff3d81 0%, transparent 70%)',
  'radial-gradient(50% 60% at 60% 85%, #6b4dff 0%, transparent 70%)',
  'radial-gradient(35% 45% at 25% 85%, #c8f560 0%, transparent 70%)',
  'linear-gradient(135deg, #1a0b2e, #2a0f3f)',
].join(',')

export default function Demo({props}: UiDemoProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[#f4f1ec]">
      <LiquidRevealCursor
        fixed={false}
        size={props.size as number}
        trail={props.trail as number}
        smear={props.smear as number}
        flow={props.flow as number}
        speed={props.speed as number}
        splash={props.splash as boolean}
      >
        <div className="h-full w-full" style={{background: BENEATH}} />
      </LiquidRevealCursor>
    </div>
  )
}
