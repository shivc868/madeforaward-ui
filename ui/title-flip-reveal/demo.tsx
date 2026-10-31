'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import TitleFlipReveal from './files/components/mfa/TitleFlipReveal'

// A heavy geometric face at poster size on a deep green.
export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  const flipOn = props.flipOn as 'click' | 'hover' | 'none'
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#0f2a1d] text-[#d9ff5b] [font-family:Outfit,sans-serif]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&display=swap" precedence="default" />
      <TitleFlipReveal
        key={run}
        trigger="mount"
        flipOn={flipOn}
        duration={props.duration as number}
        stagger={props.stagger as number}
        scaleFrom={props.scaleFrom as number}
        scaleDuration={props.scaleDuration as number}
        className="w-full text-center text-[clamp(48px,9.5vw,190px)] leading-[0.9] font-semibold tracking-[-0.01em] uppercase"
      />
      {flipOn !== 'none' && (
        <span className="mt-6 text-sm text-[#d9ff5b]/70">({flipOn === 'click' ? 'Click' : 'Hover'} the title)</span>
      )}
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
