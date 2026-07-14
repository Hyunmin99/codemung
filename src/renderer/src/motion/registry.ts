import { LavaMotion } from './packs/lava/LavaMotion'
import type { MotionPackDefinition, MotionPackId } from './types'

const lavaPack = {
  id: 'lava',
  label: '용암멍',
  states: {
    idle: { speed: 0.18, brightness: 0.34, density: 0.24, turbulence: 0.12 },
    working: { speed: 0.68, brightness: 0.76, density: 0.7, turbulence: 0.58 },
    waiting_permission: { speed: 0.34, brightness: 0.94, density: 0.54, turbulence: 0.76 },
    completed: { speed: 0.62, brightness: 1, density: 0.86, turbulence: 0.38 },
    error: { speed: 0.28, brightness: 0.5, density: 0.4, turbulence: 0.96 }
  },
  Component: LavaMotion
} satisfies MotionPackDefinition

const motionPacks: Partial<Record<MotionPackId, MotionPackDefinition>> = {
  lava: lavaPack
}

export function getMotionPack(id: MotionPackId): MotionPackDefinition {
  return motionPacks[id] ?? lavaPack
}

export const registeredMotionPacks: readonly MotionPackDefinition[] = Object.values(motionPacks)
