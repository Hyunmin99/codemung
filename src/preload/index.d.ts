declare global {
  interface CodeMungAppInfo {
    name: string
    version: string
    platform: string
  }

  interface CodeMungApi {
    getAppInfo: () => Promise<CodeMungAppInfo>
    setAlwaysOnTop: (enabled: boolean) => Promise<boolean>
  }

  interface Window {
    codemung: CodeMungApi
  }
}

export {}
