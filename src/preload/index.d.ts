declare global {
  interface UsageWindow { usedPercent: number; resetsAt: number | null; windowDurationMins: number }
  interface UsageBucket { id: string; label: string; fiveHour: UsageWindow | null; weekly: UsageWindow | null }
  interface ProviderUsage { provider: 'codex' | 'claude'; status: 'loading' | 'ready' | 'stale' | 'login-required' | 'unavailable' | 'error'; buckets: UsageBucket[]; updatedAt: number | null; message?: string }
  interface UsageSnapshot { codex: ProviderUsage; claude: ProviderUsage }
  interface CodeMungAppInfo {
    name: string
    version: string
    platform: string
  }
  type CharacterSize = 'small' | 'medium' | 'large'

  interface CodeMungApi {
    getAppInfo: () => Promise<CodeMungAppInfo>
    openReleases: () => Promise<boolean>
    refreshUsage: () => Promise<UsageSnapshot | undefined>
    getUsageSnapshot: () => Promise<UsageSnapshot | undefined>
    getCharacterSize: () => Promise<CharacterSize | undefined>
    setCharacterSize: (size: CharacterSize) => void
    onCharacterSize: (listener: (size: CharacterSize) => void) => () => void
    connectClaude: () => Promise<UsageSnapshot | undefined>
    onUsageSnapshot: (listener: (snapshot: UsageSnapshot) => void) => () => void
    closeUsage: () => void
    setUsageBucket: (id: string) => void
    openSettings: () => void
    toggleCompanion: () => void
    quit: () => void
  }

  interface Window {
    codemung: CodeMungApi
  }
}

export {}
