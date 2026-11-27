import type { Plugin } from 'vite'
import { createWriteStream, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const archiver = require('archiver')

/** Package the three required Komari inputs, failing on incomplete releases. */
export function komariThemeZip(rootDir: string, commitHash: string): Plugin {
  return {
    name: 'komari-theme-zip',
    apply: 'build',
    async closeBundle() {
      const zipFileName = `komari-theme-emerald-build-${commitHash}.zip`
      const distDir = resolve(rootDir, 'dist')
      const manifest = resolve(rootDir, 'komari-theme.json')
      const preview = resolve(rootDir, 'docs/preview.png')
      for (const input of [distDir, manifest, preview]) {
        if (!existsSync(input))
          throw new Error(`[komari-theme-zip] Required input missing: ${input}`)
      }

      const output = createWriteStream(resolve(rootDir, zipFileName))
      const archive = archiver('zip', { zlib: { level: 9 } })
      await new Promise<void>((resolve, reject) => {
        function fail(error: Error): void {
          archive.abort()
          output.destroy()
          reject(error)
        }
        output.on('error', fail)
        archive.on('error', fail)
        archive.on('warning', fail)
        output.on('close', () => resolve())
        archive.pipe(output)
        archive.file(manifest, { name: 'komari-theme.json' })
        archive.file(preview, { name: 'preview.png' })
        archive.directory(distDir, 'dist')
        void archive.finalize().catch(fail)
      })
      console.info(`[komari-theme-zip] Created ${zipFileName} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`)
    },
  }
}
