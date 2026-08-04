import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const compiledMainPath = join(repositoryRoot, 'out/main/index.js')
const compiledPreloadPath = join(repositoryRoot, 'out/preload/index.mjs')
const appSourcePath = join(repositoryRoot, 'src/renderer/src/App.tsx')
const stylesSourcePath = join(repositoryRoot, 'src/renderer/src/styles.css')

test('compiled BrowserWindows load the emitted preload bundle', () => {
  assert.equal(existsSync(compiledPreloadPath), true, 'preload bundle must exist')

  const compiledMain = readFileSync(compiledMainPath, 'utf8')

  assert.match(compiledMain, /\.\.\/preload\/index\.mjs/)
  assert.doesNotMatch(compiledMain, /\.\.\/preload\/index\.js/)
})

test('companion uses Electron native draggable regions', () => {
  const appSource = readFileSync(appSourcePath, 'utf8')
  const stylesSource = readFileSync(stylesSourcePath, 'utf8')
  const companionRule = stylesSource.match(/\.companion\s*\{[^}]+\}/s)?.[0] ?? ''

  assert.match(companionRule, /-webkit-app-region:\s*drag/)
  assert.doesNotMatch(appSource, /onPointer(?:Down|Move|Up|Cancel)/)
  assert.doesNotMatch(appSource, /(?:start|move|end)WindowDrag/)
})
