import { BrowserWindow, nativeImage, screen, Tray } from 'electron'
import { join } from 'node:path'
import type { UsageSnapshot } from '../shared/usage'
import { CLAUDE_ICON_PATH, CLAUDE_ICON_PNG, CODEX_ICON_PATH, CODEX_ICON_PNG } from '../shared/provider-icons'

const USAGE_WINDOW = { width: 356, height: 620 }
const TRAY_ICON_SIZE = 14
const TRAY_ICON_CANVAS = 18

/**
 * NSStatusItem can ignore the pixel dimensions of a resized PNG on Retina
 * displays and scale it back to the source's logical size. Use an SVG canvas
 * with explicit transparent padding on macOS instead: the canvas stays at the
 * normal 18pt menu-bar footprint while the provider glyph is a reliable 14.4pt
 * (80%) and leaves ~2pt before the title starts.
 */
function trayImage(provider: 'codex' | 'claude'): Electron.NativeImage {
  const path = provider === 'codex' ? CODEX_ICON_PATH : CLAUDE_ICON_PATH
  if (process.platform === 'darwin') {
    const glyphSize = 14.4
    const inset = (TRAY_ICON_CANVAS - glyphSize) / 2
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TRAY_ICON_CANVAS}" height="${TRAY_ICON_CANVAS}" viewBox="0 0 ${TRAY_ICON_CANVAS} ${TRAY_ICON_CANVAS}"><path fill="black" d="${path}" transform="translate(${inset} ${inset}) scale(${glyphSize / 24})"/></svg>`
    const image = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
    // Electron versions on macOS can return an empty NativeImage for SVG data
    // URLs. Keep the tray item alive with the bundled PNG in that case.
    if (image.isEmpty()) {
      const fallback = nativeImage.createFromBuffer(Buffer.from(provider === 'codex' ? CODEX_ICON_PNG : CLAUDE_ICON_PNG, 'base64')).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE })
      fallback.setTemplateImage(true)
      return fallback
    }
    image.setTemplateImage(true)
    return image
  }
  const png = provider === 'codex' ? CODEX_ICON_PNG : CLAUDE_ICON_PNG
  const image = nativeImage.createFromBuffer(Buffer.from(png, 'base64')).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE })
  image.setTemplateImage(false)
  return image
}
export interface UsageTrayController { show(snapshot: UsageSnapshot): void; hide(): void; toggle(snapshot: UsageSnapshot): void; updateTray(snapshot: UsageSnapshot): void; setBucket(id: string): void; destroy(): void }
export function createUsageTrayController(tray: Tray, loadRenderer: (window: BrowserWindow, hash?: string) => void, onClose: () => void, onContextMenu: (tray: Tray) => void, onOpen: () => void): UsageTrayController {
  let window: BrowserWindow | null = null; let latest: UsageSnapshot | null = null; let selectedBucketId = ''; let activeTray = tray
  let codexTray: Tray | null = tray
  let claudeTray: Tray | null = null
  // Claude is only shown while its credentials are currently usable. Codex
  // may retain a useful authenticated snapshot during a transient refresh
  // failure, so keep its item for stale data that still has usage buckets.
  const codexConnected = (provider: UsageSnapshot['codex']): boolean =>
    provider.status === 'ready' || (provider.status === 'stale' && provider.buckets.length > 0 && provider.updatedAt !== null)
  const claudeConnected = (provider: UsageSnapshot['claude']): boolean => provider.status === 'ready'
  const attachTray = (provider: 'codex' | 'claude', target: Tray): void => {
    target.setImage(trayImage(provider)); target.setToolTip(`${provider === 'codex' ? 'Codex' : 'Claude'} 사용량`)
    target.on('click', () => toggleFrom(target)); target.on('right-click', () => onContextMenu(target))
  }
  const setTrayVisibility = (provider: 'codex' | 'claude', visible: boolean): Tray | null => {
    const current = provider === 'codex' ? codexTray : claudeTray
    if (visible) {
      if (current && !current.isDestroyed()) return current
      const next = new Tray(trayImage(provider)); attachTray(provider, next)
      if (provider === 'codex') codexTray = next; else claudeTray = next
      return next
    }
    if (current && !current.isDestroyed()) current.destroy()
    if (provider === 'codex') codexTray = null; else claudeTray = null
    return null
  }
  attachTray('codex', tray)
  const ensureWindow = (): BrowserWindow => { if (window && !window.isDestroyed()) return window; window = new BrowserWindow({ ...USAGE_WINDOW, show: false, frame: false, resizable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, alwaysOnTop: true, backgroundColor: '#00000000', webPreferences: { preload: join(__dirname, '../preload/index.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } }); window.setAlwaysOnTop(true, 'pop-up-menu'); window.on('blur', () => { if (window && !window.isDestroyed()) window.hide() }); window.on('closed', () => { window = null }); window.webContents.on('did-finish-load', () => { if (latest) window?.webContents.send('usage:snapshot', latest) }); loadRenderer(window, 'usage'); return window }
  const position = (target: BrowserWindow): void => { const source = activeTray && !activeTray.isDestroyed() ? activeTray : codexTray ?? claudeTray; if (!source) return; const bounds = source.getBounds(); const area = screen.getDisplayMatching(bounds).workArea; const height = Math.min(USAGE_WINDOW.height, area.height); const x = Math.min(Math.max(Math.round(bounds.x + bounds.width / 2 - USAGE_WINDOW.width / 2), area.x), area.x + area.width - USAGE_WINDOW.width); const y = process.platform === 'darwin' ? area.y : Math.min(bounds.y + bounds.height + 6, area.y + area.height - height); target.setSize(USAGE_WINDOW.width, height, false); target.setPosition(x, y, false) }
  const emptySnapshot = (): UsageSnapshot => ({ codex: { provider: 'codex', status: 'loading', buckets: [], updatedAt: null }, claude: { provider: 'claude', status: 'loading', buckets: [], updatedAt: null } })
  const toggleFrom = (source: Tray): void => { activeTray = source; if (window?.isVisible()) { window.hide(); return }; const snapshot = latest ?? emptySnapshot(); latest = snapshot; onOpen(); const target = ensureWindow(); position(target); target.show(); target.focus(); target.webContents.send('usage:snapshot', snapshot) }
  const titleWithGap = (value: string): string => process.platform === 'darwin' ? `\u2009${value}` : value
  return { show(snapshot) { latest = snapshot; onOpen(); const target = ensureWindow(); position(target); target.show(); target.focus(); target.webContents.send('usage:snapshot', snapshot) }, hide() { if (window && !window.isDestroyed()) window.hide() }, toggle(snapshot) { if (window?.isVisible()) this.hide(); else this.show(snapshot) }, updateTray(snapshot) { latest = snapshot; const selected = snapshot.codex.buckets.find((bucket) => bucket.id === selectedBucketId) ?? snapshot.codex.buckets[0]; const codex = selected?.fiveHour; const claude = snapshot.claude.buckets[0]?.fiveHour; const label = (value: number | undefined) => value == null ? '—' : `${Math.round(Math.max(0, Math.min(100, 100 - value)))}%`; const codexTarget = setTrayVisibility('codex', codexConnected(snapshot.codex)); const claudeTarget = setTrayVisibility('claude', claudeConnected(snapshot.claude)); if (codexTarget) codexTarget.setTitle(process.platform === 'darwin' ? titleWithGap(`${label(codex?.usedPercent)}${selected?.weekly?.usedPercent === 100 ? ' !' : ''}`) : 'CodeMung'); if (claudeTarget) claudeTarget.setTitle(process.platform === 'darwin' ? titleWithGap(`${label(claude?.usedPercent)}${snapshot.claude.buckets[0]?.weekly?.usedPercent === 100 ? ' !' : ''}`) : 'Claude'); if (window && !window.isDestroyed()) window.webContents.send('usage:snapshot', snapshot) }, setBucket(id) { if (typeof id === 'string' && id.length <= 120) { selectedBucketId = id; if (latest) this.updateTray(latest) } }, destroy() { onClose(); if (codexTray && !codexTray.isDestroyed()) codexTray.destroy(); if (claudeTray && !claudeTray.isDestroyed()) claudeTray.destroy(); if (window && !window.isDestroyed()) window.destroy(); window = null } }
}
