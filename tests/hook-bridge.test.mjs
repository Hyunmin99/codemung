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
