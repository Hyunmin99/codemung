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
  type ObjectSize = 'small' | 'medium' | 'large'
  type ObjectId = import('../shared/object').ObjectId

  interface CodeMungApi {
    getAppInfo: () => Promise<CodeMungAppInfo>
    openReleases: () => Promise<boolean>
    refreshUsage: () => Promise<UsageSnapshot | undefined>
    getUsageSnapshot: () => Promise<UsageSnapshot | undefined>
    getObjectSize: () => Promise<ObjectSize | undefined>
    setObjectSize: (size: ObjectSize) => void
    onObjectSize: (listener: (size: ObjectSize) => void) => () => void
    getObjectId: () => Promise<ObjectId | undefined>
    setObjectId: (id: ObjectId) => void
    onObjectId: (listener: (id: ObjectId) => void) => () => void
    /** @deprecated Compatibility for renderer hot reloads from older builds. */
    getCharacterSize?: () => Promise<ObjectSize | undefined>
    /** @deprecated Compatibility for renderer hot reloads from older builds. */
    setCharacterSize?: (size: ObjectSize) => void
    /** @deprecated Compatibility for renderer hot reloads from older builds. */
    onCharacterSize?: (listener: (size: ObjectSize) => void) => () => void
    connectClaude: () => Promise<UsageSnapshot | undefined>
    onUsageSnapshot: (listener: (snapshot: UsageSnapshot) => void) => () => void
    closeUsage: () => void
    setUsageBucket: (id: string) => void
    openSettings: () => void
    toggleCompanion: () => void
    quit: () => void
    setSessionPanelOpen: (isOpen: boolean) => void
    startCompanionDrag: (startScreenX: number, startScreenY: number) => void
    moveCompanion: (screenX: number, screenY: number) => void
    endCompanionDrag: () => void
  }

  interface Window {
    codemung: CodeMungApi
  }
}

export {}
