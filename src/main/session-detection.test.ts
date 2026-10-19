import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectSessions } from './session-detection'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('detectSessions', () => {
  it('detects multiple recent Claude and Codex sessions using metadata only', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codemung-session-'))
    roots.push(home)
    const now = Date.now()
    const claudeDir = join(home, '.claude', 'projects', 'alpha')
    const codexDir = join(home, '.codex', 'sessions', '2026', '09', '21')
    await mkdir(claudeDir, { recursive: true })
    await mkdir(codexDir, { recursive: true })

    const claudeLog = join(claudeDir, 'claude-1.jsonl')
    const codexLog = join(codexDir, 'codex-1.jsonl')
    await writeFile(claudeLog, '{"type":"user","message":"secret prompt"}\n')
    await writeFile(codexLog, '{"type":"session_meta","payload":{"id":"codex-1","cwd":"/work/beta"}}\n{"type":"user","message":"secret prompt"}\n')
    await utimes(claudeLog, new Date(now), new Date(now))
    await utimes(codexLog, new Date(now - 45_000), new Date(now - 45_000))

    const sessions = await detectSessions(now, home)
    expect(sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'claude', sessionId: 'claude-1', projectName: 'alpha', state: 'working' }),
      expect.objectContaining({ provider: 'codex', sessionId: 'codex-1', projectName: 'beta', state: 'working' })
    ]))
    expect(sessions).toHaveLength(2)
  })

  it('ignores stale sessions and tolerates missing provider directories', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codemung-session-'))
    roots.push(home)
    const directory = join(home, '.claude', 'projects', 'old')
    await mkdir(directory, { recursive: true })
    const log = join(directory, 'old.jsonl')
    await writeFile(log, 'conversation content is not needed')
    await utimes(log, new Date(1), new Date(1))
    await expect(detectSessions(Date.now(), home)).resolves.toEqual([])
  })

  it.each([
    ['task_started', 'working'],
    ['task_complete', 'completed'],
    ['exec_approval_request', 'waiting_permission'],
    ['task_failed', 'error']
  ] as const)('maps Codex %s lifecycle events to %s', async (event, state) => {
    const home = await mkdtemp(join(tmpdir(), 'codemung-codex-state-'))
    roots.push(home)
    const directory = join(home, '.codex', 'sessions', '2026', '10', '04')
    await mkdir(directory, { recursive: true })
    const log = join(directory, 'rollout-fixture.jsonl')
    await writeFile(log, [
      '{"timestamp":"2026-10-04T00:00:00Z","type":"session_meta","payload":{"cwd":"/work/demo"}}',
      `{"timestamp":"2026-10-04T00:00:01Z","type":"event_msg","payload":{"type":"${event}"}}`
    ].join('\n') + '\n')

    await expect(detectSessions(Date.now() + 1_000, home)).resolves.toEqual([
      expect.objectContaining({ provider: 'codex', sessionId: 'rollout-fixture', state })
    ])
  })

  it('treats an interrupted Codex turn as inactive and lets a newer turn win', async () => {
    const home = await mkdtemp(join(tmpdir(), 'codemung-codex-state-'))
    roots.push(home)
    const directory = join(home, '.codex', 'sessions', '2026', '10', '04')
    await mkdir(directory, { recursive: true })
    const log = join(directory, 'rollout-fixture.jsonl')
    const event = (type: string) => `{"type":"event_msg","payload":{"type":"${type}"}}`
    await writeFile(log, [event('task_started'), event('turn_aborted')].join('\n') + '\n')
    await expect(detectSessions(Date.now() + 1_000, home)).resolves.toEqual([])

    await writeFile(log, [event('task_started'), event('turn_aborted'), event('task_started')].join('\n') + '\n')
    await expect(detectSessions(Date.now() + 1_000, home)).resolves.toEqual([
      expect.objectContaining({ provider: 'codex', state: 'working' })
    ])
  })
})
