export interface UsageWindow {
  usedPercent: number
  resetsAt: number | null
  windowDurationMins: number
}

export interface UsageBucket {
  id: string
  label: string
  fiveHour: UsageWindow | null
  weekly: UsageWindow | null
}

export interface ProviderUsage {
  provider: 'codex' | 'claude'
  status: 'loading' | 'ready' | 'stale' | 'login-required' | 'unavailable' | 'error'
  buckets: UsageBucket[]
  updatedAt: number | null
  message?: string
}

export interface UsageSnapshot {
  codex: ProviderUsage
  claude: ProviderUsage
}
