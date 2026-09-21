import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

import vueDevTools from 'vite-plugin-vue-devtools'

const require = createRequire(import.meta.url)
const fs = require('node:fs')
const archiver = require('archiver')

function getCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  }
  catch {
    return 'unknown'
  }
}

/**
 * Vite 插件：构建后打包 Komari 主题 Zip
 * theme.zip
 * ├── komari-theme.json
 * ├── preview.png
 * └── dist/
 */
function komariThemeZip(): Plugin {
  return {
    name: 'komari-theme-zip',
    apply: 'build',
    closeBundle: async () => {
      const commitHash = getCommitHash()
      const zipFileName = `komari-theme-emerald-build-${commitHash}.zip`
      const distDir = resolve(__dirname, 'dist')
      const themeJsonPath = resolve(__dirname, 'komari-theme.json')
      const previewPath = resolve(__dirname, 'docs/preview.png')
      const outputPath = resolve(__dirname, zipFileName)

      if (!existsSync(distDir)) {
        console.log('[komari-theme-zip] dist directory not found, skipping zip creation')
        return
      }

      const output = fs.createWriteStream(outputPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(2)
          console.log(`[komari-theme-zip] Created ${zipFileName} (${sizeMB} MB)`)
          resolve(undefined)
        })

        archive.on('error', (err: Error) => {
          console.error('[komari-theme-zip] Error:', err)
          reject(err)
        })

        archive.pipe(output)

        if (existsSync(themeJsonPath)) {
          archive.file(themeJsonPath, { name: 'komari-theme.json' })
        }

        if (existsSync(previewPath)) {
          archive.file(previewPath, { name: 'preview.png' })
        }

        archive.directory(distDir, 'dist')

        archive.finalize()
      })
    },
  }
}

interface LocalSnapshot {
  public_info?: Record<string, unknown>
  public_settings?: Record<string, unknown>
  backend_version?: Record<string, unknown>
  nodes?: Record<string, unknown>
  statuses?: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => body += chunk)
    req.on('end', () => {
      try {
        const value: unknown = JSON.parse(body)
        if (!isRecord(value)) {
          reject(new Error('RPC body must be a JSON object'))
          return
        }
        resolve(value)
      }
      catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, payload: unknown, statusCode = 200): void {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

/**
 * Serve a read-only copy of the live probe data during local development.
 * This is intentionally a Vite serve-only plugin and is never included in the
 * production theme bundle.
 */
function localSnapshotApi(): Plugin {
  return {
    name: 'komari-local-snapshot-api',
    apply: 'serve',
    configureServer(server) {
      const snapshotPath = resolve(__dirname, '..', 'komari-live-dedirock-us-20260921', 'data', 'current-public-snapshot.json')
      if (!fs.existsSync(snapshotPath)) {
        console.warn(`[komari-local-snapshot-api] Snapshot not found: ${snapshotPath}`)
        return
      }

      let snapshot: LocalSnapshot
      try {
        snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as LocalSnapshot
      }
      catch (error) {
        console.warn('[komari-local-snapshot-api] Failed to read snapshot:', error)
        return
      }

      const publicSettings = snapshot.public_settings ?? snapshot.public_info ?? {}
      const publicThemeSettings = isRecord(publicSettings.theme_settings) ? publicSettings.theme_settings : {}
      const localPublicSettings = {
        ...publicSettings,
        // The snapshot is static, so local preview uses HTTP polling instead of
        // opening a WebSocket that the Vite middleware does not emulate.
        theme_settings: { ...publicThemeSettings, rpcTransportMode: 'http' },
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url ?? '/', 'http://localhost').pathname

        if (pathname === '/api/rpc2' && req.method === 'POST') {
          try {
            const request = await readJsonBody(req)
            const id = request.id ?? null
            let result: unknown

            switch (request.method) {
              case 'rpc.ping':
                result = 'pong'
                break
              case 'rpc.getMethods':
                result = [
                  'rpc.ping',
                  'rpc.getMethods',
                  'common:getPublicInfo',
                  'common:getNodes',
                  'common:getNodesLatestStatus',
                  'common:getNodeRecentStatus',
                  'common:getRecords',
                ]
                break
              case 'common:getPublicInfo':
                result = snapshot.public_info ?? localPublicSettings
                break
              case 'common:getNodes':
                result = snapshot.nodes ?? {}
                break
              case 'common:getNodesLatestStatus':
                result = snapshot.statuses ?? {}
                break
              case 'common:getNodeRecentStatus':
                result = { count: 0, records: [] }
                break
              case 'common:getRecords':
                result = { records: [] }
                break
              default:
                sendJson(res, {
                  jsonrpc: '2.0',
                  error: { code: -32601, message: 'Method not found in local snapshot' },
                  id,
                }, 404)
                return
            }

            sendJson(res, { jsonrpc: '2.0', result, id })
          }
          catch (error) {
            sendJson(res, {
              jsonrpc: '2.0',
              error: { code: -32600, message: error instanceof Error ? error.message : 'Invalid RPC request' },
              id: null,
            }, 400)
          }
          return
        }

        if (pathname === '/api/public' && req.method === 'GET') {
          sendJson(res, { status: 'success', message: '', data: localPublicSettings })
          return
        }

        if (pathname === '/api/me' && req.method === 'GET') {
          sendJson(res, { logged_in: false, username: 'Guest' })
          return
        }

        if (pathname === '/api/version' && req.method === 'GET') {
          sendJson(res, {
            status: 'success',
            message: '',
            data: snapshot.backend_version ?? { version: 'local-snapshot', hash: 'local-snapshot' },
          })
          return
        }

        next()
      })

      console.info(`[komari-local-snapshot-api] Serving ${Object.keys(snapshot.nodes ?? {}).length} live nodes from ${snapshotPath}`)
    },
  }
}

const packageJson = require('./package.json')

export default defineConfig({
  define: {
    __BUILD_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_GIT_HASH__: JSON.stringify(getCommitHash()),
  },
  plugins: [
    localSnapshotApi(),
    vue(),
    vueDevTools(),
    tailwindcss(),
    komariThemeZip(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 用函数形式按模块路径归组：对象形式的 ['echarts'] 会把完整 echarts
        // 主入口强制打进 chunk（即使代码只用了 echarts/core 的按需注册）
        manualChunks(id: string) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/vue-echarts') || id.includes('node_modules/zrender'))
            return 'echarts'
          if (id.includes('node_modules/@vue/') || id.includes('node_modules/vue-router') || id.includes('node_modules/pinia') || id.includes('node_modules/vue/'))
            return 'vue-vendor'
          if (id.includes('node_modules/reka-ui'))
            return 'reka-ui'
          if (id.includes('node_modules/@vueuse/'))
            return 'vueuse'
        },
      },
    },
  },
})
