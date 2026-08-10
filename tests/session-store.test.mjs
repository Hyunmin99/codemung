import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const { createSessionStore } = await import(join(repositoryRoot, 'out/main/session-store.js'))

// The store is driven by an injected clock and scheduler so that the completed
// hold can be advanced without real timers.
function createHarness({ completedHoldMs = 4000 } = {}) {
  const snapshots = []
  const scheduled = []
  let currentTime = 1000

  const store = createSessionStore({
    completedHoldMs,
    onChange: (snapshot) => snapshots.push(snapshot),
    now: () => currentTime,
    schedule: (callback, delayMs) => {
      const entry = { callback, delayMs, cancelled: false }
      scheduled.push(entry)
      return () => {
        entry.cancelled = true
      }
    }
  })

  return {
    store,
    snapshots,
    scheduled,
    advance: (milliseconds) => {
      currentTime += milliseconds
    },
    runPending: () => {
      for (const entry of scheduled) {
        if (!entry.cancelled) entry.callback()
      }
    }
  }
}

function event(overrides) {
  return {
    provider: 'claude',
    sessionId: 'session-a',
    kind: 'activity',
    occurredAt: 1000,
    ...overrides
  }
}

test('an activity event puts the provider and the scene into working', () => {
  const { store } = createHarness()

  store.apply(event({ kind: 'activity' }))

  const snapshot = store.getSnapshot()

  assert.equal(snapshot.providers.claude.state, 'working')
  assert.equal(snapshot.providers.codex.state, 'idle')
  assert.equal(snapshot.representativeState, 'working')
  store.dispose()
})

test('each provider keeps its own state and the scene shows the higher priority', () => {
  const { store } = createHarness()

  store.apply(event({ provider: 'codex', sessionId: 'session-b', kind: 'activity' }))
  store.apply(event({ provider: 'claude', kind: 'permission_requested' }))

  const snapshot = store.getSnapshot()

  assert.equal(snapshot.providers.codex.state, 'working')
  assert.equal(snapshot.providers.claude.state, 'waiting_permission')
  assert.equal(snapshot.representativeState, 'waiting_permission')
  store.dispose()
})

test('a completed session falls back to idle after the hold elapses', () => {
  const harness = createHarness({ completedHoldMs: 4000 })

  harness.store.apply(event({ kind: 'completed' }))
  assert.equal(harness.store.getSnapshot().providers.claude.state, 'completed')
  assert.equal(harness.scheduled[0].delayMs, 4000)

  harness.runPending()

  assert.equal(harness.store.getSnapshot().providers.claude.state, 'idle')
  harness.store.dispose()
})

test('a new event cancels a pending completed hold', () => {
  const harness = createHarness()

  harness.store.apply(event({ kind: 'completed' }))
  harness.store.apply(event({ kind: 'activity' }))
  harness.runPending()

  assert.equal(harness.scheduled[0].cancelled, true)
  assert.equal(harness.store.getSnapshot().providers.claude.state, 'working')
  harness.store.dispose()
})

test('a repeated session_started does not reset a session that is already working', () => {
  const { store } = createHarness()

  store.apply(event({ kind: 'activity', occurredAt: 1000 }))
  store.apply(event({ kind: 'session_started', occurredAt: 1100 }))

  assert.equal(store.getSnapshot().providers.claude.state, 'working')
  store.dispose()
})

test('an out-of-order event regresses neither the state nor the project', () => {
  const { store } = createHarness()

  store.apply(event({ kind: 'activity', project: 'codemung', occurredAt: 2000 }))
  store.apply(event({ kind: 'session_started', project: 'portfolio', occurredAt: 1000 }))

  const snapshot = store.getSnapshot()

  assert.equal(snapshot.providers.claude.state, 'working')
  assert.equal(snapshot.providers.claude.project, 'codemung')
  store.dispose()
})

test('an out-of-order event leaves a pending completed hold intact', () => {
  const harness = createHarness()

  harness.store.apply(event({ kind: 'completed', occurredAt: 2000 }))
  harness.store.apply(event({ kind: 'activity', occurredAt: 1000 }))
  harness.runPending()

  assert.equal(harness.scheduled[0].cancelled, false)
  assert.equal(harness.store.getSnapshot().providers.claude.state, 'idle')
  harness.store.dispose()
})

test('a repeated session_started keeps the pending completed hold', () => {
  const harness = createHarness()

  harness.store.apply(event({ kind: 'completed', occurredAt: 1000 }))
  harness.store.apply(event({ kind: 'session_started', occurredAt: 1100 }))
  assert.equal(harness.store.getSnapshot().providers.claude.state, 'completed')

  harness.runPending()

  assert.equal(harness.store.getSnapshot().providers.claude.state, 'idle')
  harness.store.dispose()
})

test('ending one session keeps the other active session of the same provider', () => {
  const { store } = createHarness()

  store.apply(event({ sessionId: 'session-a', kind: 'activity' }))
  store.apply(event({ sessionId: 'session-b', kind: 'activity' }))
  store.apply(event({ sessionId: 'session-a', kind: 'session_ended' }))

  const snapshot = store.getSnapshot()

  assert.equal(snapshot.providers.claude.state, 'working')
  assert.equal(snapshot.providers.claude.activeSessionCount, 1)
  store.dispose()
})

test('a failed event maps to error and outranks working', () => {
  const { store } = createHarness()

  store.apply(event({ provider: 'codex', sessionId: 'session-b', kind: 'activity' }))
  store.apply(event({ kind: 'failed' }))

  assert.equal(store.getSnapshot().providers.claude.state, 'error')
  assert.equal(store.getSnapshot().representativeState, 'error')
  store.dispose()
})

test('onChange is skipped when the snapshot does not change', () => {
  const { store, snapshots } = createHarness()

  store.apply(event({ kind: 'activity' }))
  store.apply(event({ kind: 'activity', occurredAt: 2000 }))

  assert.equal(snapshots.length, 1)
  store.dispose()
})

test('the project of the most recently updated session is reported', () => {
  const { store } = createHarness()

  store.apply(event({ sessionId: 'session-a', project: 'codemung', occurredAt: 1000 }))
  store.apply(event({ sessionId: 'session-b', project: 'portfolio', occurredAt: 2000 }))

  assert.equal(store.getSnapshot().providers.claude.project, 'portfolio')
  store.dispose()
})

test('dispose cancels every pending hold', () => {
  const harness = createHarness()

  harness.store.apply(event({ kind: 'completed' }))
  harness.store.dispose()

  assert.equal(harness.scheduled[0].cancelled, true)
})
