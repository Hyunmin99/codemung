import { execFile as nodeExecFile } from 'node:child_process'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import type { ProviderUsage, UsageBucket, UsageWindow } from '../../shared/usage'

type ClaudeDeps = { readFile?: typeof readFile; execFile?: typeof nodeExecFile; fetch?: typeof globalThis.fetch; home?: () => string; timeoutMs?: number }
type Credential = { token: string; source: 'file' | 'keychain'; expiresAt: number | null }

export function mapClaudeUsage(payload: any): { fiveHour: UsageWindow | null; weekly: UsageWindow | null } {
  const map = (value: any, mins: number): UsageWindow | null => {
    if (!value || typeof value.utilization !== 'number' || !Number.isFinite(value.utilization) || value.utilization < 0 || value.utilization > 100) return null
    const parsed = value.resets_at ? Date.parse(value.resets_at) : NaN
    return { usedPercent: value.utilization, resetsAt: Number.isFinite(parsed) ? parsed : null, windowDurationMins: mins }
  }
  return { fiveHour: map(payload?.five_hour, 300), weekly: map(payload?.seven_day, 10080) }
}

async function readToken(deps: ClaudeDeps, allowKeychain: boolean, signal: AbortSignal): Promise<Credential | null> {
  try {
    const raw = JSON.parse(await (deps.readFile ?? readFile)(`${(deps.home ?? homedir)()}/.claude/.credentials.json`, 'utf8'))
    const token = raw?.claudeAiOauth?.accessToken ?? raw?.accessToken
    const expiry = raw?.claudeAiOauth?.expiresAt ?? raw?.claudeAiOauth?.expires_at ?? raw?.expiresAt ?? raw?.expires_at
    const expiresAt = typeof expiry === 'number' ? expiry < 10_000_000_000 ? expiry * 1000 : expiry : typeof expiry === 'string' ? Date.parse(expiry) : null
    if (typeof token === 'string' && token) return { token, source: 'file', expiresAt: Number.isFinite(expiresAt) ? expiresAt : null }
  } catch { /* try keychain only when explicitly requested */ }
  if (signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
  if (!allowKeychain) return null
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    let onAbort: () => void
    const child = (deps.execFile ?? nodeExecFile)('/usr/bin/security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], { timeout: 5_000 }, (error, stdout) => {
      signal.removeEventListener('abort', onAbort)
      if (error) return resolve(null)
      try {
        const parsed = JSON.parse(stdout); const token = parsed?.claudeAiOauth?.accessToken ?? parsed?.accessToken
        const expiry = parsed?.claudeAiOauth?.expiresAt ?? parsed?.claudeAiOauth?.expires_at ?? parsed?.expiresAt ?? parsed?.expires_at
        const expiresAt = typeof expiry === 'number' ? expiry < 10_000_000_000 ? expiry * 1000 : expiry : typeof expiry === 'string' ? Date.parse(expiry) : null
        resolve(typeof token === 'string' && token ? { token, source: 'keychain', expiresAt: Number.isFinite(expiresAt) ? expiresAt : null } : null)
      } catch { resolve(null) }
    }) as any
    onAbort = () => { try { child?.kill?.() } catch {}; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export class ClaudeUsageAdapter {
  private readonly deps: ClaudeDeps
  private cached: Credential | null = null
  private controller: AbortController | null = null
  constructor(deps: ClaudeDeps = {}) { this.deps = deps }
  async fetch(options: { allowKeychain?: boolean } = {}): Promise<ProviderUsage> {
    const previous = this.cached
    if (options.allowKeychain === true) this.cached = null
    const controller = new AbortController(); this.controller = controller
    const timer = setTimeout(() => controller.abort(), this.deps.timeoutMs ?? 15_000)
    let credential: Credential | null = null
    try {
      credential = !options.allowKeychain && previous?.source === 'keychain' ? previous : await readToken(this.deps, options.allowKeychain === true, controller.signal)
      if (controller.signal.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      if (!credential) return { provider: 'claude', status: 'login-required', buckets: [], updatedAt: null, message: 'Claude 연결이 필요합니다.' }
      if (credential.expiresAt !== null && credential.expiresAt <= Date.now()) { this.cached = null; return { provider: 'claude', status: 'login-required', buckets: [], updatedAt: null, message: '인증이 만료되었습니다. 터미널에서 claude auth login 후 다시 연결해 주세요.' } }
      this.cached = credential
      const response = await (this.deps.fetch ?? globalThis.fetch)('https://api.anthropic.com/api/oauth/usage', { headers: { authorization: `Bearer ${credential.token}`, 'anthropic-beta': 'oauth-2025-04-20' }, signal: controller.signal })
      if (response.status === 401) { this.cached = null; return { provider: 'claude', status: 'login-required', buckets: [], updatedAt: null, message: '인증이 만료되었습니다. 터미널에서 claude auth login 후 다시 연결해 주세요.' } }
      if (response.status === 403) throw Object.assign(new Error('scope'), { unavailable: true, unavailableMessage: 'Claude 사용량 권한이 없습니다. 다시 연결해 주세요.' })
      if (!response.ok) throw Object.assign(new Error('network'), { transient: true, accountChanged: Boolean(previous && previous.token !== credential.token) })
      const mapped = mapClaudeUsage(await response.json())
      if (!mapped.fiveHour && !mapped.weekly) throw Object.assign(new Error('Claude usage windows unavailable'), { unavailable: true })
      const buckets: UsageBucket[] = [{ id: 'oauth', label: 'Claude', fiveHour: mapped.fiveHour, weekly: mapped.weekly }]
      return { provider: 'claude', status: 'ready', buckets, updatedAt: Date.now() }
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ECONNRESET' || error?.code === 'ENOTFOUND' || error?.code === 'ETIMEDOUT') throw Object.assign(new Error('network'), { transient: true, accountChanged: Boolean(previous && credential && previous.token !== credential.token) })
      if (error?.unavailable) throw error
      throw Object.assign(new Error('network'), { transient: true, accountChanged: Boolean(previous && this.cached && previous.token !== this.cached.token) })
    } finally { clearTimeout(timer); if (this.controller === controller) this.controller = null }
  }
  abort(): void { this.controller?.abort() }
}
