<script setup lang="ts">
import type { NodePingBar } from '@/composables/useNodePingDisplay'
import { ref, watch } from 'vue'

// ping 诊断条：裸 span + 事件委托的单例 tooltip。
// 之前每根条包一个 DataTooltip 组件，列表视图 25 节点 × 40 条 ≈ 1000 个组件实例，
// 且移动端没有 hover，这些 tooltip 根本触发不了。
const props = defineProps<{
  bars: NodePingBar[]
}>()

const root = ref<HTMLElement>()
const tip = ref<{ text: string, x: number, align: 'center' | 'left' | 'right' } | null>(null)

function handleOver(event: MouseEvent) {
  const el = (event.target as HTMLElement).closest<HTMLElement>('[data-bar-index]')
  if (!el || !root.value) {
    tip.value = null
    return
  }
  const bar = props.bars[Number(el.dataset.barIndex)]
  if (!bar?.tooltip) {
    tip.value = null
    return
  }
  const rootRect = root.value.getBoundingClientRect()
  const rect = el.getBoundingClientRect()
  const x = rect.left - rootRect.left + rect.width / 2
  const align = x < 52 ? 'left' : rootRect.width - x < 52 ? 'right' : 'center'
  tip.value = { text: bar.tooltip, x, align }
}

function handleLeave() {
  tip.value = null
}

// 数据刷新后旧索引可能失效，直接收起
watch(() => props.bars, () => {
  tip.value = null
})
</script>

<template>
  <div
    ref="root"
    class="ping-bars relative h-full cursor-auto"
    @mouseover="handleOver"
    @mouseleave="handleLeave"
  >
    <div
      class="grid h-full items-end gap-[1px]"
      :style="{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }"
    >
      <span
        v-for="(bar, index) in bars"
        :key="bar.key"
        :data-bar-index="index"
        class="ping-bar block h-full w-full rounded-[1px]"
        :class="bar.className"
      />
    </div>
    <span
      v-if="tip"
      role="tooltip"
      class="pointer-events-none absolute bottom-full z-20 mb-1 rounded bg-foreground/85 px-1.5 py-1 text-[10px] leading-none text-background shadow-lg whitespace-nowrap"
      :class="tip.align === 'center' ? '-translate-x-1/2' : tip.align === 'left' ? 'left-0' : 'right-0'"
      :style="tip.align === 'center' ? { left: `${tip.x}px` } : undefined"
    >
      {{ tip.text }}
    </span>
  </div>
</template>

<style scoped>
.ping-bar {
  transition:
    transform 150ms ease,
    opacity 150ms ease;
  transform-origin: bottom;
}

.ping-bars:hover .ping-bar {
  opacity: 0.6;
}

.ping-bars .ping-bar:hover {
  opacity: 1;
  transform: scaleY(1.6);
}
</style>
