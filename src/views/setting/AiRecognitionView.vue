<script setup lang="ts">
import { onMounted, ref, shallowRef } from 'vue'
import type { QTableColumn } from 'quasar'
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
  { name: 'original_name', label: '原始名称', field: 'original_name', align: 'left' },
  { name: 'actions', label: '识别动作', field: 'actions', align: 'left' },
  { name: 'providers', label: '识别方式结果', field: 'provider_results', align: 'left', style: 'width: 190px; max-width: 190px; white-space: normal', headerStyle: 'width: 190px' },
  { name: 'overall', label: '整体结果', field: 'overall_result', align: 'left', style: 'width: 160px; max-width: 160px; white-space: normal', headerStyle: 'width: 160px' },
  { name: 'tmdb', label: 'TMDB', field: 'tmdb_results', align: 'left' },
  { name: 'created_at', label: '记录时间', field: 'created_at', align: 'left', style: 'width: 170px; white-space: nowrap', headerStyle: 'width: 170px' },
  { name: 'detail', label: '详情', field: 'request_id', align: 'right' }
]

function actionSummary(record: RecognitionRecord): string {
  return record.actions.map((action) => actionLabels[String(action.action_type)] || String(action.action_type || '未知动作')).join(' → ')
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
  const labels: Record<string, string> = {
    success: '成功', failed: '失败', unknown: '历史状态未知',
    running: '处理中断待恢复', interrupted: '进程中断', skipped: '已跳过'
  }
  return `${labels[statusValue] || `未知状态 (${statusValue})`}${reason}${business}`
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
  return actions.find((action) => action.action_id === selectedId) || actions[0]
}

function selectAction(requestId: string, action: Record<string, unknown>) {
  selectedActionIds.value[requestId] = String(action.action_id || '')
}

function selectAttemptAction(requestId: string, attemptId: string, providerId: string) {
  const action = actionList(requestId).find((item) => item.attempt_id === attemptId)
    || actionList(requestId).find((item) => item.action_type === 'provider_parse' && item.provider_id === providerId)
  if (action) selectAction(requestId, action)
}

function selectTmdbAction(requestId: string, resultIndex: number, providerId: string) {
  const matches = actionList(requestId).filter((action) => action.action_type === 'tmdb_query' && action.provider_id === providerId)
  const results = recordDetail(requestId)?.tmdb_results || []
  const providerIndex = results.slice(0, resultIndex).filter((item) => item.provider_id === providerId).length
  if (matches[providerIndex]) selectAction(requestId, matches[providerIndex])
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
        details.value = {}
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
  details.value = {}
  total.value = 0
  hasMore.value = false
  void load()
}

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
  if (details.value[requestId]) return
  detailLoading.value[requestId] = true
  try {
    const response = await getRecognitionRecordDetail(requestId)
    if (response.code === 0 && response.record) details.value[requestId] = response.record
    else modal.error(response.msg || '读取识别详情失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '读取识别详情失败')
  } finally {
    detailLoading.value[requestId] = false
  }
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
      <q-infinite-scroll :disable="!$q.screen.lt.sm || !hasMore || loading" :offset="180" @load="loadNextPage">
      <div class="recognition-table-scroll">
      <q-table :rows="records" :columns="columns" row-key="request_id" flat :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="暂无媒体识别记录">
        <template #body="props">
          <q-tr :props="props">
            <q-td v-for="col in props.cols" :key="col.name" :props="props" :data-label="col.label"><template v-if="col.name === 'original_name'"><div class="original-name">{{ props.row.original_name || '（空名称）' }}</div><div class="text-caption text-secondary">{{ props.row.source || '来源未知' }} · {{ props.row.stage || '阶段未知' }}</div></template><template v-else-if="col.name === 'actions'"><div class="action-summary">{{ actionSummary(props.row) || '无动作' }}</div><div class="text-caption">{{ props.row.actions.length }} 个动作</div></template><template v-else-if="col.name === 'providers'"><div v-for="item in props.row.provider_results" :key="item.attempt_id" class="provider-summary"><div class="provider-summary-heading"><span class="text-caption text-secondary">{{ providerLabel(item.provider_id) }}</span><q-badge :color="providerStatusColor(item.status)" :label="providerStatusLabels[item.status] || item.status" /></div><div class="provider-result-title">{{ providerResultSummary(item.normalized_result).title }}</div><div v-if="providerResultSummary(item.normalized_result).seasonEpisode" class="text-caption">{{ providerResultSummary(item.normalized_result).seasonEpisode }}</div><div v-if="item.error" class="text-caption provider-error">{{ providerReasonLabel(item.error) }}</div></div><div v-if="!props.row.provider_results.length" class="text-caption text-secondary">无解析器结果</div></template><template v-else-if="col.name === 'overall'"><div class="overall-summary"><q-badge :color="statusColor(props.row.overall_result.status)" :label="overallLabel(props.row)" /></div></template><template v-else-if="col.name === 'tmdb'"><div v-for="(item, index) in props.row.tmdb_results" :key="index" class="result-summary">{{ providerLabel(item.provider_id) }}：{{ tmdbSummary(item) }}</div><div v-if="!props.row.tmdb_results.length" class="text-caption text-secondary">无 TMDB 请求</div></template><template v-else-if="col.name === 'created_at'">{{ formatCreatedAt(props.row.created_at) }}</template><template v-else-if="col.name === 'detail'"><q-btn flat dense icon="visibility" label="查看" :loading="detailLoading[props.row.request_id]" @click="loadDetail(props.row.request_id)" /></template><template v-else>{{ col.value }}</template></q-td>
          </q-tr>
          <q-tr v-if="details[props.row.request_id]" :props="props" class="detail-row">
            <q-td colspan="100%">
              <div class="detail-grid">
                <section class="wide-section"><div class="detail-title">原始名称与上下文</div><RecognitionJsonViewer :value="{ original_name: details[props.row.request_id].original_name, source: details[props.row.request_id].source, stage: details[props.row.request_id].stage, context: details[props.row.request_id].context }" /></section>
                <section>
                  <div class="detail-title">识别动作时间线</div>
                  <div class="action-list">
                    <q-btn v-for="action in actionList(props.row.request_id)" :key="String(action.action_id || action.sequence)" dense no-caps flat align="left" class="action-button" :color="selectedAction(props.row.request_id)?.action_id === action.action_id ? 'primary' : 'grey-8'" @click="selectAction(props.row.request_id, action)">
                      <span class="action-sequence">{{ action.sequence }}</span>
                      {{ actionLabels[String(action.action_type)] || String(action.action_type || '未知动作') }}
                      <q-badge class="q-ml-sm" :label="String(action.status || 'unknown')" />
                    </q-btn>
                  </div>
                </section>
                <section>
                  <div class="detail-title">所选动作输入 / 输出</div>
                  <template v-if="selectedAction(props.row.request_id)">
                    <RecognitionJsonViewer :value="{ input: selectedAction(props.row.request_id)?.input, output: selectedAction(props.row.request_id)?.output, reason: selectedAction(props.row.request_id)?.reason, time: selectedAction(props.row.request_id)?.time }" />
                    <div v-if="titleEvidenceSegments(props.row.request_id).length" class="evidence-title q-mt-sm">
                      名称证据：<template v-for="(segment, index) in titleEvidenceSegments(props.row.request_id)" :key="index"><mark v-if="segment.matched">{{ segment.text }}</mark><span v-else>{{ segment.text }}</span></template>
                    </div>
                  </template>
                  <div v-else class="text-secondary">此记录没有动作</div>
                </section>
                <section>
                  <div class="detail-title">解析器结果与动作定位</div>
                  <q-banner v-if="anitopyDiagnostic(props.row.request_id)" rounded dense class="q-mb-sm bg-grey-2 text-dark">
                    {{ anitopyDiagnostic(props.row.request_id) }}
                  </q-banner>
                  <div v-if="details[props.row.request_id].provider_results.length" class="provider-list">
                    <div v-for="item in details[props.row.request_id].provider_results" :key="item.attempt_id" class="provider-card">
                      <q-btn dense flat no-caps color="primary" :label="`${item.provider_id} · ${item.status}`" @click="selectAttemptAction(props.row.request_id, item.attempt_id, item.provider_id)" />
                      <div class="provider-attempt-status"><q-badge :color="providerStatusColor(item.status)" :label="providerStatusLabels[item.status] || item.status" /><span v-if="item.error" class="text-caption">{{ providerReasonLabel(item.error) }}</span><span class="text-caption">耗时：{{ item.elapsed_ms ?? '未知' }} ms</span></div>
                      <details><summary>标准化结果 / 原始响应</summary><RecognitionJsonViewer :value="{ normalized: item.normalized_result, raw: item.raw_result, input: item.input, error: item.error }" /></details>
                    </div>
                  </div>
                  <div v-else class="text-secondary">没有解析器结果</div>
                </section>
                <section>
                  <div class="detail-title">整体结果</div>
                  <q-banner v-if="isAmbiguous(props.row)" dense rounded class="bg-orange-1 text-orange-10 q-mb-sm">
                    多个 TMDB 条目均命中，识别失败；未选择胜出项。
                  </q-banner>
                  <RecognitionJsonViewer :value="details[props.row.request_id].overall_result" />
                </section>
                <section class="wide-section">
                  <div class="detail-title">TMDB 原始结果与名称证据</div>
                  <div v-if="details[props.row.request_id].tmdb_results.length" class="tmdb-list">
                    <div v-for="(item, index) in details[props.row.request_id].tmdb_results" :key="index" class="tmdb-card">
                      <div class="row items-center q-gutter-sm">
                        <q-btn dense flat no-caps color="primary" :label="`${item.provider_id || '未知方式'} · ${tmdbSummary(item)}`" @click="selectTmdbAction(props.row.request_id, index, String(item.provider_id || ''))" />
                        <q-badge :label="tmdbStatusLabels[String(item.status || 'unknown')] || String(item.status || 'unknown')" />
                      </div>
                      <details><summary>查询条件 / TMDB 返回原文</summary><RecognitionJsonViewer :value="{ query: item.query, result: item.result, reason: item.reason }" /></details>
                    </div>
                  </div>
                  <div v-else class="text-secondary">没有 TMDB 查询结果</div>
                </section>
              </div>
            </q-td>
          </q-tr>
        </template>
      </q-table>
      </div>
      <template #loading>
        <div class="mobile-list-loading"><q-spinner-dots color="primary" size="24px" /><span>加载下一页…</span></div>
      </template>
      </q-infinite-scroll>
      <div v-if="$q.screen.lt.sm && records.length && !hasMore && !loading && !loadError" class="mobile-list-end">已加载全部 {{ records.length }} 条记录</div>
      <div v-if="!$q.screen.lt.sm && total > pageSize" class="row justify-center q-pa-md">
        <q-pagination v-model="page" :max="Math.ceil(total / pageSize)" :max-pages="7" direction-links boundary-links @update:model-value="pageChange" />
        <div class="pagination-count">第 {{ page }} / {{ Math.ceil(total / pageSize) }} 页 · 共 {{ total }} 条</div>
      </div>
    </q-card>
    <ScrollToTop v-if="$q.screen.lt.sm" />
  </div>
</template>

<style scoped>
.original-name { min-width: 220px; max-width: 360px; white-space: normal; overflow-wrap: anywhere; }
.action-summary { min-width: 180px; max-width: 300px; white-space: normal; overflow-wrap: anywhere; }
.action-list, .tmdb-list { display: flex; flex-direction: column; gap: 6px; }
.provider-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px; }
.action-button { justify-content: flex-start; width: 100%; }
.action-sequence { display: inline-flex; min-width: 22px; justify-content: center; margin-right: 6px; opacity: .7; }
.provider-card, .tmdb-card { border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; }
.provider-attempt-status { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.provider-card summary, .tmdb-card summary { cursor: pointer; font-size: 12px; margin-top: 6px; }
.evidence-title { overflow-wrap: anywhere; }
mark { background: #ffe082; color: inherit; border-radius: 2px; padding: 0 2px; }
.provider-summary { max-width: 180px; white-space: normal; overflow-wrap: anywhere; line-height: 1.35; }
.provider-summary + .provider-summary { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--border-color); }
.provider-summary-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.provider-error { color: var(--text-secondary); overflow-wrap: anywhere; }
.provider-result-title { overflow-wrap: anywhere; }
.overall-summary { max-width: 150px; white-space: normal; overflow-wrap: anywhere; }
.overall-summary :deep(.q-badge) { display: inline-block; max-width: 100%; white-space: normal; height: auto; text-align: left; overflow-wrap: anywhere; }
.result-summary { max-width: 240px; white-space: normal; overflow-wrap: anywhere; }
.detail-row td { background: var(--surface-muted); }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px; text-align: left; }
.wide-section { grid-column: 1 / -1; }
.detail-title { font-weight: 600; margin-bottom: 4px; }
.recognition-table-scroll { max-width: 100%; min-width: 0; overflow-x: auto; }
.recognition-table-scroll :deep(.q-table__container) { min-width: 1180px; }
.pagination-count { width: 100%; text-align: center; margin-top: 6px; color: var(--text-secondary); font-size: 12px; }
.mobile-list-loading, .mobile-list-end { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; color: var(--text-secondary); font-size: 12px; }
@media (max-width: 700px) {
  .detail-grid { grid-template-columns: 1fr; gap: 10px; padding: 8px; }
  .recognition-table-scroll { overflow-x: hidden; }
  .recognition-table-scroll :deep(.q-table__container) { min-width: 0; }
  .recognition-table-scroll :deep(.q-table) { table-layout: fixed; width: 100%; }
  .recognition-table-scroll :deep(thead) { display: none; }
  .recognition-table-scroll :deep(tbody tr:not(.detail-row)) { display: block; margin: 8px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
  .recognition-table-scroll :deep(tbody tr:not(.detail-row) td) { display: block; width: 100% !important; max-width: none !important; min-width: 0 !important; padding: 8px 10px; white-space: normal; overflow-wrap: anywhere; text-align: left; }
  .recognition-table-scroll :deep(tbody tr:not(.detail-row) td::before) { content: attr(data-label); display: block; margin-bottom: 3px; color: var(--text-secondary); font-size: 11px; font-weight: 600; }
  .original-name, .action-summary, .provider-summary, .overall-summary, .result-summary { min-width: 0; max-width: 100%; }
  .detail-row :deep(td) { display: block; padding: 4px; }
  .detail-title { margin-top: 5px; }
}
</style>
