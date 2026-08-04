import type { CSSProperties } from 'react'

import type { MotionPackProps } from '../../types'
import './lava.css'

type LavaStyle = CSSProperties &
  Record<
    | '--motion-speed'
    | '--motion-brightness'
    | '--motion-density'
    | '--motion-turbulence'
    | '--lava-duration'
    | '--lava-opacity'
    | '--lava-saturation'
    | '--lava-secondary-scale'
    | '--lava-spread'
    | '--lava-travel-x',
    number | string
  >

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value))

function stateEnergy(state: MotionPackProps['state']): number {
  switch (String(state)) {
    case 'working':
    case 'thinking':
      return 1.12
    case 'waiting':
    case 'waiting_permission':
      return 0.84
    case 'error':
      return 0.94
    case 'completed':
      return 1.04
    default:
      return 0.72
  }
}

export function LavaMotion({ state, motion, reducedMotion }: MotionPackProps): React.JSX.Element {
  const speed = clamp(motion.speed)
  const brightness = clamp(motion.brightness)
  const density = clamp(motion.density)
  const turbulence = clamp(motion.turbulence)
  const energy = stateEnergy(state)

  const style: LavaStyle = {
    '--motion-speed': speed,
    '--motion-brightness': brightness,
    '--motion-density': density,
    '--motion-turbulence': turbulence,
    '--lava-duration': `${(24 - speed * 10) / energy}s`,
    '--lava-opacity': 0.72 + brightness * 0.26,
    '--lava-saturation': `${88 + brightness * 32}%`,
    '--lava-secondary-scale': 0.72 + density * 0.34,
    '--lava-spread': `${10 + turbulence * 8}px`,
    '--lava-travel-x': `${6 + turbulence * 15}px`,
  }

  return (
    <svg
      className={`lava-motion${reducedMotion ? ' lava-motion--reduced' : ''}`}
      data-state={String(state)}
      style={style}
      viewBox="0 0 240 300"
      role="img"
      aria-label={`라바 모션, ${String(state)} 상태`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="lava-fill" x1="0.18" y1="0.08" x2="0.82" y2="0.94">
          <stop className="lava-motion__stop lava-motion__stop--warm" offset="0" />
          <stop className="lava-motion__stop lava-motion__stop--mid" offset="0.54" />
          <stop className="lava-motion__stop lava-motion__stop--deep" offset="1" />
        </linearGradient>
        <filter
          id="lava-metaball"
          x="-45%"
          y="-35%"
          width="190%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={5.4 + density * 1.8}
            result="soft-balls"
          />
          <feColorMatrix
            in="soft-balls"
            type="matrix"
            values="1 0 0 0 0
                    0 1 0 0 0
                    0 0 1 0 0
                    0 0 0 22 -9"
            result="joined-balls"
          />
        </filter>
      </defs>

      <g className="lava-motion__field" filter="url(#lava-metaball)" aria-hidden="true">
        <ellipse className="lava-motion__blob lava-motion__blob--one" cx="112" cy="174" rx="41" ry="37" />
        <ellipse className="lava-motion__blob lava-motion__blob--two" cx="146" cy="158" rx="33" ry="36" />
        <circle className="lava-motion__blob lava-motion__blob--three" cx="92" cy="148" r="29" />
        <ellipse className="lava-motion__blob lava-motion__blob--four" cx="144" cy="119" rx="25" ry="28" />
        <circle className="lava-motion__blob lava-motion__blob--five" cx="103" cy="110" r="19" />
      </g>

      <g className="lava-motion__sheen" aria-hidden="true">
        <ellipse cx="103" cy="166" rx="15" ry="23" />
        <ellipse cx="140" cy="148" rx="10" ry="16" />
      </g>
    </svg>
  )
}

export default LavaMotion
