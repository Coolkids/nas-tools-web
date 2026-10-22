<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { type QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import RecognitionTracePanel from '@/components/recognition/RecognitionTracePanel.vue'
import RecognitionCleanupActions from '@/components/recognition/RecognitionCleanupActions.vue'
import LLMTokenUsage from '@/components/recognition/LLMTokenUsage.vue'
import { downloadRecognitionJsonl, downloadRecognitionXlsx, getRecognitionProviders, getRecognitionStatistics, listRecognitionHistory,
  submitRecognition, RecognitionAPIError, type RecognitionHistoryFilters, type RecognitionHistoryItem, type RecognitionStatistics } from '@/api/recognition'
import { durationLabel, recognitionStatuses, reasonLabel, statusColor, statusLabel, tmdbLink } from '@/utils/recognitionEvents'
const route = useRoute(), router = useRouter()
const draft = reactive({ title: '', status: '', source: '', provider_id: '', action_type: '', reason: '', date_from: '', date_to: '', type: '', cache_hit: '' })
const applied = ref<RecognitionHistoryFilters>({})
const records = shallowRef<RecognitionHistoryItem[]>([]), stats = shallowRef<RecognitionStatistics>()
const providers = ref<{ label: string; value: string }[]>([])
const page = ref(1), total = ref(0), loading = ref(false), error = ref(''), statsError = ref(''), exporting = ref(''), notice = ref('')
const detailOpen = ref(false), requestId = ref(''), submitting = ref(false), newTitle = ref(''), submitOpen = ref(false)
const pageSize = 20
let request: AbortController | undefined, statsRequest: AbortController | undefined
const canManage = computed(() => Boolean(stats.value?.can_manage))
const hasMore = computed(() => records.value.length < total.value)
const columns: QTableColumn<RecognitionHistoryItem>[] = [
  { name: 'title', label: '原始名称 / 最终结果', field: 'title', align: 'left', style: 'max-width: 360px; white-space: normal' },
  { name: 'status', label: '状态', field: 'status', align: 'left' }, { name: 'media_type', label: '类型', field: 'media_type', align: 'left' },
  { name: 'score', label: '匹配评分', field: 'score', align: 'left' }, { name: 'duration_ms', label: '总耗时', field: 'duration_ms', align: 'left' },
  { name: 'llm_usage', label: 'API Token（输入 / 输出）', field: 'llm_usage', align: 'left' },
  { name: 'started_at', label: '开始时间', field: 'started_at', align: 'left' }, { name: 'detail', label: '详情', field: 'request_id', align: 'left' }
]
const modes = { all: '记录全部', failed: '只记录失败', none: '不记录' }
const typeName = (value: unknown) => value === 'movie' ? '电影' : value === 'tv' ? '电视剧' : '未确定'
const time = (value: string) => new Date(value).toLocaleString()
function resultLink(row: RecognitionHistoryItem) { return row.status === 'MATCHED' ? tmdbLink(row.media_type, row.tmdb_id) : null }
async function load(append = false) {
  request?.abort(); const active = new AbortController(); request = active; loading.value = true; error.value = ''
  const nextPage = append ? page.value + 1 : page.value
  try {
    const response = await listRecognitionHistory({ ...applied.value, page: nextPage, page_size: pageSize }, active.signal)
    if (active.signal.aborted) return
    const merged = new Map((append ? records.value : []).map(row => [row.request_id, row]))
    for (const row of response.items) merged.set(row.request_id, row)
    records.value = [...merged.values()]; total.value = response.total; page.value = nextPage
  } catch (cause) { if (!active.signal.aborted) error.value = (cause as Error).message }
  finally { if (!active.signal.aborted) loading.value = false }
}
async function loadStats() {
  statsRequest?.abort(); const active = new AbortController(); statsRequest = active; statsError.value = ''
  try { const value = await getRecognitionStatistics(applied.value, active.signal); if (!active.signal.aborted) stats.value = value }
  catch (cause) { if (!active.signal.aborted) statsError.value = (cause as Error).message }
}
function search() {
  const filters: RecognitionHistoryFilters = {}
  for (const [key, value] of Object.entries(draft)) if (value !== '' && value !== null) (filters as Record<string, unknown>)[key] = key === 'cache_hit' ? value === 'true' : String(value).trim()
  if (draft.date_from && draft.date_to && draft.date_from > draft.date_to) { error.value = '开始日期不能晚于结束日期'; return }
  applied.value = filters; page.value = 1; records.value = []; void load(); void loadStats()
}
function openDetail(id: string) { requestId.value = id; detailOpen.value = true; void router.replace({ query: { ...route.query, request_id: id } }) }
function refresh() { page.value = 1; void load(); void loadStats() }
async function submit() {
  if (!newTitle.value.trim() || submitting.value) return
  submitting.value = true; error.value = ''
  try {
    const task = await submitRecognition({ title: newTitle.value.trim(), idempotency_key: crypto.randomUUID() })
    submitOpen.value = false; openDetail(task.request_id)
  } catch (cause) { error.value = cause instanceof RecognitionAPIError && cause.status === 409 ? '任务接入状态已变化，请稍后重新提交。' : (cause as Error).message }
  finally { submitting.value = false }
}
async function exportRecords(format: 'jsonl' | 'xlsx') {
  exporting.value = format; notice.value = ''; error.value = ''
  try {
    const filters: Record<string, string> = {}
    for (const [key, value] of Object.entries(applied.value)) filters[key === 'date_from' ? 'created_from' : key === 'date_to' ? 'created_to' : key] = String(value)
    const blob = await (format === 'jsonl' ? downloadRecognitionJsonl(filters) : downloadRecognitionXlsx(filters))
    const url = URL.createObjectURL(blob), link = document.createElement('a')
    link.href = url; link.download = `媒体识别记录.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    notice.value = `${format.toUpperCase()} 导出已开始下载，范围与当前已查询条件一致。`
  } catch (cause) { error.value = (cause as Error).message || '导出失败' }
  finally { exporting.value = '' }
}
async function loadMore(_index: number, done: (stop?: boolean) => void) { if (!loading.value && hasMore.value) await load(true); done(!hasMore.value || Boolean(error.value)) }
watch(detailOpen, value => { if (!value && route.query.request_id) { const query = { ...route.query }; delete query.request_id; void router.replace({ query }) } })
watch(() => route.query.request_id, value => { if (typeof value === 'string' && value) { requestId.value = value; detailOpen.value = true } else detailOpen.value = false }, { immediate: true })
onMounted(() => {
  void load(); void loadStats()
  void getRecognitionProviders().then(value => { providers.value = value.providers.map(provider => ({ label: String(provider.display_name || provider.provider_id), value: String(provider.provider_id) })) }).catch(() => {})
})
onBeforeUnmount(() => { request?.abort(); statsRequest?.abort() })
</script>

<template>
  <div class="page-shell recognition-history">
    <PageHeader title="媒体识别记录" description="查看已保存的识别结果、并行流程、候选评分与实际执行事件">
      <template #actions><div class="row q-gutter-sm"><q-btn color="primary" unelevated icon="play_arrow" label="发起识别" @click="submitOpen = true" /><q-btn outline icon="file_download" label="导出 JSONL" :loading="exporting === 'jsonl'" :disable="Boolean(exporting)" @click="exportRecords('jsonl')" /><q-btn outline icon="table_view" label="导出 Excel" :loading="exporting === 'xlsx'" :disable="Boolean(exporting)" @click="exportRecords('xlsx')" /></div></template>
    </PageHeader>
    <q-banner v-if="error" class="history-banner text-negative" role="alert">{{ error }}<q-btn flat label="重新查询记录" :disable="loading" @click="load()" /></q-banner>
    <q-banner v-if="notice" class="history-banner" role="status">{{ notice }}</q-banner>
    <div v-if="stats" class="history-coverage" aria-label="已保存记录 API 用量"><strong>当前筛选已保存记录的 API Token</strong><LLMTokenUsage :usage="stats.llm_usage" aggregate /><p>包含已保存的仅解析请求；不包含未留存、已清理记录或连接测试。缓存命中计本次零调用。</p><p v-if="stats.llm_usage_incomplete_records">{{ stats.llm_usage_incomplete_records }} 条记录没有完整 usage，不能作为全部调用的账单总额。</p></div>
    <q-banner v-if="statsError" class="history-banner" role="alert">统计范围暂不可用：{{ statsError }}<q-btn flat label="重新读取统计" @click="loadStats" /></q-banner>
    <div v-if="stats" class="history-coverage" aria-label="历史覆盖范围"><strong>当前记录方式：{{ modes[stats.record_mode] }}</strong><p>{{ stats.coverage_description }}。{{ stats.record_mode === 'failed' ? '成功、仅解析、跳过和用户主动取消通常未保留，不能据此计算全部请求成功率。' : stats.record_mode === 'none' ? '新请求只提供活跃期间的信息；已有历史仍可查看或清理。' : '即使记录全部，已清理和未留存数据也不在统计范围内。' }}</p><div class="coverage-metrics"><span>已保存统计样本 {{ stats.saved_count }} 条</span><span v-if="stats.success_rate !== null">已保存样本匹配率 {{ (stats.success_rate * 100).toFixed(1) }}%</span><span v-if="stats.p95_duration_ms !== null">已保存样本 P95 {{ durationLabel(stats.p95_duration_ms) }}</span></div></div>
    <q-card flat bordered>
      <q-card-section class="history-filters"><q-input v-model="draft.title" label="原始名称" outlined dense clearable @keyup.enter="search" /><q-select v-model="draft.status" :options="Object.entries(recognitionStatuses).filter(([key]) => key === key.toUpperCase()).map(([value, label]) => ({ value, label }))" label="识别状态" emit-value map-options clearable outlined dense /><q-select v-model="draft.type" :options="[{ label: '电影', value: 'movie' }, { label: '电视剧', value: 'tv' }]" label="媒体类型" emit-value map-options clearable outlined dense /><q-btn color="primary" label="查询记录" :loading="loading" @click="search" /></q-card-section>
      <q-expansion-item label="更多筛选条件" icon="filter_alt" class="advanced-filters"><div class="history-filters"><q-input v-model="draft.source" label="业务来源" outlined dense clearable /><q-select v-model="draft.provider_id" :options="providers" label="识别方式" emit-value map-options clearable outlined dense /><q-input v-model="draft.action_type" label="动作或节点 ID" outlined dense clearable /><q-input v-model="draft.reason" label="失败原因码" outlined dense clearable /><q-input v-model="draft.date_from" type="date" label="开始日期" outlined dense clearable /><q-input v-model="draft.date_to" type="date" label="结束日期" outlined dense clearable /><q-select v-model="draft.cache_hit" :options="[{ label: '缓存命中', value: 'true' }, { label: '未命中缓存', value: 'false' }]" label="缓存情况" emit-value map-options clearable outlined dense /></div></q-expansion-item>
      <div v-if="!$q.screen.lt.sm" class="history-table"><q-table :rows="records" :columns="columns" row-key="request_id" flat :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="暂无已保存的媒体识别记录">
        <template #body-cell-title="cell"><q-td :props="cell"><strong>{{ cell.row.title || '（空名称）' }}</strong><div v-if="cell.row.result_title" class="text-primary">{{ cell.row.result_title }}</div><div v-if="cell.row.failure_code" class="text-negative">{{ reasonLabel(cell.row.failure_code) }}</div><div class="text-caption text-secondary">{{ cell.row.source }}<span v-if="cell.row.cache_source"> · 缓存 {{ cell.row.cache_source }}</span></div><a v-if="resultLink(cell.row)" :href="resultLink(cell.row)!" target="_blank" rel="noopener noreferrer">TMDB #{{ cell.row.tmdb_id }}</a></q-td></template>
        <template #body-cell-status="cell"><q-td :props="cell"><q-badge :color="statusColor(cell.row.status)">{{ statusLabel(cell.row.status) }}</q-badge></q-td></template>
        <template #body-cell-media_type="cell"><q-td :props="cell">{{ typeName(cell.row.media_type) }}</q-td></template>
        <template #body-cell-score="cell"><q-td :props="cell">{{ typeof cell.row.score === 'number' ? cell.row.score.toFixed(4) : '未记录' }}</q-td></template>
        <template #body-cell-duration_ms="cell"><q-td :props="cell">{{ durationLabel(cell.row.duration_ms) }}</q-td></template>
        <template #body-cell-llm_usage="cell"><q-td :props="cell"><LLMTokenUsage :usage="cell.row.llm_usage" compact /></q-td></template>
        <template #body-cell-started_at="cell"><q-td :props="cell">{{ time(cell.row.started_at) }}</q-td></template>
        <template #body-cell-detail="cell"><q-td :props="cell"><q-btn flat color="primary" label="查看流程" @click="openDetail(cell.row.request_id)" /></q-td></template>
      </q-table></div>
      <q-infinite-scroll v-else :disable="!hasMore || loading || Boolean(error)" :offset="150" @load="loadMore"><div class="mobile-history"><article v-for="row in records" :key="row.request_id" class="mobile-history-record"><div class="row justify-between items-center"><q-badge :color="statusColor(row.status)">{{ statusLabel(row.status) }}</q-badge><span class="text-caption text-secondary">{{ typeName(row.media_type) }}</span></div><h3>{{ row.title || '（空名称）' }}</h3><p v-if="row.result_title">{{ row.result_title }}</p><p v-if="row.failure_code" class="text-negative">{{ reasonLabel(row.failure_code) }}</p><LLMTokenUsage :usage="row.llm_usage" compact /><div class="text-caption text-secondary">评分 {{ row.score ?? '未记录' }} · 总耗时 {{ durationLabel(row.duration_ms) }}<br />{{ row.source }} · {{ time(row.started_at) }}</div><div class="row q-gutter-sm q-mt-sm"><q-btn flat color="primary" label="查看流程" @click="openDetail(row.request_id)" /><q-btn v-if="resultLink(row)" flat color="primary" label="最终 TMDB" :href="resultLink(row)!" target="_blank" rel="noopener noreferrer" /></div></article></div></q-infinite-scroll>
      <q-card-section v-if="!records.length && !loading" class="history-empty">暂无已保存记录。升级会清理旧识别历史；当前记录策略、筛选条件及历史清理都会影响可见范围。</q-card-section>
      <q-card-section class="history-pagination"><span class="text-caption text-secondary">共 {{ total }} 条已保存记录</span><q-pagination v-if="!$q.screen.lt.sm && total > pageSize" v-model="page" :max="Math.ceil(total / pageSize)" :max-pages="5" direction-links aria-label="记录分页" @update:model-value="load()" /><q-btn v-if="$q.screen.lt.sm && hasMore" flat color="primary" label="加载更多记录" :loading="loading" @click="load(true)" /></q-card-section>
    </q-card>
    <q-card v-if="canManage" flat bordered class="q-mt-lg"><q-card-section><h2 class="cleanup-title">清理识别记录</h2><RecognitionCleanupActions @completed="refresh" /></q-card-section></q-card>
    <q-dialog v-model="detailOpen" :maximized="$q.screen.lt.sm" no-route-dismiss><q-card class="history-detail-dialog"><q-card-section class="row items-center recognition-detail-heading"><h2 class="detail-title">识别记录详情</h2><q-space /><q-btn flat round icon="close" aria-label="关闭识别详情" v-close-popup /></q-card-section><q-separator /><q-card-section><RecognitionTracePanel v-if="detailOpen && requestId" :request-id="requestId" :can-manage="canManage" @follow="openDetail" @completed="refresh" /></q-card-section></q-card></q-dialog>
    <q-dialog v-model="submitOpen" persistent><q-card class="new-recognition-dialog"><q-card-section><h2 class="detail-title">发起媒体识别</h2><p>使用当前设置创建只读识别任务，可实时查看进度；关闭详情不会取消任务。</p><q-input v-model="newTitle" label="待识别名称" outlined maxlength="2048" @keyup.enter="submit" /><p v-if="error" class="text-negative" role="alert">{{ error }}</p></q-card-section><q-card-actions align="right"><q-btn flat label="取消" :disable="submitting" v-close-popup /><q-btn color="primary" label="开始识别" :disable="!newTitle.trim()" :loading="submitting" @click="submit" /></q-card-actions></q-card></q-dialog>
    <ScrollToTop />
  </div>
</template>
<style scoped>
.history-coverage { padding: 18px 20px; margin-bottom: 20px; background: var(--surface-muted); border-radius: 12px; }.history-coverage p { color: var(--text-secondary); line-height: 1.7; font-size: 13px; margin: 8px 0; }.coverage-metrics { display: flex; flex-wrap: wrap; gap: 12px 24px; font-size: 13px; }.history-banner { margin-bottom: 16px; background: var(--surface-muted); border-radius: 8px; }.history-filters { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; gap: 12px; }.advanced-filters { padding: 0 16px 16px; }.advanced-filters .history-filters { padding-top: 12px; }.history-table { overflow-x: auto; }.history-table :deep(.q-table) { min-width: 850px; }.history-table strong { display: block; overflow-wrap: anywhere; }.history-pagination { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }.mobile-history-record { padding: 18px; border-bottom: 1px solid var(--border-subtle); overflow-wrap: anywhere; }.mobile-history-record h3 { font-size: 15px; margin: 12px 0; }.mobile-history-record p { margin: 8px 0; }.history-empty { color: var(--text-secondary); line-height: 1.7; }.recognition-detail-heading { position: sticky; top: 0; z-index: 10; background: var(--surface); }.history-detail-dialog { width: 1200px; max-width: 96vw; }.detail-title,.cleanup-title { margin: 0; font-size: 19px; font-weight: 650; }.cleanup-title { margin-bottom: 16px; }.new-recognition-dialog { width: 520px; max-width: 94vw; }.new-recognition-dialog p { color: var(--text-secondary); font-size: 13px; line-height: 1.7; }@media(max-width: 767px) { .history-filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }.history-detail-dialog { max-width: 100vw; }.detail-title { font-size: 18px; } }
</style>
