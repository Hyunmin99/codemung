declare global {
  interface CodeMungAppInfo {
    name: string
    version: string
    platform: string
  }

  type CodeMungAgentState = 'idle' | 'working' | 'waiting_permission' | 'completed' | 'error'

  interface CodeMungProviderSnapshot {
    state: CodeMungAgentState
    activeSessionCount: number
    project?: string
  }

  interface CodeMungSessionSnapshot {
    providers: Record<'claude' | 'codex', CodeMungProviderSnapshot>
    representativeState: CodeMungAgentState
    updatedAt: number
  }

  interface CodeMungApi {
    getAppInfo: () => Promise<CodeMungAppInfo>
    setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
    getSessionSnapshot: () => Promise<CodeMungSessionSnapshot | null>
    onSessionSnapshot: (listener: (snapshot: CodeMungSessionSnapshot) => void) => () => void
  }

  interface Window {
    codemung: CodeMungApi
  }
}

export {}
