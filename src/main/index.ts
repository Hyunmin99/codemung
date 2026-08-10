import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
  type Rectangle
} from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { startEventServer, type EventServer, type ProviderEvent } from './event-server'

const APP_INFO_CHANNEL = 'app:get-info'
const ALWAYS_ON_TOP_CHANNEL = 'window:set-always-on-top'
const WINDOW_STATE_FILENAME = 'companion-window-state.json'
const EVENT_SERVER_RUNTIME_FILENAME = 'event-server.json'
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
let eventServer: EventServer | null = null
let isQuitting = false
let positionSaveTimer: NodeJS.Timeout | null = null

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

function handleProviderEvent(event: ProviderEvent): void {
  // The session store arrives in the next slice, so events are only observable in development.
  if (!app.isPackaged) {
    console.log('[codemung] event', event.provider, event.kind, event.sessionId, event.project ?? '')
  }
}

async function startEventBridge(): Promise<void> {
  try {
    eventServer = await startEventServer({
      runtimeFilePath: join(app.getPath('userData'), EVENT_SERVER_RUNTIME_FILENAME),
      onEvent: handleProviderEvent
    })

    if (!app.isPackaged) {
      console.log(`[codemung] event server listening on 127.0.0.1:${eventServer.port}`)
    }
  } catch (error) {
    // The companion still runs without the bridge; provider events are simply not received.
    console.error('[codemung] the event server could not start', error)
  }
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
      preload: join(__dirname, '../preload/index.mjs'),
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
    { label: '설정…', click: openSettings },
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
      preload: join(__dirname, '../preload/index.mjs'),
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
  appTray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '설정…', click: openSettings },
      { type: 'separator' },
      { label: '표시/숨기기', click: toggleWindow },
      { type: 'separator' },
      { label: '종료', click: quitApp }
    ])
  )
  appTray.on('click', toggleWindow)

  return appTray
}

if (hasSingleInstanceLock) {
  app.on('second-instance', showWindow)
  app.on('before-quit', () => {
    isQuitting = true
    if (positionSaveTimer) clearTimeout(positionSaveTimer)
    saveMainWindowBounds()
    // The runtime file is removed synchronously inside close, so a stale port is never left behind.
    void eventServer?.close()
    eventServer = null
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
    mainWindow = createWindow()
    tray = createTray()
    void startEventBridge()
  })
}
