import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { networkInterfaces, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const { startEventServer, MAX_PAYLOAD_BYTES } = await import(
  join(repositoryRoot, 'out/main/event-server.js')
)

async function withEventServer(run) {
  const runtimeDirectory = await mkdtemp(join(tmpdir(), 'codemung-test-'))
  const runtimeFilePath = join(runtimeDirectory, 'event-server.json')
  const received = []
  const server = await startEventServer({
    runtimeFilePath,
    onEvent: (event) => received.push(event)
  })

  const post = (body, { token = server.token, headers = {}, path = '/events', method = 'POST' } = {}) =>
    fetch(`http://127.0.0.1:${server.port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token === null ? {} : { authorization: `Bearer ${token}` }),
        ...headers
      },
      ...(method === 'GET' ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) })
    })

  try {
    await run({ server, post, received, runtimeFilePath })
  } finally {
    await server.close()
    await rm(runtimeDirectory, { recursive: true, force: true })
  }
}

test('the runtime file records the port and token with owner-only permissions', async () => {
  await withEventServer(async ({ server, runtimeFilePath }) => {
    const runtime = JSON.parse(readFileSync(runtimeFilePath, 'utf8'))

    assert.equal(runtime.port, server.port)
    assert.equal(runtime.token, server.token)
    assert.equal(statSync(runtimeFilePath).mode & 0o777, 0o600)
  })
})

test('the runtime file is removed when the server closes', async () => {
  const runtimeDirectory = await mkdtemp(join(tmpdir(), 'codemung-test-'))
  const runtimeFilePath = join(runtimeDirectory, 'event-server.json')
  const server = await startEventServer({ runtimeFilePath, onEvent: () => {} })

  await server.close()

  assert.throws(() => statSync(runtimeFilePath))
  await rm(runtimeDirectory, { recursive: true, force: true })
})

test('a valid event is accepted and reduced to status fields', async () => {
  await withEventServer(async ({ post, received }) => {
    const response = await post({
      provider: 'claude',
      sessionId: 'session-1',
      kind: 'permission_requested',
      cwd: '/Users/someone/Projects/codemung',
      occurredAt: 1234,
      prompt: 'secret prompt',
      toolInput: { command: 'rm -rf /' }
    })

    assert.equal(response.status, 204)
    assert.deepEqual(received, [
      {
        provider: 'claude',
        sessionId: 'session-1',
        kind: 'permission_requested',
        project: 'codemung',
        occurredAt: 1234
      }
    ])
  })
})

test('a missing occurredAt falls back to the receive time', async () => {
  await withEventServer(async ({ post, received }) => {
    const before = Date.now()
    const response = await post({ provider: 'codex', sessionId: 'session-2', kind: 'activity' })

    assert.equal(response.status, 204)
    assert.equal(received[0].project, undefined)
    assert.ok(received[0].occurredAt >= before)
  })
})

test('requests without a valid token are rejected', async () => {
  await withEventServer(async ({ post, server, received }) => {
    const event = { provider: 'claude', sessionId: 'session-3', kind: 'activity' }

    assert.equal((await post(event, { token: null })).status, 401)
    assert.equal((await post(event, { token: 'wrong-token' })).status, 401)
    assert.equal((await post(event, { token: `${server.token}extra` })).status, 401)
    assert.equal(received.length, 0)
  })
})

test('requests that carry browser context are rejected', async () => {
  await withEventServer(async ({ post, received }) => {
    const response = await post(
      { provider: 'claude', sessionId: 'session-4', kind: 'activity' },
      { headers: { origin: 'https://example.com' } }
    )

    assert.equal(response.status, 403)
    assert.equal(received.length, 0)
  })
})

test('unknown paths and methods are rejected', async () => {
  await withEventServer(async ({ post, received }) => {
    assert.equal((await post(null, { path: '/', method: 'GET' })).status, 404)
    assert.equal((await post({}, { path: '/events/extra' })).status, 404)
    assert.equal((await post(null, { path: '/events', method: 'GET' })).status, 405)
    assert.equal(received.length, 0)
  })
})

test('malformed and oversized payloads are rejected', async () => {
  await withEventServer(async ({ post, received }) => {
    assert.equal((await post('not json')).status, 400)
    assert.equal((await post([1, 2, 3])).status, 400)
    assert.equal((await post({ provider: 'unknown', sessionId: 'a', kind: 'activity' })).status, 400)
    assert.equal((await post({ provider: 'claude', sessionId: '', kind: 'activity' })).status, 400)
    assert.equal((await post({ provider: 'claude', sessionId: 'a', kind: 'exploded' })).status, 400)
    assert.equal(
      (await post({ provider: 'claude', sessionId: 'a', kind: 'activity', cwd: 'x'.repeat(MAX_PAYLOAD_BYTES) })).status,
      413
    )
    assert.equal(received.length, 0)
  })
})

test('a request addressed to a foreign host name is rejected', async () => {
  await withEventServer(async ({ server }) => {
    // fetch refuses to override Host, so a raw request stands in for a rebound DNS name.
    const statusCode = await new Promise((resolve, reject) => {
      const request = httpRequest(
        {
          host: '127.0.0.1',
          port: server.port,
          path: '/events',
          method: 'POST',
          headers: {
            host: 'codemung.example.com',
            authorization: `Bearer ${server.token}`,
            'content-type': 'application/json',
            'content-length': '2'
          }
        },
        (response) => {
          response.resume()
          resolve(response.statusCode)
        }
      )

      request.on('error', reject)
      request.end('{}')
    })

    assert.equal(statusCode, 403)
  })
})

test('the server does not listen on a non-loopback interface', async (t) => {
  const externalAddress = Object.values(networkInterfaces())
    .flat()
    .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)?.address

  if (!externalAddress) {
    t.skip('no external IPv4 interface is available')
    return
  }

  await withEventServer(async ({ server }) => {
    await assert.rejects(
      fetch(`http://${externalAddress}:${server.port}/events`, { method: 'POST', body: '{}' })
    )
  })
})
