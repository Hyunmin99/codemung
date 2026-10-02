import { beforeEach, describe, expect, it } from 'vitest'
import { acceptClaudeHook, getClaudeHooks, getClaudeRelaySnapshot, mergeClaudeStatusLine, parseClaudeHook, parseClaudeStatusLine, resetClaudeRelayForTests } from './claude-relay'
import { mergeClaudeHookSessions } from '../session-hooks'

describe('Claude status line relay parsing', () => {
  beforeEach(() => { resetClaudeRelayForTests() })
  it('maps provider rate limits and preserves omitted windows during merge', () => {
    const first = { rate_limits: { five_hour: { utilization: 42, resets_at: '2030-01-01T00:00:00Z' }, seven_day: { utilization: 15, resets_at: '2030-01-08T00:00:00Z' } } }
    expect(parseClaudeStatusLine(first, Date.parse('2029-01-01'))?.fiveHour?.usedPercent).toBe(42)
    mergeClaudeStatusLine(first, Date.parse('2029-01-01'))
    mergeClaudeStatusLine({ rate_limits: { five_hour: { utilization: 50, resets_at: '2030-01-01T00:00:00Z' } } }, Date.parse('2029-01-02'))
    expect(getClaudeRelaySnapshot().windows.weekly?.usedPercent).toBe(15)
    mergeClaudeStatusLine({ rate_limits: { five_hour: { utilization: 50, resets_at: '2030-01-01T00:00:00Z' } } }, Date.parse('2030-01-09'))
    expect(getClaudeRelaySnapshot().windows.weekly).toBeNull()
  })
  it('rejects malformed or out of range data', () => {
    expect(parseClaudeStatusLine('{')).toBeNull()
    expect(parseClaudeStatusLine({ rate_limits: { five_hour: { utilization: 101 } } })?.fiveHour).toBeNull()
  })
  it('keeps only hook metadata and respects blocking actor and terminal events', () => {
    const raw = { hook_event_name: 'PermissionRequest', session_id: 's1', agent_id: 'agent-a', cwd: '/work/app', prompt: 'secret' }
    expect(parseClaudeHook(raw)).not.toHaveProperty('prompt')
    expect(acceptClaudeHook(raw, 10)).toBe(true)
    acceptClaudeHook({ hook_event_name: 'PostToolUse', session_id: 's1', agent_id: 'agent-b' }, 11)
    expect(getClaudeHooks()[0].state).toBe('waiting_permission')
    acceptClaudeHook({ hook_event_name: 'Stop', session_id: 's1', stop_hook_active: true }, 12)
    expect(getClaudeHooks()[0].state).toBe('waiting_permission')
    acceptClaudeHook({ hook_event_name: 'SessionEnd', session_id: 's1' }, 13)
    expect(getClaudeHooks()[0].state).toBe('idle')
    expect(getClaudeHooks()[0].event.cwd).toBe('/work/app')
  })
  it('guards every non-session event by actor and recognizes only input notifications', () => {
    acceptClaudeHook({ hook_event_name: 'PermissionRequest', session_id: 's1' }, 1)
    acceptClaudeHook({ hook_event_name: 'PostToolUseFailure', session_id: 's1', agent_id: 'subagent' }, 2)
    expect(getClaudeHooks()[0].state).toBe('waiting_permission')
    acceptClaudeHook({ hook_event_name: 'Notification', session_id: 's1', notification_type: 'idle_prompt' }, 3)
    expect(getClaudeHooks()[0].state).toBe('waiting_permission')
    acceptClaudeHook({ hook_event_name: 'Notification', session_id: 's1', notification_type: 'agent_needs_input' }, 4)
    expect(getClaudeHooks()[0].state).toBe('waiting_permission')
    acceptClaudeHook({ hook_event_name: 'UserPromptSubmit', session_id: 's1' }, 5)
    expect(getClaudeHooks()[0].state).toBe('working')
  })
  it('lets official hook state override file mtime state and removes ended sessions', () => {
    acceptClaudeHook({ hook_event_name: 'PermissionRequest', session_id: 's1' }, 100)
    const derived = [{ provider: 'claude' as const, sessionId: 's1', projectName: 'app', state: 'working' as const, updatedAt: 101 }]
    expect(mergeClaudeHookSessions(derived, 102)[0].state).toBe('waiting_permission')
    acceptClaudeHook({ hook_event_name: 'SessionEnd', session_id: 's1' }, 103)
    expect(mergeClaudeHookSessions(derived, 104)).toEqual([])
    expect(mergeClaudeHookSessions(derived, 103 + 30_001)[0].state).toBe('working')
    acceptClaudeHook({ hook_event_name: 'Stop', session_id: 's1' }, 200)
    expect(mergeClaudeHookSessions(derived, 200 + 30_001)[0].state).toBe('working')
    acceptClaudeHook({ hook_event_name: 'UserPromptSubmit', session_id: 'orphan' }, 300)
    expect(mergeClaudeHookSessions([], 300 + 60_001)).toEqual([])
  })
})
