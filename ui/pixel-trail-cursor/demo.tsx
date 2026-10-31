'use client'

import type {UiDemoProps} from '@/ui'
import PixelTrailCursor from './files/components/mfa/PixelTrailCursor'

export default function Demo({props}: UiDemoProps) {
  return (
    <PixelTrailCursor
      background={props.background as string}
      color={props.color as string}
      cellSize={props.cellSize as number}
      radius={props.radius as number}
      strength={props.strength as number}
      persistence={props.persistence as number}
    />
  )
}
