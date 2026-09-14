import assert from 'node:assert/strict'
import test from 'node:test'
import { CodexUsageAdapter, parseCodexRateLimits } from '../src/main/usage/codex.ts'
import { ClaudeUsageAdapter, mapClaudeUsage } from '../src/main/usage/claude.ts'
import { UsageService } from '../src/main/usage/service.ts'

test('Codex rate limits preserve distinct buckets and identify standard windows', () => {
  const result = parseCodexRateLimits({
    rateLimitsByLimitId: {
      primary: { limitName: 'ChatGPT Plus', primary: { usedPercent: 40, resetAt: 1700000300, windowDurationMins: 300 }, secondary: { usedPercent: 12, resetAt: 1700005000, windowDurationMins: 10080 } },
      secondary: { limitName: 'Codex', primary: { usedPercent: 8, resetAt: 1700000600, windowDurationMins: 300 }, secondary: null }
    }
  })
  assert.equal(result.length, 2)
  assert.equal(result[0].fiveHour.usedPercent, 40)
  assert.equal(result[0].weekly.windowDurationMins, 10080)
  assert.equal(result[1].weekly, null)
})

test('Claude usage maps OAuth windows to epoch milliseconds', () => {
  const result = mapClaudeUsage({ five_hour: { utilization: 7.5, resets_at: '2026-09-13T03:00:00Z' }, seven_day: { utilization: 61, resets_at: '2026-09-19T03:00:00Z' } })
  assert.equal(result.fiveHour.usedPercent, 7.5)
  assert.equal(result.fiveHour.windowDurationMins, 300)
  assert.equal(result.weekly.windowDurationMins, 10080)
  assert.equal(result.weekly.resetsAt, Date.parse('2026-09-19T03:00:00Z'))
})

test('UsageService isolates provider failures and retains stale values', async () => {
  const snapshots = []
  const codex = { fetch: async () => ({ provider: 'codex', status: 'ready', buckets: [], updatedAt: 100 }) }
  const claude = { fetch: async () => { throw Object.assign(new Error('offline'), { transient: true }) } }
  const service = new UsageService((snapshot) => snapshots.push(snapshot), { codex, claude, now: () => 200, intervalMs: 60_000 })
  const snapshot = await service.refresh()
  assert.equal(snapshot.codex.status, 'ready')
  assert.equal(snapshot.claude.status, 'unavailable')
  assert.equal(snapshots.length, 1)
  service.stop()
})

test('Codex adapter never invokes a shell when spawning the CLI', async () => {
  let received
  const adapter = new CodexUsageAdapter({
    findBinary: () => '/usr/local/bin/codex', timeoutMs: 20,
    spawn: (file, args, options) => { received = { file, args, options }; return { stdin: { write() {}, end() {} }, stdout: { on() {} }, stderr: { on() {} }, once(event, cb) { if (event === 'spawn') queueMicrotask(cb); }, kill() {} } }
  })
  const promise = adapter.fetch()
  await assert.rejects(promise)
  assert.equal(received.file, '/usr/local/bin/codex')
  assert.equal(received.options.shell, false)
})

test('Claude adapter caches an explicitly connected token for background refreshes', async () => {
  let reads = 0
  let calls = 0
  const adapter = new ClaudeUsageAdapter({
    readFile: async () => { reads++; return JSON.stringify({ claudeAiOauth: { accessToken: 'token-a' } }) },
    fetch: async (_url, options) => { calls++; assert.equal(options.headers.authorization, 'Bearer token-a'); return { ok: true, status: 200, json: async () => ({ five_hour: { utilization: 1 }, seven_day: { utilization: 2 } }) } }
  })
  await adapter.fetch({ allowKeychain: true })
  await adapter.fetch()
  assert.equal(calls, 2)
  assert.equal(reads, 2)
})

test('UsageService starts a new refresh immediately after resume while old work is unresolved', async () => {
  let resolveFirst
  let calls = 0
  const first = new Promise((resolve) => { resolveFirst = resolve })
  const codex = { fetch: () => { calls++; return calls === 1 ? first : Promise.resolve({ provider: 'codex', status: 'ready', buckets: [], updatedAt: 2 }) }, abort() {} }
  const claude = { fetch: async () => ({ provider: 'claude', status: 'ready', buckets: [], updatedAt: 2 }), abort() {} }
  const service = new UsageService(() => {}, { codex, claude })
  service.start()
  await new Promise((resolve) => setImmediate(resolve))
  service.suspend(); service.resume()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(calls, 2)
  resolveFirst({ codex: { provider: 'codex', status: 'ready', buckets: [], updatedAt: 1 }, claude: { provider: 'claude', status: 'ready', buckets: [], updatedAt: 1 } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(service.getSnapshot().codex.updatedAt, 2)
  service.stop()
})

test('Claude reads the credential file on every refresh and does not reuse a removed file token', async () => {
  let file = JSON.stringify({ claudeAiOauth: { accessToken: 'token-a' } })
  const auth = []
  const adapter = new ClaudeUsageAdapter({ readFile: async () => { if (!file) throw new Error('missing'); return file }, fetch: async (_url, options) => { auth.push(options.headers.authorization); return { ok: true, status: 200, json: async () => ({ five_hour: { utilization: 1 } }) } } })
  await adapter.fetch(); file = JSON.stringify({ claudeAiOauth: { accessToken: 'token-b' } }); await adapter.fetch()
  assert.deepEqual(auth, ['Bearer token-a', 'Bearer token-b'])
  file = ''; const result = await adapter.fetch(); assert.equal(result.status, 'login-required')
})

test('Claude reports expired credentials without calling usage endpoint', async () => {
  let calls = 0
  const adapter = new ClaudeUsageAdapter({
    readFile: async () => JSON.stringify({ claudeAiOauth: { accessToken: 'expired', expiresAt: Date.now() - 1 } }),
    fetch: async () => { calls++; throw new Error('must not fetch') }
  })
  const result = await adapter.fetch()
  assert.equal(result.status, 'login-required')
  assert.match(result.message, /인증이 만료되었습니다/)
  assert.equal(calls, 0)
})

test('Codex rejects buckets that contain neither a valid five-hour nor weekly window', () => {
  assert.deepEqual(parseCodexRateLimits({ rateLimitsByLimitId: { empty: { primary: { usedPercent: 10, windowDurationMins: 60 } } } }), [])
})
