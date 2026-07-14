interface CodeMungAppInfo {
  name: string
  version: string
  platform: string
}

interface CodeMungApi {
  getAppInfo: () => Promise<CodeMungAppInfo>
}

declare global {
  interface Window {
    codemung: CodeMungApi
  }
}

export {}
