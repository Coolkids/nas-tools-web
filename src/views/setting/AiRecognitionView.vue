<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import { downloadAiRecognitionRecords, getAiRecognitionRecords, type AiRecognitionRecord } from '@/api/aiRecognition'

const modal = useModalStore()
const loading = ref(false)
const loadError = ref('')
const title = ref('')
const records = ref<AiRecognitionRecord[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)

const columns: QTableColumn<AiRecognitionRecord>[] = [
  { name: 'title', label: '标题', field: 'title', align: 'left' },
  { name: 'status', label: '状态', field: 'status', align: 'left' },
  { name: 'time', label: '记录时间', field: 'add_time', align: 'left' },
  { name: 'detail', label: '详情', field: 'id', align: 'right' }
]

function jsonText(value: unknown): string {
  return JSON.stringify(value || {}, null, 2)
}

function statusLabel(status: string): string {
  return status === 'inconsistent' ? 'TMDB结果不一致' : '均未命中TMDB'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const response = await getAiRecognitionRecords(title.value.trim(), page.value, pageSize)
    if (response.code === 0) {
      records.value = response.records || []
      total.value = response.total || 0
    } else loadError.value = response.msg || '查询识别记录失败'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '查询识别记录失败'
  } finally {
    loading.value = false
  }
}

function search() {
  page.value = 1
  load()
}

async function exportRecords() {
  try {
    const blob = await downloadAiRecognitionRecords(title.value.trim())
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'AI识别核对记录.xlsx'
    link.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '导出失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="page-shell ai-recognition-view">
    <PageHeader title="AI识别记录" description="查看本地解析与 AI 推理结果未命中或不一致的标题">
      <template #actions>
        <q-btn outline icon="file_download" label="导出 Excel" :loading="loading" @click="exportRecords" />
      </template>
    </PageHeader>

    <q-card flat bordered>
      <q-card-section class="row items-center q-col-gutter-sm">
        <div class="col-12 col-sm-8">
          <q-input v-model="title" outlined dense clearable label="按标题查询" placeholder="输入原始标题" @keyup.enter="search" />
        </div>
        <div class="col-12 col-sm-auto">
          <q-btn color="primary" unelevated icon="search" label="查询" :loading="loading" @click="search" />
        </div>
        <q-space />
        <div class="text-caption text-secondary">共 {{ total }} 条</div>
      </q-card-section>
      <q-banner v-if="loadError" rounded dense class="q-mx-md q-mb-md">
        <template #avatar><q-icon name="error_outline" color="negative" /></template>
        {{ loadError }}
      </q-banner>
      <q-table :rows="records" :columns="columns" row-key="id" flat :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="暂无识别核对记录">
        <template #body-cell-status="slotProps">
          <q-td :props="slotProps"><q-badge :color="slotProps.row.status === 'inconsistent' ? 'warning' : 'grey-7'" :label="statusLabel(slotProps.row.status)" /></q-td>
        </template>
        <template #body-cell-detail="slotProps">
          <q-td :props="slotProps">
            <q-expansion-item dense expand-separator label="查看解析与TMDB数据" class="record-detail">
              <div class="detail-grid">
                <div><div class="detail-title">本地解析</div><pre>{{ jsonText(slotProps.row.anitopy_result) }}</pre></div>
                <div><div class="detail-title">AI解析</div><pre>{{ jsonText(slotProps.row.ai_result) }}</pre></div>
                <div><div class="detail-title">本地TMDB</div><pre>{{ jsonText(slotProps.row.anitopy_tmdb) }}</pre></div>
                <div><div class="detail-title">AI TMDB</div><pre>{{ jsonText(slotProps.row.ai_tmdb) }}</pre></div>
              </div>
            </q-expansion-item>
          </q-td>
        </template>
      </q-table>
      <div v-if="total > pageSize" class="row justify-center q-pa-md">
        <q-pagination v-model="page" :max="Math.ceil(total / pageSize)" @update:model-value="load" />
      </div>
    </q-card>
  </div>
</template>

<style scoped>
.record-detail { min-width: 260px; text-align: left; }
.record-detail :deep(.q-item__section--main), .record-detail :deep(.q-expansion-item__content) { text-align: left; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding: 12px 0; min-width: min(720px, 80vw); text-align: left; }
.detail-title { font-weight: 600; margin-bottom: 4px; }
pre { max-height: 180px; overflow: auto; white-space: pre-wrap; word-break: break-word; padding: 8px; margin: 0; background: var(--surface-muted); border-radius: 4px; font-size: 12px; text-align: left; }
@media (max-width: 700px) { .detail-grid { grid-template-columns: 1fr; min-width: 0; } }
</style>
