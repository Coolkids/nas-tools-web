<script setup lang="ts">
import { computed } from 'vue'
import { durationLabel, nodeLabel, statusLabel } from '@/utils/recognitionEvents'
import type { RecognitionEventV3 } from '@/api/recognition'
const props = defineProps<{ events: RecognitionEventV3[]; cursor: number; playing: boolean; speed: number; live: boolean }>()
const emit = defineEmits<{ seek: [number]; play: []; pause: []; 'update:speed': [number]; select: [string] }>()
const index = computed(() => props.events.filter(event => event.seq <= props.cursor).length)
const shown = computed(() => props.events.slice(Math.max(0, index.value - 25), Math.min(props.events.length, index.value + 25)))
function seek(value: number | null) { emit('seek', value ? props.events[value - 1].seq : (props.events[0]?.seq || 1) - 1) }
</script>
<template>
  <section aria-label="识别事件时间线" class="recognition-timeline">
    <div class="timeline-controls"><q-btn outline color="primary" :label="playing ? '暂停回放' : '播放回放'" :icon="playing ? 'pause' : 'play_arrow'" :disable="!events.length" @click="playing ? emit('pause') : emit('play')" /><q-btn flat label="回到最新" :disable="!events.length" @click="emit('seek', events[events.length - 1].seq)" /><q-select :model-value="speed" :options="[.5, 1, 2, 4]" label="回放速度" dense outlined @update:model-value="emit('update:speed', $event)" /></div>
    <p class="text-caption text-secondary">{{ live ? '正在接收实时事件；可暂停并查看之前的步骤。' : '历史回放只改变本页显示，不会重新发起识别。' }} 当前 {{ index }} / {{ events.length }} 个事件。节点耗时可能重叠，不相加计算总耗时。</p>
    <q-slider :model-value="index" :min="0" :max="Math.max(1, events.length)" :disable="!events.length" label aria-label="回放事件位置" @update:model-value="seek" />
    <q-select :model-value="cursor" :options="events.map(event => ({ value: event.seq, label: `#${event.seq} ${nodeLabel(event.node_id)} · ${statusLabel(event.status)}` }))" emit-value map-options outlined dense label="定位关键事件" @update:model-value="emit('seek', $event)" />
    <ol class="timeline-events"><li v-for="event in shown" :key="event.seq" :class="{ future: event.seq > cursor, current: event.seq === cursor }"><button type="button" @click="emit('seek', event.seq); emit('select', event.node_id)"><strong>#{{ event.seq }} {{ nodeLabel(event.node_id) }}</strong><span>{{ statusLabel(event.status) }} · {{ event.event_type }}</span><small>请求开始后 {{ durationLabel(event.offset_ns / 1e6) }}</small></button></li></ol>
    <p v-if="events.length > shown.length" class="text-caption text-secondary">当前显示回放位置附近的 {{ shown.length }} 个事件；可通过进度条或事件选择跳转全部事件。</p>
  </section>
</template>
<style scoped>
.timeline-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }.timeline-controls .q-field { width: 110px; }.timeline-events { padding: 0; list-style: none; margin: 18px 0 0; max-height: 340px; overflow-y: auto; }.timeline-events li { border-bottom: 1px solid var(--border-subtle); }.timeline-events button { width: 100%; border: 0; background: transparent; color: inherit; cursor: pointer; padding: 12px; text-align: left; display: grid; gap: 4px; overflow-wrap: anywhere; }.timeline-events .future { opacity: .55; }.timeline-events .current { background: var(--primary-soft); }.timeline-events span,.timeline-events small { color: var(--text-secondary); font-size: 12px; }
</style>
