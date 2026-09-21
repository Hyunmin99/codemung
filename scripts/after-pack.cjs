'use strict'

const { execFileSync } = require('node:child_process')
const path = require('node:path')

/**
 * electron-builder skips signing because `identity: null` is set in
 * electron-builder.yml, which leaves the bundle with only Electron's
 * linker-signed signature. macOS on Apple Silicon refuses to launch such a
 * bundle and reports it as damaged, so apply an ad-hoc signature here.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit'
  })
  execFileSync('codesign', ['--verify', '--strict', appPath], {
    stdio: 'inherit'
  })

  console.log(`  • ad-hoc signed  path=${appPath}`)
}
