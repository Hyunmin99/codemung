import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  Tray,
  type Rectangle
} from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UsageService } from './usage/service'
import type { UsageSnapshot } from '../shared/usage'
import { createUsageTrayController, type UsageTrayController } from './usage-tray'
import { compactBoundsForPersistence, expandedBoundsForSessionPanel, getExpandedCompanionWindowSize, isCompanionScreenPoint } from '../shared/companion-window'
import { DEFAULT_OBJECT_ID, isRegisteredObjectId, type ObjectId } from '../shared/object'

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
const OBJECT_ID_GET_CHANNEL = 'object-id:get'
const OBJECT_ID_SET_CHANNEL = 'object-id:set'
const OBJECT_ID_SNAPSHOT_CHANNEL = 'object-id:snapshot'
const LEGACY_SIZE_GET_CHANNEL = 'character-size:get'
const LEGACY_SIZE_SET_CHANNEL = 'character-size:set'
const LEGACY_SIZE_SNAPSHOT_CHANNEL = 'character-size:snapshot'
const COMPANION_PANEL_CHANNEL = 'companion:set-session-panel-open'
const COMPANION_DRAG_START_CHANNEL = 'companion:drag-start'
const COMPANION_DRAG_MOVE_CHANNEL = 'companion:drag-move'
const COMPANION_DRAG_END_CHANNEL = 'companion:drag-end'
const WINDOW_STATE_FILENAME = 'companion-window-state.json'
const POSITION_SAVE_DELAY_MS = 250
const RELEASES_URL = 'https://github.com/Hyunmin99/codemung/releases/latest'

type ObjectSize = 'small' | 'medium' | 'large'
const COMPANION_WINDOW_SIZES: Record<ObjectSize, { width: number; height: number }> = {
  small: { width: 120, height: 136 },
  medium: { width: 150, height: 170 },
  large: { width: 180, height: 204 }
}
let objectSize: ObjectSize = 'medium'
let objectId: ObjectId = DEFAULT_OBJECT_ID
const SETTINGS_WINDOW_SIZE = {
  width: 460,
  height: 440
}

let mainWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null
let tray: Tray | null = null
let usageTray: UsageTrayController | null = null
let usageService: UsageService | null = null
let isQuitting = false
let positionSaveTimer: NodeJS.Timeout | null = null
let isSessionPanelOpen = false
let companionDrag: { origin: Rectangle; startScreenX: number; startScreenY: number } | null = null

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

function currentCompanionWindowSize(): { width: number; height: number } {
  return isSessionPanelOpen
    ? getExpandedCompanionWindowSize(COMPANION_WINDOW_SIZES[objectSize]).window
    : COMPANION_WINDOW_SIZES[objectSize]
}

function clampToVisibleWorkArea(bounds: Rectangle, size = currentCompanionWindowSize()): Rectangle {
  const workArea = screen.getDisplayMatching(bounds).workArea
  const width = Math.min(size.width, workArea.width)
  const height = Math.min(size.height, workArea.height)

  return {
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
    width,
    height
  }
}

function setSessionPanelOpen(isOpen: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed() || isSessionPanelOpen === isOpen) return
  const bounds = mainWindow.getBounds()
  const compactSize = COMPANION_WINDOW_SIZES[objectSize]
  const nextBounds = isOpen
    ? expandedBoundsForSessionPanel(bounds, getExpandedCompanionWindowSize(compactSize).window)
    : compactBoundsForPersistence(bounds, compactSize)
  isSessionPanelOpen = isOpen
  companionDrag = null
  mainWindow.setBounds(clampToVisibleWorkArea(nextBounds), false)
  scheduleBoundsSave()
}

function startCompanionDrag(value: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || !isCompanionScreenPoint(value)) return
  companionDrag = {
    origin: mainWindow.getBounds(),
    startScreenX: value.screenX,
    startScreenY: value.screenY
  }
}

function moveCompanion(value: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed() || !companionDrag || !isCompanionScreenPoint(value)) return
  const { origin, startScreenX, startScreenY } = companionDrag
  mainWindow.setBounds(clampToVisibleWorkArea({
    ...origin,
    x: Math.round(origin.x + value.screenX - startScreenX),
    y: Math.round(origin.y + value.screenY - startScreenY)
  }), false)
}

function readSavedBounds(): Rectangle | null {
  try {
    const saved = JSON.parse(readFileSync(getWindowStatePath(), 'utf8')) as unknown

    if (!isValidBounds(saved)) return null
    const savedValue = saved as { objectSize?: unknown; characterSize?: unknown; objectId?: unknown }
    const savedSize = savedValue.objectSize ?? savedValue.characterSize
    if (savedSize === 'small' || savedSize === 'medium' || savedSize === 'large') objectSize = savedSize
    objectId = isRegisteredObjectId(savedValue.objectId) ? savedValue.objectId : DEFAULT_OBJECT_ID

    return clampToVisibleWorkArea({
      x: saved.x,
      y: saved.y,
      ...COMPANION_WINDOW_SIZES[objectSize]
    })
  } catch {
    return null
  }
}

function saveMainWindowBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  try {
    const compactBounds = compactBoundsForPersistence(mainWindow.getBounds(), COMPANION_WINDOW_SIZES[objectSize])
    writeFileSync(getWindowStatePath(), JSON.stringify({ ...compactBounds, objectSize, objectId }), 'utf8')
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

function broadcastObjectSize(): void {
  for (const target of [mainWindow, settingsWindow]) {
    if (target && !target.isDestroyed()) {
      target.webContents.send(OBJECT_SIZE_SNAPSHOT_CHANNEL, objectSize)
      target.webContents.send(LEGACY_SIZE_SNAPSHOT_CHANNEL, objectSize)
    }
  }
}

function broadcastObjectId(): void {
  for (const target of [mainWindow, settingsWindow]) {
    if (target && !target.isDestroyed()) target.webContents.send(OBJECT_ID_SNAPSHOT_CHANNEL, objectId)
  }
}

function selectObject(id: ObjectId): void {
  objectId = id
  saveMainWindowBounds()
  broadcastObjectId()
}

function resizeCompanion(size: ObjectSize): void {
  objectSize = size
  if (mainWindow && !mainWindow.isDestroyed()) {
    const bounds = mainWindow.getBounds()
    const nextSize = isSessionPanelOpen
      ? getExpandedCompanionWindowSize(COMPANION_WINDOW_SIZES[size]).window
      : COMPANION_WINDOW_SIZES[size]
    const next = clampToVisibleWorkArea({ ...bounds, ...nextSize }, nextSize)
    mainWindow.setBounds(next, false)
    scheduleBoundsSave()
  }
  broadcastObjectSize()
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
    { label: '오브제 창 표시/숨기기', click: toggleWindow },
    { type: 'separator' },
    { label: '종료', click: quitApp }
  ])
}

function createWindow(): BrowserWindow {
  const savedBounds = readSavedBounds()
  const window = new BrowserWindow({
    ...COMPANION_WINDOW_SIZES[objectSize],
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
    isSessionPanelOpen = false
    companionDrag = null
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
    ipcMain.handle(OPEN_RELEASES_CHANNEL, async (event) => {
      if (!isTrustedRenderer(event)) return false
      try {
        await shell.openExternal(RELEASES_URL)
        return true
      } catch {
        return false
      }
    })
    ipcMain.handle(USAGE_REFRESH_CHANNEL, async (event) => {
      if (!isTrustedRenderer(event)) return undefined
      if (!usageService) return undefined
      return usageService.refresh()
    })
    ipcMain.handle(USAGE_GET_CHANNEL, (event) => isTrustedRenderer(event) ? usageService?.getSnapshot() : undefined)
    ipcMain.handle(OBJECT_SIZE_GET_CHANNEL, (event) => isTrustedRenderer(event) ? objectSize : undefined)
    ipcMain.handle(OBJECT_ID_GET_CHANNEL, (event) => isTrustedRenderer(event) ? objectId : undefined)
    ipcMain.on(OBJECT_ID_SET_CHANNEL, (event, value: unknown) => {
      if (isTrustedRenderer(event) && isRegisteredObjectId(value)) selectObject(value)
    })
    ipcMain.on(OBJECT_SIZE_SET_CHANNEL, (event, value: unknown) => {
      if (isTrustedRenderer(event) && (value === 'small' || value === 'medium' || value === 'large')) resizeCompanion(value)
    })
    ipcMain.handle(LEGACY_SIZE_GET_CHANNEL, (event) => isTrustedRenderer(event) ? objectSize : undefined)
    ipcMain.on(LEGACY_SIZE_SET_CHANNEL, (event, value: unknown) => {
      if (isTrustedRenderer(event) && (value === 'small' || value === 'medium' || value === 'large')) resizeCompanion(value)
    })
    ipcMain.handle(USAGE_CONNECT_CLAUDE_CHANNEL, async (event) => isTrustedRenderer(event) ? usageService?.refresh({ allowKeychain: true }) : undefined)
    ipcMain.on(USAGE_CLOSE_CHANNEL, (event) => { if (isTrustedRenderer(event)) usageTray?.hide() })
    ipcMain.on(USAGE_BUCKET_CHANNEL, (event, id: unknown) => { if (isTrustedRenderer(event) && typeof id === 'string') usageTray?.setBucket(id) })
    ipcMain.on(OPEN_SETTINGS_CHANNEL, (event) => { if (isTrustedRenderer(event)) openSettings() })
    ipcMain.on(TOGGLE_COMPANION_CHANNEL, (event) => { if (isTrustedRenderer(event)) toggleWindow() })
    ipcMain.on(QUIT_CHANNEL, (event) => { if (isTrustedRenderer(event)) quitApp() })
    ipcMain.on(COMPANION_PANEL_CHANNEL, (event, isOpen: unknown) => { if (isTrustedRenderer(event) && typeof isOpen === 'boolean') setSessionPanelOpen(isOpen) })
    ipcMain.on(COMPANION_DRAG_START_CHANNEL, (event, value: unknown) => { if (isTrustedRenderer(event)) startCompanionDrag(value) })
    ipcMain.on(COMPANION_DRAG_MOVE_CHANNEL, (event, value: unknown) => { if (isTrustedRenderer(event)) moveCompanion(value) })
    ipcMain.on(COMPANION_DRAG_END_CHANNEL, (event) => { if (isTrustedRenderer(event)) companionDrag = null })
    mainWindow = createWindow()
    tray = createTray()
    usageService = new UsageService((snapshot: UsageSnapshot) => {
      usageTray?.updateTray(snapshot)
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(USAGE_SNAPSHOT_CHANNEL, snapshot)
      if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send(USAGE_SNAPSHOT_CHANNEL, snapshot)
    })
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
