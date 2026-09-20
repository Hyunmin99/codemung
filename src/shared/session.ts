export type Provider = 'claude' | 'codex'
export type AgentState = 'idle' | 'working' | 'waiting_permission' | 'completed' | 'error'

export interface SessionRecord {
  provider: Provider
  sessionId: string
  projectName: string
  state: AgentState
  updatedAt: number
}

export interface ProviderSummary {
  provider: Provider
  state: AgentState
  activeCount: number
  sessions: readonly SessionRecord[]
}

export interface SessionSnapshot {
  providers: readonly ProviderSummary[]
  representativeState: AgentState
}

export const COMPLETED_VISIBLE_MS = 5_000

const PRIORITY: Readonly<Record<AgentState, number>> = {
  idle: 0,
  working: 1,
  completed: 2,
  error: 3,
  waiting_permission: 4
}

function isActive(session: SessionRecord, now: number): boolean {
  if (session.state === 'idle') return false
  if (session.state !== 'completed') return true
  return now - session.updatedAt < COMPLETED_VISIBLE_MS
}

function highestState(sessions: readonly SessionRecord[]): AgentState {
  return sessions.reduce<AgentState>(
    (current, session) => PRIORITY[session.state] > PRIORITY[current] ? session.state : current,
    'idle'
  )
}

export function summarizeSessions(
  sessions: readonly SessionRecord[],
  now = Date.now()
): SessionSnapshot {
  const providers = (['claude', 'codex'] as const).flatMap((provider) => {
    const active = sessions
      .filter((session) => session.provider === provider && isActive(session, now))
      .map((session) => Object.freeze({ ...session }))
    if (active.length === 0) return []
    return [Object.freeze({
      provider,
      state: highestState(active),
      activeCount: active.length,
      sessions: Object.freeze([...active])
    })]
  })

  return Object.freeze({
    providers: Object.freeze(providers),
    representativeState: highestState(providers.flatMap((provider) => provider.sessions))
  })
}
