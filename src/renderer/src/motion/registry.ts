import { LavaMotion } from './packs/lava/LavaMotion'
import type { MotionPackDefinition, MotionPackId } from './types'

const lavaPack = {
  id: 'lava',
  label: '용암멍',
  description: '따뜻하게 흐르는 용암 오브제',
  states: {
    idle: { speed: 0.18, brightness: 0.34, density: 0.24, turbulence: 0.12 },
    working: { speed: 0.68, brightness: 0.76, density: 0.7, turbulence: 0.58 },
    waiting_permission: { speed: 0.92, brightness: 0.94, density: 0.54, turbulence: 0.76 },
    completed: { speed: 0.08, brightness: 0.12, density: 0.5, turbulence: 0.08 },
    error: { speed: 0.58, brightness: 0.65, density: 0.55, turbulence: 0.82 }
  },
  Component: LavaMotion
} satisfies MotionPackDefinition

const motionPacks: Record<MotionPackId, MotionPackDefinition> = {
  lava: lavaPack
}

export function getMotionPack(id: MotionPackId): MotionPackDefinition {
  return motionPacks[id] ?? lavaPack
}

export const registeredMotionPacks: readonly MotionPackDefinition[] = Object.values(motionPacks)
