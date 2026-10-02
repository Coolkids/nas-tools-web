<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import {
  downloadRecognitionJsonl,
  getRecognitionProviders,
  getRecognitionRecordDetail,
  getRecognitionRecords,
  type RecognitionRecord
} from '@/api/recognition'

const modal = useModalStore()
const loading = ref(false)
const exporting = ref(false)
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
const records = ref<RecognitionRecord[]>([])
const details = ref<Record<string, RecognitionRecord & { context?: unknown; attempts?: unknown[] }>>({})
const detailLoading = ref<Record<string, boolean>>({})
const page = ref(1)
const pageSize = 20
const total = ref(0)

const actionLabels: Record<string, string> = {
  request_start: '开始识别', preprocess: '名称预处理', provider_parse: '名称解析',
  tmdb_query: 'TMDB 查询', title_match: '名称比对', cache_hit: '缓存命中', tmdb_cache: 'TMDB 缓存命中',
  fallback: '回退识别', file_skip: '跳过文件', provided_tmdb: '指定 TMDB',
  decision: '整体决策', request_finish: '完成识别'
}

const columns: QTableColumn<RecognitionRecord>[] = [
  { name: 'original_name', label: '原始名称', field: 'original_name', align: 'left' },
  { name: 'actions', label: '识别动作', field: 'actions', align: 'left' },
  { name: 'providers', label: '识别方式结果', field: 'provider_results', align: 'left' },
  { name: 'overall', label: '整体结果', field: 'overall_result', align: 'left' },
  { name: 'tmdb', label: 'TMDB', field: 'tmdb_results', align: 'left' },
  { name: 'created_at', label: '记录时间', field: 'created_at', align: 'left' },
  { name: 'detail', label: '详情', field: 'request_id', align: 'right' }
]

function jsonText(value: unknown): string {
  return JSON.stringify(value ?? null, null, 2)
}

function actionSummary(record: RecognitionRecord): string {
  return record.actions.map((action) => actionLabels[String(action.action_type)] || String(action.action_type || '未知动作')).join(' → ')
}

function overallLabel(record: RecognitionRecord): string {
  const value = record.overall_result
  const statusValue = String(value.status || 'unknown')
  const reason = value.reason ? `：${String(value.reason)}` : ''
  return `${statusValue === 'success' ? '成功' : statusValue === 'failed' ? '失败' : statusValue}${reason}`
}

function tmdbSummary(result: Record<string, unknown>): string {
  const value = result.result as Record<string, unknown> | null
  if (!value || typeof value !== 'object') return String(result.status || '无结果')
  return `${String(value.title || value.name || 'TMDB 条目')} (#${String(value.id || '?')})`
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await getRecognitionRecords({
      title: title.value.trim(), source: source.value,
      status: status.value, provider_id: providerId.value,
      action_type: actionType.value, reason: reason.value,
      created_from: createdFrom.value, created_to: createdTo.value,
      page: page.value, page_size: pageSize
    })
    if (response.code === 0) {
      records.value = response.records || []
      total.value = response.total || 0
      details.value = {}
    } else loadError.value = response.msg || '查询识别记录失败'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '查询识别记录失败'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  void load()
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

async function exportRecords() {
  exporting.value = true
  try {
    const blob = await downloadRecognitionJsonl({
      title: title.value.trim(), source: source.value, status: status.value,
      provider_id: providerId.value, action_type: actionType.value,
      reason: reason.value, created_from: createdFrom.value, created_to: createdTo.value
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = '媒体识别记录.jsonl'
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '导出失败')
  } finally {
    exporting.value = false
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
        <q-btn outline icon="file_download" label="导出完整 JSONL" :loading="exporting" @click="exportRecords" />
      </template>
    </PageHeader>

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
          <q-select v-model="status" outlined dense clearable emit-value map-options label="结果" :options="[{ label: '成功', value: 'success' }, { label: '失败', value: 'failed' }]" />
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
      <q-banner v-if="loadError" rounded dense class="q-mx-md q-mb-md">
        <template #avatar><q-icon name="error_outline" color="negative" /></template>
        {{ loadError }}
      </q-banner>
      <q-table :rows="records" :columns="columns" row-key="request_id" flat :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="暂无媒体识别记录">
        <template #body="props">
          <q-tr :props="props">
            <q-td v-for="col in props.cols" :key="col.name" :props="props"><template v-if="col.name === 'original_name'"><div class="original-name">{{ props.row.original_name || '（空名称）' }}</div><div class="text-caption text-secondary">{{ props.row.source }} · {{ props.row.stage }}</div></template><template v-else-if="col.name === 'actions'"><div class="action-summary">{{ actionSummary(props.row) || '无动作' }}</div><div class="text-caption">{{ props.row.actions.length }} 个动作</div></template><template v-else-if="col.name === 'providers'"><div v-for="item in props.row.provider_results" :key="item.attempt_id" class="result-summary">{{ item.provider_id }}：{{ jsonText(item.normalized_result) }}</div></template><template v-else-if="col.name === 'overall'"><q-badge :color="props.row.overall_result.status === 'success' ? 'positive' : 'negative'" :label="overallLabel(props.row)" /></template><template v-else-if="col.name === 'tmdb'"><div v-for="(item, index) in props.row.tmdb_results" :key="index" class="result-summary">{{ item.provider_id }}：{{ tmdbSummary(item) }}</div></template><template v-else-if="col.name === 'detail'"><q-btn flat dense icon="visibility" label="查看" :loading="detailLoading[props.row.request_id]" @click="loadDetail(props.row.request_id)" /></template><template v-else>{{ col.value }}</template></q-td>
          </q-tr>
          <q-tr v-if="details[props.row.request_id]" :props="props" class="detail-row">
            <q-td colspan="100%">
              <div class="detail-grid">
                <section><div class="detail-title">原始名称与上下文</div><pre>{{ jsonText({ original_name: details[props.row.request_id].original_name, source: details[props.row.request_id].source, stage: details[props.row.request_id].stage, context: details[props.row.request_id].context }) }}</pre></section>
                <section><div class="detail-title">识别动作</div><pre>{{ jsonText(details[props.row.request_id].actions) }}</pre></section>
                <section><div class="detail-title">各识别方式结果</div><pre>{{ jsonText(details[props.row.request_id].provider_results) }}</pre></section>
                <section><div class="detail-title">整体结果</div><pre>{{ jsonText(details[props.row.request_id].overall_result) }}</pre></section>
                <section><div class="detail-title">TMDB 查询结果</div><pre>{{ jsonText(details[props.row.request_id].tmdb_results) }}</pre></section>
              </div>
            </q-td>
          </q-tr>
        </template>
      </q-table>
      <div v-if="total > pageSize" class="row justify-center q-pa-md">
        <q-pagination v-model="page" :max="Math.ceil(total / pageSize)" @update:model-value="load" />
      </div>
    </q-card>
  </div>
</template>

<style scoped>
.original-name { min-width: 220px; max-width: 360px; white-space: normal; overflow-wrap: anywhere; }
.action-summary { min-width: 180px; max-width: 300px; white-space: normal; }
.result-summary { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.detail-row td { background: var(--surface-muted); }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px; text-align: left; }
.detail-title { font-weight: 600; margin-bottom: 4px; }
pre { max-height: 320px; overflow: auto; white-space: pre-wrap; word-break: break-word; padding: 8px; margin: 0; background: var(--surface); border-radius: 4px; font-size: 12px; }
@media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; } }
</style>
