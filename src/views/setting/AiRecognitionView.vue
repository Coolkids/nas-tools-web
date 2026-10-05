<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { useQuasar, type QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import RecognitionJsonViewer from '@/components/RecognitionJsonViewer.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import { useModalStore } from '@/stores/modal'
import {
  downloadRecognitionJsonl,
  downloadRecognitionXlsx,
  getRecognitionProviders,
  getRecognitionRecordDetail,
  getRecognitionRecords,
  type RecognitionRecord
} from '@/api/recognition'

const modal = useModalStore()
const quasar = useQuasar()
const loading = ref(false)
const exportingFormat = ref('')
const exportMessage = ref('')
const loadError = ref('')
const title = ref('')
const source = ref('')
const providerId = ref('')
const actionType = ref('')
const status = ref('')
const reason = ref('')
const createdFrom = ref('')
const createdTo = ref('')
const providers = ref<Array<Record<string, unknown>>>([])
const records = shallowRef<RecognitionRecord[]>([])
const details = ref<Record<string, RecognitionRecord & { context?: unknown; attempts?: unknown[] }>>({})
const detailLoading = ref<Record<string, boolean>>({})
const detailErrors = ref<Record<string, string>>({})
type DetailTab = 'overview' | 'actions' | 'providers' | 'tmdb'
const detailOpen = ref(false)
const detailTab = ref<DetailTab>('overview')
const activeRecord = shallowRef<RecognitionRecord | null>(null)
const activeRequestId = computed(() => activeRecord.value?.request_id || '')
const activeDetail = computed(() => details.value[activeRequestId.value])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const hasMore = ref(false)
const lastLoadWasAppend = ref(false)
let pendingReload = false
let loadGeneration = 0

const actionLabels: Record<string, string> = {
  request_start: '开始识别', request_error: '识别异常', forced_search: '强制重搜',
  resolution_overrides: '查询条件覆盖', preprocess: '名称预处理', provider_parse: '名称解析',
  tmdb_query: 'TMDB 查询', tmdb_candidate_selection: 'TMDB 候选筛选',
  title_match: '名称比对', cache_hit: '缓存命中', tmdb_cache: 'TMDB 缓存命中',
  fallback: '回退识别', file_skip: '跳过文件', provided_tmdb: '指定 TMDB',
  decision: '整体决策', request_finish: '完成识别', request_recovered: '中断恢复',
  prefilter_rejected: '业务过滤拒绝', media_cache_hit: '媒体缓存命中'
}

const recognitionReasonLabels: Record<string, string> = {
  ambiguous_tmdb: '多个 TMDB 条目的名称或别名命中标题',
  tmdb_network_error: 'TMDB 网络请求失败',
  tmdb_no_results: 'TMDB 查询无结果',
  no_tmdb_match: 'TMDB 候选名称或别名未在标题中找到',
  tmdb_unavailable: 'TMDB 未配置或不可用',
  recognition_deadline_exceeded: '识别超时',
  no_name_parsed: '未能解析出媒体名称',
  insufficient_title_evidence: '标题匹配证据不足',
  indexer_seeders_zero: '索引器过滤：做种数为零',
  local_parse_no_name: '本地解析未得到名称',
  indexer_type_mismatch: '索引器过滤：媒体类型不匹配',
  indexer_filter_rejected: '索引器规则过滤拒绝',
  indexer_imdb_match: '索引器 IMDB 条目复用',
  indexer_media_cache_match: '索引器媒体缓存命中',
  rss_media_cache_hit: 'RSS 媒体缓存命中',
  rss_already_downloaded: 'RSS 过滤：已成功订阅过',
  rss_subscription_filter_rejected: 'RSS 订阅规则不匹配'
}

const tmdbStatusLabels: Record<string, string> = {
  success: '匹配成功', ambiguous: '多个候选命中', ambiguous_tmdb: '多个候选命中',
  tmdb_network_error: '网络请求失败',
  tmdb_no_results: '查询无结果', no_tmdb_match: '名称未命中', timeout: '请求超时',
  no_result: '无结果', error: '请求错误'
}

const providerStatusLabels: Record<string, string> = {
  success: '成功', cached: '缓存', skipped: '跳过', error: '异常',
  timeout: '超时', invalid: '响应无效', no_result: '无结果'
}

const providerReasonLabels: Record<string, string> = {
  ai_inference_disabled: 'AI 总开关关闭',
  ai_inference_endpoint_missing: 'AI 接口地址未配置',
  anitopy_ml_provider_disabled: 'anitopy-ml 识别器已关闭',
  disabled_or_empty_title: 'AI 未启用或标题为空',
  empty_endpoint: 'AI 接口地址为空',
  empty_title: '标题为空',
  ai_deferred_to_resolve: '本地预解析，后续完整识别时再运行 AI',
  ai_deferred_by_caller: '当前业务步骤暂不运行 AI',
  ai_deferred_to_rss_cache_or_resolution: '等待 RSS 媒体缓存或完整识别分支决定是否运行 AI',
  ai_deferred_to_indexer_filter_or_resolution: '等待索引器过滤或完整识别分支决定是否运行 AI',
  indexer_seeders_zero: '做种数为零，索引器提前过滤',
  local_parse_no_name: '本地解析没有得到可用名称',
  indexer_type_mismatch: '媒体类型不匹配，索引器提前过滤',
  indexer_filter_rejected: '索引器过滤规则拒绝',
  indexer_imdb_match: '复用已匹配的 IMDB 媒体条目',
  indexer_media_cache_match: '命中索引器媒体缓存',
  rss_media_cache_hit: '命中 RSS 媒体缓存',
  rss_already_downloaded: '该种子已成功订阅过',
  rss_subscription_filter_rejected: 'RSS 订阅规则拒绝该种子',
  provider_deferred_by_caller: '当前业务步骤暂不运行此识别方式',
  prefilter_rejected: '被业务过滤规则提前跳过',
  media_cache_hit: '命中媒体缓存，跳过 AI',
  provider_unavailable: '识别器未加载',
  provided_tmdb: '本次使用了指定 TMDB 条目'
}

const columns: QTableColumn<RecognitionRecord>[] = [
  { name: 'original_name', label: '原始名称', field: 'original_name', align: 'left', headerStyle: 'width: 24%' },
  { name: 'actions', label: '识别动作', field: 'actions', align: 'left', headerStyle: 'width: 14%' },
  { name: 'providers', label: '识别方式结果', field: 'provider_results', align: 'left', headerStyle: 'width: 17%' },
  { name: 'overall', label: '整体结果', field: 'overall_result', align: 'left', headerStyle: 'width: 11%' },
  { name: 'tmdb', label: 'TMDB', field: 'tmdb_results', align: 'left', headerStyle: 'width: 18%' },
  { name: 'created_at', label: '记录时间', field: 'created_at', align: 'left', headerStyle: 'width: 10%' },
  { name: 'detail', label: '详情', field: 'request_id', align: 'center', headerStyle: 'width: 6%' }
]

interface TmdbSummaryGroup {
  key: string
  providerId: string
  label: string
  count: number
}

// Summarize once per list update; rendering cost and row height stay bounded.
const summaryRows = computed(() => records.value.map((record) => {
  const actions = new Map<string, { type: string; label: string; count: number }>()
  for (const action of record.actions) {
    const type = String(action.action_type || 'unknown')
    const group = actions.get(type)
    if (group) group.count += 1
    else actions.set(type, { type, label: actionLabels[type] || type, count: 1 })
  }
  const tmdb = new Map<string, TmdbSummaryGroup>()
  const finalTmdb = new Map<string, TmdbSummaryGroup>()
  for (const item of record.tmdb_results) {
    const result = asObject(item.result)
    const label = tmdbSummary(item)
    const providerId = String(item.provider_id || 'unknown')
    const key = JSON.stringify([providerId, item.status, result.media_type, result.id, label])
    const group = tmdb.get(key)
    if (group) group.count += 1
    else tmdb.set(key, { key, providerId, label, count: 1 })

    // Calls are ordered. Ignore successful boolean/list responses, which do not
    // identify a media item; a later failed query supersedes earlier candidates.
    if (item.status === 'success' && result.id) {
      finalTmdb.set(providerId, { key, providerId, label, count: 1 })
    } else if (item.status && item.status !== 'success') {
      finalTmdb.set(providerId, tmdb.get(key)!)
    }
  }
  const selectedProvider = String(record.overall_result.selected_provider || '')
  const selectedResult = asObject(record.overall_result.tmdb_result)
  if (record.overall_result.status === 'success' && selectedProvider && selectedResult.id) {
    finalTmdb.set(selectedProvider, {
      key: `final:${selectedProvider}`, providerId: selectedProvider,
      label: tmdbSummary({ result: selectedResult }), count: 1
    })
  }
  const tmdbGroups = [...tmdb.values()].sort((a, b) => b.count - a.count)
  const tmdbFinalResults = record.overall_result.status === 'success'
    ? [...new Set(['local_rules', 'anitopy_ml', ...finalTmdb.keys()])]
        .flatMap((providerId) => finalTmdb.has(providerId) ? [finalTmdb.get(providerId)!] : [])
        .slice(0, 2)
    : []
  return {
    ...record,
    actionGroups: [...actions.values()].sort((a, b) => b.count - a.count),
    tmdbGroups,
    tmdbFinalResults,
    tmdbPreview: tmdbFinalResults.length ? tmdbFinalResults : tmdbGroups.slice(0, 2)
  }
}))

function statusLabel(statusValue: unknown): string {
  const labels: Record<string, string> = {
    success: '成功', failed: '失败', unknown: '历史状态未知',
    running: '处理中断待恢复', interrupted: '进程中断', skipped: '已跳过'
  }
  const status = String(statusValue || 'unknown')
  return labels[status] || `未知状态 (${status})`
}

function overallLabel(record: RecognitionRecord): string {
  const value = record.overall_result
  const statusValue = String(value.status || 'unknown')
  const reasonValue = String(value.reason || '')
  const reason = reasonValue ? `：${recognitionReasonLabels[reasonValue] || reasonValue}` : ''
  const businessResult = value.business_result as { reason?: string } | undefined
  const businessReason = String(businessResult?.reason || '')
  const business = businessReason
    ? ` · ${recognitionReasonLabels[businessReason] || providerReasonLabels[businessReason] || businessReason}`
    : ''
  return `${statusLabel(statusValue)}${reason}${business}`
}

function statusColor(statusValue: unknown): string {
  const colors: Record<string, string> = {
    success: 'positive', failed: 'negative', interrupted: 'warning',
    running: 'info', skipped: 'grey', unknown: 'grey-7'
  }
  return colors[String(statusValue || 'unknown')] || 'grey-7'
}

function providerStatusColor(statusValue: unknown): string {
  const colors: Record<string, string> = {
    success: 'positive', cached: 'info', skipped: 'grey',
    error: 'negative', timeout: 'warning', invalid: 'negative', no_result: 'grey'
  }
  return colors[String(statusValue || 'unknown')] || 'grey-7'
}

function providerReasonLabel(value: unknown): string {
  const reason = String(value || '')
  return providerReasonLabels[reason] || reason
}

function providerLabel(providerIdValue: unknown): string {
  const id = String(providerIdValue || 'unknown')
  const provider = providers.value.find((item) => String(item.provider_id) === id)
  return String(provider?.display_name || id)
}

function providerResultSummary(value: unknown): { title: string; seasonEpisode: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { title: '未解析', seasonEpisode: '' }
  }
  const result = value as Record<string, unknown>
  const extracted = asObject(result.extracted)
  const parsed = Object.keys(extracted).length ? extracted : result
  const spans = Array.isArray(parsed.title_spans) ? parsed.title_spans : []
  const firstSpan = asObject(spans[0])
  const allTitles = Array.isArray(parsed.all_titles) ? parsed.all_titles : []
  const title = String(parsed.name || parsed.title || parsed.anime_title ||
    parsed.cn_name || parsed.en_name || firstSpan.text || allTitles[0] ||
    parsed.canonical_title || '未解析')
  const seasonValues = Array.isArray(parsed.seasons) ? parsed.seasons : []
  const episodeValues = Array.isArray(parsed.episodes) ? parsed.episodes : []
  const firstEpisode = episodeValues.length ? asObject(episodeValues[0]) : {}
  const season = parsed.season ?? parsed.season_number ?? seasonValues[0] ?? parsed.anime_season
  const episode = parsed.episode ?? parsed.episode_number ?? firstEpisode.value ?? episodeValues[0]
  const seasonText = season === undefined || season === null || season === '' ? '' : `第${String(season).replace(/^第|季$/g, '')}季`
  const episodeText = episode === undefined || episode === null || episode === '' ? '' : `第${String(episode).replace(/^第|集$/g, '')}集`
  return { title, seasonEpisode: [seasonText, episodeText].filter(Boolean).join(' ') }
}

function formatCreatedAt(value: unknown): string {
  return String(value || '').replace(/\.\d+(?=Z|[+-]\d{2}:?\d{2}|$)/, '')
}

function tmdbSummary(result: Record<string, unknown>): string {
  const value = result.result as Record<string, unknown> | null
  if (!value || typeof value !== 'object') {
    const status = String(result.status || 'no_result')
    return tmdbStatusLabels[status] || status || '无结果'
  }
  return `${String(value.title || value.name || 'TMDB 条目')} (#${String(value.id || '?')})`
}

function recordDetail(requestId: string) {
  return details.value[requestId]
}

function actionList(requestId: string): Array<Record<string, unknown>> {
  return (recordDetail(requestId)?.actions || []) as Array<Record<string, unknown>>
}

function selectedAction(requestId: string): Record<string, unknown> | undefined {
  const actions = actionList(requestId)
  const selectedId = selectedActionIds.value[requestId]
  return actions.find((action) => actionKey(action) === selectedId) || actions[0]
}

function actionKey(action: Record<string, unknown>): string {
  return String(action.action_id || action.sequence || '')
}

function selectAction(requestId: string, action: Record<string, unknown>) {
  selectedActionIds.value[requestId] = actionKey(action)
}

function selectAttemptAction(requestId: string, attemptId: string, providerId: string) {
  const action = actionList(requestId).find((item) => item.attempt_id === attemptId)
    || actionList(requestId).find((item) => item.action_type === 'provider_parse' && item.provider_id === providerId)
  if (action) {
    selectAction(requestId, action)
    detailTab.value = 'actions'
  }
}

function selectTmdbAction(requestId: string, resultIndex: number, providerId: string) {
  const matches = actionList(requestId).filter((action) => action.action_type === 'tmdb_query' && action.provider_id === providerId)
  const results = recordDetail(requestId)?.tmdb_results || []
  const providerIndex = results.slice(0, resultIndex).filter((item) => item.provider_id === providerId).length
  if (matches[providerIndex]) {
    selectAction(requestId, matches[providerIndex])
    detailTab.value = 'actions'
  }
}

function titleEvidenceSegments(requestId: string): Array<{ text: string; matched: boolean }> {
  const action = selectedAction(requestId)
  if (action?.action_type !== 'title_match') return []
  const input = (action.input || {}) as Record<string, unknown>
  const output = (action.output || {}) as Record<string, unknown>
  const rawTitle = String(input.original_name || output.input || recordDetail(requestId)?.original_name || '')
  const names = [
    ...((output.matched_names as Array<Record<string, unknown>> | undefined) || []),
    ...((output.weak_matches as Array<Record<string, unknown>> | undefined) || [])
  ]
  const codePointToUtf16 = (index: number) => Array.from(rawTitle).slice(0, index).join('').length
  const codePointLength = Array.from(rawTitle).length
  const ranges = names.map((item) => ({
    start: Number(item.match_start),
    end: Number(item.match_end)
  })).filter((item) => Number.isInteger(item.start) && Number.isInteger(item.end)
    && item.start >= 0 && item.end > item.start && item.end <= codePointLength)
    .map((item) => ({ index: codePointToUtf16(item.start), end: codePointToUtf16(item.end) }))
    .sort((a, b) => a.index - b.index)
  const match = ranges[0]
  if (!match) {
    const candidates = names.map((item) => String(item.match || '')).filter(Boolean)
    const lowerTitle = rawTitle.toLocaleLowerCase()
    const fallback = candidates.map((value) => ({ value, index: lowerTitle.indexOf(value.toLocaleLowerCase()) }))
      .filter((item) => item.index >= 0).sort((a, b) => a.index - b.index)[0]
    if (!fallback) return [{ text: rawTitle, matched: false }]
    return [
      { text: rawTitle.slice(0, fallback.index), matched: false },
      { text: rawTitle.slice(fallback.index, fallback.index + fallback.value.length), matched: true },
      { text: rawTitle.slice(fallback.index + fallback.value.length), matched: false }
    ].filter((item) => item.text)
  }
  return [
    { text: rawTitle.slice(0, match.index), matched: false },
    { text: rawTitle.slice(match.index, match.end), matched: true },
    { text: rawTitle.slice(match.end), matched: false }
  ].filter((item) => item.text)
}

function isAmbiguous(record: RecognitionRecord): boolean {
  return String(record.overall_result.reason || '') === 'ambiguous_tmdb'
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function anitopyDiagnostic(requestId: string): string {
  const record = recordDetail(requestId)
  if (!record) return ''
  const attempt = record.provider_results.find((item) => item.provider_id === 'anitopy_ml')
  if (attempt?.status === 'skipped') {
    return `anitopy-ml 本次未运行：${providerReasonLabel(attempt.error)}。`
  }
  if (attempt) return ''
  if (record.stage === 'parse_only') return 'parse_only 按设计只运行本地解析器，不调用 anitopy-ml。'

  const context = asObject(record.context)
  const snapshot = asObject(context.recognition_config_snapshot)
  const runtime = asObject(snapshot.runtime)
  const recognition = asObject(snapshot.recognition)
  const providerSettings = asObject(asObject(recognition.providers).anitopy_ml)
  if (runtime.ai_inference_enabled === false) return '该请求的配置快照显示 AI 推理总开关处于关闭状态。'
  if (providerSettings.enabled === false) return '该请求的配置快照显示 anitopy-ml 识别器处于关闭状态。'
  if (runtime.ai_inference_enabled === true && providerSettings.enabled === true) {
    return '配置快照显示 AI 总开关和 anitopy-ml 识别器均已开启，但本次没有写入调用记录；请核对来源、调用路径和部署版本。'
  }
  return '本条记录没有 anitopy-ml 调用结果，且配置快照不足以判断原因。'
}

const selectedActionIds = ref<Record<string, string>>({})

async function load(append = false): Promise<boolean> {
  if (loading.value) {
    if (!append) pendingReload = true
    return false
  }
  const requestGeneration = loadGeneration
  const requestPage = page.value
  loading.value = true
  lastLoadWasAppend.value = append
  loadError.value = ''
  try {
    const response = await getRecognitionRecords({
      title: title.value.trim(), source: source.value,
      status: status.value, provider_id: providerId.value,
      action_type: actionType.value, reason: reason.value,
      created_from: createdFrom.value, created_to: createdTo.value,
      page: requestPage, page_size: pageSize
    })
    if (requestGeneration !== loadGeneration || requestPage !== page.value) return false
    if (response.code === 0) {
      const rows = response.records || []
      if (append) {
        const existingIds = new Set<string>()
        const mergedRows: RecognitionRecord[] = []
        for (const record of records.value as RecognitionRecord[]) {
          existingIds.add(record.request_id)
          mergedRows.push(record)
        }
        for (const record of rows as RecognitionRecord[]) {
          if (!existingIds.has(record.request_id)) mergedRows.push(record)
        }
        records.value = mergedRows
      } else {
        records.value = rows
        clearDetailCache()
      }
      total.value = response.total || 0
      hasMore.value = rows.length > 0 && requestPage < Math.ceil(total.value / pageSize)
      return true
    }
    loadError.value = response.msg || '查询识别记录失败'
    hasMore.value = false
  } catch (error) {
    if (requestGeneration !== loadGeneration || requestPage !== page.value) return false
    loadError.value = error instanceof Error ? error.message : '查询识别记录失败'
    hasMore.value = false
  } finally {
    loading.value = false
    if (pendingReload) {
      pendingReload = false
      void load()
    }
  }
  return false
}

function search() {
  loadGeneration += 1
  page.value = 1
  records.value = []
  clearDetailCache()
  total.value = 0
  hasMore.value = false
  void load()
}

function clearDetailCache() {
  const currentDetail = activeDetail.value
  details.value = detailOpen.value && currentDetail
    ? { [currentDetail.request_id]: currentDetail }
    : {}
}

// Both list modes start on page one; keep an open detail visible during rotation.
watch(() => quasar.screen.lt.sm, search)

function pageChange(nextPage: number) {
  page.value = nextPage
  void load()
}

async function loadNextPage(_index: number, done: (stop?: boolean) => void) {
  if (!hasMore.value) {
    done(true)
    return
  }
  if (loading.value) {
    done()
    return
  }
  page.value += 1
  const loaded = await load(true)
  done(!loaded || !hasMore.value)
}

function retryLoad() {
  void load(lastLoadWasAppend.value)
}

async function loadDetail(requestId: string) {
  if (details.value[requestId] || detailLoading.value[requestId]) return
  detailLoading.value[requestId] = true
  detailErrors.value[requestId] = ''
  try {
    const response = await getRecognitionRecordDetail(requestId)
    if (response.code === 0 && response.record) details.value[requestId] = response.record
    else detailErrors.value[requestId] = response.msg || '读取识别详情失败'
  } catch (error) {
    detailErrors.value[requestId] = error instanceof Error ? error.message : '读取识别详情失败'
  } finally {
    detailLoading.value[requestId] = false
  }
}

function openDetail(record: RecognitionRecord, tab: DetailTab = 'overview') {
  activeRecord.value = record
  detailTab.value = tab
  detailOpen.value = true
  void loadDetail(record.request_id)
}

async function exportRecords(format: 'jsonl' | 'xlsx') {
  exportingFormat.value = format
  exportMessage.value = ''
  try {
    const filters = {
      title: title.value.trim(), source: source.value, status: status.value,
      provider_id: providerId.value, action_type: actionType.value,
      reason: reason.value, created_from: createdFrom.value, created_to: createdTo.value
    }
    const blob = format === 'jsonl'
      ? await downloadRecognitionJsonl(filters)
      : await downloadRecognitionXlsx(filters)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `媒体识别记录.${format}`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    exportMessage.value = `${format.toUpperCase()} 导出已开始下载。`
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exportingFormat.value = ''
  }
}

onMounted(async () => {
  try {
    const result = await getRecognitionProviders()
    providers.value = result.providers || []
  } catch { /* The records remain readable if provider discovery diagnostics fail. */ }
  await load()
})
</script>

<template>
  <div class="page-shell ai-recognition-view">
    <PageHeader title="媒体识别记录" description="查看每次识别的原始名称、执行动作、各识别方式结果、整体结果及 TMDB 返回值">
      <template #actions>
        <div class="row q-gutter-sm">
          <q-btn outline icon="file_download" label="导出 JSONL" :loading="exportingFormat === 'jsonl'" :disable="!!exportingFormat" @click="exportRecords('jsonl')" />
          <q-btn outline icon="table_view" label="导出 Excel" :loading="exportingFormat === 'xlsx'" :disable="!!exportingFormat" @click="exportRecords('xlsx')" />
        </div>
      </template>
    </PageHeader>
    <q-banner v-if="exportMessage" rounded dense class="bg-positive text-white q-mb-md">
      <template #avatar><q-icon name="check_circle" /></template>
      {{ exportMessage }}
    </q-banner>

    <q-card flat bordered>
      <q-card-section class="row items-center q-col-gutter-sm">
        <div class="col-12 col-md-4">
          <q-input v-model="title" outlined dense clearable label="原始名称" placeholder="搜索识别名称" @keyup.enter="search" />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="source" outlined dense clearable label="业务来源" @keyup.enter="search" />
        </div>
        <div class="col-6 col-md-2">
          <q-select v-model="providerId" outlined dense clearable emit-value map-options label="识别方式" :options="providers.map((item) => ({ label: String(item.display_name || item.provider_id), value: String(item.provider_id) }))" />
        </div>
        <div class="col-6 col-md-2">
          <q-select v-model="actionType" outlined dense clearable emit-value map-options label="识别动作" :options="Object.entries(actionLabels).map(([value, label]) => ({ value, label }))" />
        </div>
        <div class="col-6 col-md-1">
          <q-select v-model="status" outlined dense clearable emit-value map-options label="结果" :options="[{ label: '成功', value: 'success' }, { label: '失败', value: 'failed' }, { label: '历史状态未知', value: 'unknown' }, { label: '处理中断', value: 'running' }, { label: '进程中断', value: 'interrupted' }, { label: '已跳过', value: 'skipped' }]" />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="reason" outlined dense clearable label="失败原因码" @keyup.enter="search" />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="createdFrom" outlined dense clearable type="date" label="开始日期" />
        </div>
        <div class="col-6 col-md-2">
          <q-input v-model="createdTo" outlined dense clearable type="date" label="结束日期" />
        </div>
        <div class="col-12 col-md-auto">
          <q-btn color="primary" unelevated icon="search" label="查询" :loading="loading" @click="search" />
        </div>
        <q-space />
        <div class="text-caption text-secondary">共 {{ total }} 条</div>
      </q-card-section>
      <q-banner v-if="loadError" rounded dense inline-actions class="q-mx-md q-mb-md">
        <template #avatar><q-icon name="error_outline" color="negative" /></template>
        {{ loadError }}
        <template #action><q-btn flat color="primary" label="重试" :disable="loading" @click="retryLoad" /></template>
      </q-banner>
      <div v-if="!$q.screen.lt.sm" class="recognition-table-scroll">
        <q-table :rows="summaryRows" :columns="columns" row-key="request_id" flat :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="暂无媒体识别记录">
          <template #body="props">
            <q-tr :props="props">
              <q-td key="original_name" :props="props">
                <div class="original-name summary-clamp" :title="props.row.original_name">{{ props.row.original_name || '（空名称）' }}</div>
                <div class="record-source text-caption text-secondary">{{ props.row.source || '来源未知' }} · {{ props.row.stage || '阶段未知' }}</div>
              </q-td>
              <q-td key="actions" :props="props">
                <div v-for="group in props.row.actionGroups.slice(0, 3)" :key="group.type" class="action-count">
                  <span class="ellipsis" :title="group.label">{{ group.label }}</span><span class="summary-count">×{{ group.count }}</span>
                </div>
                <q-btn v-if="props.row.actions.length" flat dense no-caps color="primary" class="summary-link" :label="`共 ${props.row.actions.length} 个动作`" icon-right="chevron_right" @click="openDetail(props.row, 'actions')" />
                <span v-else class="text-caption text-secondary">无动作</span>
              </q-td>
              <q-td key="providers" :props="props">
                <div v-for="item in props.row.provider_results.slice(0, 2)" :key="item.attempt_id" class="provider-summary">
                  <div class="provider-summary-heading"><span class="ellipsis text-caption text-secondary">{{ providerLabel(item.provider_id) }}</span><q-badge :color="providerStatusColor(item.status)" :label="providerStatusLabels[item.status] || item.status" /></div>
                  <div class="ellipsis" :title="providerResultSummary(item.normalized_result).title">{{ providerResultSummary(item.normalized_result).title }}</div>
                  <div v-if="providerResultSummary(item.normalized_result).seasonEpisode" class="ellipsis text-caption text-secondary">{{ providerResultSummary(item.normalized_result).seasonEpisode }}</div>
                  <div v-if="item.error" class="ellipsis text-caption text-secondary" :title="providerReasonLabel(item.error)">{{ providerReasonLabel(item.error) }}</div>
                </div>
                <q-btn v-if="props.row.provider_results.length > 2" flat dense color="primary" class="summary-link" :label="`还有 ${props.row.provider_results.length - 2} 条结果`" @click="openDetail(props.row, 'providers')" />
                <span v-if="!props.row.provider_results.length" class="text-caption text-secondary">无解析器结果</span>
              </q-td>
              <q-td key="overall" :props="props">
                <q-badge class="status-badge" :color="statusColor(props.row.overall_result.status)" :label="statusLabel(props.row.overall_result.status)" />
                <div v-if="overallLabel(props.row) !== statusLabel(props.row.overall_result.status)" class="overall-reason summary-clamp text-caption" :title="overallLabel(props.row)">{{ overallLabel(props.row) }}</div>
              </q-td>
              <q-td key="tmdb" :props="props">
                <div v-for="group in props.row.tmdbPreview" :key="group.key" class="tmdb-summary">
                  <div class="summary-clamp" :title="group.label">{{ group.label }}</div>
                  <div class="tmdb-summary-meta text-caption text-secondary"><span class="ellipsis">{{ providerLabel(group.providerId) }}</span><span v-if="group.count > 1" class="summary-count">×{{ group.count }}</span></div>
                </div>
                <q-btn v-if="props.row.tmdb_results.length" flat dense no-caps color="primary" class="summary-link" :label="`全部 ${props.row.tmdb_results.length} 条`" icon-right="chevron_right" @click="openDetail(props.row, 'tmdb')" />
                <span v-else-if="!props.row.tmdbPreview.length" class="text-caption text-secondary">无 TMDB 请求</span>
              </q-td>
              <q-td key="created_at" :props="props"><div class="record-time">{{ formatCreatedAt(props.row.created_at) }}</div></q-td>
              <q-td key="detail" :props="props"><q-btn flat dense color="primary" label="查看" @click="openDetail(props.row)" /></q-td>
            </q-tr>
          </template>
        </q-table>
      </div>
      <q-infinite-scroll v-else :disable="!hasMore || loading" :offset="180" @load="loadNextPage">
        <div class="mobile-record-list">
          <article v-for="record in summaryRows" :key="record.request_id" class="mobile-record">
            <div class="mobile-record-heading">
              <span class="record-time text-caption text-secondary">{{ formatCreatedAt(record.created_at) }}</span>
              <q-badge class="status-badge" :color="statusColor(record.overall_result.status)" :label="statusLabel(record.overall_result.status)" />
            </div>
            <button type="button" class="mobile-record-title summary-clamp" @click="openDetail(record)">{{ record.original_name || '（空名称）' }}</button>
            <div class="record-source text-caption text-secondary">{{ record.source || '来源未知' }} · {{ record.stage || '阶段未知' }}</div>
            <div v-if="overallLabel(record) !== statusLabel(record.overall_result.status)" class="overall-reason summary-clamp text-caption">{{ overallLabel(record) }}</div>
            <div v-if="record.provider_results.length" class="mobile-providers">
              <div v-for="item in record.provider_results.slice(0, 2)" :key="item.attempt_id" class="provider-summary">
                <div class="provider-summary-heading"><span class="ellipsis text-caption text-secondary">{{ providerLabel(item.provider_id) }}</span><q-badge :color="providerStatusColor(item.status)" :label="providerStatusLabels[item.status] || item.status" /></div>
                <div class="summary-clamp">{{ providerResultSummary(item.normalized_result).title }}</div>
                <div v-if="providerResultSummary(item.normalized_result).seasonEpisode" class="ellipsis text-caption text-secondary">{{ providerResultSummary(item.normalized_result).seasonEpisode }}</div>
              </div>
            </div>
            <div v-if="record.tmdbFinalResults.length" class="mobile-tmdb-results">
              <div class="text-caption text-secondary">TMDB 最终结果</div>
              <div v-for="result in record.tmdbFinalResults" :key="result.key" class="mobile-tmdb-result">
                <span class="text-caption text-secondary">{{ providerLabel(result.providerId) }}</span>
                <span class="summary-clamp">{{ result.label }}</span>
                <span v-if="result.count > 1" class="summary-count">×{{ result.count }}</span>
              </div>
            </div>
            <div v-else-if="record.tmdbGroups.length" class="mobile-tmdb-summary">
              <span class="text-caption text-secondary">TMDB</span><span class="ellipsis">{{ record.tmdbGroups[0].label }}</span>
              <span v-if="record.tmdbGroups.length > 1" class="summary-count">等 {{ record.tmdbGroups.length }} 组</span>
            </div>
            <div class="mobile-record-metrics">
              <q-btn flat no-caps align="left" icon="format_list_numbered" :label="`${record.actions.length} 个动作`" icon-right="chevron_right" @click="openDetail(record, 'actions')" />
              <q-btn flat no-caps align="left" icon="movie" :label="`${record.tmdb_results.length} 条 TMDB`" icon-right="chevron_right" @click="openDetail(record, 'tmdb')" />
            </div>
            <div class="mobile-record-footer">
              <q-btn flat dense no-caps color="primary" :label="`识别方式 (${record.provider_results.length})`" @click="openDetail(record, 'providers')" />
              <q-btn flat dense color="primary" label="查看详情" icon-right="arrow_forward" @click="openDetail(record)" />
            </div>
          </article>
          <div v-if="loading && !records.length" class="list-state"><q-spinner-dots color="primary" size="28px" /><span>加载识别记录…</span></div>
          <div v-else-if="!records.length && !loadError" class="list-state"><q-icon name="fact_check" size="32px" /><span>暂无媒体识别记录</span></div>
        </div>
        <template #loading><div class="mobile-list-loading"><q-spinner-dots color="primary" size="24px" /><span>加载下一页…</span></div></template>
      </q-infinite-scroll>
      <div v-if="$q.screen.lt.sm && records.length && !hasMore && !loading && !loadError" class="mobile-list-end">已加载全部 {{ records.length }} 条记录</div>
      <div v-if="!$q.screen.lt.sm && total > pageSize" class="row justify-center q-pa-md">
        <q-pagination v-model="page" :max="Math.ceil(total / pageSize)" :max-pages="7" direction-links boundary-links @update:model-value="pageChange" />
        <div class="pagination-count">第 {{ page }} / {{ Math.ceil(total / pageSize) }} 页 · 共 {{ total }} 条</div>
      </div>
    </q-card>
    <q-dialog v-model="detailOpen" :maximized="$q.screen.lt.sm" aria-labelledby="recognition-detail-title">
      <q-card class="recognition-detail-dialog">
        <q-card-section class="detail-header">
          <div class="detail-header-copy">
            <div id="recognition-detail-title" class="text-h6">识别记录详情</div>
            <div class="detail-filename summary-clamp text-caption text-secondary">{{ activeRecord?.original_name || '（空名称）' }}</div>
          </div>
          <q-btn flat round dense icon="close" aria-label="关闭详情" v-close-popup />
        </q-card-section>
        <q-tabs v-model="detailTab" dense no-caps align="left" active-color="primary" indicator-color="primary" class="detail-tabs">
          <q-tab name="overview" label="概览" />
          <q-tab name="actions" :label="`动作 (${(activeDetail || activeRecord)?.actions.length || 0})`" />
          <q-tab name="providers" label="识别方式" />
          <q-tab name="tmdb" :label="`TMDB (${(activeDetail || activeRecord)?.tmdb_results.length || 0})`" />
        </q-tabs>
        <q-separator />
        <div v-if="detailLoading[activeRequestId]" class="list-state detail-state"><q-spinner-dots color="primary" size="32px" /><span>加载完整详情…</span></div>
        <div v-else-if="detailErrors[activeRequestId]" class="list-state detail-state">
          <q-icon name="error_outline" color="negative" size="32px" /><span>{{ detailErrors[activeRequestId] }}</span>
          <q-btn outline color="primary" label="重试" @click="loadDetail(activeRequestId)" />
        </div>
        <q-tab-panels v-else-if="activeDetail" v-model="detailTab" class="detail-panels">
          <q-tab-panel name="overview" class="detail-panel">
            <div class="overview-grid">
              <section class="wide-section">
                <div class="detail-title">原始名称</div><div class="full-record-name">{{ activeDetail.original_name || '（空名称）' }}</div>
                <div class="record-source text-caption text-secondary">{{ activeDetail.source || '来源未知' }} · {{ activeDetail.stage || '阶段未知' }} · {{ formatCreatedAt(activeDetail.created_at) }}</div>
              </section>
              <section class="wide-section">
                <div class="detail-title">整体结果</div>
                <q-badge class="status-badge" :color="statusColor(activeDetail.overall_result.status)" :label="statusLabel(activeDetail.overall_result.status)" />
                <div class="q-mt-sm">{{ overallLabel(activeDetail) }}</div>
                <q-banner v-if="isAmbiguous(activeDetail)" dense rounded class="bg-orange-1 text-orange-10 q-mt-sm">多个 TMDB 条目均命中，识别失败；未选择胜出项。</q-banner>
                <details class="raw-data"><summary>整体结果原文</summary><RecognitionJsonViewer :value="activeDetail.overall_result" /></details>
              </section>
              <section class="wide-section"><div class="detail-title">请求上下文</div><RecognitionJsonViewer :value="activeDetail.context" /></section>
            </div>
          </q-tab-panel>
          <q-tab-panel name="actions" class="detail-panel actions-panel">
            <div v-if="actionList(activeRequestId).length" class="actions-layout">
              <q-select v-if="$q.screen.lt.sm" :model-value="actionKey(selectedAction(activeRequestId) || {})" :options="actionList(activeRequestId).map((action) => ({ value: actionKey(action), label: `${action.sequence || ''} · ${actionLabels[String(action.action_type)] || action.action_type} · ${action.status || 'unknown'}` }))" outlined dense emit-value map-options label="选择动作查看输入 / 输出" @update:model-value="selectedActionIds[activeRequestId] = $event" />
              <div v-else class="action-list">
                <q-btn v-for="action in actionList(activeRequestId)" :key="actionKey(action)" flat no-caps align="left" class="action-button" :class="{ 'is-active': actionKey(selectedAction(activeRequestId) || {}) === actionKey(action) }" :aria-pressed="actionKey(selectedAction(activeRequestId) || {}) === actionKey(action)" @click="selectAction(activeRequestId, action)">
                  <span class="action-sequence">{{ action.sequence }}</span><span class="action-label">{{ actionLabels[String(action.action_type)] || action.action_type }}</span><q-badge :label="String(action.status || 'unknown')" />
                </q-btn>
              </div>
              <section class="action-output">
                <div class="detail-title">{{ selectedAction(activeRequestId)?.sequence }} · {{ actionLabels[String(selectedAction(activeRequestId)?.action_type)] || selectedAction(activeRequestId)?.action_type }}</div>
                <div class="text-caption text-secondary q-mb-sm">所选动作输入 / 输出</div>
                <RecognitionJsonViewer :value="{ input: selectedAction(activeRequestId)?.input, output: selectedAction(activeRequestId)?.output, reason: selectedAction(activeRequestId)?.reason, time: selectedAction(activeRequestId)?.time }" />
                <div v-if="titleEvidenceSegments(activeRequestId).length" class="evidence-title q-mt-md">
                  名称证据：<template v-for="(segment, index) in titleEvidenceSegments(activeRequestId)" :key="index"><mark v-if="segment.matched">{{ segment.text }}</mark><span v-else>{{ segment.text }}</span></template>
                </div>
              </section>
            </div>
            <div v-else class="list-state">此记录没有动作</div>
          </q-tab-panel>
          <q-tab-panel name="providers" class="detail-panel">
            <q-banner v-if="anitopyDiagnostic(activeRequestId)" rounded dense class="diagnostic-banner q-mb-md">{{ anitopyDiagnostic(activeRequestId) }}</q-banner>
            <div v-if="activeDetail.provider_results.length" class="provider-list">
              <section v-for="item in activeDetail.provider_results" :key="item.attempt_id" class="provider-card">
                <div class="detail-entry-heading"><strong>{{ providerLabel(item.provider_id) }}</strong><q-badge :color="providerStatusColor(item.status)" :label="providerStatusLabels[item.status] || item.status" /></div>
                <div class="q-mt-sm">{{ providerResultSummary(item.normalized_result).title }}</div>
                <div class="text-caption">{{ providerResultSummary(item.normalized_result).seasonEpisode }}</div>
                <div class="provider-attempt-status text-caption text-secondary"><span v-if="item.error">{{ providerReasonLabel(item.error) }}</span><span>耗时：{{ item.elapsed_ms ?? '未知' }} ms</span></div>
                <q-btn flat dense color="primary" label="定位识别动作" @click="selectAttemptAction(activeRequestId, item.attempt_id, item.provider_id)" />
                <details class="raw-data"><summary>标准化结果 / 原始响应</summary><RecognitionJsonViewer :value="{ normalized: item.normalized_result, raw: item.raw_result, input: item.input, error: item.error }" /></details>
              </section>
            </div>
            <div v-else class="list-state">没有解析器结果</div>
          </q-tab-panel>
          <q-tab-panel name="tmdb" class="detail-panel">
            <div v-if="activeDetail.tmdb_results.length" class="tmdb-list">
              <div class="text-caption text-secondary">共 {{ activeDetail.tmdb_results.length }} 条，按原始顺序展示</div>
              <section v-for="(item, index) in activeDetail.tmdb_results" :key="index" class="tmdb-card">
                <div class="detail-entry-heading"><span class="text-caption text-secondary">{{ index + 1 }} · {{ providerLabel(item.provider_id) }}</span><q-badge :label="tmdbStatusLabels[String(item.status || 'unknown')] || String(item.status || 'unknown')" /></div>
                <div class="q-my-sm text-weight-medium">{{ tmdbSummary(item) }}</div>
                <q-btn flat dense color="primary" label="定位查询动作" @click="selectTmdbAction(activeRequestId, index, String(item.provider_id || ''))" />
                <details class="raw-data"><summary>查询条件 / TMDB 返回原文</summary><RecognitionJsonViewer :value="{ query: item.query, result: item.result, reason: item.reason }" /></details>
              </section>
            </div>
            <div v-else class="list-state">没有 TMDB 查询结果</div>
          </q-tab-panel>
        </q-tab-panels>
      </q-card>
    </q-dialog>
    <ScrollToTop v-if="$q.screen.lt.sm && !detailOpen" />
  </div>
</template>

<style scoped>
.recognition-table-scroll { min-width: 0; max-width: 100%; overflow-x: auto; }
.recognition-table-scroll :deep(.q-table__container) { min-width: 1180px; }
.recognition-table-scroll :deep(.q-table) { table-layout: fixed; width: 100%; }
.recognition-table-scroll :deep(tbody td) { padding: 14px 12px; vertical-align: top; white-space: normal; }
.recognition-table-scroll :deep(th) { padding-inline: 12px; color: var(--text-secondary); background: var(--surface-muted); }
.summary-clamp { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; white-space: normal; }
.original-name { -webkit-line-clamp: 3; font-weight: 500; line-height: 1.6; }
.record-source { margin-top: 5px; overflow-wrap: anywhere; }
.record-time { font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.action-count { display: flex; justify-content: space-between; gap: 8px; min-width: 0; margin-bottom: 4px; line-height: 1.6; }
.summary-count { flex-shrink: 0; color: var(--text-secondary); font-size: 12px; font-variant-numeric: tabular-nums; }
.summary-link { margin-top: 6px; font-size: 12px; }
.summary-link :deep(.q-icon) { font-size: 16px; }
.provider-summary { min-width: 0; line-height: 1.5; }
.provider-summary + .provider-summary, .tmdb-summary + .tmdb-summary { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-subtle); }
.provider-summary-heading { display: flex; align-items: center; gap: 6px; min-width: 0; margin-bottom: 2px; }
.provider-summary-heading > span { min-width: 0; }
.provider-summary-heading :deep(.q-badge) { flex-shrink: 0; max-width: 50%; overflow: hidden; text-overflow: ellipsis; }
.tmdb-summary-meta { display: flex; align-items: center; gap: 8px; min-width: 0; }
.status-badge { max-width: 100%; white-space: normal; overflow-wrap: anywhere; line-height: 1.4; }
.overall-reason { margin-top: 6px; color: var(--text-secondary); }
.pagination-count { width: 100%; text-align: center; margin-top: 6px; color: var(--text-secondary); font-size: 12px; }
.mobile-list-loading, .mobile-list-end, .list-state { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; color: var(--text-secondary); font-size: 13px; }
.list-state { flex-direction: column; min-height: 160px; text-align: center; }
.mobile-record-list { display: grid; gap: 12px; padding: 12px; background: var(--page-bg); }
.mobile-record { min-width: 0; padding: 14px; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--surface); }
.mobile-record-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 8px; }
.mobile-record-heading .status-badge { flex-shrink: 0; max-width: 45%; }
.mobile-record-title { width: 100%; padding: 0; border: 0; background: transparent; color: inherit; text-align: left; font: inherit; font-weight: 600; line-height: 1.6; -webkit-line-clamp: 3; cursor: pointer; }
.mobile-providers { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-subtle); font-size: 13px; }
.mobile-providers .provider-summary + .provider-summary { margin: 0; padding: 0; border: 0; }
.mobile-tmdb-summary { display: flex; align-items: center; gap: 8px; margin-top: 12px; min-width: 0; font-size: 12px; }
.mobile-tmdb-summary > :first-child { flex-shrink: 0; }
.mobile-tmdb-results { display: grid; gap: 6px; margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--border-subtle); }
.mobile-tmdb-result { display: grid; grid-template-columns: 72px minmax(0, 1fr) auto; align-items: start; gap: 6px; font-size: 12px; }
.mobile-record-metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
.mobile-record-metrics :deep(.q-btn) { min-height: 44px; min-width: 0; padding: 8px; border-radius: 8px; background: var(--surface-muted); font-size: 12px; }
.mobile-record-metrics :deep(.q-btn__content) { flex-wrap: nowrap; }
.mobile-record-metrics :deep(.q-icon) { font-size: 18px; }
.mobile-record-metrics :deep(.q-icon.on-left) { margin-right: 6px; }
.mobile-record-metrics :deep(.q-icon.on-right) { margin-left: auto; }
.mobile-record-footer { display: flex; justify-content: space-between; gap: 8px; margin: 8px -4px -6px; }
.mobile-record-footer :deep(.q-btn) { min-height: 40px; font-size: 12px; }
.recognition-detail-dialog.q-card { display: flex; flex-direction: column; width: min(1120px, calc(100vw - 48px)); max-width: min(1120px, calc(100vw - 48px)) !important; height: min(780px, calc(100dvh - 48px)); max-height: calc(100dvh - 48px); overflow: hidden; background: var(--surface); color: var(--text-primary); }
.detail-header { display: flex; align-items: flex-start; gap: 16px; flex-shrink: 0; padding: 16px 20px; }
.detail-header-copy { flex: 1; min-width: 0; }
.detail-filename { margin-top: 4px; }
.detail-tabs { flex-shrink: 0; padding: 0 12px; }
.detail-panels { flex: 1; min-height: 0; background: transparent; }
.detail-panel { height: 100%; padding: 20px; overflow: auto; }
.detail-state { flex: 1; }
.detail-title { margin-bottom: 10px; font-weight: 600; }
.overview-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; }
.overview-grid > section, .action-output { min-width: 0; overflow-wrap: anywhere; }
.wide-section { grid-column: 1 / -1; }
.full-record-name { line-height: 1.6; }
.actions-panel { overflow: hidden; }
.actions-layout { display: grid; grid-template-columns: 280px minmax(0, 1fr); gap: 20px; height: 100%; min-height: 0; }
.action-list { display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow-y: auto; padding-right: 8px; }
.action-button { flex-shrink: 0; justify-content: flex-start; width: 100%; height: auto; min-height: 44px; padding: 8px; border-radius: 8px; }
.action-button.is-active { background: var(--primary-soft); color: var(--q-primary); }
.action-button :deep(.q-btn__content) { display: flex; flex-wrap: nowrap; gap: 6px; text-align: left; }
.action-sequence { flex-shrink: 0; min-width: 22px; color: var(--text-secondary); font-size: 12px; }
.action-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.action-output { min-height: 0; overflow: auto; padding-right: 4px; }
.evidence-title { padding: 12px; border-radius: 8px; background: var(--surface-muted); overflow-wrap: anywhere; }
mark { background: #ffe082; color: #172033; border-radius: 2px; padding: 0 2px; }
.provider-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 12px; }
.provider-card, .tmdb-card { min-width: 0; padding: 14px; border: 1px solid var(--border-subtle); border-radius: 8px; overflow-wrap: anywhere; }
.provider-attempt-status { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 8px 0; }
.detail-entry-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.detail-entry-heading :deep(.q-badge) { max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.tmdb-list { display: flex; flex-direction: column; gap: 12px; }
.raw-data { margin-top: 12px; border-top: 1px solid var(--border-subtle); padding-top: 10px; }
.raw-data > summary { cursor: pointer; font-size: 13px; color: var(--text-secondary); }
.raw-data[open] > summary { margin-bottom: 10px; }
.diagnostic-banner { background: var(--surface-muted); }
@media (max-width: 599px) {
  .recognition-detail-dialog.q-card { width: 100%; max-width: 100% !important; height: 100dvh; max-height: 100dvh; border-radius: 0; }
  .detail-header { padding: 12px 16px; gap: 8px; }
  .detail-header :deep(.q-btn) { min-width: 44px; min-height: 44px; }
  .detail-tabs { padding: 0; }
  .detail-tabs :deep(.q-tab) { min-height: 44px; padding: 0 10px; }
  .detail-tabs :deep(.q-tab__label) { font-size: 13px; }
  .detail-panel { padding: 16px 16px calc(16px + var(--safe-bottom)); }
  .actions-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); gap: 16px; }
  .provider-list, .overview-grid { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 359px) {
  .mobile-record-list { padding: 8px; }
  .mobile-record { padding: 12px; }
  .mobile-record-metrics :deep(.q-icon.on-left) { display: none; }
}
</style>
