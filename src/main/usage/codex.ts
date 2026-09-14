import { spawn as nodeSpawn } from 'node:child_process'
import { accessSync, constants } from 'node:fs'
import { delimiter } from 'node:path'
import type { UsageBucket, UsageWindow, ProviderUsage } from '../../shared/usage'

type Spawned = ReturnType<typeof nodeSpawn>
type CodexDeps = { findBinary?: () => string | null; spawn?: typeof nodeSpawn; timeoutMs?: number }

const COMMON_BINARIES = ['/opt/homebrew/bin/codex', '/usr/local/bin/codex', '/usr/bin/codex']

export function findCodexBinary(): string | null {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = `${directory}/codex`
    try { accessSync(candidate, constants.X_OK); return candidate } catch { /* continue */ }
  }
  return COMMON_BINARIES.find((candidate) => { try { accessSync(candidate, constants.X_OK); return true } catch { return false } }) ?? null
}

function window(value: any): UsageWindow | null {
  if (!value || typeof value !== 'object' || typeof value.usedPercent !== 'number' || !Number.isFinite(value.usedPercent) || value.usedPercent < 0 || value.usedPercent > 100) return null
  const mins = Number(value.windowDurationMins ?? value.window_duration_mins)
  if (!Number.isFinite(mins) || mins <= 0) return null
  const reset = Number(value.resetsAt ?? value.reset_at ?? value.resetAt)
  return { usedPercent: value.usedPercent, windowDurationMins: mins, resetsAt: Number.isFinite(reset) ? reset * 1000 : null }
}

export function parseCodexRateLimits(payload: any): UsageBucket[] {
  const source = payload?.rateLimitsByLimitId && typeof payload.rateLimitsByLimitId === 'object'
    ? Object.entries(payload.rateLimitsByLimitId)
    : payload?.rateLimits ? [['default', payload.rateLimits]] : []
  return source.map(([id, value]) => {
    const primary = window(value?.primary ?? value?.fiveHour)
    const secondary = window(value?.secondary ?? value?.weekly)
    const windows = [primary, secondary].filter(Boolean) as UsageWindow[]
    const fiveHour = windows.find((item) => item.windowDurationMins === 300) ?? null
    const weekly = windows.find((item) => item.windowDurationMins === 10080) ?? null
    return { id, label: String(value?.limitName ?? value?.name ?? id), fiveHour, weekly }
  }).filter((bucket) => bucket.fiveHour !== null || bucket.weekly !== null)
}

export class CodexUsageAdapter {
  private readonly deps: Required<Pick<CodexDeps, 'findBinary' | 'spawn'>> & { timeoutMs: number }
  private activeChild: Spawned | null = null
  private accountId: string | null = null
  constructor(deps: CodexDeps = {}) { this.deps = { findBinary: deps.findBinary ?? findCodexBinary, spawn: deps.spawn ?? nodeSpawn, timeoutMs: deps.timeoutMs ?? 15_000 } }

  async fetch(): Promise<ProviderUsage> {
    const binary = this.deps.findBinary()
    if (!binary) return { provider: 'codex', status: 'unavailable', buckets: [], updatedAt: null, message: 'Codex CLI를 설치해 주세요.' }
    let result: { account: any; rateLimits: any; accountChanged?: boolean }
    try { result = await this.run(binary) } catch (error: any) {
      if (error?.loginRequired) return { provider: 'codex', status: 'login-required', buckets: [], updatedAt: null, message: error.message }
      if (error?.unavailable) return { provider: 'codex', status: 'unavailable', buckets: [], updatedAt: null, message: error.message }
      throw error
    }
    const account = result.account
    if (!account || account.type === 'api_key' || account.authMode === 'api_key') return { provider: 'codex', status: 'login-required', buckets: [], updatedAt: null, message: 'Codex login required' }
    const nextId = String(account.id ?? account.accountId ?? account.account_id ?? account.email ?? '')
    const changedAccount = Boolean(this.accountId && nextId && this.accountId !== nextId)
    if (changedAccount) this.accountId = nextId
    if (nextId) this.accountId = nextId
    const buckets = parseCodexRateLimits(result.rateLimits)
    if (!buckets.length) throw Object.assign(new Error('Codex usage unavailable'), { unavailable: true, accountChanged: changedAccount || result.accountChanged })
    return { provider: 'codex', status: 'ready', buckets, updatedAt: Date.now() }
  }

  abort(): void { try { this.activeChild?.kill() } catch {} ; this.activeChild = null }
  private run(binary: string): Promise<{ account: any; rateLimits: any }> {
    return new Promise((resolve, reject) => {
      const child = this.deps.spawn(binary, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'], shell: false }) as Spawned
      this.activeChild = child
      const responses: { account?: any; rateLimits?: any; accountChanged?: boolean } = {}
      let output = ''; let settled = false; let initialized = false
      const finish = (error?: Error, value?: any) => { if (settled) return; settled = true; clearTimeout(timer); if (this.activeChild === child) this.activeChild = null; try { child.kill() } catch {} ; if (error) reject(Object.assign(error, { accountChanged: Boolean((error as Error & { accountChanged?: boolean }).accountChanged || responses.accountChanged) })); else resolve(value) }
      const timer = setTimeout(() => finish(Object.assign(new Error('Codex CLI timed out'), { transient: true })), this.deps.timeoutMs)
      child.stdout?.on('data', (chunk) => {
        output += String(chunk)
        if (output.length > 1_000_000) { finish(Object.assign(new Error('Codex CLI output exceeded limit'), { transient: true })); return }
        for (const line of output.split('\n').slice(0, -1)) {
          try {
            const message = JSON.parse(line)
            if (message.id === 1 && message.result && !initialized) {
              initialized = true
              try { child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', method: 'initialized', params: {} }) + '\n'); child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'account/read', params: {} }) + '\n') } catch { finish(Object.assign(new Error('Codex CLI unavailable'), { transient: true })) }
            } else if (message.id === 2 && message.result) {
              responses.account = Object.prototype.hasOwnProperty.call(message.result, 'account') ? message.result.account : message.result
              const account = responses.account
              const accountType = String(account?.type ?? account?.authMode ?? '').toLowerCase()
              if (!account || accountType === 'api_key' || accountType === 'apikey') { finish(Object.assign(new Error(account ? 'Codex API key usage is unavailable' : 'Codex login required'), account ? { unavailable: true } : { loginRequired: true })); continue }
              const nextId = String(account.id ?? account.accountId ?? account.account_id ?? account.email ?? '')
              responses.accountChanged = Boolean(this.accountId && nextId && this.accountId !== nextId)
              if (nextId) this.accountId = nextId
              try { child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'account/rateLimits/read', params: {} }) + '\n') } catch { finish(Object.assign(new Error('Codex CLI unavailable'), { transient: true, accountChanged: responses.accountChanged })) }
            } else if (message.id === 3 && message.result) { responses.rateLimits = message.result; finish(undefined, responses) }
            else if (message.error) finish(Object.assign(new Error('Codex usage request failed'), { unavailable: message.id === 2, transient: message.id !== 2, accountChanged: responses.accountChanged }))
          } catch { /* wait for complete JSONL */ }
        }
        output = output.split('\n').at(-1) ?? ''
      })
      child.stderr?.on('data', () => { /* drain stderr without exposing command or credentials */ })
      child.once('error', (error) => finish(Object.assign(error, { transient: true })))
      child.stdin?.once?.('error', () => finish(Object.assign(new Error('Codex CLI unavailable'), { transient: true })))
      child.once('exit', (code) => { if (!settled) finish(Object.assign(new Error(`Codex CLI exited (${code ?? 'unknown'})`), { transient: true })) })
      child.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { clientInfo: { name: 'codemung', version: '0.1.0' } } }) + '\n')
      // Keep stdin open until the server has completed the initialize handshake.
    })
  }
}
