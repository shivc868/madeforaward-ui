'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import ScrambleText from './files/components/mfa/ScrambleText'

const LINKS = ['Work', 'Studio', 'Journal', 'Contact']

// A heading that resolves on load (hover it to replay) and a nav whose
// links scramble on hover.
export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  const timing = {duration: props.duration as number, spread: props.spread as number}
  return (
    <div className="relative flex h-full w-full flex-col justify-center gap-12 bg-[#0d0d0f] px-8 sm:px-14">
      <ScrambleText
        key={run}
        as="h2"
        trigger="mount"
        {...timing}
        text="Signal over noise. Every detail earns its place."
        className="max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight text-white sm:text-6xl"
      />
      <nav className="flex gap-8 font-mono text-sm tracking-widest text-white/70 uppercase">
        {LINKS.map((l) => (
          <ScrambleText key={l} as="span" trigger="hover" {...timing} text={l} className="cursor-pointer hover:text-white" />
        ))}
      </nav>
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
