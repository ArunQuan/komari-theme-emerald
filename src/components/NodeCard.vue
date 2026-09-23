<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { Icon } from '@iconify/vue'
import { computed } from 'vue'
import PingBars from '@/components/PingBars.vue'
import { Badge } from '@/components/ui/badge'
import { CardX } from '@/components/ui/card-x'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { ProgressThin } from '@/components/ui/progress-thin'
import { useNodePingDisplay } from '@/composables/useNodePingDisplay'
import { useAppStore } from '@/stores/app'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatRelativeTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { buildPriceTags, parseTags } from '@/utils/tagHelper'

const props = defineProps<{ node: NodeData }>()

const emit = defineEmits<{ click: [] }>()

type NodePing = NonNullable<NodeData['ping']>[string]

const networkProviders = [
  { label: '电信', keywords: ['电信', 'telecom', 'chinatelecom', 'china telecom'] },
  { label: '联通', keywords: ['联通', 'unicom', 'chinaunicom', 'china unicom'] },
  { label: '移动', keywords: ['移动', 'mobile', 'chinamobile', 'china mobile'] },
] as const

const appStore = useAppStore()

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, 'hour')
const formatOnlineTime = (seconds: number) => `在线${formatUptimeWithFormat(seconds, 'day').replaceAll(' ', '')}`
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  let used = 0
  switch (traffic_limit_type) {
    case 'up': used = net_total_up
      break
    case 'down': used = net_total_down
      break
    case 'min': used = Math.min(net_total_up, net_total_down)
      break
    case 'max': used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }
  return Math.min((used / props.node.traffic_limit) * 100, 100)
})

const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  switch (traffic_limit_type) {
    case 'up': return net_total_up
    case 'down': return net_total_down
    case 'min': return Math.min(net_total_up, net_total_down)
    case 'max': return Math.max(net_total_up, net_total_down)
    case 'sum':
    default: return net_total_up + net_total_down
  }
})

const priceTags = computed(() => buildPriceTags(props.node, appStore.lang))
const remainingText = computed(() => priceTags.value[0]?.text ?? '剩余 -')
const priceText = computed(() => priceTags.value[1]?.text ?? '')

const isPinned = computed(() => appStore.isNodePinned(props.node.uuid))
const offlineRelative = computed(() => formatRelativeTime(props.node.time))

const customTags = computed(() => parseTags(props.node.tags).map(t => t.text))

const providerPings = computed(() => {
  const pingEntries = Object.entries(props.node.ping ?? {})

  return networkProviders.map((provider) => {
    const match = pingEntries.find(([, ping]) => {
      const name = String(ping.name ?? '').toLowerCase()
      return provider.keywords.some(keyword => name.includes(keyword))
    })
    const taskId = match ? Number(match[0]) : null

    return {
      ...provider,
      taskId: Number.isSafeInteger(taskId) ? taskId : null,
      stats: match?.[1] ?? null,
    }
  })
})

const hasProviderPing = computed(() => providerPings.value.some(provider => provider.stats !== null))

const providerPingDisplays = [
  useNodePingDisplay(() => props.node.uuid, {
    taskId: () => providerPings.value[0]?.taskId ?? null,
  }),
  useNodePingDisplay(() => props.node.uuid, {
    taskId: () => providerPings.value[1]?.taskId ?? null,
  }),
  useNodePingDisplay(() => props.node.uuid, {
    taskId: () => providerPings.value[2]?.taskId ?? null,
  }),
] as const

function formatProviderLatency(ping: NodePing | null): string {
  if (!ping)
    return '-'

  const latency = Number.isFinite(ping.avg) && ping.avg >= 0 ? ping.avg : ping.latest
  if (!Number.isFinite(latency) || latency < 0)
    return '丢包'
  return `${Math.round(latency)} ms`
}

function formatProviderLoss(ping: NodePing | null): string {
  if (!ping || !Number.isFinite(ping.loss))
    return '-'
  return `${ping.loss.toFixed(1)}%`
}

function getProviderFallbackBars(provider: typeof providerPings.value[number], metric: 'latency' | 'loss') {
  const ping = provider.stats
  const value = metric === 'latency'
    ? ping && Number.isFinite(ping.avg) && ping.avg >= 0 ? ping.avg : null
    : ping && Number.isFinite(ping.loss) ? ping.loss : null
  const className = value === null
    ? 'bg-muted-foreground/10'
    : metric === 'latency'
      ? value <= 60
        ? 'bg-emerald-600/90'
        : value <= 100
          ? 'bg-green-400/80'
          : value <= 160
            ? 'bg-lime-400/80'
            : value <= 200
              ? 'bg-yellow-400/80'
              : 'bg-rose-500/80'
      : value <= 1
        ? 'bg-emerald-600/90'
        : value <= 3
          ? 'bg-green-400/90'
          : value <= 6
            ? 'bg-lime-400/90'
            : value <= 9
              ? 'bg-yellow-400/90'
              : 'bg-rose-500/80'

  return Array.from({ length: 12 }, (_, index) => ({
    key: `${provider.label}-${metric}-${index}`,
    className,
    tooltip: metric === 'latency'
      ? `${provider.label} ${formatProviderLatency(ping)}`
      : `${provider.label} ${formatProviderLoss(ping)}`,
  }))
}

function getProviderHistoryBars(provider: typeof providerPings.value[number], providerIndex: number, metric: 'latency' | 'loss') {
  const display = providerPingDisplays[providerIndex]
  if (display?.pingStats.hasData.value)
    return metric === 'latency' ? display.latencyRenderBars.value : display.lossRenderBars.value

  return getProviderFallbackBars(provider, metric)
}

const isCompact = computed(() => appStore.cardDensity === 'compact')

// 点标签直接筛选同标签节点（再点一次取消）
function filterByTag(tag: string) {
  appStore.nodeSearchText = appStore.nodeSearchText === tag ? '' : tag
}

function hasRegion(region: string | null | undefined): boolean {
  return Boolean(region?.trim())
}
</script>

<template>
  <CardX
    hoverable
    class="node-card w-full cursor-pointer backdrop-blur-xl backdrop-saturate-150 bg-background/40 border-none shadow-[0_0_0_3px] shadow-transparent hover:bg-background/60 hover:shadow-slate-500/10 transition-all duration-200 rounded-lg ring-1 ring-foreground/[0.06] glass-hover-blur"
    :class="[!props.node.online && '!shadow-red-600/20']"
    :header-class="`max-md:px-3 max-md:py-2.5 ${isCompact ? 'md:px-3 md:py-2' : ''}`"
    :content-class="`max-md:p-3 max-md:pt-0 ${isCompact ? 'md:p-3 md:pt-0' : ''}`"
    @click="emit('click')"
  >
    <template #header>
      <div class="flex gap-2 min-w-0 items-center">
        <DataTooltip
          placement="right"
          :content="formatUptime(props.node.uptime ?? 0)"
          class="size-2 rounded-full" :class="[props.node.online ? 'bg-green-600' : 'bg-red-600']"
          content-class="whitespace-nowrap"
        >
          <div
            class="animate-ping absolute inset-0 rounded-full opacity-50"
            :class="[props.node.online ? 'bg-green-600' : 'bg-red-600']"
          />
        </DataTooltip>
        <span class="text-md font-bold flex-1 min-w-0 truncate">{{ props.node.name }}</span>
      </div>
    </template>

    <template #header-extra>
      <div class="flex gap-2 items-center">
        <button
          type="button" :aria-label="isPinned ? '取消置顶' : '置顶'"
          class="flex items-center transition-colors"
          :class="isPinned ? 'text-amber-400' : 'text-muted-foreground/40 hover:text-amber-400'"
          @click.stop="appStore.togglePinnedNode(props.node.uuid)"
        >
          <Icon :icon="isPinned ? 'tabler:star-filled' : 'tabler:star'" width="14" height="14" />
        </button>
        <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
        <img
          v-if="hasRegion(props.node.region)" :src="`/images/flags/${getRegionCode(props.node.region)}.svg`"
          :alt="getRegionDisplayName(props.node.region)" class="size-5 shrink-0"
        >
      </div>
    </template>

    <template #default>
      <div class="flex flex-col gap-1.5">
        <div
          class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 overflow-hidden text-[11px] text-muted-foreground leading-none"
          :class="[!props.node.online ? 'blur-xs opacity-60' : '']"
        >
          <span v-if="appStore.showNodeUptime" class="inline-flex max-w-full shrink-0 truncate rounded-sm bg-slate-500/[0.08] pl-0 pr-1 py-0.5">{{ formatOnlineTime(props.node.uptime ?? 0) }}</span>
          <span v-if="priceText" class="inline-flex max-w-full shrink-0 truncate rounded-sm bg-slate-500/[0.08] pl-0 pr-1 py-0.5">{{ priceText }}</span>
          <span class="inline-flex max-w-full shrink-0 truncate rounded-sm bg-slate-500/[0.08] pl-0 pr-1 py-0.5">{{ remainingText }}</span>
        </div>
        <div class="gap-x-2 gap-y-1.5 grid grid-cols-2">
          <!-- <div class="flex flex-col gap-1 col-span-2">
                <div class="flex gap-2 items-center">
                  <img :src="getOSImage(props.node.os)" :alt="getOSName(props.node.os)" class="size-4">
                  <span class="text-xs">{{ getOSName(props.node.os) }}</span>
                </div>
              </div> -->
          <!-- CPU -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                CPU
              </span>
              <span>{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="props.node.cpu ?? 0" :status="cpuStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ props.node.load.toFixed(2) ?? 0 }}, {{ props.node.load5.toFixed(2) ?? 0 }}, {{
                props.node.load15.toFixed(2) ?? 0 }} ({{ props.node.cpu_cores }}c)
            </div>
          </div>

          <!-- 内存 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                内存
              </span>
              <span>{{ memPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="memPercentage" :status="memStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}
            </div>
          </div>

          <!-- 硬盘 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                硬盘
              </span>
              <span>{{ diskPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="diskPercentage" :status="diskStatus" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}
            </div>
          </div>

          <!-- 流量进度条 -->
          <div class="flex flex-col gap-1">
            <div class="w-full text-xs flex flex-row justify-between">
              <span class="text-muted-foreground">
                流量
              </span>
              <span>{{ trafficUsedPercentage.toFixed(1) }}%</span>
            </div>
            <ProgressThin :percentage="trafficUsedPercentage" status="success" :height="4" />
            <div class="text-[11px] text-muted-foreground truncate">
              {{ formatBytes(trafficUsed) }} /
              <template v-if="showTrafficProgress(node)">
                {{ formatBytes(props.node.traffic_limit) }}
              </template>
              <template v-else>
                ∞
              </template>
            </div>
          </div>
        </div>
        <div class="gap-2 grid grid-cols-6 relative">
          <div
            v-if="!props.node.online"
            class="absolute inset-0 flex flex-col gap-1 items-center justify-center z-1 text-center" aria-hidden="true"
          >
            <div class="text-sm font-medium text-destructive">
              离线{{ offlineRelative !== '-' ? ` ${offlineRelative}` : '' }}
            </div>
            <div class="text-xs text-muted-foreground">
              {{ offlineTime }}
            </div>
          </div>
          <div
            class="flex flex-col gap-0.5 p-1 pl-2 rounded-sm bg-slate-500/5"
            :class="[!props.node.online ? 'blur-xs opacity-60' : '', appStore.showNodeConnections ? 'col-span-2' : 'col-span-3']"
          >
            <div class="text-[11px] flex flex-col">
              <div class="text-green-600 flex flex-row items-center gap-1">
                <Icon icon="tabler:chevron-up" width="12" height="12" />
                {{ formatBytesPerSecond(props.node.net_out ?? 0) }}
              </div>
              <div class="text-blue-600 flex flex-row items-center gap-1">
                <Icon icon="tabler:chevron-down" width="12" height="12" />
                {{ formatBytesPerSecond(props.node.net_in ?? 0) }}
              </div>
            </div>
          </div>
          <div
            class="flex flex-col gap-0.5 p-1 pl-2 rounded-sm bg-slate-500/5"
            :class="[!props.node.online ? 'blur-xs opacity-60' : '', appStore.showNodeConnections ? 'col-span-2' : 'col-span-3']"
          >
            <div class="text-[11px] text-muted-foreground flex flex-col">
              <div class="flex flex-row items-center gap-1">
                <Icon icon="tabler:upload" width="12" height="12" />
                {{ formatBytes(props.node.net_total_up ?? 0) }}
              </div>
              <div class="flex flex-row items-center gap-1">
                <Icon icon="tabler:download" width="12" height="12" />
                {{ formatBytes(props.node.net_total_down ?? 0) }}
              </div>
            </div>
          </div>
          <div
            v-if="appStore.showNodeConnections"
            class="col-span-2 flex flex-col gap-0.5 p-1 pl-2 rounded-sm bg-slate-500/5"
            :class="[!props.node.online ? 'blur-xs opacity-60' : '']"
          >
            <div class="text-[11px] text-muted-foreground flex flex-col">
              <div class="flex flex-row items-center gap-1">
                <span class="text-[10px] font-medium text-muted-foreground/70">TCP</span>
                {{ (props.node.connections ?? 0).toLocaleString() }}
              </div>
              <div class="flex flex-row items-center gap-1">
                <span class="text-[10px] font-medium text-muted-foreground/70">UDP</span>
                {{ (props.node.connections_udp ?? 0).toLocaleString() }}
              </div>
            </div>
          </div>
          <template v-if="hasProviderPing">
            <div
              v-for="(provider, providerIndex) in providerPings" :key="provider.label"
              class="col-span-6 grid grid-cols-2 gap-1.5"
              :class="[!props.node.online ? 'blur-xs opacity-60' : '']"
            >
              <div
                class="group/panel relative col-span-1 flex flex-col gap-1 p-1 h-8 rounded-sm bg-slate-500/5"
                :title="`延迟 · ${provider.label}`"
              >
                <div class="flex items-center justify-between gap-2 text-[11px] leading-none relative">
                  <span class="text-muted-foreground">{{ provider.label }}</span>
                  <span class="font-medium text-foreground/85">{{ formatProviderLatency(provider.stats) }}</span>
                </div>
                <div class="h-full min-h-0 opacity-80 group-hover/panel:opacity-100">
                  <PingBars :bars="getProviderHistoryBars(provider, providerIndex, 'latency')" />
                </div>
              </div>
              <div
                class="group/panel relative col-span-1 flex flex-col gap-1 p-1 h-8 rounded-sm bg-slate-500/5"
                :title="`丢包 · ${provider.label}`"
              >
                <div class="flex items-center justify-between gap-2 text-[11px] leading-none">
                  <span class="text-muted-foreground">丢包</span>
                  <span class="font-medium text-foreground/85">{{ formatProviderLoss(provider.stats) }}</span>
                </div>
                <div class="h-full min-h-0 opacity-80 group-hover/panel:opacity-100">
                  <PingBars :bars="getProviderHistoryBars(provider, providerIndex, 'loss')" />
                </div>
              </div>
            </div>
          </template>
        </div>
        <div v-if="customTags.length > 0" class="flex shrink-0 flex-wrap gap-1 items-center">
          <Badge
            v-for="(tag, index) in customTags" :key="index" variant="outline"
            class="!text-[11px] rounded text-muted-foreground border-muted-foreground/10 px-1.5 cursor-pointer transition-colors hover:text-foreground hover:border-muted-foreground/30"
            :title="`筛选标签：${tag}`"
            @click.stop="filterByTag(tag)"
          >
            {{ tag }}
          </Badge>
        </div>
      </div>
    </template>
  </CardX>
</template>

<style scoped>
.node-card {
  position: relative;
  overflow: hidden;
}

.node-offline-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  pointer-events: none;
  border-radius: inherit;
  background-color: var(--card);
  transition: opacity 200ms ease;
}

.node-card:hover .node-offline-overlay {
  opacity: 0;
}

.node-offline-overlay__content {
  display: flex;
  max-width: 100%;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

.node-offline-overlay__header,
.node-offline-overlay__tags {
  max-width: 100%;
}
</style>
