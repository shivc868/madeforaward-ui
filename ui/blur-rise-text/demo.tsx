'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import BlurRiseText from './files/components/mfa/BlurRiseText'

export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#0b0b0c]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&display=swap" precedence="default" />
      <BlurRiseText
        key={run}
        trigger="mount"
        duration={props.duration as number}
        stagger={props.stagger as number}
        blur={props.blur as number}
        distance={props.distance as number}
        from={props.from as 'edges'}
        className="text-[clamp(72px,12vw,176px)] leading-none text-[#ff6a2b] uppercase [font-family:Anton,sans-serif]"
      >
        Afterglow
      </BlurRiseText>
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
