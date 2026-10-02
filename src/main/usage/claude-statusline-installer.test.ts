import { mkdir, mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { installClaudeHooks, installClaudeStatusLine, removeClaudeHooks, removeClaudeStatusLine } from './claude-statusline-installer'

let root = ''
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); root = '' })

describe('Claude status line installer', () => {
  it('adds and removes only marked hooks while preserving existing hook commands', () => {
    const original = { hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo keep' }] }] }, extra: true }
    const installed = installClaudeHooks(original)
    expect(installed.hooks.Stop).toHaveLength(2)
    expect(removeClaudeHooks(installed)).toEqual(original)
  })
  it('backs up existing settings and restores them on removal', async () => {
    root = await mkdtemp(join(tmpdir(), 'codemung-claude-'))
    const directory = join(root, '.claude')
    const path = join(directory, 'settings.json')
    const original = JSON.stringify({ statusLine: { type: 'command', command: 'echo ok' }, other: true })
    await mkdir(directory)
    await writeFile(path, original)
    expect((await installClaudeStatusLine(root)).status).toBe('installed')
    expect(JSON.parse(await readFile(path, 'utf8')).statusLine.command).toContain('codemung-statusline.sh')
    const updated = JSON.parse(await readFile(path, 'utf8'))
    updated.anotherSetting = 'keep this'
    await writeFile(path, JSON.stringify(updated))
    expect((await removeClaudeStatusLine(root)).status).toBe('removed')
    const restored = JSON.parse(await readFile(path, 'utf8'))
    expect(restored).toEqual({ statusLine: { type: 'command', command: 'echo ok' }, other: true, anotherSetting: 'keep this' })
    await expect(access(`${path}.codemung-backup`)).rejects.toThrow()
  })

  it('installs relay-only status line when no original command exists', async () => {
    root = await mkdtemp(join(tmpdir(), 'codemung-claude-empty-'))
    const directory = join(root, '.claude')
    const path = join(directory, 'settings.json')
    await mkdir(directory)
    await writeFile(path, JSON.stringify({ theme: 'dark', statusLine: { type: 'command', padding: 3 } }))
    expect((await installClaudeStatusLine(root)).status).toBe('installed')
    const installed = JSON.parse(await readFile(path, 'utf8'))
    expect(installed.statusLine).toMatchObject({ type: 'command', padding: 3 })
    expect(installed.statusLine.command).toContain('codemung-statusline.sh')
    expect(await readFile(`${path}.codemung-backup`, 'utf8')).toContain('"value":{"type":"command","padding":3}')
  })

  it('refuses to install over a pre-existing backup for a non-CodeMung command', async () => {
    root = await mkdtemp(join(tmpdir(), 'codemung-claude-stale-backup-'))
    const directory = join(root, '.claude')
    const path = join(directory, 'settings.json')
    await mkdir(directory)
    const original = JSON.stringify({ statusLine: { command: 'echo current' }, keep: true })
    await writeFile(path, original)
    await writeFile(`${path}.codemung-backup`, JSON.stringify({ present: true, value: { command: 'echo stale' } }))
    const result = await installClaudeStatusLine(root)
    expect(result).toMatchObject({ ok: false, status: 'error' })
    expect(result.message).toContain('백업 파일')
    expect(await readFile(path, 'utf8')).toBe(original)
  })
})
