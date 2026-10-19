import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { AgentState, Provider, SessionRecord } from '../shared/session'

const RECENT_MS = 5 * 60_000
const MAX_SESSIONS_PER_PROVIDER = 100
const CODEX_TAIL_BYTES = 512 * 1024

const CODEX_STATE_BY_EVENT: Readonly<Record<string, AgentState>> = {
  task_started: 'working',
  task_complete: 'completed',
  turn_aborted: 'idle',
  exec_approval_request: 'waiting_permission',
  approval_request: 'waiting_permission',
  approval_requested: 'waiting_permission',
  tool_approval_requested: 'waiting_permission',
  turn_failed: 'error',
  task_failed: 'error',
  response_failed: 'error'
}

interface SessionFile {
  provider: Provider
  sessionId: string
  projectName: string
  path: string
}

async function filesInDirectories(root: string, provider: Provider): Promise<SessionFile[]> {
  let directories: string[]
  try {
    directories = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(root, entry.name))
  } catch {
    return []
  }

  const files = await Promise.all(directories.map(async (directory) => {
    try {
      const entries = await readdir(directory, { withFileTypes: true })
      return entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => ({
          provider,
          sessionId: entry.name.slice(0, -6),
          projectName: basename(directory),
          path: join(directory, entry.name)
        }))
    } catch {
      return []
    }
  }))
  return files.flat()
}

async function codexFiles(root: string): Promise<SessionFile[]> {
  const files: SessionFile[] = []
  // Codex nests session logs under year/month/day directories.
  async function visit(path: string, depth: number): Promise<void> {
    if (depth === 3) {
      try {
        const entries = await readdir(path, { withFileTypes: true })
        files.push(...entries.filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl')).map((entry) => ({
          provider: 'codex' as const,
          sessionId: entry.name.slice(0, -6),
          projectName: 'Codex session',
          path: join(path, entry.name)
        })))
      } catch { /* Provider has not created this date directory. */ }
      return
    }
    try {
      const entries = await readdir(path, { withFileTypes: true })
      await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => visit(join(path, entry.name), depth + 1)))
    } catch { /* Provider has not created this directory. */ }
  }
  await visit(root, 0)
  return files
}

async function codexProjectName(path: string): Promise<string> {
  try {
    // The first record is session metadata; conversation records are never read.
    const handle = await open(path, 'r')
    try {
      const bytes: number[] = []
      const byte = Buffer.alloc(1)
      for (let position = 0; position < 4096; position++) {
        const { bytesRead } = await handle.read(byte, 0, 1, position)
        if (!bytesRead || byte[0] === 10) break
        bytes.push(byte[0])
      }
      const firstLine = Buffer.from(bytes).toString('utf8')
      const record = JSON.parse(firstLine) as { type?: unknown; payload?: { cwd?: unknown } }
      if (record.type === 'session_meta' && typeof record.payload?.cwd === 'string') return basename(record.payload.cwd) || 'Codex session'
    } finally {
      await handle.close()
    }
  } catch { /* Older or incomplete logs may not have a readable metadata header. */ }
  return 'Codex session'
}

/** Reads only the outer record type and event subtype; message/tool bodies are never parsed. */
async function codexState(path: string): Promise<AgentState> {
  let handle
  try {
    handle = await open(path, 'r')
    const { size } = await handle.stat()
    const length = Math.min(size, CODEX_TAIL_BYTES)
    const bytes = Buffer.alloc(length)
    await handle.read(bytes, 0, length, size - length)
    const lines = bytes.toString('utf8').split('\n')
    let state: AgentState | undefined
    for (const line of lines) {
      // Top-level type precedes nested payloads in Codex rollout records.
      const recordType = line.match(/^\s*\{[^{}]*?"type"\s*:\s*"([^"]+)"/)?.[1]
      if (recordType !== 'event_msg') continue
      const eventType = line.match(/"payload"\s*:\s*\{\s*"type"\s*:\s*"([^"]+)"/)?.[1]
      if (eventType && CODEX_STATE_BY_EVENT[eventType]) state = CODEX_STATE_BY_EVENT[eventType]
    }
    return state ?? 'working'
  } catch {
    return 'working'
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

export async function detectSessions(now = Date.now(), home = homedir()): Promise<SessionRecord[]> {
  const claudeRoot = join(home, '.claude', 'projects')
  const codexRoot = join(home, '.codex', 'sessions')
  const [claude, codex] = await Promise.all([
    filesInDirectories(claudeRoot, 'claude'),
    codexFiles(codexRoot)
  ])
  const recent = await Promise.all([...claude, ...codex].map(async (file) => {
    try {
      const info = await stat(file.path)
      const age = now - info.mtimeMs
      if (age < 0 || age > RECENT_MS) return null
      const state = file.provider === 'codex' ? await codexState(file.path) : 'working'
      if (state === 'idle') return null
      return { file, updatedAt: info.mtimeMs, state }
    } catch { return null }
  }))
  const detected = recent.filter((value): value is NonNullable<typeof value> => value !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  const selected: typeof detected = []
  const counts: Record<Provider, number> = { claude: 0, codex: 0 }
  for (const entry of detected) {
    if (counts[entry.file.provider] >= MAX_SESSIONS_PER_PROVIDER) continue
    counts[entry.file.provider]++
    selected.push(entry)
  }
  return Promise.all(selected.map(async ({ file, state, updatedAt }) => ({
    provider: file.provider,
    sessionId: file.sessionId,
    projectName: file.provider === 'codex' ? await codexProjectName(file.path) : file.projectName,
    state,
    updatedAt
  })))
}

export const SESSION_POLL_INTERVAL_MS = 2_000
