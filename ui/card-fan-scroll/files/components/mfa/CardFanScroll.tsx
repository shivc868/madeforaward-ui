'use client'

import {useEffect, useRef, useState, type ReactNode} from 'react'
import gsap from 'gsap'
import {useGSAP} from '@gsap/react'
import {ScrollTrigger} from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

export type FanCard = {
  title: string
  /** the filled pill under the title */
  tag: string
  /** an outlined pill above the title */
  note?: string
  color: string
  ink: string
}

export type CardFanScrollProps = {
  cards?: FanCard[]
  heading?: ReactNode
  /** degrees between neighbouring cards */
  spread?: number
  /** section height in screens (the stage stays pinned through it) */
  length?: number
  /** gather the fan back into a stack at the end */
  fold?: boolean
  background?: string
  color?: string
  /** the scrolling element, when it isn't the window */
  scroller?: HTMLElement | null
  className?: string
}

const CARDS: FanCard[] = [
  {title: 'Motion', tag: 'Easing & timing', color: '#ff5b2e', ink: '#1f0a03'},
  {title: 'Type', tag: 'Variable fonts', color: '#f4efe6', ink: '#151515'},
  {title: 'Shaders', tag: 'GPU', note: 'Now exploring', color: '#111111', ink: '#c6ff3d'},
  {title: '3D', tag: 'Blender & R3F', color: '#6c5cff', ink: '#ffffff'},
  {title: 'Sound', tag: 'Web Audio', note: 'Now exploring', color: '#0d2b24', ink: '#4fffb0'},
  {title: 'Brand', tag: 'Identity systems', color: '#ffcf3f', ink: '#241a00'},
  {title: 'Copy', tag: 'Tone of voice', color: '#ff8fc8', ink: '#2b0719'},
  {title: 'Craft', tag: 'Details, always', color: '#2f6bff', ink: '#ffffff'},
]

const HEADING = (
  <>
    <h2 className="text-[clamp(44px,7cqw,104px)] leading-none font-bold tracking-[-0.04em]">
      The Kit
    </h2>
    <p className="mt-[2cqh] text-[clamp(16px,1.8cqw,28px)] font-light opacity-80">
      What we bring to every project
    </p>
  </>
)

// the share of the scroll that deals the cards, and where the fold runs
const DEAL = 0.6
const FOLD_FROM = 0.8
const FOLD_TO = 0.95
const POP = 'elastic.out(0.6, 0.3)'

// the click wave: a card dips, jumps and wobbles back; its neighbours follow
// a beat later and a little less, the further away the less
function bounce(el: HTMLElement, a: number) {
  return gsap
    .timeline()
    .to(el, {y: 6 * a, scale: 1 - 0.03 * a, duration: 0.08, ease: 'power2.in'})
    .to(el, {y: -24 * a, scale: 1 + 0.07 * a, duration: 0.18, ease: 'power3.out'})
    .to(el, {y: 0, scale: 1, duration: 0.42, ease: 'elastic.out(0.8, 0.35)'})
}

// A pinned scroll section that deals a hand of cards into a fan. The cards
// hang from one huge wheel (three times the stage's width, its hub far below
// the stage), each a few degrees round from the last. As you scroll they are
// laid down one at a time, each popping in from 94% on an elastic ease, and
// the wheel swings back by half a step so the fan stays centred. At the end
// the fan folds back into a stack (the cards underneath lose their shadows).
// Hover lifts a card to the front; a click sends a bounce through the hand.
export default function CardFanScroll({
  cards = CARDS,
  heading = HEADING,
  spread = 3.5,
  length = 4,
  fold = true,
  background = '#1c1b1d',
  color = '#f6efe6',
  scroller = null,
  className = '',
}: CardFanScrollProps) {
  const rootRef = useRef<HTMLElement>(null)
  const wheelRef = useRef<HTMLDivElement>(null)
  const slotRefs = useRef<HTMLDivElement[]>([])
  const motionRefs = useRef<HTMLDivElement[]>([])
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
    (_, contextSafe) => {
      const wheel = wheelRef.current!
      const slots = slotRefs.current.slice(0, cards.length)
      const motions = motionRefs.current.slice(0, cards.length)
      const n = slots.length
      const front = n + 10
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches

      slots.forEach((slot, i) =>
        gsap.set(slot, {rotation: i * spread, zIndex: i + 1, visibility: i ? 'hidden' : 'visible'}),
      )
      gsap.set(wheel, {rotation: 0, '--fold': 0})

      let shown = 0
      let aimed = 0
      let folded = 0
      let wave: gsap.core.Timeline | null = null
      let held = -1

      const release = () => {
        if (held < 0) return
        const slot = slots[held]
        gsap.set(slot, {zIndex: slot.matches(':hover') ? front : held + 1})
        held = -1
      }
      const stopWave = () => {
        if (!wave) return
        wave.kill()
        wave = null
        release()
        gsap.killTweensOf(motions, 'y,scale')
        gsap.set(motions, {y: 0, scale: 1})
      }

      const update = (p: number) => {
        stopWave()
        const c = Math.min(Math.floor(Math.min(p / DEAL, 1) * n), n - 1)
        if (c > shown)
          for (let i = shown + 1; i <= c; i++) {
            gsap.set(slots[i], {visibility: 'visible'})
            if (!still) gsap.fromTo(slots[i], {scale: 0.94}, {scale: 1, ease: POP, duration: 0.5})
          }
        else for (let i = shown; i > c; i--) gsap.set(slots[i], {visibility: 'hidden'})
        shown = c

        const g = fold ? gsap.utils.clamp(0, 1, (p - FOLD_FROM) / (FOLD_TO - FOLD_FROM)) : 0
        if (g !== folded) {
          slots.forEach((slot, i) => gsap.set(slot, {rotation: i * spread * (1 - g)}))
          folded = g
        }
        if (g > 0) {
          gsap.killTweensOf(wheel)
          gsap.set(wheel, {rotation: (-((n - 1) * spread) / 2) * (1 - g), '--fold': g})
          aimed = -1
        } else if (c !== aimed) {
          gsap.to(wheel, {
            rotation: -(c * spread) / 2,
            '--fold': 0,
            ease: POP,
            duration: still ? 0 : 0.5,
            overwrite: true,
          })
          aimed = c
        }
      }

      ScrollTrigger.create({
        trigger: rootRef.current,
        scroller: scroller ?? undefined,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => update(self.progress),
        onRefresh: (self) => update(self.progress),
      })

      const lift = contextSafe!((i: number, e: PointerEvent) => {
        if (e.pointerType !== 'touch') gsap.set(slots[i], {zIndex: front})
      })
      const drop = contextSafe!((i: number, e: PointerEvent) => {
        if (e.pointerType !== 'touch' && i !== held) gsap.set(slots[i], {zIndex: i + 1})
      })
      const poke = contextSafe!((i: number) => {
        stopWave()
        if (still) return
        const tl = gsap.timeline()
        slots.forEach((slot, j) => {
          if (j > shown) return
          const d = Math.abs(j - i)
          tl.add(bounce(motions[j], Math.max(0.25, 1 - d * 0.18)), d * 0.045)
        })
        wave = tl
        held = i
        gsap.set(slots[i], {zIndex: front})
        tl.eventCallback('onComplete', () => {
          if (wave !== tl) return
          release()
          wave = null
        })
      })

      const off = slots.map((slot, i) => {
        const card = slot.firstElementChild as HTMLElement
        const enter = (e: PointerEvent) => lift(i, e)
        const leave = (e: PointerEvent) => drop(i, e)
        const click = () => poke(i)
        card.addEventListener('pointerenter', enter)
        card.addEventListener('pointerleave', leave)
        card.addEventListener('click', click)
        return () => {
          card.removeEventListener('pointerenter', enter)
          card.removeEventListener('pointerleave', leave)
          card.removeEventListener('click', click)
        }
      })
      return () => off.forEach((f) => f())
    },
    {
      scope: rootRef,
      dependencies: [cards, spread, fold, scroller, stageH, length],
      revertOnUpdate: true,
    },
  )

  return (
    <section
      ref={rootRef}
      className={`relative ${className}`}
      style={{height: stageH ? stageH * length : `${length * 100}svh`, background, color}}
    >
      <div
        className="sticky top-0 overflow-hidden [container-type:size]"
        style={{height: stageH || '100svh'}}
      >
        <div className="pointer-events-none absolute inset-x-0 top-[12%] z-2 px-6 text-center">
          {heading}
        </div>
        {/* the wheel: a square three stages wide, its top edge at 60% of the stage; cards ride on that edge */}
        <div ref={wheelRef} className="absolute top-[60%] left-[-100%] z-1 aspect-square w-[300%]">
          {cards.map((card, i) => (
            <div
              key={i}
              ref={(el) => {
                if (el) slotRefs.current[i] = el
              }}
              className="pointer-events-none absolute inset-0"
            >
              <div className="pointer-events-auto relative mx-auto aspect-[295/417] w-[min(clamp(140px,18cqw,295px),29cqh)] -translate-y-1/2 cursor-pointer [container-type:inline-size] transition-transform duration-200 ease-out select-none hover:-translate-y-[54%] hover:scale-[1.04]">
                <div
                  ref={(el) => {
                    if (el) motionRefs.current[i] = el
                  }}
                  className="flex h-full w-full flex-col items-center justify-center gap-[7cqw] rounded-[7cqw] p-[9cqw] text-center will-change-transform"
                  style={{
                    background: card.color,
                    color: card.ink,
                    // stacked up at the end, only the top card keeps its shadow
                    boxShadow: `0 18px 36px -22px rgba(0,0,0,${i === cards.length - 1 ? 0.45 : 'calc(0.45 * (1 - var(--fold, 0)))'})`,
                  }}
                >
                  {card.note && (
                    <span className="rounded-full border-[0.5cqw] border-current px-[4cqw] py-[1.4cqw] text-[6cqw] leading-none font-semibold">
                      {card.note}
                    </span>
                  )}
                  <span className="text-[18cqw] leading-[0.9] font-extrabold tracking-[-0.03em]">
                    {card.title}
                  </span>
                  <span
                    className="rounded-full px-[4.5cqw] py-[2cqw] text-[6cqw] leading-none font-semibold"
                    style={{background: card.ink, color: card.color}}
                  >
                    {card.tag}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
