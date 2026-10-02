import { chmod, mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export type InstallResult = { ok: boolean; status: 'installed' | 'removed' | 'already-installed' | 'missing' | 'invalid-settings' | 'error'; message?: string }
const HOOK_MARKER = 'codemung-claude-hook'
export type ClaudeConnectionStatus = { statusLineInstalled: boolean; hooksInstalled: boolean; backupConflict: boolean }
export function claudeHookCommand(): string { return `# ${HOOK_MARKER}\ncurl --silent --max-time 2 --connect-timeout 1 -H 'Content-Type: application/json' --data-binary @- 'http://127.0.0.1:48163/hook/claude' >/dev/null 2>&1 || true\nexit 0` }
export function installClaudeHooks(settings: any): any {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } }
  const command = claudeHookCommand()
  for (const event of ['SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'Notification', 'Stop', 'StopFailure', 'SessionEnd']) {
    const groups = Array.isArray(next.hooks[event]) ? [...next.hooks[event]] : []
    if (!groups.some((group: any) => group?.hooks?.some((hook: any) => typeof hook.command === 'string' && hook.command.includes(HOOK_MARKER)))) groups.push({ hooks: [{ type: 'command', command }] })
    next.hooks[event] = groups
  }
  return next
}
export function removeClaudeHooks(settings: any): any {
  const next = { ...settings, hooks: { ...(settings.hooks ?? {}) } }
  for (const [event, groups] of Object.entries(next.hooks)) {
    if (!Array.isArray(groups)) continue
    const retained = groups.map((group: any) => ({ ...group, hooks: Array.isArray(group?.hooks) ? group.hooks.filter((hook: any) => !(typeof hook.command === 'string' && hook.command.includes(HOOK_MARKER))) : group.hooks })).filter((group: any) => !Array.isArray(group.hooks) || group.hooks.length)
    if (retained.length) next.hooks[event] = retained
    else delete next.hooks[event]
  }
  if (!Object.keys(next.hooks).length) delete next.hooks
  return next
}
export async function getClaudeConnectionStatus(home = homedir()): Promise<ClaudeConnectionStatus> {
  try {
    const settings = JSON.parse(await readFile(join(home, '.claude', 'settings.json'), 'utf8'))
    const serialized = JSON.stringify(settings.hooks ?? {})
    const backupExists = await stat(`${join(home, '.claude', 'settings.json')}.codemung-backup`).then(() => true, () => false)
    return { statusLineInstalled: typeof settings.statusLine?.command === 'string' && settings.statusLine.command.includes('codemung-statusline.sh'), hooksInstalled: serialized.includes(HOOK_MARKER), backupConflict: backupExists && !(typeof settings.statusLine?.command === 'string' && settings.statusLine.command.includes('codemung-statusline.sh')) }
  } catch { return { statusLineInstalled: false, hooksInstalled: false, backupConflict: false } }
}

function wrapperSource(command: string | null): string {
  const encoded = Buffer.from(command ?? '').toString('base64')
  const runOriginal = command ? `TMP=$(mktemp) || exit 1\nsh -c "$(printf '%s' '${encoded}' | base64 -D)" <"$INPUT" >"$TMP"\nCODE=$?\ncat "$TMP"\nrm -f "$TMP"` : 'CODE=0'
  return `#!/bin/sh\nINPUT=$(mktemp) || exit 1\ncat >"$INPUT"\n${runOriginal}\n(curl --silent --show-error --max-time 2 --connect-timeout 1 -H 'Content-Type: application/json' --data-binary @"$INPUT" 'http://127.0.0.1:48163/usage/claude'; rm -f "$INPUT") </dev/null >/dev/null 2>&1 &\nexit $CODE\n`
}

export async function installClaudeStatusLine(home = homedir()): Promise<InstallResult> {
  const settingsPath = join(home, '.claude', 'settings.json')
  const wrapperPath = join(home, '.claude', 'codemung-statusline.sh')
  const backupPath = `${settingsPath}.codemung-backup`
  try {
    await mkdir(join(home, '.claude'), { recursive: true })
    const raw = await readFile(settingsPath, 'utf8').catch((error: any) => { if (error?.code === 'ENOENT') return '{}' as string; throw error })
    const settings = JSON.parse(raw)
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return { ok: false, status: 'invalid-settings' }
    settings.hooks = installClaudeHooks(settings).hooks
    const current = settings.statusLine
    if (typeof current?.command === 'string' && current.command.includes('codemung-statusline.sh')) {
      await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
      return { ok: true, status: 'already-installed' }
    }
    const backup = { present: Object.prototype.hasOwnProperty.call(settings, 'statusLine'), value: current ?? null }
    try { await writeFile(backupPath, JSON.stringify(backup), { flag: 'wx' }) }
    catch (error: any) {
      if (error?.code === 'EEXIST') return { ok: false, status: 'error', message: '기존 Claude status line 백업 파일이 있어 덮어쓰지 않았습니다. 설정 확인 후 백업 파일을 정리해 주세요.' }
      throw error
    }
    await writeFile(wrapperPath, wrapperSource(typeof current?.command === 'string' && current.command.trim() ? current.command : null), { mode: 0o700 })
    await chmod(wrapperPath, 0o700)
    settings.statusLine = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}), type: current?.type ?? 'command', command: `/bin/sh "${wrapperPath}"` }
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    return { ok: true, status: 'installed' }
  } catch { return { ok: false, status: 'error' } }
}

export async function removeClaudeStatusLine(home = homedir()): Promise<InstallResult> {
  const settingsPath = join(home, '.claude', 'settings.json')
  const backupPath = `${settingsPath}.codemung-backup`
  try {
    const settings = JSON.parse(await readFile(settingsPath, 'utf8'))
    settings.hooks = removeClaudeHooks(settings).hooks
    let backup: { present: boolean; value: unknown } | null = null
    try { backup = JSON.parse(await readFile(backupPath, 'utf8')) as { present: boolean; value: unknown } } catch { /* Hooks can be removed independently. */ }
    if (!backup) {
      await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
      if (settings.statusLine?.command?.includes('codemung-statusline.sh')) return { ok: false, status: 'error', message: '세션 훅은 해제했지만 status line 백업이 없어 제거하지 않았습니다. 백업 파일을 복구한 뒤 다시 시도해 주세요.' }
      return { ok: true, status: 'removed', message: 'Claude 세션 훅 연결을 해제했습니다.' }
    }
    if (settings.statusLine?.command && !settings.statusLine.command.includes('codemung-statusline.sh')) {
      await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
      return { ok: false, status: 'error', message: 'Claude 세션 훅은 해제했습니다. status line은 CodeMung 설치 후 변경되어 복원하지 않았습니다. settings.json과 codemung-backup을 확인해 주세요.' }
    }
    if (backup.present) settings.statusLine = backup.value
    else delete settings.statusLine
    await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
    await unlink(join(home, '.claude', 'codemung-statusline.sh')).catch(() => undefined)
    await unlink(backupPath).catch(() => undefined)
    return { ok: true, status: 'removed' }
  } catch { return { ok: false, status: 'missing' } }
}
