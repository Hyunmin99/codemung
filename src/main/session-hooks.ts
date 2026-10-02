import type { SessionRecord } from '../shared/session'
import { getClaudeHooks } from './usage/claude-relay'

const ORPHAN_TTL_MS = 60_000
const TERMINAL_TTL_MS = 30_000

export function mergeClaudeHookSessions(detected: SessionRecord[], now = Date.now()): SessionRecord[] {
  const byId = new Map(detected.map((session) => [session.sessionId, session]))
  for (const hook of getClaudeHooks()) {
    const derived = byId.get(hook.event.session_id)
    const age = now - hook.updatedAt
    if (hook.state === 'idle') {
      if (age <= TERMINAL_TTL_MS) byId.delete(hook.event.session_id)
      continue
    }
    if ((hook.state === 'completed' || hook.state === 'error') && age > TERMINAL_TTL_MS) continue
    if (age > ORPHAN_TTL_MS) continue
    byId.set(hook.event.session_id, {
      provider: 'claude', sessionId: hook.event.session_id,
      projectName: hook.event.cwd?.split('/').filter(Boolean).at(-1) ?? derived?.projectName ?? 'Claude session',
      state: hook.state, updatedAt: Math.max(hook.updatedAt, derived?.updatedAt ?? 0)
    })
  }
  return [...byId.values()]
}
