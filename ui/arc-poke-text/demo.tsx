'use client'

import {useState} from 'react'
import type {UiDemoProps} from '@/ui'
import {ReplayButton} from '../demo-kit'
import ArcPokeText from './files/components/mfa/ArcPokeText'

// A heavy condensed face at poster size, with a paper-grain backdrop.
export default function Demo({props}: UiDemoProps) {
  const [run, setRun] = useState(0)
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden bg-[#ffd23f] text-[#1b1464]">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@800&display=swap" precedence="default" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.012' numOctaves='3'/%3E%3CfeDiffuseLighting lighting-color='%23fff' surfaceScale='2'%3E%3CfeDistantLight azimuth='45' elevation='55'/%3E%3C/feDiffuseLighting%3E%3C/filter%3E%3Crect width='240' height='240' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <ArcPokeText
        key={run}
        trigger="mount"
        arcDrop={props.arcDrop as number}
        arcTilt={props.arcTilt as number}
        poke={props.poke as boolean}
        duration={props.duration as number}
        stagger={props.stagger as number}
        tracking={props.tracking as number}
        lineHeight={0.8}
        className="relative pt-[0.2em] text-[clamp(90px,15vw,230px)] font-extrabold uppercase [font-family:'Barlow_Semi_Condensed',sans-serif]"
      />
      <ReplayButton onClick={() => setRun((r) => r + 1)} />
    </div>
  )
}
