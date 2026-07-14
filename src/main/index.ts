import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron'
import { join } from 'node:path'

const APP_INFO_CHANNEL = 'app:get-info'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
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

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 280,
    height: 280,
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
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  window.setAlwaysOnTop(true, 'floating')
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false })

  window.on('close', (event) => {
    if (isQuitting) return

    event.preventDefault()
    window.hide()
  })

  window.on('closed', () => {
    mainWindow = null
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  window.once('ready-to-show', () => window.show())

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
      { label: '표시/숨기기', click: toggleWindow },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])
  )
  appTray.on('click', toggleWindow)

  return appTray
}

if (hasSingleInstanceLock) {
  app.on('second-instance', showWindow)

  app.on('before-quit', () => {
    isQuitting = true
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

    mainWindow = createWindow()
    tray = createTray()
  })
}
