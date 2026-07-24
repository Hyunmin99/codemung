# CodeMung Companion Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add draggable and square-resizable companion objects, state-aware click reactions, lava and water themes, a status context panel, persisted settings, and layered interaction/status sounds.

**Architecture:** Keep session aggregation, window control, preferences, companion packs, pointer classification, and audio behind separate interfaces. Main process owns window movement and disk persistence; renderer owns visual interaction and the custom context panel; preload exposes a minimal typed IPC seam. Built-in packs register at build time through `CompanionPack`, allowing later internal plugin-style expansion without changing callers.

**Tech Stack:** Electron 35, React 19, TypeScript 5.8, Vite/electron-vite, SVG/CSS animation, Web Audio, Vitest, Testing Library

**Design spec:** `docs/superpowers/specs/2026-07-24-companion-interactions-design.md`

## Global Constraints

- Target macOS first.
- Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Never send prompts, responses, or tool input bodies to the renderer.
- Display project basenames only; never display full paths.
- Treat `waiting_permission > error > completed > working > idle` as the state priority.
- Keep `completed` visible for exactly 5,000ms, then treat it as `idle`.
- Classify pointer movement below 5px as click and movement of 5px or more as drag.
- Keep window width and height equal and within 180–480px.
- Default theme is `lava`; sound is enabled at 30% global volume.
- Apply a 120ms click cooldown.
- Permit at most four concurrent interaction sounds and one status chime.
- Bundle original `.wav` files; do not depend on externally licensed sound assets.
- Do not load third-party plugin code.

---

## File Map

### Shared contracts

- `src/shared/session.ts`: Provider/session types, active-session filtering, aggregation, and representative state.
- `src/shared/preferences.ts`: persisted preference types, defaults, and field-by-field validation.
- `src/shared/ipc.ts`: IPC channel constants and renderer-safe preference patch type.

### Main process

- `src/main/preferences/preferences-store.ts`: atomic JSON persistence behind a small interface.
- `src/main/preferences/preferences-store.test.ts`: default, corruption, and round-trip tests.
- `src/main/window/bounds.ts`: pure square-size and multi-display bounds calculations.
- `src/main/window/bounds.test.ts`: geometry tests.
- `src/main/window/window-manager.ts`: BrowserWindow drag, aspect ratio, always-on-top, and debounced bounds persistence.
- `src/main/ipc/register-companion-ipc.ts`: validated IPC registration.
- `src/main/ipc/register-companion-ipc.test.ts`: IPC behavior tests with fakes.
- `src/main/index.ts`: app lifecycle composition only.

### Preload

- `src/preload/index.ts`: minimal typed bridge.
- `src/preload/index.d.ts`: renderer-facing `window.codemung` declaration.

### Renderer

- `src/renderer/src/session/session-store.ts`: observable in-memory `SessionStore`.
- `src/renderer/src/session/session-store.test.ts`: aggregation and expiry tests.
- `src/renderer/src/session/fixture.ts`: temporary Claude/Codex fixture adapter.
- `src/renderer/src/audio/types.ts`: audio backend and sound-pack interfaces.
- `src/renderer/src/audio/audio-manager.ts`: preload, cooldown, concurrency, volume, and failure isolation.
- `src/renderer/src/audio/audio-manager.test.ts`: fake-backend tests.
- `src/renderer/src/audio/web-audio-backend.ts`: production Web Audio adapter.
- `src/renderer/src/assets/audio/*.wav`: generated original sound assets.
- `scripts/generate-sounds.mjs`: deterministic WAV generator.
- `src/renderer/src/motion/types.ts`: `CompanionPack` interface and reaction types.
- `src/renderer/src/motion/registry.ts`: built-in lava/water registration and lava fallback.
- `src/renderer/src/motion/registry.test.ts`: lookup and fallback tests.
- `src/renderer/src/motion/MotionScene.tsx`: pack rendering and interaction token.
- `src/renderer/src/motion/packs/lava/LavaMotion.tsx`: lava rendering with state reaction hooks.
- `src/renderer/src/motion/packs/lava/lava.css`: lava reaction styles.
- `src/renderer/src/motion/packs/water/WaterMotion.tsx`: water-drop companion.
- `src/renderer/src/motion/packs/water/water.css`: water motion and reaction styles.
- `src/renderer/src/interaction/gesture.ts`: pure 5px click/drag classifier.
- `src/renderer/src/interaction/gesture.test.ts`: threshold tests.
- `src/renderer/src/interaction/use-companion-interaction.ts`: pointer capture, IPC drag, reaction, and sound orchestration.
- `src/renderer/src/components/ContextPanel.tsx`: active Provider summary, session disclosure, and settings.
- `src/renderer/src/components/ContextPanel.test.tsx`: visibility, expansion, and settings tests.
- `src/renderer/src/components/context-panel.css`: selected C-layout styling.
- `src/renderer/src/hooks/use-preferences.ts`: IPC-backed preference state.
- `src/renderer/src/hooks/use-status-chime.ts`: snapshot transition detection.
- `src/renderer/src/hooks/use-status-chime.test.tsx`: initial-hydrate and transition tests.
- `src/renderer/src/App.tsx`: composition only.
- `src/renderer/src/styles.css`: responsive square scene and interaction surface.
- `src/renderer/src/test/setup.ts`: Testing Library matcher setup.

### Configuration and docs

- `package.json`: test scripts and test dependencies.
- `package-lock.json`: resolved test dependencies.
- `vitest.config.ts`: test environment and setup.
- `tsconfig.node.json`: include shared contracts and Vitest config.
- `tsconfig.web.json`: include shared contracts.
- `README.md`: describe implemented interactions and remaining real-provider work.

---

### Task 1: Test Harness and Session Aggregation

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Modify: `tsconfig.node.json`
- Modify: `tsconfig.web.json`
- Create: `src/renderer/src/test/setup.ts`
- Create: `src/shared/session.ts`
- Create: `src/renderer/src/session/session-store.ts`
- Test: `src/renderer/src/session/session-store.test.ts`

**Interfaces:**
- Produces: `Provider`, `AgentState`, `SessionRecord`, `ProviderSummary`, `SessionSnapshot`
- Produces: `summarizeSessions(sessions, now): SessionSnapshot`
- Produces: `createSessionStore(initialSessions, now): SessionStore`

- [ ] **Step 1: Install and configure the test harness**

Run:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom
```

Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/renderer/src/test/setup.ts'],
    clearMocks: true
  }
})
```

Create `src/renderer/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Add `"vitest.config.ts"` and `"src/shared/**/*.ts"` to `tsconfig.node.json`; add `"src/shared/**/*.ts"` to `tsconfig.web.json`.

- [ ] **Step 2: Write failing session aggregation tests**

Create `src/renderer/src/session/session-store.test.ts`:

```ts
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

  it('publishes immutable snapshots only when the aggregate changes', () => {
    const listener = vi.fn()
    const store = createSessionStore([], () => NOW)
    const unsubscribe = store.subscribe(listener)

    store.replace([
      { provider: 'codex', sessionId: 'x1', projectName: 'codemung', state: 'working', updatedAt: NOW }
    ])
    unsubscribe()
    store.replace([])

    expect(listener).toHaveBeenCalledTimes(1)
    expect(Object.isFrozen(listener.mock.calls[0][0])).toBe(true)
  })
})
```

- [ ] **Step 3: Run the test and verify failure**

Run:

```bash
npm test -- src/renderer/src/session/session-store.test.ts
```

Expected: FAIL because `./session-store` does not exist.

- [ ] **Step 4: Implement shared session aggregation**

Create `src/shared/session.ts`:

```ts
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
    const active = sessions.filter((session) => session.provider === provider && isActive(session, now))
    if (active.length === 0) return []
    return [{
      provider,
      state: highestState(active),
      activeCount: active.length,
      sessions: Object.freeze([...active])
    }]
  })

  return Object.freeze({
    providers: Object.freeze(providers),
    representativeState: highestState(providers.flatMap((provider) => provider.sessions))
  })
}
```

Create `src/renderer/src/session/session-store.ts`:

```ts
import { summarizeSessions, type SessionRecord, type SessionSnapshot } from '../../../shared/session'

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
        .filter((session) => session.state === 'completed' && now() - session.updatedAt < 5_000)
        .map((session) => session.updatedAt + 5_000)
      return expiries.length > 0 ? Math.min(...expiries) : null
    }
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- src/renderer/src/session/session-store.test.ts
npm run typecheck
```

Expected: three tests PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tsconfig.node.json tsconfig.web.json src/shared/session.ts src/renderer/src/test/setup.ts src/renderer/src/session/session-store.ts src/renderer/src/session/session-store.test.ts
git commit -m "test: add session aggregation"
```

---

### Task 2: Preferences Contract and Atomic Persistence

**Files:**
- Create: `src/shared/preferences.ts`
- Create: `src/main/preferences/preferences-store.ts`
- Test: `src/main/preferences/preferences-store.test.ts`

**Interfaces:**
- Produces: `CompanionPreferences`, `RendererPreferencePatch`, `DEFAULT_PREFERENCES`
- Produces: `normalizePreferences(input): CompanionPreferences`
- Produces: `createPreferencesStore(filePath): PreferencesStore`

- [ ] **Step 1: Write failing validation and persistence tests**

Create `src/main/preferences/preferences-store.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES } from '../../shared/preferences'
import { createPreferencesStore } from './preferences-store'

describe('PreferencesStore', () => {
  it('returns defaults when the file is absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codemung-preferences-'))
    const store = createPreferencesStore(join(directory, 'preferences.json'))
    expect(await store.load()).toEqual({ source: 'defaults', preferences: DEFAULT_PREFERENCES })
  })

  it('recovers invalid fields without discarding valid fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codemung-preferences-'))
    const store = createPreferencesStore(join(directory, 'preferences.json'))

    const saved = await store.replace({
      ...DEFAULT_PREFERENCES,
      themeId: 'water',
      volume: Number.NaN,
      windowBounds: { x: 20, y: 30, width: 700, height: 300 }
    })

    expect(saved.themeId).toBe('water')
    expect(saved.volume).toBe(0.3)
    expect(saved.windowBounds).toEqual({ x: 20, y: 30, width: 300, height: 300 })
  })

  it('writes parseable JSON atomically', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codemung-preferences-'))
    const path = join(directory, 'preferences.json')
    const store = createPreferencesStore(path)
    await store.patch({ soundEnabled: false })
    expect(JSON.parse(await readFile(path, 'utf8')).soundEnabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/main/preferences/preferences-store.test.ts
```

Expected: FAIL because preference modules do not exist.

- [ ] **Step 3: Implement preference validation**

Create `src/shared/preferences.ts`:

```ts
export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CompanionPreferences {
  themeId: string
  soundEnabled: boolean
  volume: number
  alwaysOnTop: boolean
  windowBounds: WindowBounds
}

export type RendererPreferencePatch = Partial<
  Pick<CompanionPreferences, 'themeId' | 'soundEnabled' | 'volume' | 'alwaysOnTop'>
>

export const DEFAULT_PREFERENCES: Readonly<CompanionPreferences> = Object.freeze({
  themeId: 'lava',
  soundEnabled: true,
  volume: 0.3,
  alwaysOnTop: true,
  windowBounds: Object.freeze({ x: 0, y: 0, width: 280, height: 280 })
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const finite = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

export function normalizePreferences(input: unknown): CompanionPreferences {
  const record = isRecord(input) ? input : {}
  const rawBounds = isRecord(record.windowBounds) ? record.windowBounds : {}
  const size = clamp(
    Math.min(
      finite(rawBounds.width, DEFAULT_PREFERENCES.windowBounds.width),
      finite(rawBounds.height, DEFAULT_PREFERENCES.windowBounds.height)
    ),
    180,
    480
  )

  return {
    themeId: typeof record.themeId === 'string' && /^[a-z0-9-]+$/.test(record.themeId)
      ? record.themeId
      : DEFAULT_PREFERENCES.themeId,
    soundEnabled: typeof record.soundEnabled === 'boolean'
      ? record.soundEnabled
      : DEFAULT_PREFERENCES.soundEnabled,
    volume: clamp(finite(record.volume, DEFAULT_PREFERENCES.volume), 0, 1),
    alwaysOnTop: typeof record.alwaysOnTop === 'boolean'
      ? record.alwaysOnTop
      : DEFAULT_PREFERENCES.alwaysOnTop,
    windowBounds: {
      x: finite(rawBounds.x, DEFAULT_PREFERENCES.windowBounds.x),
      y: finite(rawBounds.y, DEFAULT_PREFERENCES.windowBounds.y),
      width: size,
      height: size
    }
  }
}
```

- [ ] **Step 4: Implement atomic JSON storage**

Create `src/main/preferences/preferences-store.ts`:

```ts
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type CompanionPreferences
} from '../../shared/preferences'

export interface PreferencesStore {
  load(): Promise<{ source: 'defaults' | 'disk'; preferences: CompanionPreferences }>
  get(): CompanionPreferences
  replace(value: unknown): Promise<CompanionPreferences>
  patch(value: Partial<CompanionPreferences>): Promise<CompanionPreferences>
}

export function createPreferencesStore(filePath: string): PreferencesStore {
  let current: CompanionPreferences = { ...DEFAULT_PREFERENCES }

  const persist = async (): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true })
    const temporaryPath = `${filePath}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
    await rename(temporaryPath, filePath)
  }

  return {
    async load() {
      try {
        current = normalizePreferences(JSON.parse(await readFile(filePath, 'utf8')))
        return { source: 'disk', preferences: current }
      } catch {
        current = { ...DEFAULT_PREFERENCES }
        return { source: 'defaults', preferences: current }
      }
    },
    get: () => current,
    async replace(value) {
      current = normalizePreferences(value)
      await persist()
      return current
    },
    async patch(value) {
      current = normalizePreferences({ ...current, ...value })
      await persist()
      return current
    }
  }
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
npm test -- src/main/preferences/preferences-store.test.ts
```

Expected: three tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/shared/preferences.ts src/main/preferences/preferences-store.ts src/main/preferences/preferences-store.test.ts
git commit -m "feat: persist companion preferences"
```

---

### Task 3: Square Bounds and Window Manager

**Files:**
- Create: `src/main/window/bounds.ts`
- Test: `src/main/window/bounds.test.ts`
- Create: `src/main/window/window-manager.ts`

**Interfaces:**
- Consumes: `PreferencesStore`
- Produces: `clampSquareBounds(bounds, workAreas): WindowBounds`
- Produces: `createWindowManager(window, store): WindowManager`
- Produces: `WindowManager.startDrag(point)`, `moveDrag(point, workAreas)`, `endDrag()`

- [ ] **Step 1: Write failing geometry tests**

Create `src/main/window/bounds.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clampSquareBounds } from './bounds'

describe('clampSquareBounds', () => {
  const displays = [{ x: 0, y: 0, width: 1440, height: 900 }]

  it('uses the shorter side and enforces the size range', () => {
    expect(clampSquareBounds({ x: 20, y: 30, width: 700, height: 300 }, displays))
      .toEqual({ x: 20, y: 30, width: 300, height: 300 })
    expect(clampSquareBounds({ x: 20, y: 30, width: 90, height: 90 }, displays).width).toBe(180)
  })

  it('keeps the whole window inside the nearest display work area', () => {
    expect(clampSquareBounds({ x: 1400, y: 880, width: 280, height: 280 }, displays))
      .toEqual({ x: 1160, y: 620, width: 280, height: 280 })
  })

  it('chooses the nearest display after a monitor layout change', () => {
    const twoDisplays = [
      { x: 0, y: 0, width: 1440, height: 900 },
      { x: 1440, y: 0, width: 1920, height: 1080 }
    ]
    expect(clampSquareBounds({ x: 3300, y: 990, width: 280, height: 280 }, twoDisplays))
      .toEqual({ x: 3080, y: 800, width: 280, height: 280 })
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/main/window/bounds.test.ts
```

Expected: FAIL because `./bounds` does not exist.

- [ ] **Step 3: Implement pure bounds calculations**

Create `src/main/window/bounds.ts`:

```ts
import type { WindowBounds } from '../../shared/preferences'

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

function distanceSquared(bounds: WindowBounds, area: WorkArea): number {
  const bx = bounds.x + bounds.width / 2
  const by = bounds.y + bounds.height / 2
  const ax = area.x + area.width / 2
  const ay = area.y + area.height / 2
  return (bx - ax) ** 2 + (by - ay) ** 2
}

export function clampSquareBounds(
  bounds: WindowBounds,
  workAreas: readonly WorkArea[]
): WindowBounds {
  const size = clamp(Math.min(bounds.width, bounds.height), 180, 480)
  const area = [...workAreas].sort(
    (left, right) => distanceSquared(bounds, left) - distanceSquared(bounds, right)
  )[0]

  if (!area) return { ...bounds, width: size, height: size }

  return {
    x: clamp(bounds.x, area.x, area.x + area.width - size),
    y: clamp(bounds.y, area.y, area.y + area.height - size),
    width: size,
    height: size
  }
}
```

- [ ] **Step 4: Implement the window manager**

Create `src/main/window/window-manager.ts`:

```ts
import type { BrowserWindow, Point, Rectangle } from 'electron'
import type { PreferencesStore } from '../preferences/preferences-store'
import { clampSquareBounds, type WorkArea } from './bounds'

export interface WindowManager {
  startDrag(cursor: Point): void
  moveDrag(cursor: Point, workAreas: readonly WorkArea[]): void
  endDrag(): void
  applyAlwaysOnTop(value: boolean): void
  restoreBounds(bounds: Rectangle, workAreas: readonly WorkArea[]): void
}

export function createWindowManager(
  window: BrowserWindow,
  preferences: PreferencesStore
): WindowManager {
  let dragOrigin: { cursor: Point; bounds: Rectangle } | null = null
  let persistTimer: ReturnType<typeof setTimeout> | undefined

  const persistBounds = (): void => {
    clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      void preferences.patch({ windowBounds: window.getBounds() })
    }, 150)
  }

  window.setAspectRatio(1)
  window.setMinimumSize(180, 180)
  window.setMaximumSize(480, 480)
  window.on('move', persistBounds)
  window.on('resize', persistBounds)

  return {
    startDrag(cursor) {
      dragOrigin = { cursor, bounds: window.getBounds() }
    },
    moveDrag(cursor, workAreas) {
      if (!dragOrigin) return
      const next = clampSquareBounds({
        ...dragOrigin.bounds,
        x: dragOrigin.bounds.x + cursor.x - dragOrigin.cursor.x,
        y: dragOrigin.bounds.y + cursor.y - dragOrigin.cursor.y
      }, workAreas)
      window.setPosition(next.x, next.y)
    },
    endDrag() {
      dragOrigin = null
      persistBounds()
    },
    applyAlwaysOnTop(value) {
      window.setAlwaysOnTop(value, 'floating')
    },
    restoreBounds(bounds, workAreas) {
      window.setBounds(clampSquareBounds(bounds, workAreas))
    }
  }
}
```

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
npm test -- src/main/window/bounds.test.ts
npm run typecheck
```

Expected: three tests PASS; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/main/window/bounds.ts src/main/window/bounds.test.ts src/main/window/window-manager.ts
git commit -m "feat: manage companion window bounds"
```

---

### Task 4: Typed IPC, Preload Bridge, and Main Composition

**Files:**
- Create: `src/shared/ipc.ts`
- Create: `src/main/ipc/register-companion-ipc.ts`
- Test: `src/main/ipc/register-companion-ipc.test.ts`
- Modify: `src/main/index.ts:1-135`
- Modify: `src/preload/index.ts:1-13`
- Modify: `src/preload/index.d.ts:1-17`

**Interfaces:**
- Consumes: `PreferencesStore`, `WindowManager`
- Produces: `CodeMungApi.getPreferences()`
- Produces: `CodeMungApi.updatePreferences(patch)`
- Produces: `CodeMungApi.onPreferences(listener)`
- Produces: `CodeMungApi.windowControls.startDrag()`, `moveDrag()`, `endDrag()`

- [ ] **Step 1: Write failing IPC tests**

Create `src/main/ipc/register-companion-ipc.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { IPC } from '../../shared/ipc'
import type { CompanionPreferences } from '../../shared/preferences'
import { registerCompanionIpc } from './register-companion-ipc'

describe('registerCompanionIpc', () => {
  it('returns validated preferences and applies always-on-top', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>()
    const listeners = new Map<string, (...args: unknown[]) => unknown>()
    const current: CompanionPreferences = {
      themeId: 'lava',
      soundEnabled: true,
      volume: 0.3,
      alwaysOnTop: true,
      windowBounds: { x: 0, y: 0, width: 280, height: 280 }
    }
    const preferences = {
      get: vi.fn(() => current),
      patch: vi.fn(async (patch: Partial<CompanionPreferences>) => ({ ...current, ...patch }))
    }
    const windowManager = {
      applyAlwaysOnTop: vi.fn(),
      startDrag: vi.fn(),
      moveDrag: vi.fn(),
      endDrag: vi.fn()
    }

    registerCompanionIpc({
      ipc: {
        handle: (channel, handler) => handlers.set(channel, handler),
        on: (channel, listener) => listeners.set(channel, listener)
      },
      preferences,
      windowManager,
      getCursor: () => ({ x: 10, y: 20 }),
      getWorkAreas: () => [{ x: 0, y: 0, width: 1440, height: 900 }],
      publish: vi.fn(),
      quit: vi.fn()
    })

    await handlers.get(IPC.preferencesUpdate)?.({}, { alwaysOnTop: false, volume: 2 })
    expect(preferences.patch).toHaveBeenCalledWith({ alwaysOnTop: false, volume: 1 })
    expect(windowManager.applyAlwaysOnTop).toHaveBeenCalledWith(false)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/main/ipc/register-companion-ipc.test.ts
```

Expected: FAIL because IPC modules do not exist.

- [ ] **Step 3: Define channels and register validated IPC**

Create `src/shared/ipc.ts`:

```ts
export const IPC = {
  appInfo: 'app:get-info',
  preferencesGet: 'preferences:get',
  preferencesUpdate: 'preferences:update',
  preferencesChanged: 'preferences:changed',
  windowDragStart: 'window:drag-start',
  windowDragMove: 'window:drag-move',
  windowDragEnd: 'window:drag-end',
  appQuit: 'app:quit'
} as const
```

Create `src/main/ipc/register-companion-ipc.ts` with these rules:

```ts
import type { Point } from 'electron'
import { IPC } from '../../shared/ipc'
import type { RendererPreferencePatch } from '../../shared/preferences'
import type { PreferencesStore } from '../preferences/preferences-store'
import type { WindowManager } from '../window/window-manager'
import type { WorkArea } from '../window/bounds'

interface IpcLike {
  handle(channel: string, handler: (event: unknown, ...args: unknown[]) => unknown): void
  on(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void
}

interface Dependencies {
  ipc: IpcLike
  preferences: Pick<PreferencesStore, 'get' | 'patch'>
  windowManager: Pick<WindowManager, 'applyAlwaysOnTop' | 'startDrag' | 'moveDrag' | 'endDrag'>
  getCursor(): Point
  getWorkAreas(): readonly WorkArea[]
  publish(value: unknown): void
  quit(): void
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value))

function normalizePatch(value: unknown): RendererPreferencePatch {
  if (!value || typeof value !== 'object') return {}
  const input = value as Record<string, unknown>
  const patch: RendererPreferencePatch = {}
  if (typeof input.themeId === 'string' && /^[a-z0-9-]+$/.test(input.themeId)) patch.themeId = input.themeId
  if (typeof input.soundEnabled === 'boolean') patch.soundEnabled = input.soundEnabled
  if (typeof input.alwaysOnTop === 'boolean') patch.alwaysOnTop = input.alwaysOnTop
  if (typeof input.volume === 'number' && Number.isFinite(input.volume)) patch.volume = clamp(input.volume)
  return patch
}

export function registerCompanionIpc(deps: Dependencies): void {
  deps.ipc.handle(IPC.preferencesGet, () => deps.preferences.get())
  deps.ipc.handle(IPC.preferencesUpdate, async (_event, rawPatch) => {
    const patch = normalizePatch(rawPatch)
    const preferences = await deps.preferences.patch(patch)
    if (patch.alwaysOnTop !== undefined) deps.windowManager.applyAlwaysOnTop(patch.alwaysOnTop)
    deps.publish(preferences)
    return preferences
  })
  deps.ipc.on(IPC.windowDragStart, () => deps.windowManager.startDrag(deps.getCursor()))
  deps.ipc.on(IPC.windowDragMove, () => deps.windowManager.moveDrag(deps.getCursor(), deps.getWorkAreas()))
  deps.ipc.on(IPC.windowDragEnd, () => deps.windowManager.endDrag())
  deps.ipc.on(IPC.appQuit, () => deps.quit())
}
```

- [ ] **Step 4: Replace preload bridge with the minimal typed interface**

`src/preload/index.ts` must expose:

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc'
import type { CompanionPreferences, RendererPreferencePatch } from '../shared/preferences'

contextBridge.exposeInMainWorld('codemung', {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  getPreferences: (): Promise<CompanionPreferences> => ipcRenderer.invoke(IPC.preferencesGet),
  updatePreferences: (patch: RendererPreferencePatch): Promise<CompanionPreferences> =>
    ipcRenderer.invoke(IPC.preferencesUpdate, patch),
  onPreferences: (listener: (value: CompanionPreferences) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: CompanionPreferences): void => listener(value)
    ipcRenderer.on(IPC.preferencesChanged, handler)
    return () => ipcRenderer.removeListener(IPC.preferencesChanged, handler)
  },
  windowControls: {
    startDrag: () => ipcRenderer.send(IPC.windowDragStart),
    moveDrag: () => ipcRenderer.send(IPC.windowDragMove),
    endDrag: () => ipcRenderer.send(IPC.windowDragEnd)
  },
  quitApp: () => ipcRenderer.send(IPC.appQuit)
})
```

`src/preload/index.d.ts` must import shared types and declare the same methods:

```ts
import type { CompanionPreferences, RendererPreferencePatch } from '../shared/preferences'

interface CodeMungApi {
  getAppInfo(): Promise<{ name: string; version: string; platform: string }>
  getPreferences(): Promise<CompanionPreferences>
  updatePreferences(patch: RendererPreferencePatch): Promise<CompanionPreferences>
  onPreferences(listener: (value: CompanionPreferences) => void): () => void
  windowControls: {
    startDrag(): void
    moveDrag(): void
    endDrag(): void
  }
  quitApp(): void
}

declare global {
  interface Window {
    codemung: CodeMungApi
  }
}

export {}
```

- [ ] **Step 5: Compose stores, window manager, and IPC in main**

Update `src/main/index.ts` so `app.whenReady()`:

1. Creates `createPreferencesStore(join(app.getPath('userData'), 'preferences.json'))`.
2. Calls `load()`.
3. Creates the BrowserWindow with `resizable: true`, width/height from preferences, and x/y only when `source === 'disk'`.
4. Creates `WindowManager`, restores/clamps bounds against `screen.getAllDisplays().map(display => display.workArea)`, and applies `alwaysOnTop`.
5. Registers IPC and publishes changes with `mainWindow?.webContents.send(IPC.preferencesChanged, value)`.
6. Supplies `quit: () => app.quit()` to `registerCompanionIpc`.

Add these imports:

```ts
import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, Tray } from 'electron'
import { IPC } from '../shared/ipc'
import type { CompanionPreferences } from '../shared/preferences'
import { createPreferencesStore } from './preferences/preferences-store'
import { registerCompanionIpc } from './ipc/register-companion-ipc'
import { createWindowManager } from './window/window-manager'
```

Remove the `APP_INFO_CHANNEL` constant and old handler block. Inside `app.whenReady().then(async () => ...)`, compose:

```ts
const preferencesStore = createPreferencesStore(
  join(app.getPath('userData'), 'preferences.json')
)
const loaded = await preferencesStore.load()
mainWindow = createWindow(loaded)
const windowManager = createWindowManager(mainWindow, preferencesStore)
const workAreas = () =>
  screen.getAllDisplays().map((display) => display.workArea)

if (loaded.source === 'disk') {
  windowManager.restoreBounds(loaded.preferences.windowBounds, workAreas())
}
windowManager.applyAlwaysOnTop(loaded.preferences.alwaysOnTop)

ipcMain.handle(IPC.appInfo, () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform
}))

registerCompanionIpc({
  ipc: ipcMain,
  preferences: preferencesStore,
  windowManager,
  getCursor: () => screen.getCursorScreenPoint(),
  getWorkAreas: workAreas,
  publish: (value) => mainWindow?.webContents.send(IPC.preferencesChanged, value),
  quit: () => app.quit()
})

tray = createTray()
```

Use this BrowserWindow option block:

```ts
function createWindow(loaded: {
  source: 'defaults' | 'disk'
  preferences: CompanionPreferences
}): BrowserWindow {
  const { source, preferences } = loaded
const window = new BrowserWindow({
  ...(source === 'disk' ? { x: preferences.windowBounds.x, y: preferences.windowBounds.y } : {}),
  width: preferences.windowBounds.width,
  height: preferences.windowBounds.height,
  minWidth: 180,
  minHeight: 180,
  maxWidth: 480,
  maxHeight: 480,
  show: false,
  frame: false,
  transparent: true,
  backgroundColor: '#00000000',
  alwaysOnTop: preferences.alwaysOnTop,
  resizable: true,
  maximizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  hasShadow: false,
  webPreferences: {
    preload: join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
})
```

After the constructor, retain the existing workspace visibility, close/hide lifecycle, URL/file loading, `ready-to-show`, and `return window` statements.

- [ ] **Step 6: Run tests, typecheck, and build**

Run:

```bash
npm test -- src/main/ipc/register-companion-ipc.test.ts
npm run typecheck
npm run build
```

Expected: IPC test PASS; typecheck and build exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/shared/ipc.ts src/main/ipc/register-companion-ipc.ts src/main/ipc/register-companion-ipc.test.ts src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: expose companion controls"
```

---

### Task 5: Original WAV Assets and Audio Manager

**Files:**
- Create: `scripts/generate-sounds.mjs`
- Create: `src/renderer/src/assets/audio/lava-click-1.wav`
- Create: `src/renderer/src/assets/audio/lava-click-2.wav`
- Create: `src/renderer/src/assets/audio/water-click-1.wav`
- Create: `src/renderer/src/assets/audio/water-click-2.wav`
- Create: `src/renderer/src/assets/audio/status-waiting.wav`
- Create: `src/renderer/src/assets/audio/status-completed.wav`
- Create: `src/renderer/src/assets/audio/status-error.wav`
- Create: `src/renderer/src/audio/types.ts`
- Create: `src/renderer/src/audio/audio-manager.ts`
- Test: `src/renderer/src/audio/audio-manager.test.ts`
- Create: `src/renderer/src/audio/web-audio-backend.ts`

**Interfaces:**
- Produces: `AudioBackend<TBuffer>`
- Produces: `InteractionSoundPack`
- Produces: `createAudioManager(backend, options): AudioManager`
- Produces: `AudioManager.preload(urls)`, `playInteraction(urls, now)`, `playStatus(kind)`, `setPreferences(value)`

- [ ] **Step 1: Create a deterministic original-sound generator**

Create `scripts/generate-sounds.mjs` with:

```js
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const SAMPLE_RATE = 44_100
const output = resolve('src/renderer/src/assets/audio')
mkdirSync(output, { recursive: true })

function wav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  samples.forEach((sample, index) => {
    buffer.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), 44 + index * 2)
  })
  return buffer
}

function render(duration, oscillator) {
  const count = Math.floor(duration * SAMPLE_RATE)
  return Array.from({ length: count }, (_, index) => {
    const t = index / SAMPLE_RATE
    const envelope = Math.sin(Math.PI * Math.min(1, t / duration)) ** 2
    return oscillator(t, index) * envelope * 0.42
  })
}

function tone(frequency, duration, glide = 0) {
  return render(duration, (t) => Math.sin(2 * Math.PI * (frequency + glide * t) * t))
}

function organic(frequency, duration, seed) {
  let random = seed
  return render(duration, (t) => {
    random = (random * 48271) % 2147483647
    const noise = random / 2147483647 - 0.5
    return Math.sin(2 * Math.PI * frequency * t + Math.sin(t * 31) * 0.8) * 0.75 + noise * 0.25
  })
}

function twoTone(first, second) {
  return [...tone(first, 0.11), ...tone(second, 0.16)]
}

const files = {
  'lava-click-1.wav': organic(128, 0.18, 11),
  'lava-click-2.wav': organic(164, 0.2, 29),
  'water-click-1.wav': tone(510, 0.16, -820),
  'water-click-2.wav': tone(620, 0.18, -960),
  'status-waiting.wav': twoTone(660, 880),
  'status-completed.wav': twoTone(523.25, 783.99),
  'status-error.wav': tone(196, 0.28, -80)
}

for (const [name, samples] of Object.entries(files)) {
  writeFileSync(resolve(output, name), wav(samples))
}
```

Run:

```bash
node scripts/generate-sounds.mjs
file src/renderer/src/assets/audio/*.wav
```

Expected: seven `RIFF (little-endian) data, WAVE audio` files.

- [ ] **Step 2: Write failing AudioManager tests**

Create `src/renderer/src/audio/audio-manager.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { createAudioManager } from './audio-manager'

describe('AudioManager', () => {
  it('uses 30% volume and blocks clicks inside the 120ms cooldown', async () => {
    const backend = { load: vi.fn(async (url: string) => url), play: vi.fn(async () => undefined) }
    const audio = createAudioManager(backend, { random: () => 0.5 })
    await audio.preload(['click.wav'])

    await audio.playInteraction(['click.wav'], 1_000)
    await audio.playInteraction(['click.wav'], 1_119)

    expect(backend.play).toHaveBeenCalledTimes(1)
    expect(backend.play).toHaveBeenCalledWith('click.wav', { gain: 0.3, playbackRate: 1 })
  })

  it('does not play when muted and swallows backend failures', async () => {
    const backend = {
      load: vi.fn(async () => { throw new Error('decode failed') }),
      play: vi.fn()
    }
    const audio = createAudioManager(backend)
    audio.setPreferences({ soundEnabled: false, volume: 0.3 })
    await expect(audio.preload(['broken.wav'])).resolves.toBeUndefined()
    await expect(audio.playStatus('error')).resolves.toBeUndefined()
  })

  it('caps concurrent interaction sounds at four', async () => {
    const releases: Array<() => void> = []
    const backend = {
      load: vi.fn(async (url: string) => url),
      play: vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)))
    }
    const audio = createAudioManager(backend)
    await audio.preload(['click.wav'])

    const plays = Array.from(
      { length: 5 },
      (_, index) => audio.playInteraction(['click.wav'], 1_000 + index * 120)
    )
    await vi.waitFor(() => expect(backend.play).toHaveBeenCalledTimes(4))
    releases.forEach((release) => release())
    await Promise.all(plays)
  })
})
```

- [ ] **Step 3: Run the test and verify failure**

Run:

```bash
npm test -- src/renderer/src/audio/audio-manager.test.ts
```

Expected: FAIL because `./audio-manager` does not exist.

- [ ] **Step 4: Implement audio interfaces and manager**

Create `src/renderer/src/audio/types.ts`:

```ts
import type { AgentState } from '../../../shared/session'

export type StatusSound = 'waiting_permission' | 'completed' | 'error'
export type InteractionSoundPack = Readonly<Record<AgentState, readonly string[]>>

export interface AudioBackend<TBuffer = unknown> {
  load(url: string): Promise<TBuffer>
  play(buffer: TBuffer, options: { gain: number; playbackRate: number }): Promise<void>
}
```

Create `src/renderer/src/audio/audio-manager.ts`:

```ts
import type { AudioBackend, StatusSound } from './types'

const STATUS_URLS: Record<StatusSound, string> = {
  waiting_permission: new URL('../assets/audio/status-waiting.wav', import.meta.url).href,
  completed: new URL('../assets/audio/status-completed.wav', import.meta.url).href,
  error: new URL('../assets/audio/status-error.wav', import.meta.url).href
}

export function createAudioManager<TBuffer>(
  backend: AudioBackend<TBuffer>,
  options: { random?: () => number } = {}
) {
  const buffers = new Map<string, TBuffer>()
  const random = options.random ?? Math.random
  let soundEnabled = true
  let volume = 0.3
  let lastInteractionAt = Number.NEGATIVE_INFINITY
  let activeInteractions = 0
  let statusPlaying = false

  const getBuffer = async (url: string): Promise<TBuffer | undefined> => {
    if (buffers.has(url)) return buffers.get(url)
    try {
      const buffer = await backend.load(url)
      buffers.set(url, buffer)
      return buffer
    } catch {
      return undefined
    }
  }

  return {
    async preload(urls: readonly string[]) {
      await Promise.all([...urls, ...Object.values(STATUS_URLS)].map(getBuffer))
    },
    setPreferences(value: { soundEnabled: boolean; volume: number }) {
      soundEnabled = value.soundEnabled
      volume = Math.min(1, Math.max(0, value.volume))
    },
    async playInteraction(urls: readonly string[], now = Date.now()) {
      if (!soundEnabled || urls.length === 0 || now - lastInteractionAt < 120 || activeInteractions >= 4) return
      lastInteractionAt = now
      const url = urls[Math.floor(random() * urls.length)] ?? urls[0]
      activeInteractions += 1
      try {
        const buffer = await getBuffer(url)
        if (!buffer) return
        await backend.play(buffer, { gain: volume, playbackRate: 0.97 + random() * 0.06 })
      } catch {
        return
      } finally {
        activeInteractions -= 1
      }
    },
    async playStatus(kind: StatusSound) {
      if (!soundEnabled || statusPlaying) return
      statusPlaying = true
      try {
        const buffer = await getBuffer(STATUS_URLS[kind])
        if (!buffer) return
        await backend.play(buffer, { gain: volume, playbackRate: 1 })
      } catch {
        return
      } finally {
        statusPlaying = false
      }
    }
  }
}
```

- [ ] **Step 5: Implement Web Audio backend**

Create `src/renderer/src/audio/web-audio-backend.ts`:

```ts
import type { AudioBackend } from './types'

export function createWebAudioBackend(): AudioBackend<AudioBuffer> {
  let context: AudioContext | null = null
  const getContext = (): AudioContext => {
    context ??= new AudioContext()
    return context
  }

  return {
    async load(url) {
      const context = getContext()
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`)
      return context.decodeAudioData(await response.arrayBuffer())
    },
    async play(buffer, { gain, playbackRate }) {
      const context = getContext()
      if (context.state === 'suspended') await context.resume()
      await new Promise<void>((resolve) => {
        const source = context.createBufferSource()
        const gainNode = context.createGain()
        source.buffer = buffer
        source.playbackRate.value = playbackRate
        gainNode.gain.value = gain
        source.connect(gainNode).connect(context.destination)
        source.addEventListener('ended', () => resolve(), { once: true })
        source.start()
      })
    }
  }
}
```

- [ ] **Step 6: Run tests and inspect asset sizes**

Run:

```bash
npm test -- src/renderer/src/audio/audio-manager.test.ts
du -h src/renderer/src/assets/audio/*.wav
```

Expected: three tests PASS; every WAV is below 100KB.

- [ ] **Step 7: Commit**

```bash
git add scripts/generate-sounds.mjs src/renderer/src/assets/audio src/renderer/src/audio
git commit -m "feat: add companion audio manager"
```

---

### Task 6: Companion Pack Interface and Water Theme

**Files:**
- Modify: `src/renderer/src/motion/types.ts:1-30`
- Modify: `src/renderer/src/motion/registry.ts:1-25`
- Test: `src/renderer/src/motion/registry.test.ts`
- Modify: `src/renderer/src/motion/MotionScene.tsx:1-69`
- Modify: `src/renderer/src/motion/packs/lava/LavaMotion.tsx`
- Modify: `src/renderer/src/motion/packs/lava/lava.css`
- Create: `src/renderer/src/motion/packs/water/WaterMotion.tsx`
- Create: `src/renderer/src/motion/packs/water/water.css`

**Interfaces:**
- Consumes: `InteractionSoundPack`
- Produces: `CompanionPack`
- Produces: `getCompanionPack(id: string): CompanionPack`
- Produces: `registeredCompanionPacks: readonly CompanionPack[]`
- Produces: `MotionScene({ packId, state, interactionToken })`

- [ ] **Step 1: Write failing registry tests**

Create `src/renderer/src/motion/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getCompanionPack, registeredCompanionPacks } from './registry'

describe('CompanionRegistry', () => {
  it('registers lava and water', () => {
    expect(registeredCompanionPacks.map((pack) => pack.id)).toEqual(['lava', 'water'])
  })

  it('falls back to lava for unknown IDs', () => {
    expect(getCompanionPack('missing').id).toBe('lava')
  })

  it('provides reactions and sounds for every state', () => {
    const water = getCompanionPack('water')
    expect(Object.keys(water.interactions)).toEqual([
      'idle', 'working', 'waiting_permission', 'completed', 'error'
    ])
    expect(water.sounds.idle.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/renderer/src/motion/registry.test.ts
```

Expected: FAIL because `getCompanionPack` is not exported.

- [ ] **Step 3: Replace the motion-only interface with `CompanionPack`**

Update `src/renderer/src/motion/types.ts`:

```ts
import type { ComponentType } from 'react'
import type { AgentState } from '../../../shared/session'
import type { InteractionSoundPack } from '../audio/types'

export type InteractionName = 'squish' | 'spark' | 'pulse' | 'bloom' | 'recoil'

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
  interactionToken: number
  interaction: InteractionName
}

export interface CompanionPack {
  id: string
  label: string
  states: Readonly<Record<AgentState, MotionParams>>
  interactions: Readonly<Record<AgentState, InteractionName>>
  sounds: InteractionSoundPack
  Motion: ComponentType<MotionPackProps>
}
```

- [ ] **Step 4: Register complete lava and water packs**

Update `src/renderer/src/motion/registry.ts` to create `lavaPack` and `waterPack`. Use:

```ts
import { LavaMotion } from './packs/lava/LavaMotion'
import { WaterMotion } from './packs/water/WaterMotion'
import type { CompanionPack } from './types'

const interactions = {
  idle: 'squish',
  working: 'spark',
  waiting_permission: 'pulse',
  completed: 'bloom',
  error: 'recoil'
} as const

const lavaSounds = {
  idle: [new URL('../assets/audio/lava-click-1.wav', import.meta.url).href],
  working: [new URL('../assets/audio/lava-click-2.wav', import.meta.url).href],
  waiting_permission: [new URL('../assets/audio/lava-click-1.wav', import.meta.url).href],
  completed: [new URL('../assets/audio/lava-click-2.wav', import.meta.url).href],
  error: [new URL('../assets/audio/lava-click-1.wav', import.meta.url).href]
}

const waterSounds = {
  idle: [new URL('../assets/audio/water-click-1.wav', import.meta.url).href],
  working: [new URL('../assets/audio/water-click-2.wav', import.meta.url).href],
  waiting_permission: [new URL('../assets/audio/water-click-1.wav', import.meta.url).href],
  completed: [new URL('../assets/audio/water-click-2.wav', import.meta.url).href],
  error: [new URL('../assets/audio/water-click-1.wav', import.meta.url).href]
}
```

Use these lava state parameters:

```ts
const lavaStates = {
  idle: { speed: 0.18, brightness: 0.34, density: 0.24, turbulence: 0.12 },
  working: { speed: 0.68, brightness: 0.76, density: 0.7, turbulence: 0.58 },
  waiting_permission: { speed: 0.34, brightness: 0.94, density: 0.54, turbulence: 0.76 },
  completed: { speed: 0.62, brightness: 1, density: 0.86, turbulence: 0.38 },
  error: { speed: 0.28, brightness: 0.5, density: 0.4, turbulence: 0.96 }
} as const
```

Use these water state parameters:

```ts
const waterStates = {
  idle: { speed: 0.14, brightness: 0.48, density: 0.32, turbulence: 0.1 },
  working: { speed: 0.58, brightness: 0.78, density: 0.68, turbulence: 0.46 },
  waiting_permission: { speed: 0.3, brightness: 0.94, density: 0.5, turbulence: 0.64 },
  completed: { speed: 0.56, brightness: 1, density: 0.82, turbulence: 0.3 },
  error: { speed: 0.22, brightness: 0.52, density: 0.38, turbulence: 0.84 }
} as const
```

Create the definitions:

```ts
const lavaPack = {
  id: 'lava',
  label: '용암멍',
  states: lavaStates,
  interactions,
  sounds: lavaSounds,
  Motion: LavaMotion
} satisfies CompanionPack

const waterPack = {
  id: 'water',
  label: '물멍',
  states: waterStates,
  interactions,
  sounds: waterSounds,
  Motion: WaterMotion
} satisfies CompanionPack
```

Export:

```ts
const packs = new Map<string, CompanionPack>([
  ['lava', lavaPack],
  ['water', waterPack]
])

export const registeredCompanionPacks = Object.freeze([...packs.values()])
export const getCompanionPack = (id: string): CompanionPack => packs.get(id) ?? lavaPack
```

- [ ] **Step 5: Implement water-drop rendering and state reactions**

Create `WaterMotion.tsx` as an SVG with one central drop, one highlight ellipse, and four bubbles:

```tsx
import type { CSSProperties } from 'react'
import type { MotionPackProps } from '../../types'
import './water.css'

type WaterStyle = CSSProperties & Record<
  | '--motion-speed'
  | '--motion-brightness'
  | '--motion-density'
  | '--motion-turbulence'
  | '--water-duration',
  number | string
>

export function WaterMotion({
  state,
  motion,
  reducedMotion,
  interactionToken,
  interaction
}: MotionPackProps): React.JSX.Element {
  return (
<svg
  key={interactionToken}
  className="water-motion"
  data-state={state}
  data-interaction={interaction}
  data-reduced-motion={reducedMotion}
  viewBox="0 0 240 300"
  role="img"
  aria-label={`물멍, ${state} 상태`}
  style={{
    '--motion-speed': motion.speed,
    '--motion-brightness': motion.brightness,
    '--motion-density': motion.density,
    '--motion-turbulence': motion.turbulence,
    '--water-duration': `${18 - motion.speed * 8}s`
  } as WaterStyle}
>
  <defs>
    <radialGradient id="water-fill" cx="32%" cy="24%">
      <stop offset="0" stopColor="#e4fdff" />
      <stop offset=".32" stopColor="#52d2f5" />
      <stop offset=".72" stopColor="#2179cc" />
      <stop offset="1" stopColor="#0c3777" />
    </radialGradient>
  </defs>
  <path className="water-motion__drop" d="M120 18C88 70 54 111 54 170c0 45 29 78 66 78s66-33 66-78c0-59-34-100-66-152Z" />
  <ellipse className="water-motion__shine" cx="92" cy="112" rx="13" ry="28" />
  <g className="water-motion__bubbles" aria-hidden="true">
    <circle cx="80" cy="215" r="7" /><circle cx="157" cy="196" r="10" />
    <circle cx="145" cy="137" r="5" /><circle cx="94" cy="168" r="4" />
  </g>
</svg>
  )
}
```

In `water.css`, map `data-interaction` to exact reactions:

```css
.water-motion[data-interaction="squish"] { animation: water-squish 280ms ease-out }
.water-motion[data-interaction="spark"] .water-motion__bubbles { animation: water-bubbles 360ms ease-out }
.water-motion[data-interaction="pulse"] { animation: water-pulse 420ms ease-in-out }
.water-motion[data-interaction="bloom"] { animation: water-bloom 520ms ease-out }
.water-motion[data-interaction="recoil"] { animation: water-recoil 320ms ease-out }
.water-motion[data-reduced-motion="true"] { animation-duration: 80ms; transform: none }

.water-motion {
  width: 100%;
  height: 100%;
  overflow: visible;
  filter: drop-shadow(0 0 24px rgba(82, 210, 245, .34));
  transform-origin: center;
}
.water-motion__drop {
  fill: url("#water-fill");
  transform-origin: center;
  animation: water-float var(--water-duration) ease-in-out infinite;
}
.water-motion__shine {
  fill: rgba(255, 255, 255, .45);
}
.water-motion__bubbles {
  fill: rgba(190, 245, 255, .6);
  opacity: calc(.35 + var(--motion-density) * .5);
}
.water-motion[data-reduced-motion="true"] .water-motion__drop {
  animation: none;
}

@keyframes water-float {
  50% { transform: translateY(-10px) scale(1.02) }
}

@keyframes water-squish {
  40% { transform: scaleX(1.08) scaleY(.9) }
}
@keyframes water-bubbles {
  60% { transform: translateY(-18px); opacity: 1 }
}
@keyframes water-pulse {
  50% { transform: scale(1.08); filter: brightness(1.18) }
}
@keyframes water-bloom {
  45% { transform: scale(1.14); filter: brightness(1.28) }
}
@keyframes water-recoil {
  30% { transform: translateX(-8px) rotate(-2deg) }
  60% { transform: translateX(5px) rotate(1deg) }
}
```

Add equivalent reaction selectors to `lava.css` and pass new props through `LavaMotion.tsx`.

Extend the `LavaMotion` signature:

```tsx
export function LavaMotion({
  state,
  motion,
  reducedMotion,
  interactionToken,
  interaction
}: MotionPackProps): React.JSX.Element {
```

Add these attributes to the current `<svg>` opening tag:

```tsx
key={interactionToken}
data-interaction={interaction}
data-reduced-motion={reducedMotion}
```

Use these exact lava selectors:

```css
.lava-motion[data-interaction="squish"] { animation: lava-squish 280ms ease-out }
.lava-motion[data-interaction="spark"] .lava-motion__field { animation: lava-spark 360ms ease-out }
.lava-motion[data-interaction="pulse"] { animation: lava-pulse 420ms ease-in-out }
.lava-motion[data-interaction="bloom"] { animation: lava-bloom 520ms ease-out }
.lava-motion[data-interaction="recoil"] { animation: lava-recoil 320ms ease-out }
.lava-motion[data-reduced-motion="true"] { animation-duration: 80ms; transform: none }

@keyframes lava-squish {
  40% { transform: scaleX(1.08) scaleY(.9) }
}
@keyframes lava-spark {
  60% { transform: translateY(-10px) scale(1.04); filter: brightness(1.2) }
}
@keyframes lava-pulse {
  50% { transform: scale(1.08); filter: brightness(1.18) }
}
@keyframes lava-bloom {
  45% { transform: scale(1.14); filter: brightness(1.3) }
}
@keyframes lava-recoil {
  30% { transform: translateX(-8px) rotate(-2deg) }
  60% { transform: translateX(5px) rotate(1deg) }
}
```

- [ ] **Step 6: Update `MotionScene`**

Change props to:

```ts
import type { AgentState } from '../../../shared/session'
import { getCompanionPack } from './registry'
import type { MotionParams } from './types'

interface MotionSceneProps {
  packId: string
  state: AgentState
  interactionToken: number
}
```

Resolve the pack and render:

```tsx
const pack = getCompanionPack(packId)
const motion = clampParams(pack.states[state], reducedMotion)
const PackMotion = pack.Motion

return (
  <div
    className="motion-scene"
    data-motion-pack={pack.id}
    data-motion-state={state}
    data-reduced-motion={reducedMotion ? 'true' : 'false'}
  >
    <PackMotion
      key={`${pack.id}:${interactionToken}`}
      state={state}
      motion={motion}
      reducedMotion={reducedMotion}
      interactionToken={interactionToken}
      interaction={pack.interactions[state]}
    />
  </div>
)
```

- [ ] **Step 7: Run tests, typecheck, and build**

Run:

```bash
npm test -- src/renderer/src/motion/registry.test.ts
npm run typecheck
npm run build
```

Expected: three registry tests PASS; typecheck and build exit 0.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/motion src/renderer/src/assets/audio
git commit -m "feat: add water companion pack"
```

---

### Task 7: Pointer Classifier and Object Drag

**Files:**
- Create: `src/renderer/src/interaction/gesture.ts`
- Test: `src/renderer/src/interaction/gesture.test.ts`
- Create: `src/renderer/src/interaction/use-companion-interaction.ts`
- Modify: `src/renderer/src/styles.css:26-45`

**Interfaces:**
- Consumes: `AudioManager`, `CompanionPack`, `window.codemung.windowControls`
- Produces: `beginGesture(pointerId, x, y): Gesture`
- Produces: `moveGesture(gesture, x, y): Gesture`
- Produces: `useCompanionInteraction(options)`

- [ ] **Step 1: Write failing threshold tests**

Create `src/renderer/src/interaction/gesture.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { beginGesture, moveGesture } from './gesture'

describe('gesture classifier', () => {
  it('keeps movement below 5px pending', () => {
    const gesture = moveGesture(beginGesture(1, 10, 10), 13, 13)
    expect(gesture.mode).toBe('pending')
  })

  it('switches to drag at exactly 5px', () => {
    const gesture = moveGesture(beginGesture(1, 10, 10), 13, 14)
    expect(gesture.mode).toBe('dragging')
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/renderer/src/interaction/gesture.test.ts
```

Expected: FAIL because `./gesture` does not exist.

- [ ] **Step 3: Implement the pure classifier**

Create `src/renderer/src/interaction/gesture.ts`:

```ts
export interface Gesture {
  pointerId: number
  startX: number
  startY: number
  mode: 'pending' | 'dragging'
}

export const beginGesture = (pointerId: number, startX: number, startY: number): Gesture => ({
  pointerId,
  startX,
  startY,
  mode: 'pending'
})

export function moveGesture(gesture: Gesture, x: number, y: number): Gesture {
  if (gesture.mode === 'dragging') return gesture
  const distance = Math.hypot(x - gesture.startX, y - gesture.startY)
  return distance >= 5 ? { ...gesture, mode: 'dragging' } : gesture
}
```

- [ ] **Step 4: Implement the React pointer hook**

Create `src/renderer/src/interaction/use-companion-interaction.ts`:

```ts
import { useRef, useState } from 'react'
import type { PointerEventHandler } from 'react'
import type { AgentState } from '../../../shared/session'
import type { CompanionPack } from '../motion/types'
import { beginGesture, moveGesture, type Gesture } from './gesture'

interface Options {
  state: AgentState
  pack: CompanionPack
  playInteraction(urls: readonly string[]): Promise<void>
}

export function useCompanionInteraction({ state, pack, playInteraction }: Options) {
  const gesture = useRef<Gesture | null>(null)
  const frame = useRef<number | null>(null)
  const lastInteractionAt = useRef(Number.NEGATIVE_INFINITY)
  const [interactionToken, setInteractionToken] = useState(0)

  const onPointerDown: PointerEventHandler<HTMLElement> = (event) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    gesture.current = beginGesture(event.pointerId, event.clientX, event.clientY)
    window.codemung.windowControls.startDrag()
  }

  const onPointerMove: PointerEventHandler<HTMLElement> = (event) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return
    gesture.current = moveGesture(gesture.current, event.clientX, event.clientY)
    if (gesture.current.mode !== 'dragging' || frame.current !== null) return
    frame.current = requestAnimationFrame(() => {
      window.codemung.windowControls.moveDrag()
      frame.current = null
    })
  }

  const onPointerUp: PointerEventHandler<HTMLElement> = (event) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return
    const wasClick = gesture.current.mode === 'pending'
    gesture.current = null
    window.codemung.windowControls.endDrag()
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (!wasClick) return
    const now = Date.now()
    if (now - lastInteractionAt.current < 120) return
    lastInteractionAt.current = now
    setInteractionToken((value) => value + 1)
    void playInteraction(pack.sounds[state])
  }

  const onPointerCancel: PointerEventHandler<HTMLElement> = (event) => {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return
    gesture.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    window.codemung.windowControls.endDrag()
  }

  return {
    interactionToken,
    pointerHandlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }
  }
}
```

- [ ] **Step 5: Make the full object interactive**

In `styles.css`, remove:

```css
-webkit-app-region: drag;
app-region: drag;
pointer-events: none;
```

Use:

```css
.companion {
  width: 100%;
  height: 100%;
  touch-action: none;
  cursor: grab;
}

.companion:active {
  cursor: grabbing;
}

.motion-scene {
  width: 86vmin;
  height: 92vmin;
  pointer-events: none;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm test -- src/renderer/src/interaction/gesture.test.ts
npm run typecheck
```

Expected: two tests PASS; typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/interaction src/renderer/src/styles.css
git commit -m "feat: add pointer interactions"
```

---

### Task 8: Context Panel, Preferences Hook, and App Integration

**Files:**
- Create: `src/renderer/src/session/fixture.ts`
- Create: `src/renderer/src/hooks/use-preferences.ts`
- Create: `src/renderer/src/hooks/use-status-chime.ts`
- Test: `src/renderer/src/hooks/use-status-chime.test.tsx`
- Create: `src/renderer/src/components/ContextPanel.tsx`
- Test: `src/renderer/src/components/ContextPanel.test.tsx`
- Create: `src/renderer/src/components/context-panel.css`
- Modify: `src/renderer/src/App.tsx:1-53`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `SessionSnapshot`, `CompanionPreferences`, `registeredCompanionPacks`
- Produces: `ContextPanel`
- Produces: `usePreferences()`
- Produces: `useStatusChime(snapshot, playStatus)`

- [ ] **Step 1: Write failing context-panel tests**

Create `src/renderer/src/components/ContextPanel.test.tsx` with jsdom:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContextPanel } from './ContextPanel'

const preferences = {
  themeId: 'lava',
  soundEnabled: true,
  volume: 0.3,
  alwaysOnTop: true,
  windowBounds: { x: 0, y: 0, width: 280, height: 280 }
}

describe('ContextPanel', () => {
  it('shows active providers, counts sessions, and expands projects', () => {
    render(
      <ContextPanel
        open
        snapshot={{
          representativeState: 'waiting_permission',
          providers: [{
            provider: 'codex',
            state: 'waiting_permission',
            activeCount: 2,
            sessions: [
              { provider: 'codex', sessionId: '1', projectName: 'codemung', state: 'waiting_permission', updatedAt: 1 },
              { provider: 'codex', sessionId: '2', projectName: 'portfolio', state: 'working', updatedAt: 1 }
            ]
          }]
        }}
        preferences={preferences}
        onUpdatePreferences={vi.fn()}
        onClose={vi.fn()}
        onQuit={vi.fn()}
      />
    )

    expect(screen.getByText('Codex')).toBeInTheDocument()
    expect(screen.getByText('2개')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Codex/ }))
    expect(screen.getByText('codemung')).toBeInTheDocument()
    expect(screen.getByText('portfolio')).toBeInTheDocument()
  })

  it('shows an empty message and closes on Escape', () => {
    const onClose = vi.fn()
    render(
      <ContextPanel
        open
        snapshot={{ representativeState: 'idle', providers: [] }}
        preferences={preferences}
        onUpdatePreferences={vi.fn()}
        onClose={onClose}
        onQuit={vi.fn()}
      />
    )
    expect(screen.getByText('현재 활성 작업 없음')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('updates the selected theme', () => {
    const onUpdatePreferences = vi.fn()
    render(
      <ContextPanel
        open
        snapshot={{ representativeState: 'idle', providers: [] }}
        preferences={preferences}
        onUpdatePreferences={onUpdatePreferences}
        onClose={vi.fn()}
        onQuit={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('물멍'))
    expect(onUpdatePreferences).toHaveBeenCalledWith({ themeId: 'water' })
  })
})
```

Create `src/renderer/src/hooks/use-status-chime.test.tsx`:

```tsx
// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { SessionSnapshot } from '../../../shared/session'
import { useStatusChime } from './use-status-chime'

const idle: SessionSnapshot = { representativeState: 'idle', providers: [] }
const waiting: SessionSnapshot = {
  representativeState: 'waiting_permission',
  providers: [{
    provider: 'codex',
    state: 'waiting_permission',
    activeCount: 1,
    sessions: [{
      provider: 'codex',
      sessionId: 'x1',
      projectName: 'codemung',
      state: 'waiting_permission',
      updatedAt: 1
    }]
  }]
}

describe('useStatusChime', () => {
  it('stays silent on hydrate and plays when entering an important state', () => {
    const playStatus = vi.fn(async () => undefined)
    const { rerender } = renderHook(
      ({ snapshot }) => useStatusChime(snapshot, playStatus),
      { initialProps: { snapshot: idle } }
    )
    expect(playStatus).not.toHaveBeenCalled()
    rerender({ snapshot: waiting })
    expect(playStatus).toHaveBeenCalledWith('waiting_permission')
  })
})
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
npm test -- src/renderer/src/components/ContextPanel.test.tsx
npm test -- src/renderer/src/hooks/use-status-chime.test.tsx
```

Expected: both commands FAIL because `ContextPanel` and `use-status-chime` do not exist.

- [ ] **Step 3: Implement fixture and preference hooks**

Create `src/renderer/src/session/fixture.ts`:

```ts
import type { AgentState, SessionRecord } from '../../../shared/session'

export const FIXTURE_SESSIONS: readonly SessionRecord[] = [
  {
    provider: 'codex',
    sessionId: 'fixture-codex',
    projectName: 'codemung',
    state: 'working',
    updatedAt: Date.now()
  }
]

export function fixtureSessionsForState(state: AgentState): readonly SessionRecord[] {
  return [{
    provider: 'codex',
    sessionId: 'fixture-codex',
    projectName: 'codemung',
    state,
    updatedAt: Date.now()
  }]
}
```

Create `src/renderer/src/hooks/use-preferences.ts`:

```ts
import { useEffect, useState } from 'react'
import { DEFAULT_PREFERENCES, type RendererPreferencePatch } from '../../../shared/preferences'

export function usePreferences() {
  const [preferences, setPreferences] = useState({ ...DEFAULT_PREFERENCES })

  useEffect(() => {
    void window.codemung.getPreferences().then(setPreferences)
    return window.codemung.onPreferences(setPreferences)
  }, [])

  const updatePreferences = async (patch: RendererPreferencePatch): Promise<void> => {
    setPreferences(await window.codemung.updatePreferences(patch))
  }

  return { preferences, updatePreferences }
}
```

Create `src/renderer/src/hooks/use-status-chime.ts` so the first snapshot does not play, then compare each Provider's previous state and call `playStatus` only when entering `waiting_permission`, `completed`, or `error`:

```ts
import { useEffect, useRef } from 'react'
import type { SessionSnapshot } from '../../../shared/session'
import type { StatusSound } from '../audio/types'

export function useStatusChime(
  snapshot: SessionSnapshot,
  playStatus: (kind: StatusSound) => Promise<void>
): void {
  const previous = useRef<SessionSnapshot | null>(null)

  useEffect(() => {
    if (previous.current) {
      for (const provider of snapshot.providers) {
        const oldState = previous.current.providers.find((item) => item.provider === provider.provider)?.state
        if (provider.state !== oldState && ['waiting_permission', 'completed', 'error'].includes(provider.state)) {
          void playStatus(provider.state as StatusSound)
        }
      }
    }
    previous.current = snapshot
  }, [snapshot, playStatus])
}
```

- [ ] **Step 4: Implement the selected C-layout panel**

Create `src/renderer/src/components/ContextPanel.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'
import type { Provider, SessionSnapshot } from '../../../shared/session'
import type {
  CompanionPreferences,
  RendererPreferencePatch
} from '../../../shared/preferences'
import { registeredCompanionPacks } from '../motion/registry'
import './context-panel.css'

const STATE_LABELS = {
  idle: '쉬는 중',
  working: '작업 중',
  waiting_permission: '확인 필요',
  completed: '완료',
  error: '오류'
} as const

const PROVIDER_LABELS: Record<Provider, string> = {
  claude: 'Claude',
  codex: 'Codex'
}

interface Props {
  open: boolean
  snapshot: SessionSnapshot
  preferences: CompanionPreferences
  onUpdatePreferences(patch: RendererPreferencePatch): void | Promise<void>
  onClose(): void
  onQuit(): void
}

const basename = (value: string): string =>
  value.split(/[\\/]/).filter(Boolean).at(-1) ?? value

export function ContextPanel({
  open,
  snapshot,
  preferences,
  onUpdatePreferences,
  onClose,
  onQuit
}: Props): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState<Provider | null>(null)

  useEffect(() => {
    if (!open) return undefined
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!panelRef.current?.contains(event.target as Node)) onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onClose)
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="context-panel"
      role="dialog"
      aria-label="CodeMung 상태 및 설정"
      tabIndex={-1}
      onPointerDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.stopPropagation()}
    >
      <section className="context-panel__status" aria-label="활성 작업">
        {snapshot.providers.length === 0 && (
          <p className="context-panel__empty">현재 활성 작업 없음</p>
        )}
        {snapshot.providers.map((provider) => {
          const isExpanded = expanded === provider.provider
          return (
            <div key={provider.provider}>
              <button
                type="button"
                className="context-panel__provider"
                aria-expanded={isExpanded}
                onClick={() => setExpanded(isExpanded ? null : provider.provider)}
              >
                <strong>{PROVIDER_LABELS[provider.provider]}</strong>
                <span>{STATE_LABELS[provider.state]}</span>
                <span>{provider.activeCount}개</span>
              </button>
              {isExpanded && (
                <ul className="context-panel__sessions">
                  {provider.sessions.map((session) => (
                    <li key={session.sessionId}>
                      <span>{basename(session.projectName)}</span>
                      <span>{STATE_LABELS[session.state]}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </section>

      <fieldset className="context-panel__group">
        <legend>테마</legend>
        {registeredCompanionPacks.map((pack) => (
          <label key={pack.id} className="context-panel__row">
            <span>{pack.label}</span>
            <input
              type="radio"
              name="theme"
              value={pack.id}
              checked={preferences.themeId === pack.id}
              onChange={() => void onUpdatePreferences({ themeId: pack.id })}
            />
          </label>
        ))}
      </fieldset>

      <div className="context-panel__group">
        <label className="context-panel__row">
          <span>효과음</span>
          <input
            type="checkbox"
            checked={preferences.soundEnabled}
            onChange={(event) => void onUpdatePreferences({ soundEnabled: event.target.checked })}
          />
        </label>
        <label className="context-panel__volume">
          <span>음량 {Math.round(preferences.volume * 100)}%</span>
          <input
            aria-label="효과음 음량"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={preferences.volume}
            onChange={(event) => void onUpdatePreferences({ volume: Number(event.target.value) })}
          />
        </label>
        <label className="context-panel__row">
          <span>항상 위</span>
          <input
            type="checkbox"
            checked={preferences.alwaysOnTop}
            onChange={(event) => void onUpdatePreferences({ alwaysOnTop: event.target.checked })}
          />
        </label>
      </div>

      <button type="button" className="context-panel__quit" onClick={onQuit}>
        종료
      </button>
    </div>
  )
}
```

Create `src/renderer/src/components/context-panel.css`:

```css
.context-panel {
  position: fixed;
  top: 8px;
  right: 8px;
  z-index: 10;
  width: min(220px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 8px;
  color: #f9f6f2;
  background: rgba(28, 31, 38, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.48);
  -webkit-app-region: no-drag;
  outline: none;
}

.context-panel__provider,
.context-panel__row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 32px;
}

.context-panel__provider {
  border: 0;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.context-panel__provider:hover,
.context-panel button:focus-visible,
.context-panel input:focus-visible {
  outline: 2px solid #7dd3fc;
  outline-offset: 2px;
}

.context-panel__sessions {
  margin: 0;
  padding: 0 8px 8px 20px;
  list-style: none;
}

.context-panel__sessions li,
.context-panel__volume {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 0;
}

.context-panel__group {
  margin: 6px 0 0;
  padding: 6px 0 0;
  border: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.12);
}

.context-panel__quit {
  width: 100%;
  min-height: 32px;
  margin-top: 6px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: #8f3341;
}
```

- [ ] **Step 5: Integrate everything in `App.tsx`**

Replace `src/renderer/src/App.tsx` with:

```tsx
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type MouseEvent
} from 'react'
import { createAudioManager } from './audio/audio-manager'
import { createWebAudioBackend } from './audio/web-audio-backend'
import { ContextPanel } from './components/ContextPanel'
import { usePreferences } from './hooks/use-preferences'
import { useStatusChime } from './hooks/use-status-chime'
import { useCompanionInteraction } from './interaction/use-companion-interaction'
import { MotionScene } from './motion/MotionScene'
import { getCompanionPack } from './motion/registry'
import { FIXTURE_SESSIONS, fixtureSessionsForState } from './session/fixture'
import { createSessionStore } from './session/session-store'

const STATE_LABELS = {
  idle: '쉬는 중',
  working: '작업 중',
  waiting_permission: '확인 필요',
  completed: '완료',
  error: '오류'
} as const

function App(): React.JSX.Element {
  const [sessionStore] = useState(() => createSessionStore(FIXTURE_SESSIONS))
  const snapshot = useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getSnapshot
  )
  const { preferences, updatePreferences } = usePreferences()
  const pack = getCompanionPack(preferences.themeId)
  const audio = useMemo(
    () => createAudioManager(createWebAudioBackend()),
    []
  )
  const [contextOpen, setContextOpen] = useState(false)

  useEffect(() => {
    audio.setPreferences({
      soundEnabled: preferences.soundEnabled,
      volume: preferences.volume
    })
    void audio.preload(Object.values(pack.sounds).flat())
  }, [audio, pack, preferences.soundEnabled, preferences.volume])

  useEffect(() => {
    const expiry = sessionStore.getNextExpiryAt()
    if (expiry === null) return undefined
    const timer = window.setTimeout(
      () => sessionStore.refresh(),
      Math.max(0, expiry - Date.now())
    )
    return () => window.clearTimeout(timer)
  }, [sessionStore, snapshot])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined
    const states = {
      Digit1: 'idle',
      Digit2: 'working',
      Digit3: 'waiting_permission',
      Digit4: 'completed',
      Digit5: 'error'
    } as const
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.altKey) return
      const state = states[event.code as keyof typeof states]
      if (state) sessionStore.replace(fixtureSessionsForState(state))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sessionStore])

  const playInteraction = useCallback(
    (urls: readonly string[]) => audio.playInteraction(urls),
    [audio]
  )
  const playStatus = useCallback(
    (kind: 'waiting_permission' | 'completed' | 'error') => audio.playStatus(kind),
    [audio]
  )

  useStatusChime(snapshot, playStatus)

  const { interactionToken, pointerHandlers } = useCompanionInteraction({
    state: snapshot.representativeState,
    pack,
    playInteraction
  })

  const openContextPanel = (event: MouseEvent<HTMLElement>): void => {
    event.preventDefault()
    setContextOpen(true)
  }

  return (
<main
  className="companion"
  aria-label={`코드멍 ${pack.label}`}
  onContextMenu={openContextPanel}
  {...pointerHandlers}
>
  <MotionScene
    packId={pack.id}
    state={snapshot.representativeState}
    interactionToken={interactionToken}
  />
  <ContextPanel
    open={contextOpen}
    snapshot={snapshot}
    preferences={preferences}
    onUpdatePreferences={updatePreferences}
    onClose={() => setContextOpen(false)}
    onQuit={() => window.codemung.quitApp()}
  />
  <p className="sr-only" aria-live="polite">
    현재 대표 상태: {STATE_LABELS[snapshot.representativeState]}
  </p>
</main>
  )
}

export default App
```

- [ ] **Step 6: Run focused and full verification**

Run:

```bash
npm test -- src/renderer/src/components/ContextPanel.test.tsx
npm test -- src/renderer/src/hooks/use-status-chime.test.tsx
npm test
npm run typecheck
npm run build
```

Expected: context-panel and status-chime tests PASS; full suite PASS; typecheck and build exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/session/fixture.ts src/renderer/src/hooks src/renderer/src/components src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat: add companion context panel"
```

---

### Task 9: Accessibility, Manual Electron Verification, and Documentation

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: all completed modules.
- Produces: verified MVP interaction slice and current project documentation.

- [ ] **Step 1: Restore focus to the companion after closing the panel**

In `App.tsx`, add:

```tsx
const companionRef = useRef<HTMLElement>(null)

const closeContextPanel = (): void => {
  setContextOpen(false)
  requestAnimationFrame(() => companionRef.current?.focus())
}
```

Add `useRef` to the React import, then update the root and panel:

```tsx
<main
  ref={companionRef}
  tabIndex={-1}
  className="companion"
  aria-label={`코드멍 ${pack.label}`}
  onContextMenu={openContextPanel}
  {...pointerHandlers}
>
  <MotionScene
    packId={pack.id}
    state={snapshot.representativeState}
    interactionToken={interactionToken}
  />
  <ContextPanel
    open={contextOpen}
    snapshot={snapshot}
    preferences={preferences}
    onUpdatePreferences={updatePreferences}
    onClose={closeContextPanel}
    onQuit={() => window.codemung.quitApp()}
  />
</main>
```

Keep `role="dialog"`, `aria-label="CodeMung 상태 및 설정"`, panel autofocus, visible `:focus-visible` outlines, and the screen-reader live region from Task 8.

- [ ] **Step 2: Update README status**

Move these items into “current prototype includes”:

- Draggable and square-resizable companion window.
- Lava and water companion packs.
- State-aware click reactions.
- Theme interaction sounds and important-state UI chimes.
- Active-provider context panel backed by fixtures.
- Persisted theme, volume, mute, always-on-top, position, and size.

Keep real Claude/Codex events, usage data, and hook installation under planned work.

- [ ] **Step 3: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected: all tests PASS; typecheck, build, and diff check exit 0.

- [ ] **Step 4: Run the Electron smoke checklist**

Run:

```bash
npm run dev
```

Verify on macOS:

1. Press and release without moving: state reaction and one organic click sound.
2. Move 4px: click behavior remains.
3. Move 5px or more: window moves and click reaction/sound do not run.
4. Resize from each edge/corner: width equals height and remains within 180–480px.
5. Move partly beyond a display, restart, and confirm the full window returns inside a work area.
6. Switch lava/water: current state and bounds stay unchanged.
7. Right-click: C-layout panel opens; active Provider count and project disclosure are correct.
8. Mute and set 30% volume; restart and confirm persistence.
9. Press `⌥3`, `⌥4`, and `⌥5`; confirm waiting, completed, and error each play one matching UI chime.
10. Enable macOS Reduce Motion; confirm continuous and click motion are reduced.
11. Hide/show from tray and confirm the app stays alive.

Stop the dev process with `Ctrl-C`.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/App.tsx README.md
git commit -m "docs: update companion feature status"
```

---

## Final Verification Gate

Before merge or push:

```bash
npm test
npm run typecheck
npm run build
git diff --check
git status --short
```

Required result:

- Test suite reports zero failures.
- TypeScript reports zero errors.
- electron-vite production build exits 0.
- `git diff --check` prints nothing.
- `git status --short` prints nothing after the final commit.
