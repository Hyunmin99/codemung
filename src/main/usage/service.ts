import { ClaudeUsageAdapter } from './claude.ts'
import { CodexUsageAdapter } from './codex.ts'
import type { ProviderUsage, UsageSnapshot } from '../../shared/usage'

const empty = (provider: 'codex' | 'claude'): ProviderUsage => ({ provider, status: 'loading', buckets: [], updatedAt: null })

export class UsageService {
  private snapshot: UsageSnapshot = { codex: empty('codex'), claude: empty('claude') }
  private pending: Promise<UsageSnapshot> | null = null
  private timer: NodeJS.Timeout | null = null
  private suspended = false
  private generation = 0
  private readonly adapters: { codex: any; claude: any }
  private readonly onChange: (snapshot: UsageSnapshot) => void
  private readonly deps: { codex?: any; claude?: any; now?: () => number; intervalMs?: number }
  private pendingAllowsKeychain = false
  constructor(onChange: (snapshot: UsageSnapshot) => void, deps: { codex?: any; claude?: any; now?: () => number; intervalMs?: number } = {}) { this.onChange = onChange; this.deps = deps; this.adapters = { codex: deps.codex ?? new CodexUsageAdapter(), claude: deps.claude ?? new ClaudeUsageAdapter() } }
  getSnapshot(): UsageSnapshot { return this.snapshot }
  async refresh(options: { allowKeychain?: boolean } = {}): Promise<UsageSnapshot> {
    if (this.suspended) return this.snapshot
    if (this.pending && !(options.allowKeychain && !this.pendingAllowsKeychain)) return this.pending
    if (this.pending && options.allowKeychain) { this.adapters.codex.abort?.(); this.adapters.claude.abort?.(); this.generation++ }
    const generation = this.generation
    this.pendingAllowsKeychain = options.allowKeychain === true
    const run = Promise.allSettled([ this.adapters.codex.fetch(), this.adapters.claude.fetch(options) ]).then((results) => {
      if (generation !== this.generation || this.suspended) return this.snapshot
      const next = { ...this.snapshot }
      for (const [key, result] of [['codex', results[0]], ['claude', results[1]]] as const) {
        if (result.status === 'fulfilled') next[key] = result.value
        else {
          const reason = result.reason as any
          const clear = reason?.unavailable || reason?.accountChanged || reason?.loginRequired
          const transient = reason?.transient || reason?.name === 'AbortError'
          next[key] = {
            ...next[key],
            ...(clear ? { buckets: [], updatedAt: null } : {}),
            status: clear && reason?.loginRequired ? 'login-required' : clear ? 'unavailable' : transient ? (next[key].updatedAt === null ? 'unavailable' : 'stale') : 'error',
            message: reason?.unavailableMessage ?? (transient ? '일시적인 네트워크 오류입니다. 잠시 후 다시 시도해 주세요.' : '사용량을 불러오지 못했습니다.')
          }
        }
      }
      this.snapshot = next; this.onChange(next); return next
    }).finally(() => { if (this.pending === run) { this.pending = null; this.pendingAllowsKeychain = false } })
    this.pending = run
    return run
  }
  start(): void { this.suspended = false; if (!this.timer) { void this.refresh(); this.timer = setInterval(() => { if (!this.suspended) void this.refresh() }, this.deps.intervalMs ?? 60_000) } }
  suspend(): void { this.suspended = true; this.generation++; this.adapters.codex.abort?.(); this.adapters.claude.abort?.(); this.pending = null; this.pendingAllowsKeychain = false }
  resume(): void { this.suspended = false; this.generation++; void this.refresh() }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = null; this.suspended = true; this.generation++; this.adapters.codex.abort?.(); this.adapters.claude.abort?.(); this.pending = null; this.pendingAllowsKeychain = false }
}
