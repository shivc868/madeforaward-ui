'use client'

import type {UiDemoProps} from '@/ui'
import {ScrollStage} from '../demo-kit'
import CylinderText from './files/components/mfa/CylinderText'

export default function Demo({props}: UiDemoProps) {
  return (
    <ScrollStage>
      {(scroller) => (
        <CylinderText
          scroller={scroller}
          step={props.step as number}
          distance={props.distance as number}
          className="text-5xl leading-none font-semibold tracking-tight text-white sm:text-7xl"
        />
      )}
    </ScrollStage>
  )
}
