#!/usr/bin/env node
// Sends one provider event to the running companion so that state changes can be
// checked without a real Claude or Codex session.
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const [provider = 'claude', kind = 'activity', sessionId = 'dev-session'] = process.argv.slice(2)
const runtimeFilePath =
  process.env.CODEMUNG_RUNTIME_FILE ??
  join(homedir(), 'Library', 'Application Support', 'codemung', 'event-server.json')

let runtime

try {
  runtime = JSON.parse(readFileSync(runtimeFilePath, 'utf8'))
} catch {
  console.error(`런타임 파일을 읽을 수 없습니다: ${runtimeFilePath}`)
  console.error('companion이 실행 중인지 확인하세요.')
  process.exit(1)
}

const response = await fetch(`http://127.0.0.1:${runtime.port}/events`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    authorization: `Bearer ${runtime.token}`
  },
  body: JSON.stringify({ provider, kind, sessionId, cwd: process.cwd(), occurredAt: Date.now() })
})

console.log(`${provider} ${kind} ${sessionId} → HTTP ${response.status}`)
