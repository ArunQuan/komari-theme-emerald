<script setup lang="ts">
import type { Arc, COBEOptions, Globe, Marker } from 'cobe'
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import {
  useDocumentVisibility,
  useElementSize,
  useElementVisibility,
  useRafFn,
} from '@vueuse/core'
import createGlobe from 'cobe'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getCoordByCode, getCountryCodeFromRegion } from '@/utils/geoHelper'
import { formatBytesPerSecondSplit } from '@/utils/helper'
import { perfTier } from '@/utils/perfTier'

const props = defineProps<{
  nodes?: NodeData[]
}>()
const appStore = useAppStore()
const nodesStore = useNodesStore()

const displayNodes = computed(() => props.nodes ?? nodesStore.nodes)

const containerRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const arcCanvasRef = ref<HTMLCanvasElement>()
const { width: containerWidth, height: containerHeight } = useElementSize(containerRef)

const documentVisibility = useDocumentVisibility()
const elementVisible = useElementVisibility(containerRef)
const shouldRender = computed(() => documentVisibility.value === 'visible' && elementVisible.value)
// low 档强制静止（可拖拽）：不自转时 RAF 空转即跳帧，WebGL 成本归零
const shouldAutoRotate = computed(() => !appStore.stopEarth && perfTier.value !== 'low')
const useFlowingArcOverlay = computed(() => perfTier.value !== 'low')
const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches

let globe: Globe | null = null
const INITIAL_THETA = 0.22
const MIN_THETA = -0.65
const MAX_THETA = 0.65
const CHINA_COORD = getCoordByCode('CN') ?? [35.8617, 104.1954]
const DEFAULT_PHI = normalizePhi(-Math.PI / 2 - CHINA_COORD[1] * Math.PI / 180)
let phi = DEFAULT_PHI
let targetPhi = phi
let theta = INITIAL_THETA
let targetTheta = INITIAL_THETA
let isPointerDown = false
let lastPointerX = 0
let lastPointerY = 0
let staticRedrawUntil = 0
// Inertia: velocity accumulated during drag, decays after release
let velocityPhi = 0
let velocityTheta = 0
const INERTIA_DECAY = 0.92
const INERTIA_MIN = 0.0001

function normalizePhi(value: number): number {
  const circle = Math.PI * 2
  let next = value % circle
  if (next <= -Math.PI)
    next += circle
  if (next > Math.PI)
    next -= circle
  return next
}

function clampTheta(value: number): number {
  return Math.min(Math.max(value, MIN_THETA), MAX_THETA)
}

function resetStoppedView() {
  phi = DEFAULT_PHI
  targetPhi = DEFAULT_PHI
  theta = INITIAL_THETA
  targetTheta = INITIAL_THETA
}

function triggerStaticRedrawWindow(duration = 1500) {
  if (typeof performance === 'undefined') {
    staticRedrawUntil = Date.now() + duration
    return
  }
  staticRedrawUntil = performance.now() + duration
}

function shouldKeepStaticRedraw(): boolean {
  const now = typeof performance === 'undefined' ? Date.now() : performance.now()
  return now < staticRedrawUntil
}

const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 768

// 移动端 30fps 足够（装饰性自转），自转步长/跟随系数按帧率补偿保持视觉速度一致
const GLOBE_FPS_LIMIT = isSmallScreen ? 30 : undefined
const AUTO_ROTATE_STEP = isSmallScreen ? 0.006 : 0.003
const ORIENTATION_LERP = isSmallScreen ? 0.22 : 0.12

// 减少高采样导致的性能问题：按原生 DPR 渲染、上限 2（移动端 1.5，low 档 1）。
// 之前强制最低 1.5 会让 DPR=1 的显示器每帧多画 2.25 倍像素（同上游 87cc17a）
// DPR 在 createGlobe 时固化，探针中途降档只影响下次访问（判级已持久化）
function getCappedDpr(): number {
  if (typeof window === 'undefined')
    return 1
  const cap = perfTier.value === 'low' ? 1 : isSmallScreen ? 1.5 : 2
  return Math.min(window.devicePixelRatio || 1, cap)
}

// 移动端降低 mapSamples 提升性能
function getMapSamples(): number {
  if (typeof window === 'undefined')
    return 14000
  return window.innerWidth < 768 ? 8000 : 14000
}

interface RegionCluster {
  code: string
  coord: [number, number]
  servers: number
  onlineServers: number
}

function clusterKey(c: RegionCluster) {
  return `${c.code}:${c.servers}:${c.onlineServers}`
}

// 节点按地区聚合
const regionClusters = computed<RegionCluster[]>(() => {
  const map = new Map<string, RegionCluster>()
  for (const node of displayNodes.value) {
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    const coord = getCoordByCode(code)
    if (!coord)
      continue

    let entry = map.get(code)
    if (!entry) {
      entry = { code, coord, servers: 0, onlineServers: 0 }
      map.set(code, entry)
    }
    entry.servers += 1
    if (node.online)
      entry.onlineServers += 1
  }
  return Array.from(map.values()).sort((a, b) => b.servers - a.servers)
})

interface RegionRate {
  up: number
  down: number
}

const regionRates = computed<Map<string, RegionRate>>(() => {
  const map = new Map<string, RegionRate>()
  for (const node of displayNodes.value) {
    if (!node.online)
      continue
    const code = getCountryCodeFromRegion(node.region)
    if (!code)
      continue
    let entry = map.get(code)
    if (!entry) {
      entry = { up: 0, down: 0 }
      map.set(code, entry)
    }
    entry.up += node.net_out || 0
    entry.down += node.net_in || 0
  }
  return map
})

function markerId(code: string): string {
  return `cdn-${code.toLowerCase()}`
}

// 挂载 marker
const anchorRefs = shallowRef<ReadonlyMap<string, HTMLDivElement>>(new Map())

function getAnchorEl(code: string): HTMLDivElement | undefined {
  return anchorRefs.value.get(markerId(code))
}

// 容器尺寸缓存
let cachedContainerW = 0
let cachedContainerH = 0
function refreshContainerSizeCache() {
  cachedContainerW = containerWidth.value || canvasRef.value?.clientWidth || 320
  cachedContainerH = containerHeight.value || canvasRef.value?.clientHeight || cachedContainerW
}

const patchedAnchors = new WeakSet<HTMLElement>()

interface AnchorCtx {
  xPx: number
  yPx: number
}
const anchorCtxs = new WeakMap<HTMLDivElement, AnchorCtx>()
const dirtyAnchors = new Set<HTMLDivElement>()

// 批量 flush 锚点位置
function flushDirtyAnchors() {
  if (dirtyAnchors.size === 0)
    return
  for (const el of dirtyAnchors) {
    const ctx = anchorCtxs.get(el)
    if (ctx)
      el.style.transform = `translate3d(${ctx.xPx}px, ${ctx.yPx}px, 0)`
  }
  dirtyAnchors.clear()
}

// 锚点定位改为性能更优、支持 GPU 加速的 transform
// 异常回落到 cobe 默认行为
function patchAnchorTransform(el: HTMLDivElement) {
  if (patchedAnchors.has(el))
    return
  refreshContainerSizeCache()
  const ctx: AnchorCtx = {
    xPx: ((Number.parseFloat(el.style.left) || 0) / 100) * cachedContainerW,
    yPx: ((Number.parseFloat(el.style.top) || 0) / 100) * cachedContainerH,
  }
  anchorCtxs.set(el, ctx)
  el.style.left = '0px'
  el.style.top = '0px'
  el.style.transform = `translate3d(${ctx.xPx}px, ${ctx.yPx}px, 0)`
  el.style.willChange = 'transform'
  try {
    Object.defineProperty(el.style, 'left', {
      configurable: true,
      enumerable: true,
      get() { return '0px' },
      set(v: string) {
        const next = ((Number.parseFloat(v) || 0) / 100) * cachedContainerW
        if (next === ctx.xPx)
          return
        ctx.xPx = next
        dirtyAnchors.add(el)
      },
    })
    Object.defineProperty(el.style, 'top', {
      configurable: true,
      enumerable: true,
      get() { return '0px' },
      set(v: string) {
        const next = ((Number.parseFloat(v) || 0) / 100) * cachedContainerH
        if (next === ctx.yPx)
          return
        ctx.yPx = next
        dirtyAnchors.add(el)
      },
    })
    patchedAnchors.add(el)
  }
  catch (err) {
    console.warn('[NodeEarthGlobe] anchor transform patch failed, falling back to cobe default', err)
  }
}

function patchAllAnchors() {
  if (!canvasRef.value)
    return
  const wrapper = canvasRef.value.parentElement
  if (!wrapper)
    return
  const anchors = wrapper.querySelectorAll<HTMLDivElement>('div[style*="--cobe-"]')
  anchors.forEach(patchAnchorTransform)
}

// hook wrapper.append：在 cobe 写入新锚点的第一个 left/top 之前完成 patch
const COBE_HOOK_FLAG = Symbol('cobeAppendHooked')
type HookableWrapper = HTMLElement & { [COBE_HOOK_FLAG]?: boolean }

function hookWrapperAppend() {
  if (!canvasRef.value)
    return
  const wrapper = canvasRef.value.parentElement as HookableWrapper | null
  if (!wrapper || wrapper[COBE_HOOK_FLAG])
    return
  wrapper[COBE_HOOK_FLAG] = true
  const origAppend = wrapper.append.bind(wrapper)
  wrapper.append = (...nodes: (Node | string)[]) => {
    const ret = origAppend(...nodes)
    for (const node of nodes) {
      if (node instanceof HTMLDivElement && node.style.cssText.includes('--cobe-'))
        patchAnchorTransform(node)
    }
    return ret
  }
}

function syncAnchorRefs() {
  if (!canvasRef.value) {
    anchorRefs.value = new Map()
    return
  }
  const wrapper = canvasRef.value.parentElement
  if (!wrapper) {
    anchorRefs.value = new Map()
    return
  }
  const next = new Map<string, HTMLDivElement>()
  for (const cluster of regionClusters.value) {
    const id = markerId(cluster.code)
    const el = wrapper.querySelector<HTMLDivElement>(`div[style*="--cobe-${id}"]`)
    if (el)
      next.set(id, el)
  }
  anchorRefs.value = next
}

const themeColors = computed(() => {
  if (appStore.isDark) {
    return {
      dark: 1,
      mapBrightness: 8,
      baseColor: [0.12, 0.16, 0.3] as [number, number, number],
      markerColor: [0.4, 0.75, 1.0] as [number, number, number],
      glowColor: [0.05, 0.08, 0.2] as [number, number, number],
      arcColor: [0.78, 0.92, 1.0] as [number, number, number],
      offlineColor: [0.97, 0.35, 0.35] as [number, number, number],
      partialColor: [0.97, 0.35, 0.35] as [number, number, number],
    }
  }
  return {
    dark: 0,
    mapBrightness: 7,
    baseColor: [0.97, 0.97, 1] as [number, number, number],
    markerColor: [0.18, 0.45, 0.9] as [number, number, number],
    glowColor: [0.9, 0.93, 1] as [number, number, number],
    arcColor: [0.06, 0.72, 0.51] as [number, number, number],
    offlineColor: [0.92, 0.22, 0.22] as [number, number, number],
    partialColor: [0.92, 0.22, 0.22] as [number, number, number],
  }
})

type RegionHealth = 'online' | 'partial' | 'offline'

function getRegionHealth(cluster: RegionCluster): RegionHealth {
  if (cluster.onlineServers === 0)
    return 'offline'
  if (cluster.onlineServers < cluster.servers)
    return 'partial'
  return 'online'
}

const markers = computed<Marker[]>(() => {
  const colors = themeColors.value
  return regionClusters.value.map((cluster) => {
    const status = getRegionHealth(cluster)
    const color = status === 'offline'
      ? colors.offlineColor
      : status === 'partial'
        ? colors.partialColor
        : colors.markerColor
    return {
      id: markerId(cluster.code),
      location: cluster.coord,
      size: status === 'offline' ? 0.065 : 0.05, // 离线圆点略放大便于识别
      color,
    }
  })
})

interface ArcRenderItem {
  code: string
  from: [number, number]
  to: [number, number]
  status: RegionHealth
  up: number
  down: number
  phaseOffset: number
}

// 以服务器数最多的地区为中心，向其余地区连线，形成 CDN 拓扑
const topologyArcs = computed<ArcRenderItem[]>(() => {
  const clusters = regionClusters.value
  if (clusters.length < 2)
    return []
  const hub = clusters[0]
  if (!hub)
    return []
  const hubOffline = hub.onlineServers === 0
  return clusters.slice(1).map((cluster, index) => {
    const targetHealth = getRegionHealth(cluster)
    const status: RegionHealth = hubOffline || targetHealth === 'offline'
      ? 'offline'
      : targetHealth === 'partial'
        ? 'partial'
        : 'online'
    const rate = regionRates.value.get(cluster.code) ?? { up: 0, down: 0 }
    return {
      code: cluster.code,
      from: hub.coord,
      to: cluster.coord,
      status,
      up: status === 'offline' ? 0 : rate.up,
      down: status === 'offline' ? 0 : rate.down,
      phaseOffset: index * 0.27,
    }
  })
})

// low 档由 WebGL 原生绘制带状态色的静态弧线；中/高档交由 2D 叠加层绘制流光水柱动画
const cobeArcs = computed<Arc[]>(() => {
  if (useFlowingArcOverlay.value)
    return []
  const colors = themeColors.value
  return topologyArcs.value.map(arc => ({
    from: arc.from,
    to: arc.to,
    color: arc.status === 'offline'
      ? colors.offlineColor
      : arc.status === 'partial'
        ? colors.partialColor
        : colors.arcColor,
  }))
})

// 与 cobe@2.0.1 完全一致的球面坐标与弧线投影公式
const GLOBE_RADIUS = 0.8
const ARC_HEIGHT = 0.4
const MARKER_ELEVATION = 0
const ARC_SAMPLE_STEPS = 48

interface ProjectedPoint {
  x: number
  y: number
  visible: boolean
}

function latLonToVec3([lat, lon]: [number, number]): [number, number, number] {
  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180 - Math.PI
  const cosLat = Math.cos(latRad)
  return [-cosLat * Math.cos(lonRad), Math.sin(latRad), cosLat * Math.sin(lonRad)]
}

function sampleProjectedArc(
  from: [number, number],
  to: [number, number],
  width: number,
  height: number,
): ProjectedPoint[] {
  const fromUnit = latLonToVec3(from)
  const toUnit = latLonToVec3(to)
  const r = GLOBE_RADIUS + MARKER_ELEVATION
  const start: [number, number, number] = [fromUnit[0] * r, fromUnit[1] * r, fromUnit[2] * r]
  const end: [number, number, number] = [toUnit[0] * r, toUnit[1] * r, toUnit[2] * r]

  const midSumX = fromUnit[0] + toUnit[0]
  const midSumY = fromUnit[1] + toUnit[1]
  const midSumZ = fromUnit[2] + toUnit[2]
  const midLen = Math.hypot(midSumX, midSumY, midSumZ)
  const midUnit: [number, number, number] = midLen > 1e-3
    ? [midSumX / midLen, midSumY / midLen, midSumZ / midLen]
    : [0, 1, 0]
  const ctrlR = GLOBE_RADIUS + ARC_HEIGHT + MARKER_ELEVATION
  const ctrl: [number, number, number] = [midUnit[0] * ctrlR, midUnit[1] * ctrlR, midUnit[2] * ctrlR]

  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const aspect = width / height

  const points: ProjectedPoint[] = []
  for (let i = 0; i <= ARC_SAMPLE_STEPS; i++) {
    const t = i / ARC_SAMPLE_STEPS
    const u = 1 - t
    const bx = u * u * start[0] + 2 * u * t * ctrl[0] + t * t * end[0]
    const by = u * u * start[1] + 2 * u * t * ctrl[1] + t * t * end[1]
    const bz = u * u * start[2] + 2 * u * t * ctrl[2] + t * t * end[2]

    const qx = cosPhi * bx + sinPhi * bz
    const qy = sinPhi * sinTheta * bx + cosTheta * by - cosPhi * sinTheta * bz
    const qz = -sinPhi * cosTheta * bx + sinTheta * by + cosPhi * cosTheta * bz

    const visible = qz >= 0 || (qx * qx + qy * qy) >= 0.64
    points.push({
      x: ((qx / aspect) + 1) * 0.5 * width,
      y: (1 - qy) * 0.5 * height,
      visible,
    })
  }
  return points
}

function getVisibleSegments(points: ProjectedPoint[]): Array<Array<{ x: number, y: number }>> {
  const segments: Array<Array<{ x: number, y: number }>> = []
  let current: Array<{ x: number, y: number }> = []
  for (const pt of points) {
    if (pt.visible) {
      current.push({ x: pt.x, y: pt.y })
    }
    else if (current.length > 1) {
      segments.push(current)
      current = []
    }
    else {
      current = []
    }
  }
  if (current.length > 1)
    segments.push(current)
  return segments
}

function strokeSegments(ctx: CanvasRenderingContext2D, segments: Array<Array<{ x: number, y: number }>>) {
  for (const seg of segments) {
    const first = seg[0]
    if (!first)
      continue
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    for (let i = 1; i < seg.length; i++) {
      const pt = seg[i]
      if (pt)
        ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()
  }
}

type RgbTuple = [number, number, number]

function lerpRgb(from: RgbTuple, to: RgbTuple, t: number, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, t))
  const r = Math.round(from[0] + (to[0] - from[0]) * clamped)
  const g = Math.round(from[1] + (to[1] - from[1]) * clamped)
  const b = Math.round(from[2] + (to[2] - from[2]) * clamped)
  return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`
}

function drawArrivalRipple(
  ctx: CanvasRenderingContext2D,
  point: ProjectedPoint | undefined,
  progress: number,
  color: (alpha: number) => string,
) {
  if (!point?.visible || progress < 0 || progress > 1)
    return
  const eased = 1 - (1 - progress) ** 2
  const radius = 2.5 + eased * 11.5
  const alpha = (1 - progress) * 0.75
  if (alpha <= 0.02)
    return

  ctx.save()
  ctx.strokeStyle = color(alpha)
  ctx.lineWidth = 1.6 - progress * 0.6
  ctx.setLineDash([])
  ctx.beginPath()
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}

function strokeCometFlyLine(
  ctx: CanvasRenderingContext2D,
  points: ProjectedPoint[],
  headProgress: number,
  tailLength: number,
  direction: 1 | -1,
  coreColor: (u: number, alpha: number) => string,
  haloColor: (alpha: number) => string,
  rippleColor: (alpha: number) => string,
) {
  const total = points.length - 1
  if (total <= 0)
    return

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.setLineDash([])

  for (let i = 0; i < total; i++) {
    const p0 = points[i]
    const p1 = points[i + 1]
    if (!p0?.visible || !p1?.visible)
      continue

    const segT = (i + 0.5) / total
    const directedT = direction === 1 ? segT : 1 - segT
    const distBehind = headProgress - directedT
    if (distBehind < 0 || distBehind > tailLength)
      continue

    const u = 1 - distBehind / tailLength
    const alpha = u ** 1.55
    if (alpha < 0.02)
      continue

    // 外层冰蓝/红冷光晕
    ctx.strokeStyle = haloColor(alpha * 0.42)
    ctx.lineWidth = 2.2 + u * 3.0
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()

    // 内层颜色渐变 + 渐粗飞线核心（尾淡头亮）
    ctx.strokeStyle = coreColor(u, alpha)
    ctx.lineWidth = 0.9 + u * 1.9
    ctx.beginPath()
    ctx.moveTo(p0.x, p0.y)
    ctx.lineTo(p1.x, p1.y)
    ctx.stroke()
  }

  // 双层飞线星点头部
  if (headProgress >= 0 && headProgress <= 1) {
    const headParam = direction === 1 ? headProgress : 1 - headProgress
    const exactIdx = headParam * total
    const i0 = Math.floor(exactIdx)
    const i1 = Math.min(total, i0 + 1)
    const p0 = points[i0]
    const p1 = points[i1]
    if (p0?.visible && p1?.visible) {
      const frac = exactIdx - i0
      const hx = p0.x + (p1.x - p0.x) * frac
      const hy = p0.y + (p1.y - p0.y) * frac

      const outerGlow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6.2)
      outerGlow.addColorStop(0, coreColor(1, 0.95))
      outerGlow.addColorStop(0.42, haloColor(0.55))
      outerGlow.addColorStop(1, haloColor(0))
      ctx.fillStyle = outerGlow
      ctx.beginPath()
      ctx.arc(hx, hy, 6.2, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(255, 255, 255, 0.98)'
      ctx.beginPath()
      ctx.arc(hx, hy, 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  // 抵达终点落点波纹
  if (headProgress >= 0.96 && headProgress <= 1.38) {
    const arrivalPoint = direction === 1 ? points[total] : points[0]
    const rippleProgress = (headProgress - 0.96) / 0.42
    drawArrivalRipple(ctx, arrivalPoint, rippleProgress, rippleColor)
  }

  ctx.restore()
}

function getFlowSpeedMultiplier(bytesPerSec: number): number {
  if (bytesPerSec <= 0)
    return 0
  return Math.min(1.25, Math.max(0.45, Math.log10(bytesPerSec + 10) / 5.6))
}

function drawArcOverlay(nowMs: number) {
  const canvas = arcCanvasRef.value
  if (!canvas)
    return
  const ctx = canvas.getContext('2d')
  if (!ctx)
    return

  const { width, height } = getRenderSize()
  if (width <= 0 || height <= 0)
    return

  const dpr = getCappedDpr()
  const targetW = Math.round(width * dpr)
  const targetH = Math.round(height * dpr)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW
    canvas.height = targetH
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  if (!useFlowingArcOverlay.value || !topologyArcs.value.length)
    return

  const isDark = appStore.isDark
  const timeSec = nowMs / 1000
  const animate = !prefersReducedMotion

  const lightEmeraldTail: RgbTuple = [5, 150, 105] // #059669
  const lightEmeraldMid: RgbTuple = [52, 211, 153] // #34d399
  const pureWhite: RgbTuple = [255, 255, 255]
  const darkIceTail: RgbTuple = [224, 242, 254] // #e0f2fe
  const redTail: RgbTuple = [239, 68, 68] // #ef4444
  const redHead: RgbTuple = [255, 241, 242] // #fff1f2

  for (const arc of topologyArcs.value) {
    const pts = sampleProjectedArc(arc.from, arc.to, width, height)
    const segments = getVisibleSegments(pts)
    if (!segments.length)
      continue

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.setLineDash([])

    if (arc.status === 'offline') {
      // 离线：红色告警轨迹 + 呼吸脉冲，无飞线
      const pulse = animate ? 0.5 + 0.38 * Math.sin(timeSec * 3.0 + arc.phaseOffset * Math.PI * 2) : 0.8
      ctx.strokeStyle = isDark ? `rgba(248, 113, 113, ${pulse.toFixed(2)})` : `rgba(220, 38, 38, ${pulse.toFixed(2)})`
      ctx.lineWidth = 1.6
      strokeSegments(ctx, segments)
      ctx.restore()
      continue
    }

    // 1) 清晰细轨迹轨道
    if (arc.status === 'partial') {
      ctx.strokeStyle = isDark ? 'rgba(248, 113, 113, 0.44)' : 'rgba(220, 38, 38, 0.42)'
      ctx.lineWidth = 1.45
      strokeSegments(ctx, segments)
    }
    else if (isDark) {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.24)'
      ctx.lineWidth = 1.2
      strokeSegments(ctx, segments)
    }
    else {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.34)'
      ctx.lineWidth = 1.35
      strokeSegments(ctx, segments)
    }

    // 2) 有实时流量时：每条轨迹一次一条渐变飞线 + 抵达波纹
    const totalRate = arc.up + arc.down
    if (animate && totalRate > 0) {
      const speed = getFlowSpeedMultiplier(totalRate)
      const direction: 1 | -1 = arc.down >= arc.up ? 1 : -1
      const cycleLen = 1.62
      const headProgress = (timeSec * 0.24 * speed + arc.phaseOffset) % cycleLen

      const coreColor = arc.status === 'partial'
        ? (u: number, alpha: number) => lerpRgb(redTail, redHead, u, alpha)
        : isDark
          ? (u: number, alpha: number) => lerpRgb(darkIceTail, pureWhite, u, alpha)
          : (u: number, alpha: number) => (u < 0.55
              ? lerpRgb(lightEmeraldTail, lightEmeraldMid, u / 0.55, alpha)
              : lerpRgb(lightEmeraldMid, pureWhite, (u - 0.55) / 0.45, alpha))

      const haloColor = arc.status === 'partial'
        ? (alpha: number) => (isDark ? `rgba(248, 113, 113, ${alpha.toFixed(3)})` : `rgba(220, 38, 38, ${alpha.toFixed(3)})`)
        : isDark
          ? (alpha: number) => `rgba(125, 211, 252, ${alpha.toFixed(3)})`
          : (alpha: number) => `rgba(16, 185, 129, ${alpha.toFixed(3)})`

      const rippleColor = arc.status === 'partial'
        ? (alpha: number) => (isDark ? `rgba(248, 113, 113, ${alpha.toFixed(3)})` : `rgba(220, 38, 38, ${alpha.toFixed(3)})`)
        : isDark
          ? (alpha: number) => `rgba(186, 230, 253, ${alpha.toFixed(3)})`
          : (alpha: number) => `rgba(16, 185, 129, ${alpha.toFixed(3)})`

      strokeCometFlyLine(ctx, pts, headProgress, 0.44, direction, coreColor, haloColor, rippleColor)
    }

    ctx.restore()
  }
}

function getRenderSize() {
  const width = containerWidth.value || canvasRef.value?.clientWidth || 320
  const height = containerHeight.value || canvasRef.value?.clientHeight || width
  return { width, height }
}

function buildInitialOptions(): COBEOptions {
  const colors = themeColors.value
  const { width, height } = getRenderSize()
  return {
    devicePixelRatio: getCappedDpr(),
    width,
    height,
    phi,
    theta,
    dark: colors.dark,
    diffuse: 1.6,
    mapSamples: getMapSamples(),
    mapBrightness: colors.mapBrightness,
    baseColor: colors.baseColor,
    markerColor: colors.markerColor,
    glowColor: colors.glowColor,
    markers: markers.value,
    arcs: cobeArcs.value,
    arcColor: colors.arcColor,
    arcWidth: 1,
    arcHeight: ARC_HEIGHT,
    markerElevation: MARKER_ELEVATION,
  }
}

function updateGlobeFrame(forceSyncAnchors = false, nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()) {
  if (!globe)
    return
  refreshContainerSizeCache()
  const { width, height } = getRenderSize()
  globe.update({ phi, theta, width, height })
  if (forceSyncAnchors)
    syncAnchorRefs()
  flushDirtyAnchors()
  drawArcOverlay(nowMs)
}

// phi 收敛/静止时跳过 globe.update，WebGL 写入归零；中/高档仍保持轻量 2D 水流动画
const ORIENTATION_IDLE_EPSILON = 1e-5
const { pause: pauseRaf, resume: resumeRaf } = useRafFn(
  () => {
    if (!globe)
      return
    const prevPhi = phi
    const prevTheta = theta
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (!isPointerDown && shouldAutoRotate.value)
      targetPhi += AUTO_ROTATE_STEP

    // Apply inertia when not dragging and not auto-rotating
    if (!isPointerDown && !shouldAutoRotate.value) {
      if (Math.abs(velocityPhi) > INERTIA_MIN || Math.abs(velocityTheta) > INERTIA_MIN) {
        targetPhi += velocityPhi
        targetTheta = clampTheta(targetTheta + velocityTheta)
        velocityPhi *= INERTIA_DECAY
        velocityTheta *= INERTIA_DECAY
      }
    }

    // Smooth lerp for fluid motion
    phi += (targetPhi - phi) * ORIENTATION_LERP
    theta += (targetTheta - theta) * ORIENTATION_LERP
    if (
      Math.abs(phi - prevPhi) < ORIENTATION_IDLE_EPSILON
      && Math.abs(theta - prevTheta) < ORIENTATION_IDLE_EPSILON
    ) {
      if (!shouldAutoRotate.value && shouldKeepStaticRedraw()) {
        updateGlobeFrame(true, nowMs)
      }
      else if (useFlowingArcOverlay.value && !prefersReducedMotion) {
        drawArcOverlay(nowMs)
      }
      return
    }
    updateGlobeFrame(false, nowMs)
  },
  { immediate: false, fpsLimit: GLOBE_FPS_LIMIT },
)

function startGlobe() {
  if (!canvasRef.value)
    return
  if (appStore.stopEarth) {
    resetStoppedView()
    triggerStaticRedrawWindow()
  }
  globe = createGlobe(canvasRef.value, buildInitialOptions())
  refreshContainerSizeCache()
  hookWrapperAppend()
  patchAllAnchors()
  syncAnchorRefs()
  // 静止地球没有自转帧，首帧需要在实际尺寸稳定后主动重绘一次。
  requestAnimationFrame(() => {
    updateGlobeFrame(true)
  })
  // documentVisibility 同步可读；useElementVisibility 需等 IntersectionObserver 首回调
  // 先按"前台"启动，若实际不可见，shouldRender 的 watch 会在下一帧 pause
  if (documentVisibility.value === 'visible')
    resumeRaf()
}

onMounted(() => {
  startGlobe()
})

onBeforeUnmount(() => {
  pauseRaf()
  globe?.destroy()
  globe = null
})

// 切换主题时更新颜色，不再整体重建（重建会导致地球丢失）
watch(() => appStore.isDark, () => {
  if (!globe)
    return
  const colors = themeColors.value
  globe.update({
    dark: colors.dark,
    mapBrightness: colors.mapBrightness,
    baseColor: colors.baseColor,
    markerColor: colors.markerColor,
    glowColor: colors.glowColor,
    arcColor: colors.arcColor,
    markers: markers.value,
    arcs: cobeArcs.value,
  })
  // 静止模式下需手动触发重绘
  if (!shouldAutoRotate.value) {
    triggerStaticRedrawWindow()
  }
  drawArcOverlay(typeof performance !== 'undefined' ? performance.now() : Date.now())
})

watch(
  [containerWidth, containerHeight],
  ([width, height]) => {
    if (!globe || width <= 0 || height <= 0)
      return
    if (!shouldAutoRotate.value)
      triggerStaticRedrawWindow(600)
    updateGlobeFrame(true)
  },
)

watch(
  () => appStore.stopEarth,
  (stopped) => {
    if (stopped)
      resetStoppedView()
    triggerStaticRedrawWindow()
    updateGlobeFrame(true)
  },
)

// 地区集合、在线状态或画质档位变化时推送 markers/arcs；速率推送仅刷新 2D 叠加层
watch(
  [
    () => regionClusters.value.map(clusterKey).join(','),
    useFlowingArcOverlay,
  ],
  () => {
    if (!globe)
      return
    refreshContainerSizeCache()
    globe.update({ markers: markers.value, arcs: cobeArcs.value })
    syncAnchorRefs()
    if (!shouldAutoRotate.value)
      triggerStaticRedrawWindow(600)
    // phi 静止时 RAF 跳帧会漏掉这次 flush，手动补一次
    flushDirtyAnchors()
    drawArcOverlay(typeof performance !== 'undefined' ? performance.now() : Date.now())
  },
)

watch(shouldRender, (visible) => {
  if (!globe)
    return
  if (visible) {
    if (!shouldAutoRotate.value)
      triggerStaticRedrawWindow()
    resumeRaf()
  }
  else {
    pauseRaf()
  }
})

function onPointerDown(e: PointerEvent) {
  isPointerDown = true
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  velocityPhi = 0
  velocityTheta = 0
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
}
function onPointerMove(e: PointerEvent) {
  if (!isPointerDown)
    return
  const deltaX = e.clientX - lastPointerX
  const deltaY = e.clientY - lastPointerY
  lastPointerX = e.clientX
  lastPointerY = e.clientY
  const dphi = deltaX / 200
  const dtheta = deltaY / 300
  targetPhi += dphi
  targetTheta = clampTheta(targetTheta + dtheta)
  // Track velocity for inertia on release
  velocityPhi = dphi * 0.6
  velocityTheta = dtheta * 0.6
}
function onPointerUp(e: PointerEvent) {
  isPointerDown = false
  const target = e.currentTarget as HTMLElement
  if (target.hasPointerCapture(e.pointerId))
    target.releasePointerCapture(e.pointerId)
}

const totalServers = computed(() => displayNodes.value.length)
const onlineServers = computed(() => displayNodes.value.filter(node => node.online).length)
const offlineServers = computed(() => totalServers.value - onlineServers.value)

function rateFor(code: string): RegionRate {
  return regionRates.value.get(code) ?? { up: 0, down: 0 }
}

function formatRate(bytesPerSec: number): string {
  const { value, unit } = formatBytesPerSecondSplit(bytesPerSec, appStore.byteDecimals)
  return `${value} ${unit}`
}
</script>

<template>
  <div ref="containerRef" class="relative aspect-square w-full max-w-md xl:max-w-[460px] mx-auto -translate-y-6 md:-translate-y-12">
    <div class="earth-globe-halo absolute inset-0 pointer-events-none" aria-hidden="true" />
    <canvas
      ref="canvasRef"
      class="earth-globe-canvas absolute inset-0 w-full h-full select-none touch-none cursor-grab active:cursor-grabbing"
      @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"
    />
    <canvas
      v-show="useFlowingArcOverlay"
      ref="arcCanvasRef"
      class="earth-globe-arcs absolute inset-0 z-1 w-full h-full pointer-events-none"
      aria-hidden="true"
    />

    <template v-for="cluster in regionClusters" :key="cluster.code">
      <Teleport v-if="getAnchorEl(cluster.code)" :to="getAnchorEl(cluster.code)!">
        <div
          class="absolute -top-7.5 left-0 z-10 transition-[opacity,filter] duration-500 rounded-lg backdrop-blur-xl backdrop-saturate-150"
          :style="{
            opacity: `var(--cobe-visible-${markerId(cluster.code)}, 0)`,
            filter: `blur(calc((1 - var(--cobe-visible-${markerId(cluster.code)}, 0)) * 20px))`,
          }"
        >
          <img
            :src="`/images/flags/${cluster.code}.svg`" :alt="cluster.code"
            class="size-4 block absolute -bottom-2 -left-2 z-1"
          >
          <div
            class="relative z-2 bg-background/50 rounded-lg py-0.5 px-1.5 text-xs zoom-80 items-start justify-center text-nowrap ring-1 ring-foreground/[0.06] shadow-sm tabular-nums"
          >
            <div class="text-emerald-600 dark:text-emerald-400 flex flex-row items-center gap-0.5">
              <Icon icon="tabler:chevron-up" width="12" height="12" /> {{ formatRate(rateFor(cluster.code).up) }}
            </div>
            <div class="text-sky-600 dark:text-sky-400 flex flex-row items-center gap-0.5">
              <Icon icon="tabler:chevron-down" width="12" height="12" /> {{ formatRate(rateFor(cluster.code).down) }}
            </div>
          </div>
        </div>
      </Teleport>
    </template>

    <div
      v-if="totalServers > 0"
      class="absolute top-6 md:top-12 left-0 text-[10px] text-muted-foreground pointer-events-none flex gap-2 items-center backdrop-blur-xl backdrop-saturate-150 bg-background/40 rounded-lg px-2.5 py-1 ring-1 ring-foreground/[0.06] shadow-sm tabular-nums"
    >
      <div v-if="onlineServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-emerald-500 animate-pulse" />
        <span class="text-emerald-600 dark:text-emerald-400">{{ onlineServers }}</span>
      </div>
      <div v-if="offlineServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-amber-500 animate-pulse" />
        <span class="text-amber-600 dark:text-amber-400">{{ offlineServers }}</span>
      </div>
      <!-- <div v-if="totalServers > 0" class="flex items-center gap-1">
        <span class="inline-block size-1.5 rounded-full bg-blue-600 animate-pulse" />
        <span class="text-blue-600">{{ totalServers }}</span>
      </div> -->
    </div>
  </div>
</template>

<style scoped>
.earth-globe-canvas {
  contain: layout paint;
}

/* 大气层光晕：静态渐变代替 canvas 上的 drop-shadow 滤镜，
   视觉上是球体外沿的一圈辉光，且不再随每帧重绘重算滤镜。
   色调沿用原 drop-shadow 的蓝色系 */
.earth-globe-halo {
  background: radial-gradient(
    circle at 50% 50%,
    oklch(0.6 0.15 250 / 0.2) 0%,
    oklch(0.6 0.15 250 / 0.08) 38%,
    oklch(0.6 0.15 250 / 0.14) 47%,
    transparent 60%
  );
}

:root.dark .earth-globe-halo {
  background: radial-gradient(
    circle at 50% 50%,
    oklch(0.5 0.18 250 / 0.3) 0%,
    oklch(0.5 0.18 250 / 0.12) 38%,
    oklch(0.5 0.18 250 / 0.22) 47%,
    transparent 62%
  );
}
</style>
