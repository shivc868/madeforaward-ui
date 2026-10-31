'use client'

import type {UiDemoProps} from '@/ui'
import ProjectWheels from './files/components/mfa/ProjectWheels'

export default function Demo({props}: UiDemoProps) {
  return <ProjectWheels bend={props.bend as number} />
}
