import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const compiledMainPath = join(repositoryRoot, 'out/main/index.js')
const compiledPreloadPath = join(repositoryRoot, 'out/preload/index.cjs')
const appSourcePath = join(repositoryRoot, 'src/renderer/src/App.tsx')
const stylesSourcePath = join(repositoryRoot, 'src/renderer/src/styles.css')
const companionSurfacePath = join(repositoryRoot, 'src/renderer/src/companion/CompanionSurface.tsx')
const preloadSourcePath = join(repositoryRoot, 'src/preload/index.ts')

test('compiled BrowserWindows load the emitted preload bundle', () => {
  assert.equal(existsSync(compiledPreloadPath), true, 'preload bundle must exist')

  const compiledMain = readFileSync(compiledMainPath, 'utf8')

  assert.match(compiledMain, /\.\.\/preload\/index\.cjs/)
  assert.doesNotMatch(compiledMain, /\.\.\/preload\/index\.(?:mjs|js)/)
})

test('companion uses renderer pointer gestures with main-process drag IPC', () => {
  const appSource = readFileSync(appSourcePath, 'utf8')
  const stylesSource = readFileSync(stylesSourcePath, 'utf8')
  const companionSurface = readFileSync(companionSurfacePath, 'utf8')
  const preloadSource = readFileSync(preloadSourcePath, 'utf8')
  const companionRule = stylesSource.match(/\.companion\s*\{[^}]+\}/s)?.[0] ?? ''
  const triggerRule = stylesSource.match(/\.companion-trigger\s*\{[^}]+\}/s)?.[0] ?? ''

  assert.doesNotMatch(companionRule, /-webkit-app-region:\s*drag/)
  assert.match(triggerRule, /-webkit-app-region:\s*no-drag/)
  assert.match(companionSurface, /CLICK_DRAG_THRESHOLD_PX = 5/)
  assert.match(companionSurface, /onPointer(?:Down|Move|Up|Cancel)/)
  assert.match(appSource, /startCompanionDrag/)
  assert.match(preloadSource, /companion:drag-start/)
  assert.match(preloadSource, /companion:drag-move/)
})
