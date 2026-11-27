import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
export function localSnapshotApi(rootDir: string): Plugin {
  return {
    name: 'komari-local-snapshot-api',
    apply: 'serve',
    configureServer(server) {
      const snapshotCandidates = [
        resolve(rootDir, '..', 'komari-live-dedirock-us-20260921', 'data', 'current-public-snapshot.json'),
        resolve(rootDir, '..', 'Server-Ops-History', '05-Komari主题', 'komari-live-dedirock-us-20260921', 'data', 'current-public-snapshot.json'),
      ]
      const snapshotPath = snapshotCandidates.find(candidate => existsSync(candidate))
      if (!snapshotPath) {
        console.warn(`[komari-local-snapshot-api] Snapshot not found in candidates:\n${snapshotCandidates.join('\n')}`)
        return
      }

      let snapshot: LocalSnapshot
      try {
        snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as LocalSnapshot
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
                  'public:queryMetrics',
                  'public:getPingMetricStats',
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
              case 'common:getNodeRecentStatus': {
                const params = isRecord(request.params) ? request.params : {}
                const uuid = typeof params.uuid === 'string' ? params.uuid : ''
                const status = isRecord(snapshot.statuses) && isRecord(snapshot.statuses[uuid]) ? snapshot.statuses[uuid] : null
                if (!status) {
                  result = { count: 0, records: [] }
                  break
                }
                const nowMs = Date.now()
                const records = Array.from({ length: 24 }, (_, idx) => {
                  const wave = Math.sin(idx * 0.45) * 0.12
                  return {
                    ...status,
                    client: uuid,
                    time: new Date(nowMs - (23 - idx) * 60_000).toISOString(),
                    cpu: Math.max(0, Math.min(100, Number(status.cpu ?? 0) * (1 + wave))),
                    net_in: Math.max(0, Math.round(Number(status.net_in ?? 0) * (1 + wave))),
                    net_out: Math.max(0, Math.round(Number(status.net_out ?? 0) * (1 - wave))),
                  }
                })
                result = { count: records.length, records }
                break
              }
              case 'common:getRecords':
                result = { records: [] }
                break
              case 'public:queryMetrics': {
                const params = isRecord(request.params) ? request.params : {}
                const uuid = typeof params.entity_id === 'string' ? params.entity_id : ''
                const metricKeys = Array.isArray(params.metric_keys) ? params.metric_keys.filter((k): k is string => typeof k === 'string') : []
                const hours = typeof params.hours === 'number' && params.hours > 0 ? params.hours : 1
                const status = isRecord(snapshot.statuses) && isRecord(snapshot.statuses[uuid]) ? snapshot.statuses[uuid] : null
                if (!status) {
                  result = { series: [] }
                  break
                }
                const nowMs = Date.now()
                const pointCount = 30
                const stepMs = (hours * 3600_000) / pointCount
                const pingMap = isRecord(status.ping) ? status.ping : {}

                if (metricKeys.includes('ping.latency_ms') || metricKeys.includes('ping.loss')) {
                  const series: Array<Record<string, unknown>> = []
                  for (const [taskId, pingRaw] of Object.entries(pingMap)) {
                    if (!isRecord(pingRaw))
                      continue
                    const avgLatency = Number(pingRaw.avg ?? pingRaw.latest ?? 50)
                    const lossPct = Number(pingRaw.loss ?? 0)
                    if (metricKeys.includes('ping.latency_ms')) {
                      series.push({
                        metric_key: 'ping.latency_ms',
                        tags: { task_id: taskId },
                        points: Array.from({ length: pointCount }, (_, idx) => ({
                          time: new Date(nowMs - (pointCount - 1 - idx) * stepMs).toISOString(),
                          value: Math.max(1, Math.round(avgLatency * (1 + Math.sin(idx * 0.6 + Number(taskId)) * 0.1))),
                        })),
                      })
                    }
                    if (metricKeys.includes('ping.loss')) {
                      series.push({
                        metric_key: 'ping.loss',
                        tags: { task_id: taskId },
                        points: Array.from({ length: pointCount }, (_, idx) => ({
                          time: new Date(nowMs - (pointCount - 1 - idx) * stepMs).toISOString(),
                          value: idx === 12 && lossPct > 0 ? 1 : 0,
                        })),
                      })
                    }
                  }
                  result = { series }
                  break
                }

                const loadFieldMap: Record<string, number> = {
                  'cpu.usage': Number(status.cpu ?? 0),
                  'gpu.usage': Number(status.gpu ?? 0),
                  'load.average': Number(status.load ?? 0),
                  'memory.used': Number(status.ram ?? 0),
                  'swap.used': Number(status.swap ?? 0),
                  'temperature': Number(status.temp ?? 0),
                  'disk.used': Number(status.disk ?? 0),
                  'net.in.rate': Number(status.net_in ?? 0),
                  'net.out.rate': Number(status.net_out ?? 0),
                  'net.total.up': Number(status.net_total_up ?? 0),
                  'net.total.down': Number(status.net_total_down ?? 0),
                  'process.count': Number(status.process ?? 0),
                  'connections.tcp': Number(status.connections ?? 0),
                  'connections.udp': Number(status.connections_udp ?? 0),
                }
                result = {
                  series: metricKeys
                    .filter(key => key in loadFieldMap)
                    .map(key => ({
                      metric_key: key,
                      points: Array.from({ length: pointCount }, (_, idx) => ({
                        time: new Date(nowMs - (pointCount - 1 - idx) * stepMs).toISOString(),
                        value: Math.max(0, (loadFieldMap[key] ?? 0) * (1 + Math.sin(idx * 0.4) * 0.08)),
                      })),
                    })),
                }
                break
              }
              case 'public:getPingMetricStats': {
                const params = isRecord(request.params) ? request.params : {}
                const uuid = typeof params.uuid === 'string' ? params.uuid : ''
                const status = isRecord(snapshot.statuses) && isRecord(snapshot.statuses[uuid]) ? snapshot.statuses[uuid] : null
                const pingMap = status && isRecord(status.ping) ? status.ping : {}
                result = {
                  stats: Object.entries(pingMap)
                    .filter(([, pingRaw]) => isRecord(pingRaw))
                    .map(([taskId, pingRaw]) => {
                      const p = pingRaw as Record<string, unknown>
                      const avg = Number(p.avg ?? 0)
                      const min = Number(p.min ?? avg)
                      const max = Number(p.max ?? avg)
                      return {
                        task_id: taskId,
                        name: typeof p.name === 'string' ? p.name : `Ping ${taskId}`,
                        type: 'icmp',
                        interval: 60,
                        loss: Number(p.loss ?? 0),
                        min,
                        max,
                        avg,
                        latest: Number(p.latest ?? avg),
                        total: 60,
                        p50: avg,
                        p99: max,
                        p99_p50_ratio: avg > 0 ? Number((max / avg).toFixed(2)) : 1,
                      }
                    }),
                }
                break
              }
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
