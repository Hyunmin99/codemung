import {
  COMPLETED_VISIBLE_MS,
  summarizeSessions,
  type SessionRecord,
  type SessionSnapshot
} from '../../../shared/session'

export interface SessionStore {
  getSnapshot(): SessionSnapshot
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void
  replace(sessions: readonly SessionRecord[]): void
  refresh(): void
  getNextExpiryAt(): number | null
}

export function createSessionStore(
  initialSessions: readonly SessionRecord[],
  now: () => number = Date.now
): SessionStore {
  let sessions = [...initialSessions]
  let snapshot = summarizeSessions(sessions, now())
  const listeners = new Set<(value: SessionSnapshot) => void>()

  const publish = (): void => {
    const next = summarizeSessions(sessions, now())
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return
    snapshot = next
    listeners.forEach((listener) => listener(snapshot))
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    replace(nextSessions) {
      sessions = [...nextSessions]
      publish()
    },
    refresh: publish,
    getNextExpiryAt() {
      const expiries = sessions
        .filter((session) => session.state === 'completed' && now() - session.updatedAt < COMPLETED_VISIBLE_MS)
        .map((session) => session.updatedAt + COMPLETED_VISIBLE_MS)
      return expiries.length > 0 ? Math.min(...expiries) : null
    }
  }
}
