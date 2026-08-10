import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

const APP_INFO_CHANNEL = 'app:get-info'
const ALWAYS_ON_TOP_CHANNEL = 'window:set-always-on-top'
const SESSION_SNAPSHOT_CHANNEL = 'session:snapshot'
const SESSION_GET_SNAPSHOT_CHANNEL = 'session:get-snapshot'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

contextBridge.exposeInMainWorld('codemung', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(APP_INFO_CHANNEL),
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ALWAYS_ON_TOP_CHANNEL, enabled),
  getSessionSnapshot: (): Promise<CodeMungSessionSnapshot | null> =>
    ipcRenderer.invoke(SESSION_GET_SNAPSHOT_CHANNEL),
  onSessionSnapshot: (listener: (snapshot: CodeMungSessionSnapshot) => void): (() => void) => {
    // The raw IpcRendererEvent is never handed to the renderer because it exposes senders.
    const handler = (_event: IpcRendererEvent, snapshot: CodeMungSessionSnapshot): void =>
      listener(snapshot)

    ipcRenderer.on(SESSION_SNAPSHOT_CHANNEL, handler)

    return () => {
      ipcRenderer.removeListener(SESSION_SNAPSHOT_CHANNEL, handler)
    }
  }
})
