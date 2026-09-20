import { describe, expect, it, vi } from 'vitest'
import { createSessionStore } from './session-store'

const NOW = 1_000_000

describe('SessionStore', () => {
  it('shows active providers and uses the highest-priority state', () => {
    const store = createSessionStore(
      [
        { provider: 'claude', sessionId: 'c1', projectName: 'alpha', state: 'working', updatedAt: NOW },
        { provider: 'claude', sessionId: 'c2', projectName: 'beta', state: 'error', updatedAt: NOW },
        { provider: 'codex', sessionId: 'x1', projectName: 'gamma', state: 'idle', updatedAt: NOW }
      ],
      () => NOW
    )

    expect(store.getSnapshot().providers).toEqual([
      expect.objectContaining({ provider: 'claude', state: 'error', activeCount: 2 })
    ])
    expect(store.getSnapshot().representativeState).toBe('error')
  })

  it('uses waiting_permission over error across providers and completed over working', () => {
    const permissionStore = createSessionStore(
      [
        { provider: 'claude', sessionId: 'c1', projectName: 'alpha', state: 'error', updatedAt: NOW },
        { provider: 'codex', sessionId: 'x1', projectName: 'beta', state: 'waiting_permission', updatedAt: NOW }
      ],
      () => NOW
    )
    const completionStore = createSessionStore(
      [
        { provider: 'claude', sessionId: 'c2', projectName: 'alpha', state: 'completed', updatedAt: NOW },
        { provider: 'codex', sessionId: 'x2', projectName: 'beta', state: 'working', updatedAt: NOW }
      ],
      () => NOW
    )

    expect(permissionStore.getSnapshot().representativeState).toBe('waiting_permission')
    expect(completionStore.getSnapshot().representativeState).toBe('completed')
  })

  it('keeps completed visible for 4,999ms and hides it at 5,000ms', () => {
    let now = NOW + 4_999
    const store = createSessionStore(
      [{ provider: 'codex', sessionId: 'x1', projectName: 'codemung', state: 'completed', updatedAt: NOW }],
      () => now
    )

    expect(store.getSnapshot().providers).toHaveLength(1)
    expect(store.getNextExpiryAt()).toBe(NOW + 5_000)
    now = NOW + 5_000
    store.refresh()
    expect(store.getSnapshot().providers).toHaveLength(0)
    expect(store.getSnapshot().representativeState).toBe('idle')
  })

  it('returns and advances to the earliest pending completion expiry', () => {
    let now = NOW
    const store = createSessionStore(
      [
        { provider: 'claude', sessionId: 'c1', projectName: 'alpha', state: 'completed', updatedAt: NOW - 1_000 },
        { provider: 'codex', sessionId: 'x1', projectName: 'beta', state: 'completed', updatedAt: NOW - 2_500 }
      ],
      () => now
    )

    expect(store.getNextExpiryAt()).toBe(NOW + 2_500)
    now = NOW + 2_500
    store.refresh()
    expect(store.getNextExpiryAt()).toBe(NOW + 4_000)
    expect(store.getSnapshot().providers).toHaveLength(1)
    now = NOW + 4_000
    store.refresh()
    expect(store.getNextExpiryAt()).toBeNull()
  })

  it('deeply freezes published summaries and detached session records', () => {
    const inputSession = {
      provider: 'codex' as const,
      sessionId: 'x1',
      projectName: 'codemung',
      state: 'working' as const,
      updatedAt: NOW
    }
    const store = createSessionStore([inputSession], () => NOW)
    const snapshot = store.getSnapshot()
    const provider = snapshot.providers[0]
    const publishedSession = provider.sessions[0]

    expect(() => {
      ;(provider as { state: string }).state = 'error'
    }).toThrow(TypeError)
    expect(() => {
      ;(publishedSession as { state: string }).state = 'error'
    }).toThrow(TypeError)
    expect(provider.state).toBe('working')
    expect(publishedSession.state).toBe('working')
    expect(inputSession.state).toBe('working')
  })

  it('suppresses unchanged replace and refresh while subscribed, then honors unsubscribe', () => {
    const listener = vi.fn()
    const store = createSessionStore([], () => NOW)
    const unsubscribe = store.subscribe(listener)

    store.replace([
      { provider: 'codex', sessionId: 'x1', projectName: 'codemung', state: 'working', updatedAt: NOW }
    ])
    expect(listener).toHaveBeenCalledTimes(1)

    store.replace([
      { provider: 'codex', sessionId: 'x1', projectName: 'codemung', state: 'working', updatedAt: NOW }
    ])
    store.refresh()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    store.replace([
      { provider: 'codex', sessionId: 'x1', projectName: 'codemung', state: 'error', updatedAt: NOW }
    ])

    expect(listener).toHaveBeenCalledTimes(1)
  })
})
