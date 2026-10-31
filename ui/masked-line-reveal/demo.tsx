'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import MaskedLineReveal from './files/components/mfa/MaskedLineReveal'

export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative flex h-full w-full flex-col justify-center bg-[#0d0d0f] px-8 sm:px-14">
      <MaskedLineReveal
        key={run}
        as="h2"
        trigger="mount"
        duration={props.duration as number}
        stagger={props.stagger as number}
        className="max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight text-white sm:text-6xl"
      >
        We shape brands for the moments people actually remember.
      </MaskedLineReveal>
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
