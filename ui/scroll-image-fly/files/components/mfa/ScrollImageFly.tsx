'use client'

import {useEffect, useRef, useState} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type ScrollImageFlyProps = {
  /** image URLs, dealt in order */
  images?: string[]
  /** section height in screens (the stage stays pinned through it) */
  length?: number
  /** largest random tilt, in degrees either way */
  tilt?: number
  /** seconds between images, in timeline units (1 = one image's whole flight) */
  overlap?: number
  /** pop each image in from 90% with an elastic bounce */
  pop?: boolean
  /** the scrolling element, when it isn't the window */
  scroller?: HTMLElement | null
  className?: string
}

const unsplash = (id: string) => `https://images.unsplash.com/${id}?q=80&w=900&auto=format&fit=crop`
const IMAGES = [
  'photo-1469474968028-56623f02e42e',
  'photo-1534528741775-53994a69daeb',
  'photo-1500530855697-b586d89ba3ee',
  'photo-1476820865390-c52aeebb9891',
  'photo-1517841905240-472988babdf9',
  'photo-1509316785289-025f5b846b35',
  'photo-1495616811223-4d98c6e9c869',
  'photo-1524504388940-b1c1722653e1',
  'photo-1473580044384-7ba9967e16a0',
  'photo-1508739773434-c26b3d09e071',
  'photo-1531123897727-8f129e1688ce',
  'photo-1470071459604-3b5ec3a7fe05',
  'photo-1482192596544-9eb780fc7f66',
  'photo-1506794778202-cad84cf45f1d',
  'photo-1506905925346-21bda4d32df4',
  'photo-1518495973542-4542c06a5843',
].map(unsplash)

// A pinned scroll section where photos fly through the frame: as you
// scroll, one image after another appears in the centre (popping in from
// 90% on an elastic spring), then sinks back into the distance with a
// random tilt and, part way, sweeps up and out of the top. Each new image
// lands on top of the ones still receding, so the stack streams away from
// you. Scrubbed by scroll; the depth comes from a CSS perspective as tall
// as the stage.
export default function ScrollImageFly({
  images = IMAGES,
  length = 4,
  tilt = 20,
  overlap = 0.1,
  pop = true,
  scroller = null,
  className = '',
}: ScrollImageFlyProps) {
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRefs = useRef<HTMLImageElement[]>([])
  const [stageH, setStageH] = useState(0)

  // the stage is as tall as the scroller's viewport
  useEffect(() => {
    const measure = () => setStageH(scroller ? scroller.clientHeight : window.innerHeight)
    measure()
    const ro = new ResizeObserver(measure)
    if (scroller) ro.observe(scroller)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [scroller])

  useGSAP(
    () => {
      const stage = stageRef.current!
      const media = imageRefs.current.slice(0, images.length)
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches
      gsap.set(media, {autoAlpha: 0})
      if (still) {
        gsap.set(media.at(-1)!, {autoAlpha: 1})
        return
      }

      // the pop: scale 0.9 → 1 on a spring, in time (not scrubbed) as each image appears
      const pops = media.map((el) =>
        gsap.timeline({paused: true}).fromTo(el, {scale: 0.9}, {scale: 1, immediateRender: false, ease: 'elastic.out(2, 0.6)', duration: 0.5}),
      )

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: rootRef.current,
          scroller: scroller ?? undefined,
          start: 'top top',
          end: 'bottom bottom',
          scrub: true,
          invalidateOnRefresh: true,
        },
      })
      media.forEach((el, i) => {
        const r = 2 * tilt * (Math.random() - 0.5)
        const flight = gsap.timeline({
          onStart: () => {
            if (pop) pops[i].play(0)
          },
          onReverseComplete: () => {
            pops[i].progress(0).pause()
          },
        })
        flight.set(el, {autoAlpha: 1}, 0.001)
        // back into the distance (as deep as the stage is wide), turning as it goes
        flight.to(el, {z: () => -stage.clientWidth, rotation: r, duration: 1, ease: 'power1.inOut'})
        // and from 40% in, up and out of the top, drifting the way it leans
        flight.to(
          el,
          {x: () => 0.01 * r * stage.clientWidth, y: () => -2 * stage.clientHeight, duration: 0.6, ease: 'power1.in'},
          '<+=0.4',
        )
        tl.add(flight, overlap * i)
      })
      return () => pops.forEach((p) => p.kill())
    },
    {scope: rootRef, dependencies: [images.join('|'), tilt, overlap, pop, scroller, stageH, length], revertOnUpdate: true},
  )

  return (
    <section ref={rootRef} className={`relative ${className}`} style={{height: stageH ? stageH * length : `${length * 100}svh`}}>
      <div
        ref={stageRef}
        className="sticky top-0 flex items-center justify-center overflow-hidden [container-type:size] [perspective:100cqh] max-md:[perspective:50cqw]"
        style={{height: stageH || '100svh'}}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            ref={(el) => {
              if (el) imageRefs.current[i] = el
            }}
            src={src}
            alt=""
            draggable={false}
            className="invisible absolute aspect-square w-[25cqw] object-contain opacity-0 select-none max-md:w-[70cqw]"
          />
        ))}
      </div>
    </section>
  )
}
