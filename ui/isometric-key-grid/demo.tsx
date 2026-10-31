'use client'

import type {UiDemoProps} from '@/ui'
import IsometricKeyGrid from './files/components/mfa/IsometricKeyGrid'

export default function Demo({props}: UiDemoProps) {
  return (
    <IsometricKeyGrid
      lift={props.lift as number}
      radius={props.radius as number}
      iconSize={props.iconSize as number}
      gap={props.gap as number}
      keySize={props.keySize as number}
    />
  )
}
