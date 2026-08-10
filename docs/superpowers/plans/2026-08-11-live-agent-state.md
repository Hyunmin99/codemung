# Live Agent State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 실제 Claude Code와 Codex의 hook 이벤트가 companion 화면의 불멍 모션을 바꾸도록 수직 슬라이스를 끝까지 연결한다.

**Architecture:** hook bridge 스크립트가 stdin으로 받은 hook payload에서 세 필드(`session_id`, `hook_event_name`, `cwd`)만 뽑아 기존 loopback event server로 POST한다. main process의 session store가 세션별 상태를 보관하고 Provider별·대표 상태를 계산해 IPC로 renderer에 밀어준다. renderer는 우선순위 계산을 다시 하지 않고 받은 snapshot을 그대로 그린다.

**Tech Stack:** Electron 40 + electron-vite, React 19, TypeScript, `node:test` (테스트 러너), Node 내장 모듈만 사용

## Global Constraints

- 새 npm 의존성을 추가하지 않는다. Node 내장 모듈과 이미 설치된 패키지만 사용한다.
- 코드 스타일은 기존 파일을 따른다: 세미콜론 없음, 작은따옴표, 2-space 들여쓰기, 100열.
- 주석은 "무엇"이 아니라 "왜"를 설명하고, 꼭 필요한 곳에만 영어 한 문장으로 쓴다 (기존 `src/main/event-server.ts` 참고).
- 사용자에게 보이는 문자열은 한국어로 쓴다.
- 프롬프트, 응답, 도구 입력·출력 본문은 어떤 계층에도 저장하거나 전달하지 않는다.
- 프로젝트 표시는 전체 경로가 아니라 디렉터리 이름만 쓴다.
- renderer의 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`를 유지한다. preload에는 필요한 최소 API만 노출한다.
- hook bridge는 어떤 실패에서도 stdout에 아무것도 쓰지 않고 exit code 0으로 끝난다. Claude와 Codex는 hook의 stdout을 제어 JSON으로 파싱하므로, stdout 오염은 AI 작업을 망가뜨린다.
- 테스트 명령은 `npm test`다. 이 명령은 `npm run build`(typecheck + electron-vite build)를 먼저 돌린 뒤 `node --test tests/*.test.mjs`를 실행한다. 테스트는 `out/`에 빌드된 산출물을 import한다.
- 커밋 메시지는 Conventional Commits를 쓴다 (`feat:`, `test:`, `docs:`).

## 범위 밖 (다음 플랜)

- hook 설정 자동 설치 도구 (dry-run, 기존 설정 병합, 백업, 제거) — MVP 슬라이스 5
- 우클릭 상태·설정 패널과 Provider 배지 UI — `docs/superpowers/plans/2026-07-24-companion-interactions.md`
- JSONL fallback과 앱 재시작 후 세션 복구 — MVP 슬라이스 7

## File Structure

| 파일 | 책임 |
|---|---|
| `src/main/event-server.ts` (수정) | `PROVIDERS` 배열을 export만 추가. 나머지는 그대로 |
| `src/main/session-store.ts` (신규) | 세션별 상태 보관, Provider별·대표 상태 계산, `completed` 유지 타이머. Electron에 의존하지 않는 순수 모듈 |
| `src/main/hook-bridge.ts` (신규) | 독립 실행 스크립트. hook payload → `ProviderEvent` 정규화 후 loopback 서버로 POST |
| `src/main/index.ts` (수정) | store 생성, 이벤트 주입, snapshot IPC 브로드캐스트 |
| `src/preload/index.ts` (수정) | `getSessionSnapshot`, `onSessionSnapshot` 노출 |
| `src/preload/index.d.ts` (수정) | 위 두 API와 snapshot 타입 선언 |
| `src/renderer/src/useSessionSnapshot.ts` (신규) | snapshot 구독 React hook |
| `src/renderer/src/App.tsx` (수정) | 하드코딩 상태 제거, snapshot 사용. 설정 창의 미리보기는 미리보기 전용으로 분리 |
| `scripts/send-event.mjs` (신규) | 개발용 이벤트 전송 CLI. 수동 검증에 사용 |
| `tests/session-store.test.mjs` (신규) | store 단위 테스트 |
| `tests/hook-bridge.test.mjs` (신규) | 정규화 단위 테스트 + 실제 spawn 통합 테스트 |
| `docs/hook-setup.md` (신규) | Claude/Codex hook 수동 연결 절차 |

## 공통 타입 계약

전 태스크가 공유하는 타입이다. Task 1에서 정의하고 이후 태스크는 이 이름 그대로 쓴다.

```ts
// src/main/event-server.ts 에서 이미 export 중
type Provider = 'claude' | 'codex'
type EventKind =
  | 'session_started' | 'activity' | 'permission_requested'
  | 'completed' | 'failed' | 'session_ended'
interface ProviderEvent {
  provider: Provider
  sessionId: string
  kind: EventKind
  project?: string
  occurredAt: number
}

// src/main/session-store.ts 에서 새로 정의
type AgentState = 'idle' | 'working' | 'waiting_permission' | 'completed' | 'error'
interface ProviderSnapshot {
  state: AgentState
  activeSessionCount: number
  project?: string
}
interface SessionSnapshot {
  providers: Record<Provider, ProviderSnapshot>
  representativeState: AgentState
  updatedAt: number
}
```

---

### Task 1: Session store

세션별 상태를 보관하고 Provider별·대표 상태를 계산하는 순수 모듈. Electron을 import하지 않으므로 `node:test`로 직접 검증할 수 있다.

**Files:**
- Modify: `src/main/event-server.ts:16`
- Create: `src/main/session-store.ts`
- Test: `tests/session-store.test.mjs`

**Interfaces:**
- Consumes: `Provider`, `EventKind`, `ProviderEvent` from `./event-server`
- Produces:
  - `export const PROVIDERS: readonly Provider[]` (event-server에서 export)
  - `createSessionStore(options: SessionStoreOptions): SessionStore`
  - `SessionStore = { apply(event: ProviderEvent): void; getSnapshot(): SessionSnapshot; dispose(): void }`
  - `SessionStoreOptions = { onChange: (snapshot: SessionSnapshot) => void; completedHoldMs?: number; now?: () => number; schedule?: (callback: () => void, delayMs: number) => () => void }`
  - 타입 `AgentState`, `ProviderSnapshot`, `SessionSnapshot`

- [ ] **Step 1: `PROVIDERS`를 export로 바꾼다**

`src/main/event-server.ts:16`을 수정한다. 현재:

```ts
const PROVIDERS = ['claude', 'codex'] as const
```

수정 후:

```ts
export const PROVIDERS = ['claude', 'codex'] as const
```

다른 줄은 건드리지 않는다.

- [ ] **Step 2: 실패하는 테스트를 작성한다**

`tests/session-store.test.mjs`를 새로 만든다.

```js
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
```

- [ ] **Step 3: 테스트가 실패하는지 확인한다**

Run: `npm test`
Expected: FAIL. `out/main/session-store.js`가 없어서 import가 `ERR_MODULE_NOT_FOUND`로 죽는다.

- [ ] **Step 4: session store를 구현한다**

`src/main/session-store.ts`를 새로 만든다.

```ts
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
```

- [ ] **Step 5: 빌드 진입점에 session store를 추가한다**

`electron.vite.config.ts`의 `main.build.rollupOptions.input`에 한 줄을 추가한다. 현재:

```ts
        input: {
          index: resolve('src/main/index.ts'),
          'event-server': resolve('src/main/event-server.ts')
        }
```

수정 후:

```ts
        input: {
          index: resolve('src/main/index.ts'),
          'event-server': resolve('src/main/event-server.ts'),
          'session-store': resolve('src/main/session-store.ts')
        }
```

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `npm test`
Expected: PASS. `tests/session-store.test.mjs`의 9개 테스트가 모두 통과하고, 기존 `tests/event-server.test.mjs`도 계속 통과한다.

- [ ] **Step 7: 커밋한다**

```bash
git add src/main/session-store.ts src/main/event-server.ts electron.vite.config.ts tests/session-store.test.mjs && git commit -m "feat: add multi-session state store for provider events"
```

---

### Task 2: Store를 main process에 연결하고 snapshot을 브로드캐스트한다

event server가 받은 이벤트를 store에 넣고, 바뀐 snapshot을 열려 있는 모든 창에 보낸다. 개발용 이벤트 전송 CLI로 육안 검증한다.

**Files:**
- Modify: `src/main/index.ts:13`, `src/main/index.ts:111-116`, `src/main/index.ts:285-318`
- Create: `scripts/send-event.mjs`
- Modify: `package.json` (scripts 항목)

**Interfaces:**
- Consumes: `createSessionStore`, `SessionSnapshot`, `SessionStore` from `./session-store`
- Produces:
  - IPC 채널 문자열 `'session:get-snapshot'` (invoke), `'session:snapshot'` (send). Task 3의 preload가 같은 문자열을 쓴다.
  - `npm run send-event -- <provider> <kind> [sessionId]`

- [ ] **Step 1: main process에 store를 연결한다**

`src/main/index.ts:13`의 import 아래에 store import를 추가한다. 현재:

```ts
import { startEventServer, type EventServer, type ProviderEvent } from './event-server'
```

수정 후:

```ts
import { startEventServer, type EventServer, type ProviderEvent } from './event-server'
import { createSessionStore, type SessionSnapshot, type SessionStore } from './session-store'
```

`src/main/index.ts:15-19`의 상수 블록에 두 채널을 추가한다. 현재:

```ts
const APP_INFO_CHANNEL = 'app:get-info'
const ALWAYS_ON_TOP_CHANNEL = 'window:set-always-on-top'
```

수정 후:

```ts
const APP_INFO_CHANNEL = 'app:get-info'
const ALWAYS_ON_TOP_CHANNEL = 'window:set-always-on-top'
const SESSION_SNAPSHOT_CHANNEL = 'session:snapshot'
const SESSION_GET_SNAPSHOT_CHANNEL = 'session:get-snapshot'
```

`src/main/index.ts:34`의 `let eventServer` 선언 아래에 store 변수를 추가한다.

```ts
let sessionStore: SessionStore | null = null
```

- [ ] **Step 2: `handleProviderEvent`를 store에 위임하도록 바꾼다**

`src/main/index.ts:111-116`을 통째로 교체한다. 현재:

```ts
function handleProviderEvent(event: ProviderEvent): void {
  // The session store arrives in the next slice, so events are only observable in development.
  if (!app.isPackaged) {
    console.log('[codemung] event', event.provider, event.kind, event.sessionId, event.project ?? '')
  }
}
```

수정 후:

```ts
function broadcastSnapshot(snapshot: SessionSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(SESSION_SNAPSHOT_CHANNEL, snapshot)
  }

  if (!app.isPackaged) {
    console.log(
      '[codemung] snapshot',
      snapshot.representativeState,
      `claude=${snapshot.providers.claude.state}`,
      `codex=${snapshot.providers.codex.state}`
    )
  }
}

function handleProviderEvent(event: ProviderEvent): void {
  sessionStore?.apply(event)
}
```

- [ ] **Step 3: 앱 준비 시점에 store를 만들고 IPC 핸들러를 등록한다**

`src/main/index.ts`의 `app.whenReady()` 블록에서 `ipcMain.handle(ALWAYS_ON_TOP_CHANNEL, ...)` 호출 바로 다음, `mainWindow = createWindow()` 바로 앞에 다음을 넣는다.

```ts
    ipcMain.handle(SESSION_GET_SNAPSHOT_CHANNEL, () => sessionStore?.getSnapshot() ?? null)
    sessionStore = createSessionStore({ onChange: broadcastSnapshot })
```

`app.on('before-quit', ...)` 블록의 `eventServer = null` 다음 줄에 정리 코드를 넣는다.

```ts
    sessionStore?.dispose()
    sessionStore = null
```

- [ ] **Step 4: 개발용 이벤트 전송 CLI를 만든다**

`scripts/send-event.mjs`를 새로 만든다.

```js
#!/usr/bin/env node
// Sends one provider event to the running companion so that state changes can be
// checked without a real Claude or Codex session.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [provider = 'claude', kind = 'activity', sessionId = 'dev-session'] = process.argv.slice(2)
const runtimeFilePath =
  process.env.CODEMUNG_RUNTIME_FILE ??
  join(homedir(), 'Library', 'Application Support', 'codemung', 'event-server.json')

let runtime

try {
  runtime = JSON.parse(readFileSync(runtimeFilePath, 'utf8'))
} catch {
  console.error(`런타임 파일을 읽을 수 없습니다: ${runtimeFilePath}`)
  console.error('companion이 실행 중인지 확인하세요.')
  process.exit(1)
}

const response = await fetch(`http://127.0.0.1:${runtime.port}/events`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${runtime.token}`
  },
  body: JSON.stringify({ provider, kind, sessionId, cwd: process.cwd(), occurredAt: Date.now() })
})

console.log(`${provider} ${kind} ${sessionId} → HTTP ${response.status}`)
```

`package.json`의 `scripts`에 항목을 추가한다.

```json
    "send-event": "node scripts/send-event.mjs",
```

`"preview"` 다음 줄에 넣는다.

- [ ] **Step 5: 타입 검사와 빌드를 확인한다**

Run: `npm test`
Expected: PASS. typecheck와 build가 통과하고 기존 테스트가 모두 통과한다.

- [ ] **Step 6: 실행해서 육안으로 확인한다**

터미널 A:

```bash
npm run dev
```

터미널 B — 다음을 순서대로 실행하며 터미널 A의 로그를 본다.

```bash
npm run send-event -- claude activity s1
```

Expected: 터미널 A에 `[codemung] snapshot working claude=working codex=idle`가 찍힌다.

```bash
npm run send-event -- codex permission_requested s2
```

Expected: `[codemung] snapshot waiting_permission claude=working codex=waiting_permission`

```bash
npm run send-event -- codex completed s2
```

Expected: 즉시 `codex=completed`가 찍히고, 약 4초 뒤 `codex=idle` 스냅샷이 한 번 더 찍힌다.

화면은 아직 하드코딩 상태로 도니까 바뀌지 않는다. Task 3에서 연결한다.

- [ ] **Step 7: 커밋한다**

```bash
git add src/main/index.ts scripts/send-event.mjs package.json && git commit -m "feat: feed provider events into the session store and broadcast snapshots"
```

---

### Task 3: renderer가 실제 상태를 그린다

preload로 snapshot을 노출하고, `App.tsx`의 하드코딩된 `INITIAL_AGENTS`와 `previewState` 반영을 실제 snapshot으로 교체한다. 설정 창의 "상태 미리보기"는 설정 창 미리보기에만 적용되도록 의미를 분리한다.

**Files:**
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`
- Create: `src/renderer/src/useSessionSnapshot.ts`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: IPC 채널 `'session:get-snapshot'`, `'session:snapshot'` (Task 2에서 정의)
- Produces:
  - `window.codemung.getSessionSnapshot(): Promise<CodeMungSessionSnapshot | null>`
  - `window.codemung.onSessionSnapshot(listener): () => void` — 구독 해제 함수를 돌려준다
  - `useSessionSnapshot(): CodeMungSessionSnapshot | null`

- [ ] **Step 1: preload에 snapshot API를 추가한다**

`src/preload/index.ts` 전체를 다음으로 교체한다.

```ts
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const APP_INFO_CHANNEL = 'app:get-info'
const ALWAYS_ON_TOP_CHANNEL = 'window:set-always-on-top'
const SESSION_SNAPSHOT_CHANNEL = 'session:snapshot'
const SESSION_GET_SNAPSHOT_CHANNEL = 'session:get-snapshot'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

contextBridge.exposeInMainWorld('codemung', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(APP_INFO_CHANNEL),
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ALWAYS_ON_TOP_CHANNEL, enabled),
  getSessionSnapshot: (): Promise<CodeMungSessionSnapshot | null> =>
    ipcRenderer.invoke(SESSION_GET_SNAPSHOT_CHANNEL),
  onSessionSnapshot: (listener: (snapshot: CodeMungSessionSnapshot) => void): (() => void) => {
    // The raw IpcRendererEvent is never handed to the renderer because it exposes senders.
    const handler = (_event: IpcRendererEvent, snapshot: CodeMungSessionSnapshot): void =>
      listener(snapshot)

    ipcRenderer.on(SESSION_SNAPSHOT_CHANNEL, handler)

    return () => {
      ipcRenderer.removeListener(SESSION_SNAPSHOT_CHANNEL, handler)
    }
  }
})
```

- [ ] **Step 2: 전역 타입 선언을 갱신한다**

`src/preload/index.d.ts` 전체를 다음으로 교체한다.

```ts
declare global {
  interface CodeMungAppInfo {
    name: string
    version: string
    platform: string
  }

  type CodeMungAgentState = 'idle' | 'working' | 'waiting_permission' | 'completed' | 'error'

  interface CodeMungProviderSnapshot {
    state: CodeMungAgentState
    activeSessionCount: number
    project?: string
  }

  interface CodeMungSessionSnapshot {
    providers: Record<'claude' | 'codex', CodeMungProviderSnapshot>
    representativeState: CodeMungAgentState
    updatedAt: number
  }

  interface CodeMungApi {
    getAppInfo: () => Promise<CodeMungAppInfo>
    setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
    getSessionSnapshot: () => Promise<CodeMungSessionSnapshot | null>
    onSessionSnapshot: (listener: (snapshot: CodeMungSessionSnapshot) => void) => () => void
  }

  interface Window {
    codemung: CodeMungApi
  }
}

export {}
```

- [ ] **Step 3: snapshot 구독 hook을 만든다**

`src/renderer/src/useSessionSnapshot.ts`를 새로 만든다.

```ts
import { useEffect, useState } from 'react'

export function useSessionSnapshot(): CodeMungSessionSnapshot | null {
  const [snapshot, setSnapshot] = useState<CodeMungSessionSnapshot | null>(null)

  useEffect(() => {
    let isMounted = true

    void window.codemung?.getSessionSnapshot().then((initial) => {
      // A pushed snapshot may already have arrived, so the initial read never overwrites it.
      if (isMounted && initial) setSnapshot((current) => current ?? initial)
    })

    const unsubscribe = window.codemung?.onSessionSnapshot(setSnapshot)

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [])

  return snapshot
}
```

- [ ] **Step 4: `App.tsx`가 snapshot을 쓰게 한다**

`src/renderer/src/App.tsx:1-3`의 import에 hook을 추가한다. 현재:

```ts
import { useEffect, useMemo, useState } from 'react'
import { MotionScene } from './motion/MotionScene'
import type { AgentState } from './motion/types'
```

수정 후:

```ts
import { useEffect, useMemo, useState } from 'react'
import { MotionScene } from './motion/MotionScene'
import type { AgentState } from './motion/types'
import { useSessionSnapshot } from './useSessionSnapshot'
```

`src/renderer/src/App.tsx:44-47`의 `INITIAL_AGENTS`를 상태 없는 정의로 바꾼다. 현재:

```ts
const INITIAL_AGENTS: Agent[] = [
  { id: 'claude', name: 'Claude', state: 'idle' },
  { id: 'codex', name: 'Codex', state: 'working' }
]
```

수정 후:

```ts
const AGENT_DEFINITIONS: readonly { id: Agent['id']; name: string }[] = [
  { id: 'claude', name: 'Claude' },
  { id: 'codex', name: 'Codex' }
]
```

`src/renderer/src/App.tsx:219-229`의 `App` 함수 앞부분을 교체한다. 현재:

```ts
function App(): React.JSX.Element {
  const isSettingsWindow = window.location.hash === '#settings'
  const [settings, setSettings] = useState(readStoredSettings)
  const [appInfo, setAppInfo] = useState<CodeMungAppInfo | null>(null)
  const agents = useMemo(
    () => INITIAL_AGENTS
      .map((agent) => agent.id === 'codex' ? { ...agent, state: settings.previewState } : agent)
      .filter((agent) => settings.visibleAgents[agent.id]),
    [settings.previewState, settings.visibleAgents]
  )
  const representativeState = getRepresentativeState(agents)
```

수정 후:

```ts
function App(): React.JSX.Element {
  const isSettingsWindow = window.location.hash === '#settings'
  const [settings, setSettings] = useState(readStoredSettings)
  const [appInfo, setAppInfo] = useState<CodeMungAppInfo | null>(null)
  const snapshot = useSessionSnapshot()
  // Hidden agents must not drive the scene, so the priority is recomputed over the visible ones.
  const agents = useMemo<Agent[]>(
    () =>
      AGENT_DEFINITIONS
        .filter((agent) => settings.visibleAgents[agent.id])
        .map((agent) => ({ ...agent, state: snapshot?.providers[agent.id].state ?? 'idle' })),
    [snapshot, settings.visibleAgents]
  )
  const representativeState = getRepresentativeState(agents)
```

- [ ] **Step 5: 설정 창의 미리보기를 미리보기 전용으로 분리한다**

`src/renderer/src/App.tsx`의 `SettingsScreen` 안에서 미리보기 장면이 `representativeState` 대신 `settings.previewState`를 쓰게 바꾼다. 현재 (`src/renderer/src/App.tsx:134`):

```tsx
          <MotionScene pack="lava" state={representativeState} reduceMotion={settings.reduceMotion} />
```

수정 후:

```tsx
          <MotionScene pack="lava" state={settings.previewState} reduceMotion={settings.reduceMotion} />
```

같은 섹션의 안내 문구를 실제 상태와 미리보기 상태가 구분되게 바꾼다. 현재 (`src/renderer/src/App.tsx:136-139`):

```tsx
        <div>
          <strong>{agents.length === 0 ? '표시할 에이전트 없음' : `${agents.length}개 에이전트 표시`}</strong>
          <p>현재 상태: {STATE_LABELS[representativeState]}</p>
        </div>
```

수정 후:

```tsx
        <div>
          <strong>{agents.length === 0 ? '표시할 에이전트 없음' : `${agents.length}개 에이전트 표시`}</strong>
          <p>companion 상태: {STATE_LABELS[representativeState]}</p>
          <p>미리보기 상태: {STATE_LABELS[settings.previewState]}</p>
        </div>
```

미리보기 설명 문구도 실제 동작에 맞춘다. 현재 (`src/renderer/src/App.tsx:169-170`):

```tsx
              <strong>상태 미리보기</strong>
              <small>Codex 상태를 화면에 반영합니다</small>
```

수정 후:

```tsx
              <strong>상태 미리보기</strong>
              <small>이 설정 창의 미리보기에만 적용됩니다</small>
```

- [ ] **Step 6: 타입 검사와 빌드를 확인한다**

Run: `npm test`
Expected: PASS. `INITIAL_AGENTS`를 지웠으니 미사용 심볼 오류가 없어야 하고, typecheck가 통과해야 한다.

- [ ] **Step 7: 실행해서 화면이 바뀌는지 확인한다**

터미널 A:

```bash
npm run dev
```

터미널 B에서 하나씩 실행하며 companion 창을 본다.

```bash
npm run send-event -- claude activity s1
```

Expected: 용암이 빨라지고 밝아진다 (working).

```bash
npm run send-event -- claude permission_requested s1
```

Expected: 용암이 느려지면서 가장 밝아진다 (waiting_permission).

```bash
npm run send-event -- claude completed s1
```

Expected: 완료 모션이 나오고 약 4초 뒤 idle로 가라앉는다.

```bash
npm run send-event -- claude session_ended s1
```

Expected: idle 유지.

설정 창(트레이 → 설정…)을 열고 "상태 미리보기"를 바꿔본다.
Expected: 설정 창 미리보기만 바뀌고 companion 창은 영향을 받지 않는다.

- [ ] **Step 8: 커밋한다**

```bash
git add src/preload src/renderer/src/useSessionSnapshot.ts src/renderer/src/App.tsx && git commit -m "feat: drive the companion scene from live session snapshots"
```

---

### Task 4: Hook bridge 스크립트

Claude Code와 Codex는 stdin으로 같은 모양의 JSON(`session_id`, `hook_event_name`, `cwd`)을 넘기므로 스크립트 하나로 둘 다 처리한다. Provider는 argv로 받는다.

**Files:**
- Create: `src/main/hook-bridge.ts`
- Modify: `electron.vite.config.ts`
- Test: `tests/hook-bridge.test.mjs`

**Interfaces:**
- Consumes: `EventKind`, `Provider` from `./event-server` (타입만)
- Produces:
  - 실행 형태: `node <repo>/out/main/hook-bridge.js <claude|codex>` (hook payload는 stdin)
  - `buildEventPayload(provider: Provider, hookPayload: unknown, occurredAt?: number): { provider: Provider; sessionId: string; kind: EventKind; cwd?: string; occurredAt: number } | null`
  - `getRuntimeFilePath(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, home?: string): string`
  - 환경변수 `CODEMUNG_RUNTIME_FILE`로 런타임 파일 경로를 덮어쓸 수 있다

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`tests/hook-bridge.test.mjs`를 새로 만든다.

```js
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const bridgePath = join(repositoryRoot, 'out/main/hook-bridge.js')
const { buildEventPayload, getRuntimeFilePath } = await import(bridgePath)

function hookPayload(overrides) {
  return {
    session_id: 'abc-123',
    hook_event_name: 'UserPromptSubmit',
    cwd: '/Users/someone/Projects/codemung',
    ...overrides
  }
}

// Runs the bridge exactly the way Claude and Codex run it: argv provider, JSON on stdin.
function runBridge(provider, payload, environment = {}) {
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(process.execPath, [bridgePath, provider], {
      env: { ...process.env, ...environment },
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('close', (code) => {
      resolve({ code, stdout, stderr, durationMs: Date.now() - startedAt })
    })

    child.stdin.end(typeof payload === 'string' ? payload : JSON.stringify(payload))
  })
}

async function withStubServer(run) {
  const requests = []
  const server = createServer((request, response) => {
    const chunks = []

    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => {
      requests.push({
        url: request.url,
        authorization: request.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString('utf8'))
      })
      response.statusCode = 204
      response.end()
    })
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

  const directory = await mkdtemp(join(tmpdir(), 'codemung-bridge-'))
  const runtimeFilePath = join(directory, 'event-server.json')

  writeFileSync(
    runtimeFilePath,
    JSON.stringify({ port: server.address().port, token: 'test-token', pid: process.pid })
  )

  try {
    await run({ requests, runtimeFilePath })
  } finally {
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
}

test('each supported hook event maps to an event kind', () => {
  const cases = [
    ['SessionStart', 'session_started'],
    ['UserPromptSubmit', 'activity'],
    ['PermissionRequest', 'permission_requested'],
    ['Stop', 'completed'],
    ['SessionEnd', 'session_ended']
  ]

  for (const [hookEventName, kind] of cases) {
    const event = buildEventPayload('claude', hookPayload({ hook_event_name: hookEventName }), 500)

    assert.equal(event.kind, kind)
    assert.equal(event.provider, 'claude')
    assert.equal(event.sessionId, 'abc-123')
    assert.equal(event.occurredAt, 500)
  }
})

test('unsupported and malformed payloads produce no event', () => {
  assert.equal(buildEventPayload('claude', hookPayload({ hook_event_name: 'PreToolUse' })), null)
  assert.equal(buildEventPayload('claude', hookPayload({ hook_event_name: 'SubagentStop' })), null)
  assert.equal(buildEventPayload('claude', hookPayload({ session_id: '' })), null)
  assert.equal(buildEventPayload('claude', null), null)
  assert.equal(buildEventPayload('claude', []), null)
})

test('prompts, transcripts, and tool bodies are dropped', () => {
  const event = buildEventPayload(
    'codex',
    hookPayload({
      prompt: 'secret prompt text',
      transcript_path: '/Users/someone/.codex/sessions/abc.jsonl',
      tool_input: { command: 'rm -rf /' },
      last_assistant_message: 'secret answer'
    })
  )

  assert.deepEqual(Object.keys(event).sort(), ['cwd', 'kind', 'occurredAt', 'provider', 'sessionId'])
})

test('the runtime file path follows the macOS application support location', () => {
  const path = getRuntimeFilePath({}, 'darwin', '/Users/someone')

  assert.equal(path, '/Users/someone/Library/Application Support/codemung/event-server.json')
})

test('the runtime file path can be overridden by the environment', () => {
  const path = getRuntimeFilePath({ CODEMUNG_RUNTIME_FILE: '/tmp/x.json' }, 'darwin', '/Users/someone')

  assert.equal(path, '/tmp/x.json')
})

test('a real invocation posts a filtered event and writes nothing to stdout', async () => {
  await withStubServer(async ({ requests, runtimeFilePath }) => {
    const result = await runBridge('claude', hookPayload({ hook_event_name: 'Stop' }), {
      CODEMUNG_RUNTIME_FILE: runtimeFilePath
    })

    assert.equal(result.code, 0)
    assert.equal(result.stdout, '')
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/events')
    assert.equal(requests[0].authorization, 'Bearer test-token')
    assert.equal(requests[0].body.kind, 'completed')
    assert.equal(requests[0].body.provider, 'claude')
    assert.equal(requests[0].body.cwd, '/Users/someone/Projects/codemung')
  })
})

test('an unknown provider argument sends nothing', async () => {
  await withStubServer(async ({ requests, runtimeFilePath }) => {
    const result = await runBridge('gemini', hookPayload(), {
      CODEMUNG_RUNTIME_FILE: runtimeFilePath
    })

    assert.equal(result.code, 0)
    assert.equal(requests.length, 0)
  })
})

test('a missing runtime file exits cleanly and quickly', async () => {
  const result = await runBridge('claude', hookPayload(), {
    CODEMUNG_RUNTIME_FILE: join(tmpdir(), 'codemung-missing', 'event-server.json')
  })

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '')
  // Node's own startup dominates here; the bridge itself must add no waiting.
  assert.ok(result.durationMs < 500, `took ${result.durationMs}ms`)
})

test('invalid JSON on stdin exits cleanly', async () => {
  const result = await runBridge('claude', 'not json at all')

  assert.equal(result.code, 0)
  assert.equal(result.stdout, '')
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test`
Expected: FAIL. `out/main/hook-bridge.js`가 없어서 import가 `ERR_MODULE_NOT_FOUND`로 죽는다.

- [ ] **Step 3: hook bridge를 구현한다**

`src/main/hook-bridge.ts`를 새로 만든다.

```ts
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { EventKind, Provider } from './event-server'

const APP_DIRECTORY_NAME = 'codemung'
const RUNTIME_FILENAME = 'event-server.json'
const REQUEST_TIMEOUT_MS = 200
// A hook that never receives an end-of-stdin must still exit, or the AI session stalls.
const WATCHDOG_TIMEOUT_MS = 1000
const MAX_STDIN_BYTES = 1_048_576

// Only the events that change what the companion shows are forwarded. PreToolUse and
// SubagentStop fire constantly and would either add latency or fake a completion.
const HOOK_EVENT_KINDS: Record<string, EventKind> = {
  SessionStart: 'session_started',
  UserPromptSubmit: 'activity',
  PermissionRequest: 'permission_requested',
  Stop: 'completed',
  SessionEnd: 'session_ended'
}

export interface BridgeEvent {
  provider: Provider
  sessionId: string
  kind: EventKind
  cwd?: string
  occurredAt: number
}

export function getRuntimeFilePath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir()
): string {
  const override = env.CODEMUNG_RUNTIME_FILE

  if (typeof override === 'string' && override.length > 0) return override

  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', APP_DIRECTORY_NAME, RUNTIME_FILENAME)
  }

  if (platform === 'win32') {
    return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), APP_DIRECTORY_NAME, RUNTIME_FILENAME)
  }

  return join(env.XDG_CONFIG_HOME ?? join(home, '.config'), APP_DIRECTORY_NAME, RUNTIME_FILENAME)
}

export function buildEventPayload(
  provider: Provider,
  hookPayload: unknown,
  occurredAt: number = Date.now()
): BridgeEvent | null {
  if (!hookPayload || typeof hookPayload !== 'object' || Array.isArray(hookPayload)) return null

  const raw = hookPayload as Record<string, unknown>
  const kind = typeof raw.hook_event_name === 'string' ? HOOK_EVENT_KINDS[raw.hook_event_name] : undefined

  if (!kind) return null
  if (typeof raw.session_id !== 'string' || raw.session_id.length === 0) return null

  // The event is rebuilt field by field so that prompts, transcripts, and tool bodies never leave the hook.
  return {
    provider,
    sessionId: raw.session_id,
    kind,
    ...(typeof raw.cwd === 'string' && raw.cwd.length > 0 ? { cwd: raw.cwd } : {}),
    occurredAt
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0

    process.stdin.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > MAX_STDIN_BYTES) {
        resolve('')
        process.stdin.destroy()
        return
      }

      chunks.push(chunk)
    })
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', () => resolve(''))
  })
}

async function run(): Promise<void> {
  const provider = process.argv[2]

  if (provider !== 'claude' && provider !== 'codex') return

  const body = await readStdin()

  let hookPayload: unknown

  try {
    hookPayload = JSON.parse(body)
  } catch {
    return
  }

  const event = buildEventPayload(provider, hookPayload)

  if (!event) return

  let runtime: unknown

  try {
    runtime = JSON.parse(readFileSync(getRuntimeFilePath(), 'utf8'))
  } catch {
    // The companion is not running, which must never be treated as an error.
    return
  }

  const { port, token } = (runtime ?? {}) as { port?: unknown; token?: unknown }

  if (typeof port !== 'number' || typeof token !== 'string') return

  await fetch(`http://127.0.0.1:${port}/events`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
}

// Importing this module for tests must not execute the script.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const watchdog = setTimeout(() => process.exit(0), WATCHDOG_TIMEOUT_MS)

  watchdog.unref()

  void run()
    .catch(() => {
      // Every failure is silent on purpose: a broken companion must not break the AI session.
    })
    .finally(() => process.exit(0))
}
```

- [ ] **Step 4: 빌드 진입점에 hook bridge를 추가한다**

`electron.vite.config.ts`의 `main.build.rollupOptions.input`을 다음으로 바꾼다.

```ts
        input: {
          index: resolve('src/main/index.ts'),
          'event-server': resolve('src/main/event-server.ts'),
          'session-store': resolve('src/main/session-store.ts'),
          'hook-bridge': resolve('src/main/hook-bridge.ts')
        }
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `npm test`
Expected: PASS. `tests/hook-bridge.test.mjs`의 8개 테스트가 통과한다.

`'a real invocation posts a filtered event...'`가 실패하면서 `requests.length`가 0이라면, 번들러가 `import.meta.url`을 보존하지 않은 것이다. 그때는 진입점 판별을 다음으로 바꾼다.

```ts
import { basename } from 'node:path'
// ...
if (basename(process.argv[1] ?? '') === 'hook-bridge.js') {
```

- [ ] **Step 6: 커밋한다**

```bash
git add src/main/hook-bridge.ts electron.vite.config.ts tests/hook-bridge.test.mjs && git commit -m "feat: add a shared hook bridge for Claude Code and Codex"
```

---

### Task 5: 실제 hook 연결과 문서

수동 연결 절차를 문서로 남기고, 실제 Claude/Codex 세션으로 끝까지 검증한 뒤 README를 현행화한다.

**Files:**
- Create: `docs/hook-setup.md`
- Modify: `README.md:17-22` (기능 목록과 안내 문단), `README.md:99-106` (Roadmap)

**Interfaces:**
- Consumes: `out/main/hook-bridge.js` (Task 4)
- Produces: 없음 (문서만)

- [ ] **Step 1: 연결 문서를 작성한다**

`docs/hook-setup.md`를 새로 만든다. `<REPO>`는 이 저장소의 절대 경로다.

````markdown
# Hook 연결 (수동)

CodeMung은 Claude Code와 Codex의 hook을 통해 상태를 받는다. 자동 설치 도구는 다음 슬라이스에서 만들고, 지금은 사용자 설정 파일을 직접 편집한다.

두 도구 모두 stdin으로 같은 모양의 JSON(`session_id`, `hook_event_name`, `cwd`)을 넘기므로 bridge 스크립트는 하나다. Provider만 인자로 구분한다.

## 사전 준비

```bash
npm run build
```

`out/main/hook-bridge.js`가 만들어져야 한다. 아래 설정에서 `<REPO>`를 이 저장소의 절대 경로로 바꿔 쓴다.

## 설정 백업

전역 설정을 고치므로 먼저 백업한다.

```bash
cp ~/.claude/settings.json ~/.claude/settings.json.bak
cp ~/.codex/hooks.json ~/.codex/hooks.json.bak 2>/dev/null || true
```

## Claude Code

`~/.claude/settings.json`의 `hooks` 객체에 아래 다섯 항목을 병합한다. 이미 같은 이벤트에 다른 hook이 등록돼 있으면, 그 이벤트의 배열에 항목을 **추가**한다. 덮어쓰지 않는다.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js claude" }] }
    ],
    "SessionEnd": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js claude" }] }
    ]
  }
}
```

## Codex

`~/.codex/hooks.json`에 같은 구조를 쓴다. Codex는 `SessionEnd` hook이 없으므로 네 개만 등록한다.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js codex" }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js codex" }] }
    ],
    "PermissionRequest": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js codex" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node <REPO>/out/main/hook-bridge.js codex" }] }
    ]
  }
}
```

설정이 인식되는지 확인한다.

```bash
codex doctor
```

## 확인

1. `npm run dev`로 companion을 띄운다.
2. 새 터미널에서 Claude Code를 실행하고 아무 질문이나 던진다.
3. 프롬프트를 보내는 순간 용암이 빨라지고(`working`), 답변이 끝나면 완료 모션 후 약 4초 뒤 가라앉는다(`idle`).
4. 승인이 필요한 도구를 쓰면 용암이 느려지며 가장 밝아진다(`waiting_permission`).
5. Codex에서 같은 순서를 반복한다.

## 되돌리기

백업 파일을 되돌리거나, 위에서 추가한 항목만 지운다.

```bash
mv ~/.claude/settings.json.bak ~/.claude/settings.json
mv ~/.codex/hooks.json.bak ~/.codex/hooks.json
```

## 알려진 한계

- Codex에는 `SessionEnd` hook이 없어 종료된 Codex 세션이 store에 `idle` 상태로 남는다. 화면에는 영향이 없고, 앱을 재시작하면 정리된다.
- `PreToolUse`와 `SubagentStop`은 연결하지 않는다. 전자는 모든 도구 호출에 지연을 더하고, 후자는 subagent가 끝날 때마다 완료로 오인된다.
- companion이 꺼져 있으면 bridge는 아무것도 보내지 않고 즉시 정상 종료한다. AI 작업은 영향을 받지 않는다.
````

- [ ] **Step 2: 실제 Claude Code 세션으로 확인한다**

`docs/hook-setup.md`의 절차대로 `~/.claude/settings.json`을 편집한 뒤:

터미널 A:

```bash
npm run dev
```

터미널 B에서 Claude Code를 새로 띄우고 짧은 질문을 하나 던진다.

Expected: 터미널 A 로그에 `[codemung] snapshot working claude=working ...`이 찍히고 companion의 용암이 빨라진다. 답변이 끝나면 `claude=completed` 후 약 4초 뒤 `claude=idle`이 찍힌다.

- [ ] **Step 3: 실제 Codex 세션으로 확인한다**

`~/.codex/hooks.json`을 편집한 뒤 Codex를 새로 띄우고 짧은 질문을 던진다.

Expected: 로그에 `codex=working` → `codex=completed` → `codex=idle`이 순서대로 찍힌다.

두 도구를 동시에 돌렸을 때 각 Provider 상태가 독립적으로 유지되고, 대표 상태가 우선순위대로 표시되는지도 확인한다.

- [ ] **Step 4: README를 현행화한다**

`README.md:20-22`의 기능 목록과 안내 문단을 교체한다. 현재:

```markdown
- A token-authenticated loopback event server that accepts provider events on `127.0.0.1`

Session aggregation, the provider hook bridge, the hook installer, and live state updates are still planned. Received events are not yet reflected on screen, so the prototype continues to use hard-coded agent states to demonstrate the motion system.
```

수정 후:

```markdown
- A token-authenticated loopback event server that accepts provider events on `127.0.0.1`
- A multi-session state store that keeps each provider independent and derives the scene state
- A shared hook bridge that turns Claude Code and Codex hook payloads into provider events

The hook installer is still planned, so hooks are connected by hand — see `docs/hook-setup.md`. Session recovery after a restart is not implemented yet.
```

`README.md`의 Roadmap에서 완료된 항목을 지운다. 현재:

```markdown
- Add a shared multi-session state store
- Normalize real Claude Code and Codex hook payloads
- Provide safe hook installation, backup, and removal tools
- Persist window position and restore active sessions
```

수정 후:

```markdown
- Provide safe hook installation, backup, and removal tools
- Restore active sessions after a restart
```

- [ ] **Step 5: 문서 커밋**

```bash
git add docs/hook-setup.md README.md && git commit -m "docs: describe manual hook setup and refresh the project status"
```

---

## 완료 기준

MVP 0.1 문서의 완료 기준 중 이 플랜이 책임지는 항목이다.

- [ ] fixture 입력으로 `working → waiting_permission → completed → idle` 변화를 확인할 수 있다 (Task 3 Step 7)
- [ ] Claude와 Codex 상태가 동시에 들어오면 각 상태는 독립이고 장면은 우선순위가 높은 상태를 표시한다 (Task 1 테스트, Task 5 Step 3)
- [ ] 동일 Provider의 두 세션 중 하나가 종료되어도 다른 활성 세션 상태가 유지된다 (Task 1 테스트)
- [ ] 앱이 꺼진 상태에서 hook bridge가 오류 없이 빠르게 종료된다 (Task 4 테스트)
- [ ] 테스트, 타입 검사, production build가 모두 통과한다 (`npm test`)
- [ ] renderer에서 Node.js API에 접근할 수 없다 (preload에 최소 API만 추가)
