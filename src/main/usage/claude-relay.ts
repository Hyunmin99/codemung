import { createServer, type Server } from 'node:http'
import type { UsageWindow } from '../../shared/usage'

export const CLAUDE_RELAY_PORT = 48163
export const CLAUDE_RELAY_URL = `http://127.0.0.1:${CLAUDE_RELAY_PORT}/usage/claude`
export const CLAUDE_HOOK_URL = `http://127.0.0.1:${CLAUDE_RELAY_PORT}/hook/claude`
const MAX_BODY_BYTES = 64 * 1024
type Windows = { fiveHour: UsageWindow | null; weekly: UsageWindow | null }
let windows: Windows = { fiveHour: null, weekly: null }
let server: Server | null = null
let onUpdate: (() => void) | null = null
let diagnostics = { listening: false, lastStatus: 'stopped', receivedAt: null as number | null }
let hookDiagnostics = { lastStatus: 'none', receivedAt: null as number | null }
export type ClaudeHook = { hook_event_name: string; session_id: string; cwd?: string; agent_id?: string; notification_type?: string; stop_hook_active?: boolean }
const hooks = new Map<string, { record: ClaudeHook; state: 'working' | 'waiting_permission' | 'completed' | 'error' | 'idle'; updatedAt: number; blocker: string | null }>()
export function parseClaudeHook(input: unknown): ClaudeHook | null {
  let p: any
  try { p = typeof input === 'string' ? JSON.parse(input) : input } catch { return null }
  if (!p || typeof p !== 'object' || typeof p.hook_event_name !== 'string' || typeof p.session_id !== 'string' || !p.session_id) return null
  const out: ClaudeHook = { hook_event_name: p.hook_event_name, session_id: p.session_id }
  for (const key of ['cwd', 'agent_id', 'notification_type'] as const) if (typeof p[key] === 'string') out[key] = p[key].slice(0, 500)
  if (typeof p.stop_hook_active === 'boolean') out.stop_hook_active = p.stop_hook_active
  return out
}
export function acceptClaudeHook(input: unknown, now = Date.now()): boolean {
  const event = parseClaudeHook(input); if (!event) return false
  hookDiagnostics = { lastStatus: 'received', receivedAt: now }
  const prior = hooks.get(event.session_id)
  if (event.hook_event_name === 'Stop' && event.stop_hook_active === true) return true
  const notification = event.notification_type ?? ''
  const asksForInput = ['permission_prompt', 'agent_needs_input', 'elicitation_dialog'].includes(notification) || /_url_dialog$/.test(notification)
  const state = event.hook_event_name === 'PermissionRequest' || (event.hook_event_name === 'Notification' && asksForInput) ? 'waiting_permission'
    : ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse'].includes(event.hook_event_name) ? 'working'
    : ['PostToolUseFailure', 'StopFailure'].includes(event.hook_event_name) ? 'error'
    : event.hook_event_name === 'Stop' ? 'completed'
    : event.hook_event_name === 'SessionEnd' ? 'idle' : undefined
  if (state === undefined) return true
  const blocker = state === 'waiting_permission' ? event.agent_id ?? null : prior?.blocker ?? null
  if (prior?.state === 'waiting_permission' && state !== 'waiting_permission' && state !== 'idle' && event.agent_id && event.agent_id !== prior.blocker) return true
  const record = { ...prior?.record, ...event, cwd: event.cwd ?? prior?.record.cwd, agent_id: event.agent_id ?? prior?.record.agent_id, notification_type: event.notification_type ?? prior?.record.notification_type }
  hooks.set(event.session_id, { record, state, updatedAt: now, blocker })
  return true
}
export function getClaudeHooks(): Array<{ event: ClaudeHook; state: 'working' | 'waiting_permission' | 'completed' | 'error' | 'idle'; updatedAt: number }> { return [...hooks.values()].map(({ record, state, updatedAt }) => ({ event: record, state, updatedAt })) }

export function parseClaudeStatusLine(input: unknown, now = Date.now()): Windows | null {
  let payload: any
  try { payload = typeof input === 'string' ? JSON.parse(input) : input } catch { return null }
  const rate = payload?.rate_limits
  if (!rate || typeof rate !== 'object') return null
  const map = (value: any, duration: number): UsageWindow | null => {
    if (!value || typeof value.utilization !== 'number' || !Number.isFinite(value.utilization) || value.utilization < 0 || value.utilization > 100) return null
    const parsed = value.resets_at ? Date.parse(value.resets_at) : NaN
    const resetsAt = Number.isFinite(parsed) ? parsed : null
    return resetsAt !== null && resetsAt <= now ? null : { usedPercent: value.utilization, resetsAt, windowDurationMins: duration }
  }
  const result = { fiveHour: map(rate.five_hour, 300), weekly: map(rate.seven_day, 10080) }
  return result
}

export function mergeClaudeStatusLine(input: unknown, now = Date.now()): boolean {
  const update = parseClaudeStatusLine(input, now)
  if (!update) return false
  windows = {
    fiveHour: update.fiveHour ?? (windows.fiveHour?.resetsAt === null || (windows.fiveHour?.resetsAt ?? 0) > now ? windows.fiveHour : null),
    weekly: update.weekly ?? (windows.weekly?.resetsAt === null || (windows.weekly?.resetsAt ?? 0) > now ? windows.weekly : null)
  }
  diagnostics = { listening: diagnostics.listening, lastStatus: 'received', receivedAt: now }
  onUpdate?.()
  return true
}

export function setClaudeRelayUpdateListener(listener: (() => void) | null): void { onUpdate = listener }

export function getClaudeRelaySnapshot(): { windows: Windows; diagnostics: typeof diagnostics; hookDiagnostics: typeof hookDiagnostics } {
  return { windows: { ...windows }, diagnostics: { ...diagnostics }, hookDiagnostics: { ...hookDiagnostics } }
}

export function resetClaudeRelayForTests(): void {
  hooks.clear()
  windows = { fiveHour: null, weekly: null }
  diagnostics = { listening: false, lastStatus: 'stopped', receivedAt: null }
  hookDiagnostics = { lastStatus: 'none', receivedAt: null }
  onUpdate = null
}

export function startClaudeUsageRelay(): Promise<void> {
  if (server) return Promise.resolve()
  return new Promise((resolve) => {
    const next = createServer((request, response) => {
      if (request.headers.origin) { diagnostics.lastStatus = 'forbidden-origin'; response.writeHead(403).end(); return }
      if (request.method !== 'POST') { diagnostics.lastStatus = 'method-not-allowed'; response.writeHead(405).end(); return }
      if (request.url !== '/usage/claude' && request.url !== '/hook/claude') { diagnostics.lastStatus = 'not-found'; response.writeHead(404).end(); return }
      if (!/^application\/json(?:;|$)/i.test(request.headers['content-type'] ?? '')) { diagnostics.lastStatus = 'unsupported-media-type'; response.writeHead(415).end(); return }
      let size = 0
      const chunks: Buffer[] = []
      request.on('data', (chunk: Buffer) => { size += chunk.length; if (size <= MAX_BODY_BYTES) chunks.push(chunk); else { diagnostics.lastStatus = 'too-large'; response.writeHead(413).end(); request.destroy() } })
      request.on('end', () => {
        if (size > MAX_BODY_BYTES || response.writableEnded) return
        const body = Buffer.concat(chunks).toString('utf8')
        const accepted = request.url === '/usage/claude' ? mergeClaudeStatusLine(body) : acceptClaudeHook(body)
        if (!accepted) { diagnostics.lastStatus = 'invalid-payload'; response.writeHead(400).end(); return }
        response.writeHead(204).end()
      })
    })
    next.once('error', () => { diagnostics = { ...diagnostics, listening: false, lastStatus: 'unavailable' }; resolve() })
    next.listen(CLAUDE_RELAY_PORT, '127.0.0.1', () => { server = next; diagnostics = { ...diagnostics, listening: true, lastStatus: 'listening' }; resolve() })
  })
}

export function stopClaudeUsageRelay(): void {
  server?.close(); server = null
  diagnostics = { ...diagnostics, listening: false, lastStatus: 'stopped' }
}
