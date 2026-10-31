'use client'

import type {UiDemoProps} from '@/ui'
import PuffyIcon, {type PuffyIconProps} from './files/components/mfa/puffy-icon/PuffyIcon'

const icon = (d: string) => `<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="${d}"/></svg>`

const ICONS = [
  {
    svg: icon('M12 21C5 15.5 2 12 2 8.2 2 5.3 4.3 3 7.1 3 9.1 3 11 4.2 12 6 13 4.2 14.9 3 16.9 3 19.7 3 22 5.3 22 8.2 22 12 19 15.5 12 21Z'),
    color: '#ff5a1f',
    iconColor: '#ffffff',
  },
  {svg: icon('M13 2 4 14h7l-1 8 9-12h-7l1-8Z'), color: '#ffffff', iconColor: '#ff5a1f'},
  {svg: icon('M7 4v16l13-8Z'), color: '#1f1f22', iconColor: '#ffffff'},
  {
    svg: icon('M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20Zm0 5a5 5 0 1 1 0 10 5 5 0 1 1 0-10Z'),
    color: '#c8f560',
    iconColor: '#111111',
  },
]

// The big tile takes every control; the row below keeps its own colours
// and shares the shape controls.
export default function Demo({props}: UiDemoProps) {
  const {color, iconColor, ...shape} = props as PuffyIconProps
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-[#0d0d0f] p-8">
      <PuffyIcon {...shape} color={color} iconColor={iconColor} className="max-w-60" />
      <div className="grid w-full max-w-130 grid-cols-4 gap-4">
        {ICONS.map((i, n) => (
          <PuffyIcon key={n} {...shape} {...i} rest={[-8, n % 2 ? 18 : -18]} />
        ))}
      </div>
    </div>
  )
}
