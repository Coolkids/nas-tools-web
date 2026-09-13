<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { QTableProps } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import AddDownloadDialog from '@/components/AddDownloadDialog.vue'
import AddRssMediaDialog from '@/components/AddRssMediaDialog.vue'
import { search, getSearchTaskList, getSearchTaskResult, searchTaskDelete, type SearchParams, type SearchTaskItem, type SearchTaskResultItem, type TaskTmdbInfo } from '@/api/media'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api/request'
import ExploreSearchBar from '@/components/ExploreSearchBar.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'

const route = useRoute()
const modal = useModalStore()

const keyword = ref((route.query.q as string) || '')
const searching = ref(false)
const tasks = ref<SearchTaskItem[]>([])
const selectedTask = ref<SearchTaskItem | null>(null)
const taskResults = ref<SearchTaskResultItem[]>([])
const loadingResults = ref(false)
const resultError = ref('')
const taskError = ref('')
const tmdbInfo = ref<TaskTmdbInfo | null>(null)
const siteFilter = ref<string[]>([])
const nameFilter = ref('')
const showResultsDialog = ref(false)
const taskListLoading = ref(false)
const taskListInFlight = ref(false)
let taskPollTimer: ReturnType<typeof setTimeout> | null = null
let resultRequestToken = 0
let pollActive = false

const taskColumns: QTableProps['columns'] = [
  { name: 'keyword', label: '搜索关键词', field: 'keyword', align: 'left' },
  { name: 'status', label: '状态', field: 'status', align: 'center' },
  { name: 'start', label: '开始时间', field: 'start_time', align: 'left' },
  { name: 'end', label: '结束时间', field: 'end_time', align: 'left' },
  { name: 'message', label: '备注', field: 'message', align: 'left' },
  { name: 'actions', label: '操作', field: 'keyword', align: 'right' }
]

const uniqueSites = computed(() => Array.from(new Set(taskResults.value.map((item) => item.site).filter(Boolean))).sort())
const filteredResults = computed(() => {
  let results = taskResults.value
  if (siteFilter.value.length) results = results.filter((item) => siteFilter.value.includes(item.site))
  const query = nameFilter.value.trim().toLowerCase()
  if (query) results = results.filter((item) => (item.torrent_name || '').toLowerCase().includes(query))
  return results
})

function statusMeta(status: string): { color: 'positive' | 'warning' | 'info' | 'negative' | 'grey-7'; label: string } {
  switch (status) {
    case 'running': return { color: 'warning', label: '运行中' }
    case 'queued': return { color: 'info', label: '排队中' }
    case 'success': return { color: 'positive', label: '完成' }
    case 'failed': return { color: 'negative', label: '失败' }
    default: return { color: 'grey-7', label: status || '未知' }
  }
}

function formatTime(value: string) {
  return value || '—'
}

async function fetchTaskList(options: { notify?: boolean } = {}) {
  if (taskListInFlight.value) return
  taskListInFlight.value = true
  taskListLoading.value = true
  try {
    const response = await getSearchTaskList()
    if (response.code === 0) {
      tasks.value = response.tasks || []
      taskError.value = ''
      if (selectedTask.value) {
        const previousStatus = selectedTask.value.status
        const latest = tasks.value.find((task) => task.keyword === selectedTask.value?.keyword)
        if (latest) {
          selectedTask.value = latest
          const finished = latest.status === 'success' || latest.status === 'failed'
          if (showResultsDialog.value && finished && previousStatus !== latest.status) void loadTaskResult(latest.keyword)
        }
      }
    } else {
      taskError.value = '搜索任务加载失败，可点击刷新重试。'
      if (options.notify) modal.error(taskError.value)
    }
  } catch (error) {
    taskError.value = '搜索任务加载失败，可点击刷新重试。'
    if (options.notify) modal.error(error instanceof Error ? error.message : taskError.value)
  } finally {
    taskListLoading.value = false
    taskListInFlight.value = false
  }
}

function scheduleTaskPoll(delay = 5000) {
  if (taskPollTimer) clearTimeout(taskPollTimer)
  taskPollTimer = setTimeout(async () => {
    if (!pollActive) return
    if (document.visibilityState === 'visible') await fetchTaskList()
    if (pollActive) scheduleTaskPoll(5000)
  }, delay)
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void fetchTaskList()
    scheduleTaskPoll()
  } else if (taskPollTimer) {
    clearTimeout(taskPollTimer)
    taskPollTimer = null
  }
}

async function runSearch(params: SearchParams) {
  if (searching.value) return
  searching.value = true
  try {
    const response = await search(params)
    if (response.code !== 0) {
      modal.error(response.msg || '搜索请求失败')
      return
    }
    await fetchTaskList()
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '搜索请求失败')
  } finally {
    searching.value = false
  }
}

function doSearch() {
  const query = keyword.value.trim()
  if (!query) {
    modal.warning('请输入搜索关键字')
    return
  }
  void runSearch({ search_word: query })
}

async function deleteTask(task: SearchTaskItem) {
  try {
    const response = await searchTaskDelete(task.keyword)
    if (response.code !== 0) {
      modal.error(response.msg || '删除失败')
      return
    }
    modal.success(`任务「${task.keyword}」已删除`)
    if (selectedTask.value?.keyword === task.keyword) {
      selectedTask.value = null
      taskResults.value = []
      tmdbInfo.value = null
      showResultsDialog.value = false
    }
    await fetchTaskList()
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '删除请求失败')
  }
}

async function loadTaskResult(keywordValue: string) {
  const token = ++resultRequestToken
  loadingResults.value = true
  resultError.value = ''
  tmdbInfo.value = null
  try {
    const response = await getSearchTaskResult(keywordValue)
    if (token !== resultRequestToken) return
    if (response.code !== 0) {
      resultError.value = '搜索结果加载失败，可关闭后重试。'
      return
    }
    taskResults.value = response.results || []
    selectedTask.value = response.task || selectedTask.value
    if (response.tmdb_info && (response.tmdb_info.poster || response.tmdb_info.overview)) tmdbInfo.value = response.tmdb_info
  } catch (error) {
    if (token === resultRequestToken) resultError.value = error instanceof Error ? error.message : '搜索结果加载失败'
  } finally {
    if (token === resultRequestToken) loadingResults.value = false
  }
}

function selectTask(task: SearchTaskItem) {
  selectedTask.value = task
  taskResults.value = []
  tmdbInfo.value = null
  resultError.value = ''
  siteFilter.value = []
  nameFilter.value = ''
  showResultsDialog.value = true
  if (task.status === 'success' || task.status === 'failed') void loadTaskResult(task.keyword)
}

function freeText(task: SearchTaskResultItem): string | null {
  if (task.download_volume_factor === 0) return 'FREE'
  if (task.download_volume_factor !== 1) return `${Math.round(task.download_volume_factor * 100)}%DL`
  return null
}

function uploadText(task: SearchTaskResultItem): string | null {
  if (task.upload_volume_factor !== 1) return `${Math.round(task.upload_volume_factor * 100)}%UL`
  return null
}

const downloadDialogVisible = ref(false)
const pendingTorrent = ref<SearchTaskResultItem | null>(null)
function openTorrent(task: SearchTaskResultItem) {
  if (!task.id) {
    modal.info('无可用下载链接')
    return
  }
  pendingTorrent.value = task
  downloadDialogVisible.value = true
}

function openPage(url: string) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

const rssDialogVisible = ref(false)
const rssTypePickerVisible = ref(false)
const rssKeyword = ref('')
const rssType = ref<'MOV' | 'TV'>('MOV')
const pendingRssTask = ref<SearchTaskItem | null>(null)

function openRssSubscribe(task: SearchTaskItem) {
  pendingRssTask.value = task
  rssTypePickerVisible.value = true
}

function chooseRssType(type: 'MOV' | 'TV') {
  rssType.value = type
  rssKeyword.value = pendingRssTask.value?.keyword || ''
  rssTypePickerVisible.value = false
  rssDialogVisible.value = true
}

function onDownloadSuccess() {
  modal.success(`${pendingTorrent.value?.site || ''} ${pendingTorrent.value?.torrent_name || ''} 添加下载成功！`)
  downloadDialogVisible.value = false
}

function onDownloadError(message: string) { modal.error(`添加下载失败：${message}`) }
function onRssSuccess() { modal.success('添加订阅成功'); rssDialogVisible.value = false }
function onRssError(message: string) { modal.error(message || '添加订阅失败') }

const showAdvanced = ref(false)
const advancedForm = reactive({ type: '', name: '', year: '', season: '', restype: '', pix: '', sp_state: '* *', rule: '' as string | number })
const restypeDict: Record<string, string> = { BLURAY: 'BluRay', REMUX: 'REMUX', DOLBY: 'Dolby', WEB: 'WEB-DL', HDTV: 'HDTV', UHD: 'UHD', HDR: 'HDR', '3D': '3D' }
const pixDict: Record<string, string> = { '8k': '8K', '4k': '4K', '1080p': '1080p', '720p': '720p' }
const spStates = [
  { value: '* *', label: '全部' }, { value: '1.0 1.0', label: '普通' }, { value: '1.0 0.0', label: '免费' },
  { value: '2.0 1.0', label: '2X' }, { value: '2.0 0.0', label: '2X免费' }, { value: '1.0 0.5', label: '50%' },
  { value: '2.0 0.5', label: '2X 50%' }, { value: '1.0 0.7', label: '70%' }, { value: '1.0 0.3', label: '30%' }
]
const seasonOptions = computed(() => [{ value: '', label: '全部' }, ...Array.from({ length: 20 }, (_, index) => ({ value: `S${String(index + 1).padStart(2, '0')}`, label: `第${index + 1}季` }))])
const filterRules = ref<Array<{ id: number; name: string }>>([])

async function loadFilterRules() {
  try {
    const response = await doAction<{ code: number; ruleGroups?: Array<{ id: number; name: string }> }>('get_filterrules', {})
    if (response.code === 0) filterRules.value = response.ruleGroups || []
  } catch {
    filterRules.value = []
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
  void loadFilterRules()
  showAdvanced.value = true
}

function doAdvancedSearch() {
  const name = advancedForm.name.trim()
  if (!name) {
    modal.warning('请输入电影/电视剧名称')
    return
  }
  let query = name
  if (advancedForm.type) query += ` ${advancedForm.type}`
  if (advancedForm.year) query += ` ${advancedForm.year}`
  if (advancedForm.season) query += ` ${advancedForm.season}`
  const filters: Record<string, unknown> = {}
  if (advancedForm.restype) filters.restype = advancedForm.restype
  if (advancedForm.pix) filters.pix = advancedForm.pix
  if (advancedForm.sp_state !== '* *') filters.sp_state = advancedForm.sp_state
  if (advancedForm.rule) filters.rule = advancedForm.rule
  showAdvanced.value = false
  keyword.value = query
  void runSearch({ search_word: query, filters, unident: true })
}

function readInitialSearch(): SearchParams | null {
  const query = keyword.value.trim()
  if (!query) return null
  let filters: Record<string, unknown> | undefined
  if (typeof route.query.filters === 'string') {
    try { filters = JSON.parse(route.query.filters) as Record<string, unknown> } catch { filters = undefined }
  }
  return { search_word: query, filters, unident: route.query.unident === 'true' }
}

onMounted(() => {
  pollActive = true
  void fetchTaskList()
  scheduleTaskPoll()
  document.addEventListener('visibilitychange', onVisibilityChange)
  const initialSearch = readInitialSearch()
  if (initialSearch) void runSearch(initialSearch)
})

onBeforeUnmount(() => {
  pollActive = false
  if (taskPollTimer) clearTimeout(taskPollTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  resultRequestToken += 1
})
</script>

<template>
  <div class="search-page">
    <ExploreSearchBar />
    <PageHeader title="资源搜索" :description="`共 ${tasks.length} 个任务`">
      <template #actions>
        <q-input v-model="keyword" outlined dense clearable class="search-input" placeholder="输入电影 / 电视剧名称" @keyup.enter="doSearch">
          <template #prepend><q-icon name="search" /></template>
        </q-input>
        <q-btn color="primary" unelevated icon="search" :label="searching ? '搜索中' : '搜索'" :loading="searching" @click="doSearch" />
        <q-btn outline icon="refresh" label="刷新" :loading="taskListLoading" @click="fetchTaskList({ notify: true })" />
        <q-btn flat icon="tune" label="高级搜索" @click="openAdvancedDialog" />
      </template>
    </PageHeader>

    <q-banner v-if="taskError" rounded class="search-alert q-mb-md" inline-actions>
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ taskError }}
      <template #action><q-btn flat color="negative" label="重试" @click="fetchTaskList({ notify: true })" /></template>
    </q-banner>

    <q-card flat bordered class="task-card">
      <q-table
        v-if="$q.screen.gt.xs"
        flat
        :rows="tasks"
        :columns="taskColumns"
        row-key="keyword"
        :loading="taskListLoading || searching"
        :rows-per-page-options="[0]"
        hide-pagination
        class="task-table"
        @row-click="(_, row) => selectTask(row)"
      >
        <template #body-cell-keyword="props"><q-td :props="props"><span class="keyword-cell">{{ props.row.keyword }}</span></q-td></template>
        <template #body-cell-status="props"><q-td :props="props"><q-badge rounded :color="statusMeta(props.row.status).color" :label="statusMeta(props.row.status).label" /></q-td></template>
        <template #body-cell-start="props"><q-td :props="props">{{ formatTime(props.row.start_time) }}</q-td></template>
        <template #body-cell-end="props"><q-td :props="props">{{ formatTime(props.row.end_time) }}</q-td></template>
        <template #body-cell-message="props"><q-td :props="props">{{ props.row.message || '—' }}</q-td></template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn flat round color="primary" icon="subscriptions" aria-label="订阅" @click.stop="openRssSubscribe(props.row)" />
            <q-btn v-if="props.row.status === 'success' || props.row.status === 'failed'" flat round color="negative" icon="delete" aria-label="删除" @click.stop="deleteTask(props.row)" />
          </q-td>
        </template>
        <template #no-data><div class="empty-state"><q-icon name="search_off" size="38px" color="grey-5" /><span>暂无搜索任务</span></div></template>
      </q-table>

      <div v-else class="mobile-task-list">
        <q-card v-for="task in tasks" :key="task.keyword" flat bordered class="mobile-task" @click="selectTask(task)">
          <q-card-section class="row items-center no-wrap">
            <div class="task-copy"><div class="keyword-cell">{{ task.keyword }}</div><div class="task-time">{{ formatTime(task.start_time) }}</div></div>
            <q-space /><q-badge rounded :color="statusMeta(task.status).color" :label="statusMeta(task.status).label" />
          </q-card-section>
          <q-card-actions align="right" class="q-pt-none">
            <q-btn flat color="primary" icon="subscriptions" label="订阅" @click.stop="openRssSubscribe(task)" />
            <q-btn v-if="task.status === 'success' || task.status === 'failed'" flat color="negative" icon="delete" label="删除" @click.stop="deleteTask(task)" />
          </q-card-actions>
        </q-card>
        <div v-if="!tasks.length && !taskListLoading" class="empty-state"><q-icon name="search_off" size="38px" color="grey-5" /><span>暂无搜索任务</span></div>
      </div>
    </q-card>

    <q-dialog v-model="showResultsDialog" :maximized="$q.screen.lt.sm" :full-width="$q.screen.gt.xs" :full-height="$q.screen.gt.xs">
      <q-card class="result-dialog-card">
        <q-card-section class="row items-center q-pb-sm">
          <div class="text-h6 ellipsis">{{ selectedTask ? `搜索结果：${selectedTask.keyword}` : '搜索结果' }}</div>
          <q-space /><q-btn flat round icon="close" aria-label="关闭" v-close-popup />
        </q-card-section>
        <q-separator />
        <q-card-section class="result-dialog-body">
          <aside v-if="tmdbInfo" class="result-media">
            <q-img v-if="tmdbInfo.poster" :src="tmdbInfo.poster" ratio=".67" class="tmdb-poster" />
            <div class="tmdb-title">{{ tmdbInfo.title }}<span v-if="tmdbInfo.year">（{{ tmdbInfo.year }}）</span></div>
            <div v-if="tmdbInfo.overview" class="tmdb-overview">{{ tmdbInfo.overview }}</div>
          </aside>
          <section class="result-list-panel">
            <q-banner v-if="selectedTask && selectedTask.status !== 'success' && selectedTask.status !== 'failed'" rounded class="result-status-banner q-mb-md">
              <template #avatar><q-icon name="hourglass_top" color="warning" /></template>
              搜索任务{{ statusMeta(selectedTask.status).label }}，完成后会自动更新结果。
            </q-banner>
            <q-inner-loading :showing="loadingResults"><q-spinner-orbit color="primary" size="42px" /></q-inner-loading>
            <q-banner v-if="resultError" rounded class="search-alert q-mb-md" inline-actions>
              <template #avatar><q-icon name="error_outline" color="negative" /></template>{{ resultError }}
              <template #action><q-btn v-if="selectedTask" flat color="negative" label="重试" @click="loadTaskResult(selectedTask.keyword)" /></template>
            </q-banner>
            <template v-else-if="taskResults.length">
              <div class="filter-bar">
                <q-select v-model="siteFilter" outlined dense multiple clearable use-chips emit-value map-options :options="uniqueSites" label="站点筛选" class="site-filter" />
                <q-input v-model="nameFilter" outlined dense clearable label="名称过滤" class="name-filter" />
                <span class="filter-count">共 {{ filteredResults.length }} 条结果</span>
              </div>
              <vxe-table
                v-if="$q.screen.gt.xs"
                class="result-table"
                :data="filteredResults"
                height="90%"
                border
                :row-config="{ keyField: 'id', isHover: true }"
                :virtual-y-config="{ enabled: true, gt: 0, preSize: 10, oSize: 5 }"
              >
                <vxe-column field="site" title="站点" width="150">
                  <template #default="{ row }"><q-badge color="grey-7" :label="row.site" /></template>
                </vxe-column>
                <vxe-column field="torrent_name" title="种子名称" min-width="420">
                  <template #default="{ row }">
                    <div class="torrent-name">{{ row.torrent_name }}</div>
                    <div v-if="row.description" class="torrent-desc">{{ row.description }}</div>
                    <div class="torrent-badges">
                      <q-chip v-if="row.title" dense color="primary" text-color="white" :label="row.title" />
                      <q-chip v-if="row.type === 'MOV'" dense color="positive" text-color="white" label="电影" />
                      <q-chip v-else-if="row.type === 'TV'" dense color="warning" text-color="white" label="电视剧" />
                      <q-chip v-if="uploadText(row)" dense color="warning" text-color="white" :label="uploadText(row) || ''" />
                      <q-chip v-if="freeText(row)" dense color="positive" text-color="white" :label="freeText(row) || ''" />
                    </div>
                  </template>
                </vxe-column>
                <vxe-column field="size" title="大小" width="120" />
                <vxe-column field="seeders" title="做种" width="90" align="center">
                  <template #default="{ row }">{{ row.seeders || 0 }} ↑</template>
                </vxe-column>
                <vxe-column title="操作" width="150" fixed="right" align="right">
                  <template #default="{ row }">
                    <div class="result-actions">
                      <q-btn color="primary" unelevated dense label="下载" @click.stop="openTorrent(row)" />
                      <q-btn v-if="row.pageurl" flat round icon="open_in_new" aria-label="打开站点" @click.stop="openPage(row.pageurl)" />
                    </div>
                  </template>
                </vxe-column>
                <template #empty>
                  <div class="empty-state result-empty"><q-icon name="inventory_2" size="42px" color="grey-5" /><span>暂无符合条件的搜索结果</span></div>
                </template>
              </vxe-table>
              <vxe-table
                v-else
                class="mobile-result-table"
                :data="filteredResults"
                height="80%"
                :show-header="false"
                :row-config="{ keyField: 'id' }"
                :cell-config="{ padding: false }"
                :virtual-y-config="{ enabled: true, gt: 0, preSize: 8, oSize: 4 }"
              >
                <vxe-column field="id" min-width="100%">
                  <template #default="{ row }">
                    <q-card flat bordered class="mobile-result-card">
                      <q-card-section>
                        <div class="row items-center q-gutter-sm">
                          <q-badge color="grey-7" :label="row.site" />
                          <q-chip v-if="row.type === 'MOV'" dense color="positive" text-color="white" label="电影" />
                          <q-chip v-else-if="row.type === 'TV'" dense color="warning" text-color="white" label="电视剧" />
                        </div>
                        <div class="torrent-name q-mt-sm">{{ row.torrent_name }}</div>
                        <div v-if="row.description" class="torrent-desc">{{ row.description }}</div>
                        <div class="torrent-badges">
                          <q-chip v-if="row.size" dense outline :label="row.size" />
                          <q-chip v-if="row.title" dense outline :label="row.title" />
                          <q-chip v-if="uploadText(row)" dense color="warning" text-color="white" :label="uploadText(row) || ''" />
                          <q-chip v-if="freeText(row)" dense color="positive" text-color="white" :label="freeText(row) || ''" />
                        </div>
                      </q-card-section>
                      <q-card-actions align="right">
                        <span class="seeders-text">{{ row.seeders || 0 }} ↑</span>
                        <q-btn color="primary" unelevated label="下载" @click.stop="openTorrent(row)" />
                        <q-btn v-if="row.pageurl" flat round icon="open_in_new" aria-label="打开站点" @click.stop="openPage(row.pageurl)" />
                      </q-card-actions>
                    </q-card>
                  </template>
                </vxe-column>
                <template #empty>
                  <div class="empty-state result-empty"><q-icon name="inventory_2" size="42px" color="grey-5" /><span>暂无符合条件的搜索结果</span></div>
                </template>
              </vxe-table>
            </template>
            <div v-else-if="!loadingResults" class="empty-state result-empty"><q-icon name="inventory_2" size="42px" color="grey-5" /><span>暂无搜索结果</span></div>
          </section>
        </q-card-section>
      </q-card>
    </q-dialog>

    <AddDownloadDialog v-model="downloadDialogVisible" mode="search" :torrent-id="pendingTorrent?.id" :title="pendingTorrent ? `添加下载【${pendingTorrent.site}】${pendingTorrent.torrent_name}` : '添加下载'" @success="onDownloadSuccess" @error="onDownloadError" />
    <AddRssMediaDialog v-model="rssDialogVisible" :type="rssType" :initial-name="rssKeyword" :initial-keyword="rssKeyword" @success="onRssSuccess" @error="onRssError" />

    <q-dialog v-model="rssTypePickerVisible">
      <q-card class="type-picker-card"><q-card-section><div class="text-h6">选择订阅类型</div><div class="text-body2 text-grey-7 q-mt-sm">请选择要订阅的媒体类型</div></q-card-section><q-card-actions align="right"><q-btn flat label="取消" v-close-popup /><q-btn outline color="primary" label="电视剧" @click="chooseRssType('TV')" /><q-btn color="primary" unelevated label="电影" @click="chooseRssType('MOV')" /></q-card-actions></q-card>
    </q-dialog>

    <q-dialog v-model="showAdvanced" :maximized="$q.screen.lt.sm">
      <q-card class="advanced-card">
        <q-card-section class="row items-center"><div class="text-h6">高级搜索</div><q-space /><q-btn flat round icon="close" aria-label="关闭" v-close-popup /></q-card-section>
        <q-separator />
        <q-form @submit.prevent="doAdvancedSearch">
          <q-card-section class="advanced-form">
            <q-select v-model="advancedForm.type" outlined label="类型" :options="[{ label: '全部', value: '' }, { label: '电影', value: '电影' }, { label: '电视剧', value: '电视剧' }]" emit-value map-options />
            <q-input v-model="advancedForm.name" outlined label="名称" placeholder="电影 / 电视剧名称" />
            <q-input v-model="advancedForm.year" outlined label="年份" placeholder="20xx" inputmode="numeric" />
            <q-select v-model="advancedForm.season" outlined label="季" :options="seasonOptions" emit-value map-options />
            <q-select v-model="advancedForm.restype" outlined label="质量" :options="[{ label: '全部', value: '' }, ...Object.entries(restypeDict).map(([value, label]) => ({ label, value }))]" emit-value map-options />
            <q-select v-model="advancedForm.pix" outlined label="分辨率" :options="[{ label: '全部', value: '' }, ...Object.entries(pixDict).map(([value, label]) => ({ label, value }))]" emit-value map-options />
            <q-select v-model="advancedForm.sp_state" outlined label="促销" :options="spStates" emit-value map-options />
            <q-select v-model="advancedForm.rule" outlined label="规则" :options="[{ id: '', name: '全部' }, ...filterRules]" option-label="name" option-value="id" emit-value map-options />
          </q-card-section>
          <q-card-actions align="right"><q-btn flat label="取消" v-close-popup /><q-btn color="primary" unelevated type="submit" label="开始搜索" :loading="searching" /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
    <ScrollToTop />
  </div>
</template>

<style scoped>
.search-page { max-width: 1600px; margin: 0 auto; }
.search-input { width: min(320px, 100%); }
.search-alert { color: var(--text-primary); background: color-mix(in srgb, var(--q-negative) 10%, var(--surface)); }
.task-card { overflow: hidden; background: var(--surface); border-color: var(--border-subtle); }
.task-table :deep(th), .result-table :deep(th) { color: var(--text-secondary); font-weight: 500; }
.task-table :deep(tbody tr) { cursor: pointer; }
.keyword-cell { color: var(--text-primary); font-weight: 600; }
.mobile-task-list { display: grid; gap: 8px; padding: 8px; }
.mobile-task { background: var(--surface); border-color: var(--border-subtle); }
.task-copy { min-width: 0; }
.task-time { margin-top: 5px; color: var(--text-secondary); font-size: 12px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 180px; color: var(--text-secondary); font-size: 13px; }
.result-dialog-card { width: min(1280px, calc(100vw - 32px)); max-width: none; max-height: 92vh; border-radius: 16px; }
.result-dialog-body { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 20px; min-height: min(68vh, 720px); overflow: hidden; }
.result-media { min-width: 0; overflow: auto; }
.tmdb-poster { display: block; width: 100%; border-radius: 10px; background: var(--surface-muted); }
.tmdb-title { margin-top: 12px; color: var(--text-primary); font-size: 17px; font-weight: 650; }
.tmdb-title span { color: var(--text-secondary); font-size: 13px; font-weight: 400; }
.tmdb-overview { margin-top: 8px; color: var(--text-secondary); font-size: 13px; line-height: 1.65; }
.result-list-panel { position: relative; min-width: 0; min-height: 0; overflow: auto; }
.result-status-banner { color: var(--text-primary); background: color-mix(in srgb, var(--q-warning) 12%, var(--surface)); }
.filter-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.site-filter { width: 210px; }
.name-filter { width: 240px; }
.filter-count { margin-left: auto; color: var(--text-secondary); font-size: 12px; white-space: nowrap; }
.result-table {
  width: 100%;
  --vxe-ui-font-color: var(--text-primary);
  --vxe-ui-font-lighten-color: var(--text-secondary);
  --vxe-ui-font-darken-color: var(--text-primary);
  --vxe-ui-font-primary-color: var(--q-primary);
  --vxe-ui-layout-background-color: var(--surface);
  --vxe-ui-table-header-background-color: var(--surface-muted);
  --vxe-ui-table-header-font-color: var(--text-secondary);
  --vxe-ui-table-border-color: var(--border-subtle);
  --vxe-ui-table-row-hover-background-color: color-mix(in srgb, var(--q-primary) 7%, var(--surface));
}
.result-table :deep(.vxe-table--render-default) { color: var(--text-primary); background: var(--surface); }
.result-table :deep(.vxe-table--header-wrapper), .result-table :deep(.vxe-table--body-wrapper) { background: var(--surface); }
.result-table :deep(.vxe-table--empty-placeholder) { min-height: 280px; }
.mobile-result-table {
  width: 100%;
  --vxe-ui-font-color: var(--text-primary);
  --vxe-ui-font-lighten-color: var(--text-secondary);
  --vxe-ui-layout-background-color: transparent;
  --vxe-ui-table-border-color: transparent;
}
.mobile-result-table :deep(.vxe-table--render-default), .mobile-result-table :deep(.vxe-table--body-wrapper) { background: transparent; }
.mobile-result-table :deep(.vxe-body--column) { padding: 4px 0; border: 0; }
.mobile-result-table :deep(.vxe-cell) { padding: 0; }
.torrent-name { color: var(--text-primary); font-size: 14px; line-height: 1.45; word-break: break-word; }
.torrent-desc { margin-top: 3px; overflow: hidden; color: var(--text-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.torrent-badges { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
.torrent-badges :deep(.q-chip) { margin: 0; }
.result-actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.mobile-result-list { display: grid; gap: 8px; }
.mobile-result-card { background: var(--surface); border-color: var(--border-subtle); }
.seeders-text { margin-right: auto; color: var(--text-secondary); font-size: 12px; }
.result-empty { min-height: 280px; }
.type-picker-card { width: min(440px, calc(100vw - 32px)); border-radius: 16px; }
.advanced-card { width: min(760px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.advanced-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
@media (max-width: 1023px) { .result-dialog-body { grid-template-columns: 180px minmax(0, 1fr); } }
@media (max-width: 599px) {
  .search-input { width: 100%; }
  .result-dialog-card { width: 100%; max-height: none; border-radius: 0; }
  .result-dialog-body { display: flex; flex-direction: column; min-height: 0; overflow: auto; padding: 12px 16px 24px; }
  .result-media { display: grid; grid-template-columns: 84px minmax(0, 1fr); column-gap: 12px; max-height: 140px; }
  .tmdb-poster { grid-row: span 2; width: 84px; height: 124px; }
  .tmdb-title { margin-top: 0; }
  .tmdb-overview { margin-top: 4px; display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 4; }
  .filter-bar { flex-wrap: wrap; }
  .site-filter, .name-filter { width: 100%; }
  .filter-count { width: 100%; margin-left: 0; }
  .advanced-card { width: 100%; min-height: 100dvh; border-radius: 0; }
  .advanced-form { grid-template-columns: 1fr; overflow: auto; }
}
</style>
