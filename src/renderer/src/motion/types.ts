import type { ComponentType } from 'react'

export type AgentState =
  | 'idle'
  | 'working'
  | 'waiting_permission'
  | 'completed'
  | 'error'

export type MotionPackId = 'water' | 'fire' | 'lava'

export interface MotionParams {
  speed: number
  brightness: number
  density: number
  turbulence: number
}

export interface MotionPackProps {
  state: AgentState
  motion: Readonly<MotionParams>
  reducedMotion: boolean
}

export interface MotionPackDefinition {
  id: MotionPackId
  label: string
  states: Readonly<Record<AgentState, MotionParams>>
  Component: ComponentType<MotionPackProps>
}
