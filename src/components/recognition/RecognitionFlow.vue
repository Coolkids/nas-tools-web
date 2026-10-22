<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { VueFlow, useVueFlow, type Edge, type Node } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { durationLabel, nodeLabel, statusColor, statusLabel, type RecognitionNode } from '@/utils/recognitionEvents'
const props = defineProps<{ nodes: Record<string, RecognitionNode>; selected?: string }>()
const emit = defineEmits<{ select: [string] }>()
const id = `recognition-flow-${useId()}`
const { fitView, zoomIn, zoomOut } = useVueFlow(id)
const canvas = ref<HTMLElement>(), ready = ref(false)
let resize: ResizeObserver | undefined
onMounted(() => { resize = new ResizeObserver(entries => { ready.value = entries.some(entry => entry.contentRect.width > 0 && entry.contentRect.height > 0) }); if (canvas.value) resize.observe(canvas.value) })
onBeforeUnmount(() => resize?.disconnect())
const positions: Record<string, [number, number]> = { request: [260, 0], preprocess: [260, 120], identity: [260, 240],
  anitopy: [0, 370], anitopy_ml: [260, 370], openai: [520, 370], parser: [260, 490], query_plan: [260, 610],
  tmdb_search: [260, 730], rank: [260, 850], identity_result: [260, 970], episode: [260, 1090], fallback: [800, 240] }
const ordered = computed(() => Object.values(props.nodes).sort((a, b) => (positions[a.id]?.[1] ?? 1200) - (positions[b.id]?.[1] ?? 1200) || a.seq - b.seq))
const graphNodes = computed<Node[]>(() => ordered.value.map((node, index) => ({ id: node.id, type: 'default',
  position: { x: positions[node.id]?.[0] ?? 800, y: positions[node.id]?.[1] ?? index * 120 },
  data: { label: `${nodeLabel(node.id)}\n${statusLabel(node.status)} · ${durationLabel(node.durationMs)}` },
  selected: props.selected === node.id, style: { width: '220px', whiteSpace: 'pre-line', fontSize: '13px', lineHeight: '1.7',
    border: `2px solid var(--q-${statusColor(node.status) === 'grey-7' ? 'info' : statusColor(node.status)})`, background: 'var(--surface)', color: 'var(--text-primary)' }
})))
const edges = computed<Edge[]>(() => {
  const links: [string, string][] = [['request', 'preprocess'], ['preprocess', 'identity'],
    ...['anitopy', 'anitopy_ml', 'openai'].flatMap(node => [['identity', node], [node, props.nodes.parser ? 'parser' : props.nodes.query_plan ? 'query_plan' : 'tmdb_search']] as [string, string][]),
    ['parser', 'query_plan'], ['query_plan', 'tmdb_search'], ['tmdb_search', 'rank'],
    ['rank', props.nodes.identity_result ? 'identity_result' : 'episode'], ['identity_result', 'episode']]
  return links.filter(([source, target]) => props.nodes[source] && props.nodes[target]).map(([source, target]) => ({ id: `${source}:${target}`, source, target, type: 'smoothstep' }))
})
async function fit() { await nextTick(); await fitView({ padding: .18 }) }
</script>
<template>
  <section class="recognition-flow" aria-label="识别流程">
    <div class="flow-toolbar"><q-select :model-value="selected" :options="ordered.map(node => ({ value: node.id, label: nodeLabel(node.id) }))" label="选择流程节点" emit-value map-options dense outlined @update:model-value="emit('select', $event)" /><q-btn flat color="primary" icon="fit_screen" label="适应视图" @click="fit" /><q-btn flat round icon="zoom_in" aria-label="放大流程" @click="zoomIn()" /><q-btn flat round icon="zoom_out" aria-label="缩小流程" @click="zoomOut()" /></div>
    <p class="text-caption text-secondary">节点按处理阶段分组，解析器可并行运行；实际先后顺序见时间线。未记录的耗时显示“未记录”。</p>
    <div ref="canvas" class="flow-canvas"><VueFlow v-if="ready" :id="id" :nodes="graphNodes" :edges="edges" :nodes-draggable="false" :nodes-connectable="false" :edges-updatable="false" :zoom-on-scroll="false" :min-zoom=".15" :max-zoom="2" fit-view-on-init @nodes-initialized="fit" @node-click="emit('select', $event.node.id)" /></div>
    <p v-if="!ordered.length" class="text-secondary">当前回放位置还没有已记录的节点。</p>
  </section>
</template>
<style scoped>
.recognition-flow { min-width: 0; }.flow-toolbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }.flow-toolbar > .q-field { flex: 1; min-width: 160px; }.flow-canvas { height: 420px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-muted); }.flow-canvas :deep(.vue-flow__node.selected) { box-shadow: 0 0 0 4px var(--primary-soft); }.flow-canvas :deep(.vue-flow__edge-path) { stroke: var(--text-secondary); }@media(max-width: 767px) { .flow-canvas { height: 340px; } }
</style>
