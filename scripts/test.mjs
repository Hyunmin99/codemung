import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const vitestArgs = ['exec', 'vitest', 'run', ...process.argv.slice(2)]
const vitest = spawnSync(npm, vitestArgs, { stdio: 'inherit' })

if (vitest.status !== 0) process.exit(vitest.status ?? 1)

if (process.argv.length === 2) {
  const legacy = spawnSync(npm, ['run', 'test:legacy'], { stdio: 'inherit' })
  process.exit(legacy.status ?? 1)
}
