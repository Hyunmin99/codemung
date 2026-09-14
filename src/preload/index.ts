import { contextBridge, ipcRenderer } from 'electron'
import type { UsageSnapshot } from '../shared/usage'

const APP_INFO_CHANNEL = 'app:get-info'
const ALWAYS_ON_TOP_CHANNEL = 'window:set-always-on-top'
const USAGE_REFRESH_CHANNEL = 'usage:refresh'
const USAGE_CONNECT_CLAUDE_CHANNEL = 'usage:connect-claude'
const USAGE_SNAPSHOT_CHANNEL = 'usage:snapshot'
const USAGE_CLOSE_CHANNEL = 'usage:close'
const OPEN_SETTINGS_CHANNEL = 'app:open-settings'
const TOGGLE_COMPANION_CHANNEL = 'app:toggle-companion'
const QUIT_CHANNEL = 'app:quit'
const USAGE_BUCKET_CHANNEL = 'usage:set-bucket'
const USAGE_GET_CHANNEL = 'usage:get'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

contextBridge.exposeInMainWorld('codemung', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(APP_INFO_CHANNEL),
  setAlwaysOnTop: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(ALWAYS_ON_TOP_CHANNEL, enabled),
  refreshUsage: (): Promise<UsageSnapshot | undefined> =>
    ipcRenderer.invoke(USAGE_REFRESH_CHANNEL),
  getUsageSnapshot: (): Promise<UsageSnapshot | undefined> => ipcRenderer.invoke(USAGE_GET_CHANNEL),
  connectClaude: (): Promise<UsageSnapshot | undefined> => ipcRenderer.invoke(USAGE_CONNECT_CLAUDE_CHANNEL),
  onUsageSnapshot: (listener: (snapshot: UsageSnapshot) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, snapshot: UsageSnapshot): void => listener(snapshot)
    ipcRenderer.on(USAGE_SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(USAGE_SNAPSHOT_CHANNEL, handler)
  },
  closeUsage: (): void => ipcRenderer.send(USAGE_CLOSE_CHANNEL)
  ,setUsageBucket: (id: string): void => ipcRenderer.send(USAGE_BUCKET_CHANNEL, id)
  ,openSettings: (): void => ipcRenderer.send(OPEN_SETTINGS_CHANNEL)
  ,toggleCompanion: (): void => ipcRenderer.send(TOGGLE_COMPANION_CHANNEL)
  ,quit: (): void => ipcRenderer.send(QUIT_CHANNEL)
})
