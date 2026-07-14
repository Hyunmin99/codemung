import { contextBridge, ipcRenderer } from 'electron'

const APP_INFO_CHANNEL = 'app:get-info'

export interface AppInfo {
  name: string
  version: string
  platform: NodeJS.Platform
}

contextBridge.exposeInMainWorld('codemung', {
  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(APP_INFO_CHANNEL)
})
