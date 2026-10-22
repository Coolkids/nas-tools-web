<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRef, watch } from 'vue'
import { useQuasar } from 'quasar'
import { cancelRecognition, getRecognitionTrace, retryRecognition, RecognitionAPIError } from '@/api/recognition'
import { useRecognitionEvents } from '@/composables/useRecognitionEvents'
import { durationLabel, objectValue, reduceRecognitionEvents, reasonLabel, statusColor, statusLabel, terminalStatuses, tmdbLink } from '@/utils/recognitionEvents'
import RecognitionJsonViewer from '@/components/RecognitionJsonViewer.vue'
import RecognitionFlow from './RecognitionFlow.vue'
import RecognitionNodeDetail from './RecognitionNodeDetail.vue'
import RecognitionCandidates from './RecognitionCandidates.vue'
import RecognitionTimeline from './RecognitionTimeline.vue'
import LLMTokenUsage from './LLMTokenUsage.vue'
const props = defineProps<{ requestId: string; canManage?: boolean }>()
const emit = defineEmits<{ follow: [string]; completed: [] }>()
const $q = useQuasar()
const { trace, events, state, loading, error, errorCode, connection, partial, reload } = useRecognitionEvents(toRef(props, 'requestId'))
const tab = ref('flow'), selected = ref('request'), cursor = ref(0), playing = ref(false), speed = ref(1), followLive = ref(true)
const actionBusy = ref(false), actionError = ref(''), sourceAvailable = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let sourceRequest: AbortController | undefined
const playback = computed(() => reduceRecognitionEvents(props.requestId, events.value.filter(event => event.seq <= cursor.value), followLive.value ? trace.value?.nodes : undefined, state.value.events[0]?.seq || 1))
const selectedNode = computed(() => playback.value.nodes[selected.value])
const outcome = computed(() => objectValue(trace.value?.outcome))
const result = computed(() => objectValue(outcome.value.result))
const llmUsage = computed(() => state.value.nodes.request?.payload.llm_usage || outcome.value.llm_usage || objectValue(state.value.nodes.openai?.payload.llm).usage)
const sourceId = computed(() => typeof result.value.source_trace_id === 'string' && result.value.source_trace_id !== props.requestId ? result.value.source_trace_id : '')
const terminal = computed(() => terminalStatuses.has(trace.value?.status || state.value.status))
const finalLink = computed(() => trace.value?.status === 'MATCHED' ? tmdbLink(result.value.media_type, result.value.tmdb_id) : null)
const connectionLabels = { loading: '读取流程', live: '实时连接', reconnecting: '正在重连', complete: '已结束', unavailable: '详情不可用' }
function pause() { playing.value = false; clearTimeout(timer) }
function seek(value: number) { pause(); cursor.value = value; followLive.value = value >= state.value.cursor }
function tick() {
  if (!playing.value) return
  const next = state.value.events.find(event => event.seq > cursor.value)
  if (!next) { pause(); followLive.value = true; return }
  const previous = state.value.events.find(event => event.seq === cursor.value)
  timer = setTimeout(() => { cursor.value = next.seq; tick() }, Math.max(16, (next.offset_ns - (previous?.offset_ns || 0)) / 1e6 / speed.value))
}
function play() {
  pause(); followLive.value = false
  if (cursor.value >= state.value.cursor) cursor.value = (state.value.events[0]?.seq || 1) - 1
  playing.value = true; tick()
}
async function action(operation: 'cancel' | 'retry') {
  if (actionBusy.value) return
  actionBusy.value = true; actionError.value = ''
  try {
    if (operation === 'cancel') { await cancelRecognition(props.requestId); await reload() }
    else { const task = await retryRecognition(props.requestId, crypto.randomUUID()); emit('follow', task.request_id) }
  } catch (cause) {
    actionError.value = cause instanceof RecognitionAPIError && cause.status === 409 ? '任务状态已变化，请重新读取流程后再操作。' : (cause as Error).message
  } finally { actionBusy.value = false }
}
function confirmAction(operation: 'cancel' | 'retry') {
  $q.dialog({ title: operation === 'cancel' ? '取消此识别任务？' : '重新识别此请求？',
    message: operation === 'cancel' ? '将显式取消业务任务；仅关闭详情不会取消任务。' : '将使用当前设置创建关联的新任务，原记录保持不变。', cancel: true, persistent: true }).onOk(() => { void action(operation) })
}
watch(() => props.requestId, () => { pause(); cursor.value = 0; followLive.value = true; selected.value = 'request'; actionError.value = ''; tab.value = 'flow' })
watch(() => state.value.cursor, value => { if (followLive.value) cursor.value = value })
watch(() => trace.value?.status, value => { if (value && terminalStatuses.has(value)) emit('completed') })
watch(sourceId, async id => {
  sourceRequest?.abort(); sourceAvailable.value = false
  if (!id) return
  const active = new AbortController(); sourceRequest = active
  try { const saved = await getRecognitionTrace(id, active.signal); if (!active.signal.aborted) sourceAvailable.value = saved.durability === 'persistent' }
  catch { /* Missing/expired/unauthorized source histories have no jump link. */ }
})
watch(speed, () => { if (playing.value) { clearTimeout(timer); tick() } })
onBeforeUnmount(() => { pause(); sourceRequest?.abort() })
</script>
<template>
  <section class="recognition-trace" aria-label="识别记录详情">
    <q-linear-progress v-if="loading" indeterminate />
    <q-banner v-if="error" dense class="trace-banner" role="alert">{{ error }}<div v-if="errorCode === 'HISTORY_NOT_RETAINED'">不记录模式，或“只记录失败”下成功、跳过、主动取消的请求，不提供持久历史。</div><div v-else-if="errorCode === 'HISTORY_EXPIRED'">识别历史已清理，无法回放已删除的流程。</div><q-btn flat color="primary" label="重新读取流程" :disable="loading" @click="reload" /></q-banner>
    <template v-if="trace">
      <div class="trace-summary"><h3>{{ trace.input.title || '识别请求' }}</h3><div class="row items-center q-gutter-sm"><q-badge :color="statusColor(trace.status)">{{ statusLabel(trace.status) }}</q-badge><span>{{ connectionLabels[connection] }}</span><span>总耗时：{{ durationLabel(outcome.duration_ms) }}</span><span>匹配评分：{{ outcome.score ?? '未记录' }}</span></div><p v-if="outcome.failure_code">原因：{{ reasonLabel(outcome.failure_code) }}</p><p>保存范围：{{ trace.retention === 'all' ? '记录全部' : trace.retention === 'failed' ? '只记录失败' : '不记录' }} · 当前数据{{ trace.durability === 'persistent' ? '已持久保存' : trace.durability === 'temporary' ? '仅临时缓冲，是否保存取决于最终结果' : '仅在内存中，回收后没有历史' }}</p>
        <div class="row q-gutter-sm"><q-btn v-if="finalLink" flat color="primary" label="查看最终 TMDB" :href="finalLink" target="_blank" rel="noopener noreferrer" /><q-btn v-if="sourceAvailable" flat color="primary" label="查看来源识别流程" @click="emit('follow', sourceId)" /><q-btn v-if="!terminal" outline color="negative" label="取消识别任务" :loading="actionBusy" @click="confirmAction('cancel')" /><q-btn v-if="terminal && trace.durability === 'persistent'" outline color="primary" label="重新识别" :loading="actionBusy" @click="confirmAction('retry')" /></div><p v-if="sourceId && !sourceAvailable" class="text-caption text-secondary">来源流程未保留、已清理或当前账号不可访问。</p>
      </div>
      <LLMTokenUsage :usage="llmUsage" />
      <q-banner v-if="partial || state.partial" dense class="trace-banner">当前事件窗口不完整，之前的事件已丢失或被截断。仅展示可用事件与当前节点快照，不伪造完整历史。</q-banner>
      <q-banner v-if="actionError" dense class="text-negative" role="alert">{{ actionError }}<q-btn flat label="重新读取流程" @click="reload" /></q-banner>
      <q-tabs v-model="tab" align="left" no-caps active-color="primary"><q-tab name="flow" label="流程与节点" /><q-tab name="candidates" label="候选评分" /><q-tab name="timeline" label="事件时间线" /></q-tabs>
      <div v-if="tab === 'flow'" class="trace-flow-layout"><RecognitionFlow :nodes="playback.nodes" :selected="selected" @select="selected = $event" /><RecognitionNodeDetail :node="selectedNode" :request-input="trace.input" /></div>
      <RecognitionCandidates v-else-if="tab === 'candidates'" :request-id="requestId" :status="trace.status" :can-manage="Boolean(canManage)" :scope="trace.input.scope" :override-version="typeof state.nodes.identity?.payload.override_version === 'number' ? state.nodes.identity.payload.override_version : undefined" @follow="emit('follow', $event)" />
      <RecognitionTimeline v-else :events="state.events" :cursor="cursor" :playing="playing" :speed="speed" :live="!terminal" @seek="seek" @play="play" @pause="pause" @update:speed="speed = $event" @select="selected = $event" />
      <q-expansion-item label="请求与结果原始数据" class="q-mt-md"><RecognitionJsonViewer :value="{ input: trace.input, outcome: trace.outcome, request_id: trace.request_id }" /></q-expansion-item>
    </template>
  </section>
</template>
<style scoped>
.recognition-trace { min-width: 0; }.trace-summary { padding: 12px 0 20px; overflow-wrap: anywhere; }.trace-summary h3 { font-size: 18px; margin: 0 0 12px; }.trace-summary p { color: var(--text-secondary); font-size: 13px; line-height: 1.7; }.trace-summary span { font-size: 13px; }.trace-banner { margin: 12px 0; border-radius: 8px; background: var(--surface-muted); }.trace-flow-layout { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(240px, 1fr); gap: 20px; padding-top: 18px; }@media(max-width: 900px) { .trace-flow-layout { grid-template-columns: minmax(0, 1fr); } }
</style>
