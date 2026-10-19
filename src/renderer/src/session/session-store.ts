import {
  COMPLETED_VISIBLE_MS,
  ERROR_VISIBLE_MS,
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
  let expiryTimer: ReturnType<typeof setTimeout> | null = null

  const getNextExpiryAt = (): number | null => {
    const expiries = sessions
      .filter((session) =>
        (session.state === 'completed' && now() - session.updatedAt < COMPLETED_VISIBLE_MS) ||
        (session.state === 'error' && now() - session.updatedAt < ERROR_VISIBLE_MS)
      )
      .map((session) => session.updatedAt + (session.state === 'error' ? ERROR_VISIBLE_MS : COMPLETED_VISIBLE_MS))
    return expiries.length > 0 ? Math.min(...expiries) : null
  }

  const scheduleExpiry = (): void => {
    if (expiryTimer) clearTimeout(expiryTimer)
    const expiresAt = getNextExpiryAt()
    if (expiresAt === null) return
    expiryTimer = setTimeout(publish, Math.max(0, expiresAt - now()))
    ;(expiryTimer as unknown as { unref?: () => void }).unref?.()
  }

  const publish = (): void => {
    scheduleExpiry()
    const next = summarizeSessions(sessions, now())
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return
    snapshot = next
    listeners.forEach((listener) => listener(snapshot))
  }

  scheduleExpiry()

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
    getNextExpiryAt
  }
}
