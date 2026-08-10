import { PROVIDERS, type EventKind, type Provider, type ProviderEvent } from './event-server'

export type AgentState = 'idle' | 'working' | 'waiting_permission' | 'completed' | 'error'

export interface ProviderSnapshot {
  state: AgentState
  activeSessionCount: number
  project?: string
}

export interface SessionSnapshot {
  providers: Record<Provider, ProviderSnapshot>
  representativeState: AgentState
  updatedAt: number
}

export type Schedule = (callback: () => void, delayMs: number) => () => void

export interface SessionStoreOptions {
  onChange: (snapshot: SessionSnapshot) => void
  completedHoldMs?: number
  now?: () => number
  schedule?: Schedule
}

export interface SessionStore {
  apply: (event: ProviderEvent) => void
  getSnapshot: () => SessionSnapshot
  dispose: () => void
}

const DEFAULT_COMPLETED_HOLD_MS = 4000

// A higher number wins when several sessions disagree.
const STATE_PRIORITY: Record<AgentState, number> = {
  idle: 0,
  working: 1,
  completed: 2,
  error: 3,
  waiting_permission: 4
}

// A null state means the session is gone rather than in some state.
const EVENT_STATES: Record<EventKind, AgentState | null> = {
  session_started: 'idle',
  activity: 'working',
  permission_requested: 'waiting_permission',
  completed: 'completed',
  failed: 'error',
  session_ended: null
}

interface SessionEntry {
  provider: Provider
  state: AgentState
  project?: string
  updatedAt: number
  cancelHold?: () => void
}

const defaultSchedule: Schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs)

  return () => clearTimeout(timer)
}

function pickHigherState(current: AgentState, candidate: AgentState): AgentState {
  return STATE_PRIORITY[candidate] > STATE_PRIORITY[current] ? candidate : current
}

export function createSessionStore(options: SessionStoreOptions): SessionStore {
  const completedHoldMs = options.completedHoldMs ?? DEFAULT_COMPLETED_HOLD_MS
  const now = options.now ?? Date.now
  const schedule = options.schedule ?? defaultSchedule
  const sessions = new Map<string, SessionEntry>()

  let snapshot = buildSnapshot()
  let lastComparable = toComparable(snapshot)

  function buildSnapshot(): SessionSnapshot {
    const providers = {} as Record<Provider, ProviderSnapshot>

    for (const provider of PROVIDERS) {
      const entries = [...sessions.values()].filter((entry) => entry.provider === provider)
      const state = entries.reduce<AgentState>(
        (current, entry) => pickHigherState(current, entry.state),
        'idle'
      )
      const latest = entries.reduce<SessionEntry | null>(
        (newest, entry) => (newest === null || entry.updatedAt >= newest.updatedAt ? entry : newest),
        null
      )

      providers[provider] = {
        state,
        activeSessionCount: entries.length,
        ...(latest?.project ? { project: latest.project } : {})
      }
    }

    return {
      providers,
      representativeState: PROVIDERS.reduce<AgentState>(
        (current, provider) => pickHigherState(current, providers[provider].state),
        'idle'
      ),
      updatedAt: now()
    }
  }

  // updatedAt always moves, so only the visible fields decide whether renderer work is needed.
  function toComparable(value: SessionSnapshot): string {
    return JSON.stringify({
      providers: value.providers,
      representativeState: value.representativeState
    })
  }

  function publish(): void {
    const next = buildSnapshot()
    const comparable = toComparable(next)

    snapshot = next

    if (comparable === lastComparable) return

    lastComparable = comparable
    options.onChange(next)
  }

  function apply(event: ProviderEvent): void {
    const key = `${event.provider}:${event.sessionId}`
    const existing = sessions.get(key)
    const state = EVENT_STATES[event.kind]

    existing?.cancelHold?.()

    if (state === null) {
      sessions.delete(key)
      publish()
      return
    }

    const entry: SessionEntry = {
      provider: event.provider,
      state,
      project: event.project ?? existing?.project,
      updatedAt: event.occurredAt
    }

    sessions.set(key, entry)

    if (entry.state === 'completed') {
      entry.cancelHold = schedule(() => {
        // The entry may have been replaced or removed while the hold was pending.
        if (sessions.get(key) !== entry) return

        entry.state = 'idle'
        entry.cancelHold = undefined
        publish()
      }, completedHoldMs)
    }

    publish()
  }

  return {
    apply,
    getSnapshot: () => snapshot,
    dispose: () => {
      for (const entry of sessions.values()) entry.cancelHold?.()
      sessions.clear()
    }
  }
}
