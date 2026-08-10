import { randomBytes, timingSafeEqual } from 'node:crypto'
import { chmodSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { basename } from 'node:path'

export const EVENTS_PATH = '/events'
export const MAX_PAYLOAD_BYTES = 4096

const LOOPBACK_HOST = '127.0.0.1'
const RUNTIME_FILE_MODE = 0o600
const REQUEST_TIMEOUT_MS = 2000
const MAX_SESSION_ID_LENGTH = 200
const MAX_CWD_LENGTH = 4096
const BEARER_PREFIX = 'Bearer '

const PROVIDERS = ['claude', 'codex'] as const
const EVENT_KINDS = [
  'session_started',
  'activity',
  'permission_requested',
  'completed',
  'failed',
  'session_ended'
] as const

export type Provider = (typeof PROVIDERS)[number]
export type EventKind = (typeof EVENT_KINDS)[number]

export interface ProviderEvent {
  provider: Provider
  sessionId: string
  kind: EventKind
  project?: string
  occurredAt: number
}

export interface EventServerOptions {
  runtimeFilePath: string
  onEvent: (event: ProviderEvent) => void
}

export interface EventServer {
  port: number
  token: string
  close: () => Promise<void>
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength
}

export function parseProviderEvent(payload: unknown, receivedAt = Date.now()): ProviderEvent | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null

  const raw = payload as Record<string, unknown>
  const provider = PROVIDERS.find((candidate) => candidate === raw.provider)
  const kind = EVENT_KINDS.find((candidate) => candidate === raw.kind)

  if (!provider || !kind || !isBoundedString(raw.sessionId, MAX_SESSION_ID_LENGTH)) return null

  const occurredAt =
    typeof raw.occurredAt === 'number' && Number.isFinite(raw.occurredAt)
      ? raw.occurredAt
      : receivedAt

  // Only the directory name is kept so that full paths never reach the store or the screen.
  const project = isBoundedString(raw.cwd, MAX_CWD_LENGTH) ? basename(raw.cwd) : undefined

  // The event is rebuilt field by field so that prompts, responses, and tool bodies are dropped.
  return {
    provider,
    sessionId: raw.sessionId,
    kind,
    ...(project ? { project } : {}),
    occurredAt
  }
}

function isAuthorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization

  if (typeof header !== 'string' || !header.startsWith(BEARER_PREFIX)) return false

  const provided = Buffer.from(header.slice(BEARER_PREFIX.length))
  const expected = Buffer.from(token)

  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

function isLocalRequest(request: IncomingMessage, port: number): boolean {
  // A web page can reach a loopback port, so anything that carries browser context is refused.
  if (request.headers.origin !== undefined) return false

  const host = request.headers.host

  return host === `${LOOPBACK_HOST}:${port}` || host === `localhost:${port}`
}

function readBody(request: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    let size = 0

    request.on('data', (chunk: Buffer) => {
      size += chunk.length

      if (size > MAX_PAYLOAD_BYTES) {
        resolve(null)
        request.destroy()
        return
      }

      chunks.push(chunk)
    })
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    request.on('error', () => resolve(null))
  })
}

function respond(response: ServerResponse, statusCode: number): void {
  response.statusCode = statusCode
  response.end()
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  context: { token: string; port: number; onEvent: (event: ProviderEvent) => void }
): Promise<void> {
  if (!isLocalRequest(request, context.port)) {
    respond(response, 403)
    return
  }

  if ((request.url ?? '').split('?')[0] !== EVENTS_PATH) {
    respond(response, 404)
    return
  }

  if (request.method !== 'POST') {
    respond(response, 405)
    return
  }

  if (!isAuthorized(request, context.token)) {
    respond(response, 401)
    return
  }

  if (Number(request.headers['content-length'] ?? 0) > MAX_PAYLOAD_BYTES) {
    respond(response, 413)
    return
  }

  const body = await readBody(request)

  if (body === null) {
    respond(response, 413)
    return
  }

  let payload: unknown

  try {
    payload = JSON.parse(body)
  } catch {
    respond(response, 400)
    return
  }

  const event = parseProviderEvent(payload)

  if (!event) {
    respond(response, 400)
    return
  }

  context.onEvent(event)
  respond(response, 204)
}

function writeRuntimeFile(path: string, port: number, token: string): void {
  writeFileSync(path, JSON.stringify({ port, token, pid: process.pid }), {
    encoding: 'utf8',
    mode: RUNTIME_FILE_MODE
  })
  // An existing file keeps its own mode, so the permissions are tightened explicitly.
  chmodSync(path, RUNTIME_FILE_MODE)
}

function closeServer(server: Server, runtimeFilePath: string): Promise<void> {
  try {
    rmSync(runtimeFilePath, { force: true })
  } catch {
    // A leftover runtime file must not block shutdown.
  }

  return new Promise((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })
}

export function startEventServer(options: EventServerOptions): Promise<EventServer> {
  const token = randomBytes(32).toString('hex')
  let port = 0

  const server = createServer((request, response) => {
    void handleRequest(request, response, { token, port, onEvent: options.onEvent })
  })

  server.headersTimeout = REQUEST_TIMEOUT_MS
  server.requestTimeout = REQUEST_TIMEOUT_MS

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: LOOPBACK_HOST, port: 0 }, () => {
      const address = server.address()

      if (address === null || typeof address === 'string') {
        server.close()
        reject(new Error('The event server did not bind to a loopback port.'))
        return
      }

      port = address.port
      server.removeListener('error', reject)

      try {
        writeRuntimeFile(options.runtimeFilePath, port, token)
      } catch (error) {
        void closeServer(server, options.runtimeFilePath)
        reject(error)
        return
      }

      resolve({
        port,
        token,
        close: () => closeServer(server, options.runtimeFilePath)
      })
    })
  })
}
