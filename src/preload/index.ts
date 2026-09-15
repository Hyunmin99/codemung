import { contextBridge, ipcRenderer } from 'electron'
import type { UsageSnapshot } from '../shared/usage'
type CharacterSize = 'small' | 'medium' | 'large'

const APP_INFO_CHANNEL = 'app:get-info'
const OPEN_RELEASES_CHANNEL = 'app:open-releases'
const USAGE_REFRESH_CHANNEL = 'usage:refresh'
const USAGE_CONNECT_CLAUDE_CHANNEL = 'usage:connect-claude'
const USAGE_SNAPSHOT_CHANNEL = 'usage:snapshot'
const USAGE_CLOSE_CHANNEL = 'usage:close'
const OPEN_SETTINGS_CHANNEL = 'app:open-settings'
const TOGGLE_COMPANION_CHANNEL = 'app:toggle-companion'
const QUIT_CHANNEL = 'app:quit'
const USAGE_BUCKET_CHANNEL = 'usage:set-bucket'
const USAGE_GET_CHANNEL = 'usage:get'
const CHARACTER_SIZE_GET_CHANNEL = 'character-size:get'
const CHARACTER_SIZE_SET_CHANNEL = 'character-size:set'
const CHARACTER_SIZE_SNAPSHOT_CHANNEL = 'character-size:snapshot'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

contextBridge.exposeInMainWorld('codemung', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(APP_INFO_CHANNEL),
  openReleases: (): Promise<boolean> => ipcRenderer.invoke(OPEN_RELEASES_CHANNEL),
  refreshUsage: (): Promise<UsageSnapshot | undefined> =>
    ipcRenderer.invoke(USAGE_REFRESH_CHANNEL),
  getUsageSnapshot: (): Promise<UsageSnapshot | undefined> => ipcRenderer.invoke(USAGE_GET_CHANNEL),
  getCharacterSize: (): Promise<CharacterSize | undefined> => ipcRenderer.invoke(CHARACTER_SIZE_GET_CHANNEL),
  setCharacterSize: (size: CharacterSize): void => ipcRenderer.send(CHARACTER_SIZE_SET_CHANNEL, size),
  onCharacterSize: (listener: (size: CharacterSize) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, size: CharacterSize): void => listener(size)
    ipcRenderer.on(CHARACTER_SIZE_SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(CHARACTER_SIZE_SNAPSHOT_CHANNEL, handler)
  },
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
