import { useEffect, useState } from 'react'
import { getMotionPack } from './registry'
import type { AgentState, MotionPackId, MotionParams } from './types'

interface MotionSceneProps {
  pack: MotionPackId
  state: AgentState
  reduceMotion?: boolean
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function getInitialReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampParams(params: MotionParams, reducedMotion: boolean): MotionParams {
  const clamped = {
    speed: clamp(params.speed),
    brightness: clamp(params.brightness),
    density: clamp(params.density),
    turbulence: clamp(params.turbulence)
  }

  if (!reducedMotion) return clamped

  return {
    ...clamped,
    speed: Math.min(clamped.speed, 0.12),
    density: Math.min(clamped.density, 0.25),
    turbulence: Math.min(clamped.turbulence, 0.08)
  }
}

export function MotionScene({
  pack,
  state,
  reduceMotion = false
}: MotionSceneProps): React.JSX.Element {
  const [reducedMotion, setReducedMotion] = useState(getInitialReducedMotion)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined

    const mediaQuery = window.matchMedia(REDUCED_MOTION_QUERY)
    const handleChange = (event: MediaQueryListEvent): void => setReducedMotion(event.matches)

    setReducedMotion(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  const definition = getMotionPack(pack)
  const effectiveReducedMotion = reducedMotion || reduceMotion
  const motion = clampParams(definition.states[state], effectiveReducedMotion)
  const PackComponent = definition.Component

  return (
    <div
      className="motion-scene"
      data-motion-pack={definition.id}
      data-motion-state={state}
      data-reduced-motion={effectiveReducedMotion ? 'true' : 'false'}
    >
      <PackComponent state={state} motion={motion} reducedMotion={effectiveReducedMotion} />
    </div>
  )
}
