<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { QTableColumn } from 'quasar'
import {
  downloadRssImportErrors,
  downloadRssImportTemplate,
  getRssImportStatus,
  retryRssImportRows,
  startRssImport,
  uploadRssImportFile,
  type RssImportJob,
  type RssImportRow,
  type RssImportValues,
  type RssType
} from '@/api/rss'

const props = defineProps<{ modelValue: boolean; type: RssType }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void; (e: 'completed'): void; (e: 'error', message: string): void }>()

const visible = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
const file = ref<File | null>(null)
const uploading = ref(false)
const downloadingTemplate = ref(false)
const exportingErrors = ref(false)
const job = ref<RssImportJob | null>(null)
const pollTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const editingRow = ref<RssImportRow | null>(null)
const editor = reactive<RssImportValues>({ name: '' })

const title = computed(() => props.type === 'TV' ? '电视剧订阅 Excel 导入' : '电影订阅 Excel 导入')
const progress = computed(() => job.value?.total ? Math.round(job.value.processed * 100 / job.value.total) : 0)
const failedRows = computed(() => job.value?.rows.filter((row) => row.status === 'failed') || [])
const columns: QTableColumn[] = [
  { name: 'row', label: '行号', field: 'row', align: 'left', style: 'width: 70px' },
  { name: 'name', label: '标题', field: (row: RssImportRow) => row.values.name, align: 'left' },
  { name: 'year', label: '年份', field: (row: RssImportRow) => row.values.year || '—', align: 'left' },
  { name: 'season', label: '季', field: (row: RssImportRow) => row.values.season || '—', align: 'left' },
  { name: 'status', label: '结果', field: 'status', align: 'left', style: 'width: 100px' },
  { name: 'reason', label: '失败原因', field: 'reason', align: 'left' },
  { name: 'actions', label: '操作', field: 'actions', align: 'right', style: 'width: 100px' }
]

function clearPolling() {
  if (pollTimer.value) clearTimeout(pollTimer.value)
  pollTimer.value = null
}

function applyJob(next?: RssImportJob) {
  if (!next) return
  job.value = next
  if (next.state === 'completed') {
    clearPolling()
    if (next.succeeded) emit('completed')
  }
}

async function poll() {
  if (!job.value?.id || !visible.value) return
  try {
    const result = await getRssImportStatus(job.value.id)
    if (result.code !== 0) throw new Error(result.msg || '获取导入进度失败')
    applyJob(result.job)
    if (result.job?.state === 'running') pollTimer.value = setTimeout(() => void poll(), 550)
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '获取导入进度失败')
    pollTimer.value = setTimeout(() => void poll(), 1200)
  }
}

async function beginImport() {
  if (!file.value) {
    emit('error', '请选择 .xlsx 格式的 Excel 文件')
    return
  }
  uploading.value = true
  try {
    const upload = await uploadRssImportFile(file.value)
    if (upload.code !== 0 || !upload.filepath) throw new Error(upload.msg || '上传文件失败')
    const result = await startRssImport(upload.filepath, props.type)
    if (result.code !== 0 || !result.job) throw new Error(result.msg || '解析 Excel 失败')
    applyJob(result.job)
    clearPolling()
    if (result.job.state === 'running') void poll()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '导入失败')
  } finally {
    uploading.value = false
  }
}

function download(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = filename
  link.click()
  URL.revokeObjectURL(href)
}

async function downloadTemplate() {
  downloadingTemplate.value = true
  try {
    download(await downloadRssImportTemplate(props.type), props.type === 'TV' ? '电视剧订阅导入模板.xlsx' : '电影订阅导入模板.xlsx')
  } catch {
    emit('error', '下载模板失败')
  } finally { downloadingTemplate.value = false }
}

async function exportErrors() {
  if (!job.value) return
  exportingErrors.value = true
  try {
    download(await downloadRssImportErrors(job.value.id), '订阅导入错误数据.xlsx')
  } catch {
    emit('error', '导出错误数据失败')
  } finally { exportingErrors.value = false }
}

function resetEditor(values: RssImportValues) {
  Object.assign(editor, {
    name: '', year: '', keyword: '', season: '', fuzzy_match: false, rss_sites: [], search_sites: [], over_edition: false,
    filter_restype: '', filter_pix: '', filter_team: '', filter_rule: '', download_setting: '', save_path: '', total_ep: '', current_ep: ''
  }, values)
}

function openEdit(row: RssImportRow) {
  editingRow.value = row
  resetEditor(row.values)
}

function siteText(value?: string[]) { return value?.join(', ') || '' }
function parseSites(value: string) { return value.split(/[,，;；\n]/).map((item) => item.trim()).filter(Boolean) }

async function saveAndRetry() {
  if (!editingRow.value || !job.value) return
  if (!editor.name.trim()) {
    emit('error', '标题不能为空')
    return
  }
  const row = editingRow.value
  row.values = { ...editor, name: editor.name.trim(), rss_sites: Array.isArray(editor.rss_sites) ? editor.rss_sites : [], search_sites: Array.isArray(editor.search_sites) ? editor.search_sites : [] }
  editingRow.value = null
  await retryRows([row])
}

async function retryRows(rows: RssImportRow[]) {
  if (!job.value || !rows.length) return
  rows.forEach((row) => { row.status = 'processing'; row.reason = '' })
  try {
    const result = await retryRssImportRows(job.value.id, rows.map((row) => ({ row: row.row, values: { ...row.values } })))
    if (result.code !== 0) throw new Error(result.msg || '重新导入失败')
    applyJob(result.job)
    clearPolling()
    void poll()
  } catch (error) {
    emit('error', error instanceof Error ? error.message : '重新导入失败')
  }
}

watch(visible, (open) => {
  if (!open) clearPolling()
  else if (job.value?.state === 'completed') {
    job.value = null
    file.value = null
  } else if (job.value?.state === 'running') void poll()
})
onBeforeUnmount(clearPolling)
</script>

<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
    <q-card class="import-dialog">
      <q-card-section class="row items-center q-pb-sm">
        <div class="text-h6">{{ title }}</div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="关闭" v-close-popup />
      </q-card-section>
      <q-separator />

      <q-card-section v-if="!job" class="upload-panel">
        <div class="text-body2 text-secondary q-mb-md">请先下载模板并填写数据；标题为必填项，电视剧的季号、筛选条件等均可按需填写。</div>
        <q-file v-model="file" outlined accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" label="选择 Excel 文件" clearable>
          <template #prepend><q-icon name="upload_file" /></template>
        </q-file>
        <div class="row q-gutter-sm q-mt-md">
          <q-btn outline color="primary" icon="download" label="下载模板" :loading="downloadingTemplate" @click="downloadTemplate" />
          <q-btn color="primary" unelevated icon="upload" label="上传并开始解析" :loading="uploading" @click="beginImport" />
        </div>
      </q-card-section>

      <template v-else>
        <q-card-section class="progress-panel">
          <div class="row items-center q-gutter-md">
            <div class="text-body1">已解析并导入 {{ job.processed }} / {{ job.total }} 行</div>
            <q-badge color="positive" :label="`成功 ${job.succeeded}`" />
            <q-badge v-if="job.failed" color="negative" :label="`失败 ${job.failed}`" />
            <q-badge v-if="job.state === 'running'" color="warning" label="正在处理" />
            <q-badge v-else color="primary" label="处理完成" />
          </div>
          <q-linear-progress class="q-mt-sm" rounded size="9px" :value="progress / 100" color="primary" track-color="grey-3" />
          <div v-if="job.current_row && job.state === 'running'" class="text-caption text-secondary q-mt-xs">后台正在解析并导入第 {{ job.current_row }} 行</div>
        </q-card-section>
        <q-separator />
        <q-card-section class="table-panel q-pa-none">
          <q-table flat :rows="job.rows" :columns="columns" row-key="row" :pagination="{ rowsPerPage: 10 }" :rows-per-page-options="[10, 20, 50]" class="import-table">
            <template #body-cell-status="scope"><q-td :props="scope"><q-badge :color="scope.row.status === 'success' ? 'positive' : scope.row.status === 'failed' ? 'negative' : scope.row.status === 'processing' ? 'warning' : 'grey-6'" :label="scope.row.status === 'success' ? '成功' : scope.row.status === 'failed' ? '失败' : scope.row.status === 'processing' ? '处理中' : '等待中'" /></q-td></template>
            <template #body-cell-reason="scope"><q-td :props="scope" class="reason-cell">{{ scope.row.reason || '—' }}</q-td></template>
            <template #body-cell-actions="scope"><q-td :props="scope"><q-btn v-if="scope.row.status === 'failed'" flat dense color="primary" label="编辑" @click="openEdit(scope.row)" /></q-td></template>
          </q-table>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="q-pa-md">
          <q-btn v-if="failedRows.length" outline color="primary" icon="download" label="导出错误数据" :loading="exportingErrors" @click="exportErrors" />
          <q-btn v-if="failedRows.length" color="primary" unelevated label="重新导入全部错误项" @click="retryRows(failedRows)" />
          <q-btn flat label="关闭" v-close-popup />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>

  <q-dialog :model-value="!!editingRow" @update:model-value="(open) => { if (!open) editingRow = null }">
    <q-card class="editor-dialog">
      <q-card-section class="row items-center"><div class="text-h6">修改第 {{ editingRow?.row }} 行</div><q-space /><q-btn flat round dense icon="close" v-close-popup /></q-card-section>
      <q-card-section class="editor-grid">
        <q-input v-model="editor.name" outlined label="标题 *" />
        <q-input v-model="editor.year" outlined label="年份" />
        <q-input v-if="type === 'TV'" v-model="editor.season" outlined label="季号" />
        <q-input v-model="editor.keyword" outlined label="自定义搜索词" />
        <q-input :model-value="siteText(editor.rss_sites)" outlined label="RSS 站点（逗号分隔）" @update:model-value="editor.rss_sites = parseSites(String($event || ''))" />
        <q-input :model-value="siteText(editor.search_sites)" outlined label="搜索站点（逗号分隔）" @update:model-value="editor.search_sites = parseSites(String($event || ''))" />
        <q-input v-model="editor.filter_restype" outlined label="资源类型" />
        <q-input v-model="editor.filter_pix" outlined label="分辨率" />
        <q-input v-model="editor.filter_team" outlined label="制作组/字幕组" />
        <q-input v-model="editor.filter_rule" outlined label="过滤规则 ID" />
        <q-input v-model="editor.download_setting" outlined label="下载设置 ID" />
        <q-input v-model="editor.save_path" outlined label="保存路径" />
        <q-input v-if="type === 'TV'" v-model="editor.total_ep" outlined label="总集数" />
        <q-input v-if="type === 'TV'" v-model="editor.current_ep" outlined label="开始订阅集数" />
        <q-toggle v-model="editor.fuzzy_match" label="模糊匹配" />
        <q-toggle v-model="editor.over_edition" label="洗版" />
      </q-card-section>
      <q-card-actions align="right"><q-btn flat label="取消" v-close-popup /><q-btn color="primary" unelevated label="保存并重新导入" @click="saveAndRetry" /></q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.import-dialog { width: min(1180px, calc(100vw - 48px)); max-width: none; }
.upload-panel { min-height: 220px; }
.progress-panel { padding-bottom: 18px; }
.table-panel { max-height: min(54vh, 560px); overflow: auto; }
.reason-cell { max-width: 360px; white-space: normal; color: var(--q-negative); }
.editor-dialog { width: min(760px, calc(100vw - 48px)); }
.editor-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
@media (max-width: 599px) { .import-dialog, .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .editor-grid { grid-template-columns: 1fr; } .table-panel { max-height: none; } }
</style>
