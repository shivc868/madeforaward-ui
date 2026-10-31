'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import WipeRevealText from './files/components/mfa/WipeRevealText'

export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative flex h-full w-full items-center overflow-hidden bg-[#121317] px-6 text-[#f2f1ee] sm:px-12">
      <WipeRevealText
        key={run}
        trigger="mount"
        step={props.step as number}
        reveal={props.reveal as number}
        stagger={props.stagger as number}
        className="text-[clamp(28px,3.4vw,52px)] leading-[1.18] font-medium tracking-[-0.045em]"
      />
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
