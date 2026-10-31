'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import TearTicket from './files/components/mfa/TearTicket'

export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_50%_40%,#2a2620,#121110_70%)]">
      <p className="absolute top-6 left-1/2 -translate-x-1/2 font-mono text-[11px] tracking-[0.2em] text-white/40 uppercase">Pull the stub to tear</p>
      <TearTicket
        key={run}
        tearAngle={props.tearAngle as number}
        stretch={props.stretch as number}
        resistance={props.resistance as number}
        tilt={props.tilt as number}
        rotate={props.rotate as number}
        holes={props.holes as number}
      />
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
