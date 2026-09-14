import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  Tray,
  type Rectangle
} from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UsageService } from './usage/service'
import type { UsageSnapshot } from '../shared/usage'
import { createUsageTrayController, type UsageTrayController } from './usage-tray'

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
const WINDOW_STATE_FILENAME = 'companion-window-state.json'
const POSITION_SAVE_DELAY_MS = 250

const COMPANION_WINDOW_SIZE = {
  width: 280,
  height: 280
}

const SETTINGS_WINDOW_SIZE = {
  width: 480,
  height: 620
}

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let usageTray: UsageTrayController | null = null
let usageService: UsageService | null = null
let isQuitting = false
let positionSaveTimer: NodeJS.Timeout | null = null

function isTrustedRenderer(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  const frameUrl = event.senderFrame?.url ?? ''
  if (event.senderFrame !== event.sender.mainFrame) return false
  try {
    const actual = new URL(frameUrl)
    if (process.env.ELECTRON_RENDERER_URL) {
      const expected = new URL(process.env.ELECTRON_RENDERER_URL)
      return actual.origin === expected.origin && actual.pathname === expected.pathname
    }
    return actual.protocol === 'file:' && actual.pathname.endsWith('/renderer/index.html')
  } catch { return false }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
  app.quit()
}

function getWindowStatePath(): string {
  return join(app.getPath('userData'), WINDOW_STATE_FILENAME)
}

function isValidBounds(value: unknown): value is Rectangle {
  if (!value || typeof value !== 'object') return false

  const bounds = value as Partial<Rectangle>

  return (
    Number.isInteger(bounds.x) &&
    Number.isInteger(bounds.y) &&
    Number.isInteger(bounds.width) &&
    Number.isInteger(bounds.height) &&
    (bounds.width ?? 0) > 0 &&
    (bounds.height ?? 0) > 0
  )
}

function clampToVisibleWorkArea(bounds: Rectangle): Rectangle {
  const workArea = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(COMPANION_WINDOW_SIZE.width, workArea.width)
  const height = Math.min(COMPANION_WINDOW_SIZE.height, workArea.height)

  return {
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height
  }
}

function readSavedBounds(): Rectangle | null {
  try {
    const saved = JSON.parse(readFileSync(getWindowStatePath(), 'utf8')) as unknown

    if (!isValidBounds(saved)) return null

    return clampToVisibleWorkArea({
      x: saved.x,
      y: saved.y,
      ...COMPANION_WINDOW_SIZE
    })
  } catch {
    return null
  }
}

function saveMainWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    writeFileSync(getWindowStatePath(), JSON.stringify(mainWindow.getBounds()), 'utf8')
  } catch {
    // A position persistence failure must not interrupt the companion.
  }
}

function scheduleBoundsSave(): void {
  if (positionSaveTimer) clearTimeout(positionSaveTimer)

  positionSaveTimer = setTimeout(() => {
    positionSaveTimer = null
    saveMainWindowBounds()
  }, POSITION_SAVE_DELAY_MS)
}

function quitApp(): void {
  isQuitting = true
  app.quit()
}

function showWindow(): void {
  if (!mainWindow) return

  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow(): void {
  if (!mainWindow) return

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    return
  }

  showWindow()
}

function loadRenderer(window: BrowserWindow, hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) {
    const url = new URL(process.env.ELECTRON_RENDERER_URL)
    if (hash) url.hash = hash
    void window.loadURL(url.toString())
    return
  }

  void window.loadFile(join(__dirname, '../renderer/index.html'), hash ? { hash } : undefined)
}

function createSettingsWindow(): BrowserWindow {
  const window = new BrowserWindow({
    ...SETTINGS_WINDOW_SIZE,
    show: false,
    title: 'CodeMung 설정',
    backgroundColor: '#f5f5f7',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
        preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.on('closed', () => {
    settingsWindow = null
  })
  window.once('ready-to-show', () => window.show())
  loadRenderer(window, 'settings')

  return window
}

function openSettings(): void {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show()
    settingsWindow.focus()
    return
  }

  settingsWindow = createSettingsWindow()
}

function buildCompanionContextMenu(): Menu {
  return Menu.buildFromTemplate([
    { label: '사용량', click: () => { const snapshot = usageService?.getSnapshot(); if (snapshot) usageTray?.show(snapshot) } },
    { label: '설정…', click: openSettings },
    { type: 'separator' },
    { label: '표시/숨기기', click: toggleWindow },
    { type: 'separator' },
    { label: '종료', click: quitApp }
  ])
}

function createWindow(): BrowserWindow {
  const savedBounds = readSavedBounds()
  const window = new BrowserWindow({
    ...COMPANION_WINDOW_SIZE,
    ...(savedBounds ? { x: savedBounds.x, y: savedBounds.y } : {}),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
      webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })
  window.on('move', scheduleBoundsSave)
  window.on('close', (event) => {
    saveMainWindowBounds()

    if (isQuitting) return

    event.preventDefault()
    window.hide()
  })
  window.on('closed', () => {
    mainWindow = null
  })
  window.webContents.on('context-menu', (_event, params) => {
    buildCompanionContextMenu().popup({ window, x: params.x, y: params.y })
  })
  window.once('ready-to-show', () => window.show())
  loadRenderer(window)

  return window
}

function createTray(): Tray {
  const trayIcon =
    process.platform === 'darwin'
      ? nativeImage.createFromNamedImage('NSActionTemplate')
      : nativeImage.createEmpty()

  trayIcon.setTemplateImage(process.platform === 'darwin')

  const appTray = new Tray(trayIcon)

  appTray.setToolTip('CodeMung')
  return appTray
}

if (hasSingleInstanceLock) {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => {
    isQuitting = true
    if (positionSaveTimer) clearTimeout(positionSaveTimer)
    saveMainWindowBounds()
  })
  app.on('window-all-closed', () => {
    // The tray owns the app lifecycle on macOS.
  })

  void app.whenReady().then(() => {
    if (process.platform === 'darwin') {
      app.setActivationPolicy('accessory')
    }

    ipcMain.handle(APP_INFO_CHANNEL, () => ({
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform
    }))
    ipcMain.handle(ALWAYS_ON_TOP_CHANNEL, (_event, enabled: boolean) => {
      if (!mainWindow || typeof enabled !== 'boolean') return false

      mainWindow.setAlwaysOnTop(enabled, enabled ? 'floating' : 'normal')
      return true
    })
    ipcMain.handle(USAGE_REFRESH_CHANNEL, async (event) => {
      if (!isTrustedRenderer(event)) return undefined
      if (!usageService) return undefined
      return usageService.refresh()
    })
    ipcMain.handle(USAGE_GET_CHANNEL, (event) => isTrustedRenderer(event) ? usageService?.getSnapshot() : undefined)
    ipcMain.handle(USAGE_CONNECT_CLAUDE_CHANNEL, async (event) => isTrustedRenderer(event) ? usageService?.refresh({ allowKeychain: true }) : undefined)
    ipcMain.on(USAGE_CLOSE_CHANNEL, (event) => { if (isTrustedRenderer(event)) usageTray?.hide() })
    ipcMain.on(USAGE_BUCKET_CHANNEL, (event, id: unknown) => { if (isTrustedRenderer(event) && typeof id === 'string') usageTray?.setBucket(id) })
    ipcMain.on(OPEN_SETTINGS_CHANNEL, (event) => { if (isTrustedRenderer(event)) openSettings() })
    ipcMain.on(TOGGLE_COMPANION_CHANNEL, (event) => { if (isTrustedRenderer(event)) toggleWindow() })
    ipcMain.on(QUIT_CHANNEL, (event) => { if (isTrustedRenderer(event)) quitApp() })
    mainWindow = createWindow()
    tray = createTray()
    usageService = new UsageService((snapshot: UsageSnapshot) => usageTray?.updateTray(snapshot))
    usageTray = createUsageTrayController(tray, loadRenderer, () => undefined, (_source) => buildCompanionContextMenu().popup(), () => {
      const snapshot = usageService?.getSnapshot()
      if (!snapshot || [snapshot.codex, snapshot.claude].some((provider) => !provider.updatedAt || Date.now() - provider.updatedAt > 30_000)) void usageService?.refresh()
    })
    usageService.start()
    powerMonitor.on('suspend', () => usageService?.suspend())
    powerMonitor.on('resume', () => usageService?.resume())
    app.on('before-quit', () => { usageService?.stop(); usageTray?.destroy() })
  })
}
