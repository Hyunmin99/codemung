import type { ComponentType } from 'react'
import type { ObjectId } from '../../../shared/object'

export type AgentState =
  | 'idle'
  | 'working'
  | 'waiting_permission'
  | 'completed'
  | 'error'

export type MotionPackId = ObjectId

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
  description: string
  states: Readonly<Record<AgentState, MotionParams>>
  Component: ComponentType<MotionPackProps>
}
