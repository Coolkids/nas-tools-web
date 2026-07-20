<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import {Search, Loading, Refresh, Plus, Delete, Link} from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import AddDownloadDialog from '@/components/AddDownloadDialog.vue'
import AddRssMediaDialog from '@/components/AddRssMediaDialog.vue'
import { search, getSearchTaskList, getSearchTaskResult, searchTaskDelete, type SearchTaskItem, type SearchTaskResultItem, type TaskTmdbInfo } from '@/api/media'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api/request'

const route = useRoute()
const modal = useModalStore()

const keyword = ref((route.query.q as string) || '')
const searching = ref(false)

const tasks = ref<SearchTaskItem[]>([])
const selectedTask = ref<SearchTaskItem | null>(null)
const taskResults = ref<SearchTaskResultItem[]>([])
const loadingResults = ref(false)
const tmdbInfo = ref<TaskTmdbInfo | null>(null)

const siteFilter = ref<string[]>([])
const nameFilter = ref('')

const showResultsDialog = ref(false)
const vxeTableRef = ref()
const tableHeight = ref(400)

function recalcTable() {
  nextTick(() => {
    const rightPanel = document.querySelector('.result-dialog .right-panel') as HTMLElement | null
    if (!rightPanel) return
    const filterBar = rightPanel.querySelector('.filter-bar') as HTMLElement | null
    let used = 0
    if (filterBar) used += filterBar.offsetHeight + 12
    tableHeight.value = Math.max(500, rightPanel.clientHeight - used - 8)
    vxeTableRef.value?.recalculate()
  })
}

let taskPollTimer: ReturnType<typeof setInterval> | null = null

const uniqueSites = computed(() => {
  const sites = new Set(taskResults.value.map(r => r.site).filter(Boolean))
  return Array.from(sites).sort()
})

const filteredResults = computed(() => {
  let results = taskResults.value
  if (siteFilter.value.length > 0) {
    results = results.filter(r => siteFilter.value.includes(r.site))
  }
  if (nameFilter.value.trim()) {
    const q = nameFilter.value.trim().toLowerCase()
    results = results.filter(r => (r.torrent_name || '').toLowerCase().includes(q))
  }
  return results
})

function statusTag(status: string): { type: 'success' | 'warning' | 'info' | 'danger'; text: string } {
  switch (status) {
    case 'running': return { type: 'warning', text: '运行中' }
    case 'queued': return { type: 'info', text: '排队中' }
    case 'success': return { type: 'success', text: '完成' }
    case 'failed': return { type: 'danger', text: '失败' }
    default: return { type: 'info', text: status }
  }
}

function formatTime(t: string): string {
  if (!t) return '-'
  return t
}

async function fetchTaskList() {
  try {
    const res = await getSearchTaskList()
    if (res.code === 0) {
      tasks.value = res.tasks || []
    }
  } catch {
    // ignore
  }
}

async function doSearch() {
  const q = keyword.value.trim()
  if (!q) {
    modal.warning('请输入搜索关键字')
    return
  }
  searching.value = true
  try {
    const res = await search({ search_word: q })
    if (res.code !== 0 && res.msg) {
      modal.error(res.msg)
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '搜索请求失败')
  }
  await fetchTaskList()
  searching.value = false
}

async function deleteTask(task: SearchTaskItem) {
  try {
    const res = await searchTaskDelete(task.keyword)
    if (res.code === 0) {
      modal.success(`任务「${task.keyword}」已删除`)
      if (selectedTask.value?.keyword === task.keyword) {
        selectedTask.value = null
        taskResults.value = []
        tmdbInfo.value = null
      }
      await fetchTaskList()
    } else {
      modal.error(res.msg || '删除失败')
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '删除请求失败')
  }
}

async function selectTask(task: SearchTaskItem) {
  selectedTask.value = task
  showResultsDialog.value = true
  siteFilter.value = []
  nameFilter.value = ''
  if (task.status === 'success' || task.status === 'failed') {
    await loadTaskResult(task.keyword)
  }
}

async function loadTaskResult(kw: string) {
  loadingResults.value = true
  tmdbInfo.value = null
  try {
    const res = await getSearchTaskResult(kw)
    if (res.code === 0) {
      taskResults.value = res.results || []
      selectedTask.value = res.task as SearchTaskItem
      if (res.tmdb_info && (res.tmdb_info.poster || res.tmdb_info.overview)) {
        tmdbInfo.value = res.tmdb_info
      }
    }
  } catch {
    // ignore
  }
  loadingResults.value = false
  recalcTable()
}

function startTaskPoll() {
  if (taskPollTimer) return
  taskPollTimer = setInterval(async () => {
    await fetchTaskList()
  }, 5000)
}

function stopTaskPoll() {
  if (taskPollTimer) {
    clearInterval(taskPollTimer)
    taskPollTimer = null
  }
}

function selectRunningTask(task: SearchTaskItem) {
  selectTask(task)
  startTaskPoll()
}

function freeText(t: SearchTaskResultItem): { text: string; type: 'success' | 'info' } | null {
  if (t.download_volume_factor === 0) return { text: 'FREE', type: 'success' }
  if (t.download_volume_factor !== 1) return { text: `${Math.round(t.download_volume_factor * 100)}%DL`, type: 'info' }
  return null
}

function uploadText(t: SearchTaskResultItem): { text: string; type: 'warning' | 'info' } | null {
  if (t.upload_volume_factor !== 1) return { text: `${Math.round(t.upload_volume_factor * 100)}%UL`, type: 'warning' }
  return null
}

function openTorrent(t: SearchTaskResultItem) {
  if (!t.id) {
    modal.info('无可用下载链接')
    return
  }
  downloadDialogVisible.value = true
  pendingTorrent.value = t
}

function openRssSubscribe(task: SearchTaskItem) {
  rssKeyword.value = task.keyword
  rssDialogVisible.value = true
}

function openPage(url: string) {
  if (url) window.open(url, '_blank')
}

const downloadDialogVisible = ref(false)
const pendingTorrent = ref<SearchTaskResultItem | null>(null)

const rssDialogVisible = ref(false)
const rssKeyword = ref('')

function onDownloadSuccess() {
  modal.success(`${pendingTorrent.value?.site || ''} ${pendingTorrent.value?.torrent_name || ''} 添加下载成功！`)
}

function onDownloadError(msg: string) {
  modal.error(`添加下载失败：${msg}`)
}

// ---- 高级搜索 ----
const showAdvanced = ref(false)
const advancedForm = reactive({
  type: '',
  name: '',
  year: '',
  season: '',
  restype: '',
  pix: '',
  sp_state: '* *',
  rule: ''
})

const restypeDict: Record<string, string> = {
  BLURAY: 'BluRay',
  REMUX: 'REMUX',
  DOLBY: 'Dolby',
  WEB: 'WEB-DL',
  HDTV: 'HDTV',
  UHD: 'UHD',
  HDR: 'HDR',
  '3D': '3D'
}

const pixDict: Record<string, string> = {
  '8k': '8K',
  '4k': '4K',
  '1080p': '1080p',
  '720p': '720p'
}

const spStates = [
  { value: '* *', label: '全部' },
  { value: '1.0 1.0', label: '普通' },
  { value: '1.0 0.0', label: '免费' },
  { value: '2.0 1.0', label: '2X' },
  { value: '2.0 0.0', label: '2X免费' },
  { value: '1.0 0.5', label: '50%' },
  { value: '2.0 0.5', label: '2X 50%' },
  { value: '1.0 0.7', label: '70%' },
  { value: '1.0 0.3', label: '30%' }
]

const seasonOptions = computed(() => {
  const options = [{ value: '', label: '全部' }]
  for (let i = 1; i <= 20; i++) {
    options.push({ value: `S${i.toString().padStart(2, '0')}`, label: `第${i}季` })
  }
  return options
})

interface RuleOption {
  id: number
  name: string
}

const filterRules = ref<RuleOption[]>([])

async function loadFilterRules() {
  try {
    const res: any = await doAction('get_filterrules', {})
    if (res.code === 0) {
      filterRules.value = (res.ruleGroups || []).map((g: any) => ({
        id: g.id,
        name: g.name
      }))
    }
  } catch {
    // ignore
  }
}

function openAdvancedDialog() {
  advancedForm.type = ''
  advancedForm.name = keyword.value || ''
  advancedForm.year = ''
  advancedForm.season = ''
  advancedForm.restype = ''
  advancedForm.pix = ''
  advancedForm.sp_state = '* *'
  advancedForm.rule = ''
  loadFilterRules()
  showAdvanced.value = true
}

async function doAdvancedSearch() {
  const name = advancedForm.name.trim()
  if (!name) {
    modal.warning('请输入电影/电视剧名称')
    return
  }
  let kw = name
  if (advancedForm.type) {
    kw = advancedForm.type + ' ' + name
  }
  if (advancedForm.year) {
    kw = kw + ' ' + advancedForm.year
  }
  if (advancedForm.season) {
    kw = kw + ' ' + advancedForm.season
  }
  const filters: Record<string, string> = {}
  if (advancedForm.restype) filters.restype = advancedForm.restype
  if (advancedForm.pix) filters.pix = advancedForm.pix
  if (advancedForm.sp_state && advancedForm.sp_state !== '* *') filters.sp_state = advancedForm.sp_state
  if (advancedForm.rule) filters.rule = advancedForm.rule
  showAdvanced.value = false
  keyword.value = kw
  searching.value = true
  try {
    const res = await search({ search_word: kw, filters, unident: true })
    if (res.code !== 0 && res.msg) {
      modal.error(res.msg)
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '搜索请求失败')
  }
  await fetchTaskList()
  searching.value = false
}

onMounted(() => {
  fetchTaskList()
  startTaskPoll()
  if (keyword.value) {
    doSearch()
  }
})

onBeforeUnmount(stopTaskPoll)
</script>

<template>
  <div class="search-view">
    <PageHeader title="资源搜索" :description="`共 ${tasks.length} 个任务`">
      <template #actions>
        <el-input
          v-model="keyword"
          placeholder="输入电影/电视剧名称..."
          clearable
          style="width: 320px"
          @keyup.enter="doSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" :icon="Search" :loading="searching" @click="doSearch">
          {{ searching ? '搜索中' : '搜索' }}
        </el-button>
        <el-button :icon="Refresh" @click="fetchTaskList">刷新</el-button>
        <el-button @click="openAdvancedDialog">高级搜索</el-button>
      </template>
    </PageHeader>

    <el-table :data="tasks" stripe size="small" @row-click="selectTask" highlight-current-row max-height="200" class="tasks-table">
      <el-table-column label="搜索关键词" min-width="200">
        <template #default="{ row }">
          <span class="keyword-cell">{{ row.keyword }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100" align="center">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status).type" size="small" effect="plain">
            {{ statusTag(row.status).text }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" width="180">
        <template #default="{ row }">{{ formatTime(row.start_time) }}</template>
      </el-table-column>
      <el-table-column label="结束时间" width="180">
        <template #default="{ row }">{{ formatTime(row.end_time) }}</template>
      </el-table-column>
      <el-table-column label="备注" min-width="150">
        <template #default="{ row }">{{ row.message || '-' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="180" align="center">
        <template #default="{ row }">
          <el-button size="small" type="success" :icon="Plus" @click.stop="openRssSubscribe(row)">
            订阅
          </el-button>
          <el-button
            v-if="row.status === 'success' || row.status === 'failed'"
            size="small" type="danger" :icon="Delete"
            @click.stop="deleteTask(row)"
          />
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="showResultsDialog"
      :title="selectedTask ? `搜索结果：${selectedTask.keyword}` : '搜索结果'"
      width="90%"
      top="3vh"
      class="result-dialog"
      destroy-on-close
      :close-on-click-modal="false"
      @opened="recalcTable"
    >
      <div class="dialog-body">
        <div v-if="tmdbInfo" class="left-panel">
          <img v-if="tmdbInfo.poster" :src="tmdbInfo.poster" class="tmdb-poster" alt="poster">
          <div class="tmdb-meta">
            <div class="tmdb-title">{{ tmdbInfo.title }}<span v-if="tmdbInfo.year" class="tmdb-year"> ({{ tmdbInfo.year }})</span></div>
            <div v-if="tmdbInfo.overview" class="tmdb-overview">{{ tmdbInfo.overview }}</div>
          </div>
        </div>

        <div class="right-panel">
          <div v-if="loadingResults" class="loading-tip">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>加载中...</span>
          </div>

          <template v-else-if="taskResults.length > 0">
            <div class="filter-bar">
              <el-select v-model="siteFilter" multiple placeholder="站点筛选" clearable collapse-tags style="width: 200px">
                <el-option v-for="s in uniqueSites" :key="s" :label="s" :value="s" />
              </el-select>
              <el-input v-model="nameFilter" placeholder="名称过滤..." clearable style="width: 240px" />
              <span class="filter-count">共 {{ filteredResults.length }} 条结果</span>
            </div>

            <vxe-table
              ref="vxeTableRef"
              :data="filteredResults"
              :height="tableHeight"
              border
              stripe
              size="small"
              :scroll-y="{ enabled: true, gt: 20 }"
              :row-config="{ height: 56 }"
              :column-config="{ resizable: true }"
            >
              <vxe-column field="site" title="站点" width="90">
                <template #default="{ row }">
                  <span class="site-cell">{{ row.site }}</span>
                </template>
              </vxe-column>
              <vxe-column field="torrent_name" title="种子名称" min-width="400">
                <template #default="{ row }">
                  <div class="torrent-name">{{ row.torrent_name }}</div>
                  <div v-if="row.description" class="torrent-desc">{{ row.description }}</div>
                  <div class="torrent-badges">
                    <el-tag v-if="row.title" size="small" type="primary">{{ row.title }}</el-tag>
                    <el-tag v-if="row.type === 'MOV'" size="small" type="success">电影</el-tag>
                    <el-tag v-else-if="row.type === 'TV'" size="small" type="warning">电视剧</el-tag>
                    <el-tag v-if="row.size" size="small" type="info">{{ row.size }}</el-tag>
                    <el-tag v-if="uploadText(row)" size="small" :type="uploadText(row)!.type">{{ uploadText(row)!.text }}</el-tag>
                    <el-tag v-if="freeText(row)" size="small" :type="freeText(row)!.type">{{ freeText(row)!.text }}</el-tag>
                  </div>
                </template>
              </vxe-column>
              <vxe-column field="size" title="大小" width="90" />
              <vxe-column field="seeders" title="做种" width="70" align="center">
                <template #default="{ row }">
                  <span v-if="row.seeders">{{ row.seeders }}↑</span>
                </template>
              </vxe-column>
              <vxe-column title="操作" width="140" align="center">
                <template #default="{ row }">
                  <el-button size="small" type="primary" @click="openTorrent(row)">下载</el-button>
                  <el-button v-if="row.pageurl" size="small" @click="openPage(row.pageurl)">
                    <el-icon><Link /></el-icon>
                  </el-button>
                </template>
              </vxe-column>
            </vxe-table>
          </template>

          <el-empty v-else description="暂无搜索结果" />
        </div>
      </div>
    </el-dialog>

    <AddDownloadDialog
      v-model="downloadDialogVisible"
      mode="search"
      :torrent-id="pendingTorrent?.id"
      :title="pendingTorrent ? `添加下载 【${pendingTorrent.site}】${pendingTorrent.torrent_name}` : '添加下载'"
      @success="onDownloadSuccess"
      @error="onDownloadError"
    />

    <AddRssMediaDialog
      v-model="rssDialogVisible"
      type="MOV"
      :initial-name="rssKeyword"
      :initial-keyword="rssKeyword"
    />

    <el-dialog v-model="showAdvanced" title="高级搜索" width="750px" destroy-on-close>
      <el-form label-width="60px">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="类型">
              <el-select v-model="advancedForm.type" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option label="电影" value="电影" />
                <el-option label="电视剧" value="电视剧" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="10">
            <el-form-item label="名称">
              <el-input v-model="advancedForm.name" placeholder="电影/电视剧名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="年份">
              <el-input v-model="advancedForm.year" placeholder="20xx" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="季">
              <el-select v-model="advancedForm.season" style="width: 100%">
                <el-option
                  v-for="opt in seasonOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="质量">
              <el-select v-model="advancedForm.restype" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option
                  v-for="(label, key) in restypeDict"
                  :key="key"
                  :label="label"
                  :value="key"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="分辨率">
              <el-select v-model="advancedForm.pix" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option
                  v-for="(label, key) in pixDict"
                  :key="key"
                  :label="label"
                  :value="key"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="促销">
              <el-select v-model="advancedForm.sp_state" style="width: 100%">
                <el-option
                  v-for="s in spStates"
                  :key="s.value"
                  :label="s.label"
                  :value="s.value"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="规则">
              <el-select v-model="advancedForm.rule" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option
                  v-for="r in filterRules"
                  :key="r.id"
                  :label="r.name"
                  :value="r.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showAdvanced = false">取消</el-button>
        <el-button type="primary" @click="doAdvancedSearch">开始搜索</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.search-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 16px;
}
.tasks-table {
  flex-shrink: 0;
}
.keyword-cell {
  font-weight: 600;
  cursor: pointer;
}
.result-dialog :deep(.el-dialog) {
  max-height: 92vh;
  display: flex;
  flex-direction: column;
}
.result-dialog :deep(.el-dialog__body) {
  height: 75vh;
  padding: 16px 20px;
  overflow: hidden;
  flex: 1;
}
.dialog-body {
  display: flex;
  gap: 20px;
  height: 100%;
}
.left-panel {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}
.left-panel .tmdb-poster {
  width: 100%;
  border-radius: 6px;
  object-fit: cover;
}
.left-panel .tmdb-meta {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.left-panel .tmdb-title {
  font-size: 16px;
  font-weight: 700;
}
.left-panel .tmdb-year {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}
.left-panel .tmdb-overview {
  font-size: 12px;
  line-height: 1.6;
  color: var(--el-text-color-secondary);
}
.right-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.loading-tip {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--el-text-color-secondary);
  padding: 40px 0;
  justify-content: center;
}
.site-cell {
  font-weight: 600;
}
.torrent-name {
  font-size: 13px;
  word-break: break-all;
}
.torrent-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}
.torrent-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.filter-bar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
  flex-shrink: 0;
}
.filter-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

/* ---- responsive ---- */
@media (max-width: 1200px) {
  .left-panel {
    width: 200px;
  }
}
@media (max-width: 768px) {
  .result-dialog :deep(.el-dialog__body) {
    height: 80vh;
  }
  .dialog-body {
    flex-direction: column;
    gap: 12px;
  }
  .left-panel {
    width: 100%;
    flex-direction: row;
    align-items: flex-start;
    max-height: 140px;
    overflow: hidden;
    flex-shrink: 0;
  }
  .left-panel .tmdb-poster {
    width: 90px;
    min-height: 120px;
    flex-shrink: 0;
  }
  .left-panel .tmdb-overview {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

</style>
