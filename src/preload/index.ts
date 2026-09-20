import { contextBridge, ipcRenderer } from 'electron'
import type { UsageSnapshot } from '../shared/usage'
import { createCompanionDragStartPayload } from '../shared/companion-window'
import type { ObjectId } from '../shared/object'
import type { SessionRecord } from '../shared/session'
type ObjectSize = 'small' | 'medium' | 'large'

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
const OBJECT_SIZE_GET_CHANNEL = 'object-size:get'
const OBJECT_SIZE_SET_CHANNEL = 'object-size:set'
const OBJECT_SIZE_SNAPSHOT_CHANNEL = 'object-size:snapshot'
const LEGACY_SIZE_GET_CHANNEL = 'character-size:get'
const LEGACY_SIZE_SET_CHANNEL = 'character-size:set'
const LEGACY_SIZE_SNAPSHOT_CHANNEL = 'character-size:snapshot'
const OBJECT_ID_GET_CHANNEL = 'object-id:get'
const OBJECT_ID_SET_CHANNEL = 'object-id:set'
const OBJECT_ID_SNAPSHOT_CHANNEL = 'object-id:snapshot'
const COMPANION_PANEL_CHANNEL = 'companion:set-session-panel-open'
const COMPANION_DRAG_START_CHANNEL = 'companion:drag-start'
const COMPANION_DRAG_MOVE_CHANNEL = 'companion:drag-move'
const COMPANION_DRAG_END_CHANNEL = 'companion:drag-end'
const SESSION_GET_CHANNEL = 'session:get'
const SESSION_SNAPSHOT_CHANNEL = 'session:snapshot'

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
  getObjectSize: (): Promise<ObjectSize | undefined> => ipcRenderer.invoke(OBJECT_SIZE_GET_CHANNEL),
  setObjectSize: (size: ObjectSize): void => ipcRenderer.send(OBJECT_SIZE_SET_CHANNEL, size),
  onObjectSize: (listener: (size: ObjectSize) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, size: ObjectSize): void => listener(size)
    ipcRenderer.on(OBJECT_SIZE_SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(OBJECT_SIZE_SNAPSHOT_CHANNEL, handler)
  },
  getObjectId: (): Promise<ObjectId | undefined> => ipcRenderer.invoke(OBJECT_ID_GET_CHANNEL),
  setObjectId: (id: ObjectId): void => ipcRenderer.send(OBJECT_ID_SET_CHANNEL, id),
  onObjectId: (listener: (id: ObjectId) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, id: ObjectId): void => listener(id)
    ipcRenderer.on(OBJECT_ID_SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(OBJECT_ID_SNAPSHOT_CHANNEL, handler)
  },
  // Keep the old bridge surface during development hot reloads. The wording
  // and current API remain object-based.
  getCharacterSize: (): Promise<ObjectSize | undefined> => ipcRenderer.invoke(LEGACY_SIZE_GET_CHANNEL),
  setCharacterSize: (size: ObjectSize): void => ipcRenderer.send(LEGACY_SIZE_SET_CHANNEL, size),
  onCharacterSize: (listener: (size: ObjectSize) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, size: ObjectSize): void => listener(size)
    ipcRenderer.on(LEGACY_SIZE_SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(LEGACY_SIZE_SNAPSHOT_CHANNEL, handler)
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
  ,setSessionPanelOpen: (isOpen: boolean): void => ipcRenderer.send(COMPANION_PANEL_CHANNEL, isOpen)
  ,startCompanionDrag: (screenX: number, screenY: number): void => ipcRenderer.send(COMPANION_DRAG_START_CHANNEL, createCompanionDragStartPayload(screenX, screenY))
  ,moveCompanion: (screenX: number, screenY: number): void => ipcRenderer.send(COMPANION_DRAG_MOVE_CHANNEL, { screenX, screenY })
  ,endCompanionDrag: (): void => ipcRenderer.send(COMPANION_DRAG_END_CHANNEL)
  ,getSessions: (): Promise<SessionRecord[] | undefined> => ipcRenderer.invoke(SESSION_GET_CHANNEL)
  ,onSessions: (listener: (sessions: SessionRecord[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, sessions: SessionRecord[]): void => listener(sessions)
    ipcRenderer.on(SESSION_SNAPSHOT_CHANNEL, handler)
    return () => ipcRenderer.removeListener(SESSION_SNAPSHOT_CHANNEL, handler)
  }
})
