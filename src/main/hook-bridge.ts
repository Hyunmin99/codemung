import { readFileSync, realpathSync } from 'node:fs'
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
  // stdin is drained before anything else, including the provider check: exiting while the
  // parent still has the payload queued makes the parent's own write fail with EPIPE.
  const body = await readStdin()

  if (provider !== 'claude' && provider !== 'codex') return

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

// Importing this module for tests must not execute the script. argv[1] is resolved through
// symlinks because Node resolves import.meta.url to the realpath, so a script reached via a
// symlink (e.g. a stable ~/.local/bin shim, or /tmp on macOS) would otherwise never match.
const isEntryPoint = (() => {
  const entry = process.argv[1]

  try {
    return Boolean(entry) && pathToFileURL(realpathSync(entry)).href === import.meta.url
  } catch {
    return false
  }
})()

if (isEntryPoint) {
  const watchdog = setTimeout(() => process.exit(0), WATCHDOG_TIMEOUT_MS)

  watchdog.unref()

  void run()
    .catch(() => {
      // Every failure is silent on purpose: a broken companion must not break the AI session.
    })
    .finally(() => process.exit(0))
}
