<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useQuasar } from 'quasar'
import RecognitionJsonViewer from '@/components/RecognitionJsonViewer.vue'
import RecognitionScoreBreakdown from './RecognitionScoreBreakdown.vue'
import { confirmRecognition, getRecognitionCandidates, RecognitionAPIError, type JsonValue, type RecognitionCandidateV3 } from '@/api/recognition'
import { reasonLabel, tmdbLink } from '@/utils/recognitionEvents'
const props = defineProps<{ requestId: string; status: string; canManage: boolean; scope?: JsonValue; overrideVersion?: number }>()
const emit = defineEmits<{ follow: [string] }>()
const $q = useQuasar()
const candidates = shallowRef<RecognitionCandidateV3[]>([])
const page = ref(1), total = ref(0), loading = ref(false), busy = ref(false), truncated = ref(false), error = ref('')
let request: AbortController | undefined
const canConfirm = computed(() => props.canManage && props.scope && typeof props.scope === 'object' && !Array.isArray(props.scope) && Number.isSafeInteger(props.overrideVersion))
async function load() {
  request?.abort(); const active = new AbortController(); request = active; loading.value = true; error.value = ''
  try {
    const result = await getRecognitionCandidates(props.requestId, page.value, active.signal)
    if (!active.signal.aborted) { candidates.value = result.items; total.value = result.total; truncated.value = Boolean(result.truncated) }
  } catch (cause) { if (!active.signal.aborted) error.value = (cause as Error).message }
  finally { if (!active.signal.aborted) loading.value = false }
}
function choose(candidate: RecognitionCandidateV3) {
  if (!canConfirm.value || !tmdbLink(candidate.media_type, candidate.tmdb_id) || busy.value) return
  $q.dialog({ title: '确认选择此作品？', message: `将验证 ${candidate.title || candidate.tmdb_id} 的类型与 TMDB ID，并记录人工选择。此操作会创建新的验证任务。`, cancel: true, persistent: true }).onOk(async () => {
    busy.value = true; error.value = ''
    try {
      const task = await confirmRecognition(props.requestId, { media_type: candidate.media_type, tmdb_id: candidate.tmdb_id,
        scope: props.scope as { canonical_name: string; media_type: 'movie' | 'tv' | 'unknown'; year: number | null }, expected_override_version: props.overrideVersion!, idempotency_key: crypto.randomUUID() })
      emit('follow', task.request_id)
    } catch (cause) {
      error.value = cause instanceof RecognitionAPIError && cause.status === 409 ? '确认范围或版本已变化，请重新识别并核对新候选后再确认。' : (cause as Error).message
    } finally { busy.value = false }
  })
}
watch(() => [props.requestId, props.status], () => { page.value = 1; void load() }, { immediate: true })
onBeforeUnmount(() => request?.abort())
</script>
<template>
  <section class="recognition-candidates" aria-label="识别候选">
    <p>匹配评分用于排序，不代表正确概率。候选按实际名次分页展示；人工选择仍需验证类型与 ID。</p>
    <q-banner v-if="error" dense class="text-negative" role="alert">{{ error }}<q-btn flat label="重新加载候选" @click="load" /></q-banner>
    <q-banner v-if="truncated" dense>当前运行缓冲仅保留部分候选，不能将此列表视为全部搜索结果。</q-banner>
    <q-linear-progress v-if="loading" indeterminate />
    <p v-if="!canConfirm" class="text-caption text-secondary">{{ canManage ? '此请求没有可用的确认范围或版本；可重新识别后确认。' : '仅管理员可以人工确认候选。' }}</p>
    <article v-for="candidate in candidates" :key="`${candidate.media_type}:${candidate.tmdb_id}`" class="candidate">
      <div class="candidate-heading"><h3>#{{ candidate.rank ?? '—' }} {{ candidate.title || '未提供名称' }}</h3><q-badge color="primary">匹配评分 {{ typeof candidate.score === 'number' ? candidate.score.toFixed(4) : '未记录' }}</q-badge></div>
      <p>{{ candidate.media_type === 'tv' ? '电视剧' : '电影' }} · TMDB {{ candidate.tmdb_id }} · 分差 {{ candidate.gap ?? '未记录' }}</p>
      <p v-if="candidate.hard_reject?.length" class="text-negative">硬拒绝：{{ candidate.hard_reject.map(reasonLabel).join('、') }}</p>
      <p>解析来源：{{ [...new Set(candidate.providers || [])].join('、') || '未记录' }}<br />查询来源：{{ [...new Set(candidate.query_ids || [])].join('、') || '未记录' }}</p>
      <RecognitionScoreBreakdown :scores="candidate.scores" :weights="candidate.available_weights" :title-checks="candidate.title_checks" />
      <q-expansion-item label="原始评分数据"><RecognitionJsonViewer :value="{ scores: candidate.scores || {}, available_weights: candidate.available_weights || {}, hard_reject: candidate.hard_reject || [] }" /></q-expansion-item>
      <div class="row q-gutter-sm"><q-btn v-if="tmdbLink(candidate.media_type, candidate.tmdb_id)" flat color="primary" label="查看候选 TMDB" :href="tmdbLink(candidate.media_type, candidate.tmdb_id)!" target="_blank" rel="noopener noreferrer" /><q-btn v-if="canManage" outline color="primary" label="人工选择此候选" :disable="!canConfirm || busy || !tmdbLink(candidate.media_type, candidate.tmdb_id)" :loading="busy" @click="choose(candidate)" /></div>
    </article>
    <p v-if="!loading && !candidates.length && !error" class="text-secondary">没有已记录的候选；可能尚未查询、走身份缓存快路径，或当前记录未保留候选。</p>
    <q-pagination v-if="total > 50" v-model="page" :max="Math.ceil(total / 50)" :max-pages="5" direction-links aria-label="候选分页" @update:model-value="load" />
    <div class="text-caption text-secondary">共 {{ total }} 条已记录候选</div>
  </section>
</template>
<style scoped>
.recognition-candidates { min-width: 0; overflow-wrap: anywhere; }.recognition-candidates p { font-size: 13px; line-height: 1.7; }.candidate { padding: 18px 0; border-bottom: 1px solid var(--border-subtle); }.candidate-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; justify-content: space-between; }h3 { font-size: 16px; margin: 0; }
</style>
