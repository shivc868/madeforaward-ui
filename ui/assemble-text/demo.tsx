'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import AssembleText from './files/components/mfa/AssembleText'

// An editorial block: a small label, then the paragraph assembling itself.
// Replay remounts it so it starts from empty.
export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative flex h-full w-full flex-col justify-center bg-[#0d0d0f] px-8 sm:px-14">
      <p className="text-xs tracking-[0.18em] text-white/40 uppercase">About the studio</p>
      <AssembleText
        key={run}
        trigger="mount"
        duration={props.duration as number}
        className="mt-6 max-w-3xl text-3xl leading-[1.1] font-medium tracking-tight text-white sm:text-4xl"
        text="Northline (est. 2014 → today) is an independent design studio known for quiet interfaces, sharp typography and motion that earns its place. Every project starts with a single question: what should people feel first?"
      />
      <button
        type="button"
        onClick={() => setRun((r) => r + 1)}
        className="absolute right-6 bottom-6 rounded-full border border-white/15 px-4 py-1.5 text-xs text-white/70 transition-colors hover:border-white/35 hover:text-white"
      >
        Replay
      </button>
    </div>
  )
}
