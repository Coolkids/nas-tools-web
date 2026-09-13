<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import type { QTableProps } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import AddDownloadDialog from '@/components/AddDownloadDialog.vue'
import PosterPreview from '@/components/PosterPreview.vue'
import { useModalStore } from '@/stores/modal'
import { getDownloading, ptStart, ptStop, ptRemove, type DownloadTask } from '@/api/download'

const modal = useModalStore()
const loading = ref(false)
const list = ref<DownloadTask[]>([])
const loadInFlight = ref(false)
let pollTimer: ReturnType<typeof setTimeout> | null = null
let pollActive = false

const columns: QTableProps['columns'] = [
  { name: 'task', label: '任务', field: (row: DownloadTask) => row.title || row.name, align: 'left' },
  { name: 'progress', label: '进度', field: 'progress', align: 'left' },
  { name: 'state', label: '状态', field: 'state', align: 'left' },
  { name: 'actions', label: '操作', field: 'id', align: 'right' }
]

async function load(options: { silent?: boolean } = {}) {
  if (loadInFlight.value) return
  loadInFlight.value = true
  if (!options.silent) loading.value = true
  try {
    const res = await getDownloading()
    if (res.code === 0) list.value = res.result || []
  } catch {
    // 静默轮询失败保留最后一次成功数据；手动刷新由按钮状态反馈
  } finally {
    loadInFlight.value = false
    loading.value = false
  }
}

function schedulePoll(delay = 5000) {
  if (pollTimer) clearTimeout(pollTimer)
  pollTimer = setTimeout(async () => {
    if (!pollActive) return
    if (document.visibilityState === 'visible') await load({ silent: true })
    if (pollActive) schedulePoll(5000)
  }, delay)
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    void load({ silent: true })
    schedulePoll(5000)
  } else if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

onMounted(() => {
  pollActive = true
  void load()
  schedulePoll()
  document.addEventListener('visibilitychange', onVisibilityChange)
})
onUnmounted(() => {
  pollActive = false
  if (pollTimer) clearTimeout(pollTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

const count = computed(() => list.value.length)

async function manualRefresh() {
  await load()
}

function isStopped(task: DownloadTask) {
  return task.state !== 'Downloading'
}

function stateMeta(task: DownloadTask) {
  if (task.state === 'Downloading') return { label: '下载中', color: 'positive' }
  if (task.state === 'Paused' || task.state === 'Stopped') return { label: '已暂停', color: 'grey-7' }
  if (task.state) return { label: task.state, color: 'info' }
  return { label: '未知状态', color: 'grey-7' }
}

function progressValue(task: DownloadTask) {
  const value = Number(task.progress)
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0
}

async function onStart(task: DownloadTask) {
  try {
    const response = await ptStart(task.id)
    if (response.retcode !== 0) {
      modal.error(response.retmsg || '开始失败')
      return
    }
    await load({ silent: true })
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '开始失败')
  }
}

async function onStop(task: DownloadTask) {
  try {
    const response = await ptStop(task.id)
    if (response.retcode !== 0) {
      modal.error(response.retmsg || '暂停失败')
      return
    }
    await load({ silent: true })
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '暂停失败')
  }
}

async function onRemove(task: DownloadTask) {
  const ok = await modal.confirm('确认删除该下载任务？删除后将同时删除文件。', '删除下载')
  if (!ok) return
  try {
    const response = await ptRemove(task.id)
    if (response.retcode !== 0) {
      modal.error(response.retmsg || '删除失败')
      return
    }
    modal.success('删除成功')
    await load({ silent: true })
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '删除失败')
  }
}

const addDialogVisible = ref(false)
const addType = ref<'torrent' | 'magnet'>('torrent')
function openAddDialog(type: 'torrent' | 'magnet') {
  addType.value = type
  addDialogVisible.value = true
}
function onAddSuccess() {
  modal.success('添加下载完成！')
  void load({ silent: true })
}
function onAddError(message: string) {
  modal.error(`添加下载失败：${message}`)
}
</script>

<template>
  <div class="downloading-page">
    <PageHeader title="正在下载" description="查看下载器中正在进行的任务">
      <template #actions>
        <q-btn-dropdown color="primary" unelevated icon="add" label="新增下载">
          <q-list>
            <q-item v-close-popup clickable @click="openAddDialog('torrent')">
              <q-item-section avatar><q-icon name="upload_file" /></q-item-section>
              <q-item-section>种子文件</q-item-section>
            </q-item>
            <q-item v-close-popup clickable @click="openAddDialog('magnet')">
              <q-item-section avatar><q-icon name="link" /></q-item-section>
              <q-item-section>磁力链接</q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
        <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="manualRefresh" />
      </template>
    </PageHeader>

    <q-card v-if="!loading && count === 0" flat bordered class="empty-card">
      <q-card-section class="column items-center q-pa-xl text-center">
        <q-icon name="download_done" size="48px" color="grey-5" />
        <div class="text-subtitle1 q-mt-md">当前下载器中没有正在下载的任务</div>
        <div class="text-caption text-grey-6 q-mt-xs">可以从上方添加种子文件或磁力链接</div>
      </q-card-section>
    </q-card>

    <q-card v-else flat bordered class="task-card" :class="{ 'is-loading': loading }">
      <q-table
        v-if="$q.screen.gt.xs"
        :rows="list"
        :columns="columns"
        row-key="id"
        hide-pagination
        flat
        :loading="loading"
        class="task-table"
      >
        <template #body-cell-task="props">
          <q-td :props="props">
            <div class="task-cell">
              <PosterPreview v-if="props.row.image" :src="props.row.image" ratio=".73" class="task-poster" />
              <q-avatar v-else rounded color="grey-2" text-color="grey-7" icon="movie" class="task-poster" />
              <div class="task-info">
                <div class="task-title" :title="props.row.title || props.row.name">{{ props.row.title || props.row.name }}</div>
                <div class="task-speed">{{ props.row.speed || '—' }}</div>
              </div>
            </div>
          </q-td>
        </template>
        <template #body-cell-progress="props">
          <q-td :props="props" style="min-width: 220px">
            <q-linear-progress rounded size="12px" :value="progressValue(props.row) / 100" :color="progressValue(props.row) >= 100 ? 'positive' : 'primary'" />
            <div class="progress-value">{{ progressValue(props.row) }}%</div>
          </q-td>
        </template>
        <template #body-cell-state="props">
          <q-td :props="props"><q-badge rounded :color="stateMeta(props.row).color" :label="stateMeta(props.row).label" /></q-td>
        </template>
        <template #body-cell-actions="props">
          <q-td :props="props">
            <q-btn v-if="isStopped(props.row)" flat round color="primary" icon="play_arrow" aria-label="开始" @click="onStart(props.row)" />
            <q-btn v-else flat round color="warning" icon="pause" aria-label="暂停" @click="onStop(props.row)" />
            <q-btn flat round color="negative" icon="delete" aria-label="删除" @click="onRemove(props.row)" />
          </q-td>
        </template>
      </q-table>

      <div v-else class="mobile-task-list">
        <q-card v-for="task in list" :key="task.id" flat class="mobile-task">
          <q-card-section class="row no-wrap items-center q-pb-sm">
            <PosterPreview v-if="task.image" :src="task.image" ratio=".73" class="task-poster" />
            <q-avatar v-else rounded color="grey-2" text-color="grey-7" icon="movie" class="task-poster" />
            <div class="task-info q-ml-md">
              <div class="task-title task-title--mobile">{{ task.title || task.name }}</div>
              <div class="row items-center q-gutter-sm q-mt-xs"><q-badge rounded :color="stateMeta(task).color" :label="stateMeta(task).label" /><span class="task-speed">{{ task.speed || '—' }}</span></div>
            </div>
          </q-card-section>
          <q-card-section class="q-pt-none">
            <div class="row justify-between text-caption text-grey-7 q-mb-xs"><span>下载进度</span><span>{{ progressValue(task) }}%</span></div>
            <q-linear-progress rounded size="10px" :value="progressValue(task) / 100" :color="progressValue(task) >= 100 ? 'positive' : 'primary'" />
          </q-card-section>
          <q-card-actions align="right" class="q-pt-none">
            <q-btn v-if="isStopped(task)" flat color="primary" icon="play_arrow" label="开始" @click="onStart(task)" />
            <q-btn v-else flat color="warning" icon="pause" label="暂停" @click="onStop(task)" />
            <q-btn flat color="negative" icon="delete" label="删除" @click="onRemove(task)" />
          </q-card-actions>
        </q-card>
      </div>
    </q-card>

    <AddDownloadDialog v-model="addDialogVisible" mode="manual" :manual-type="addType" @success="onAddSuccess" @error="onAddError" />
  </div>
</template>

<style scoped>
.downloading-page { min-width: 0; }
.empty-card { min-height: 240px; }
.task-card { overflow: hidden; }
.task-table :deep(.q-table__top), .task-table :deep(th) { color: var(--text-secondary); }
.task-cell { display: flex; align-items: center; gap: 12px; min-width: 0; }
.task-poster { width: 44px; height: 60px; flex: 0 0 44px; border-radius: 6px; overflow: hidden; background: var(--surface-muted); }
.task-info { min-width: 0; }
.task-title { overflow: hidden; color: var(--text-primary); font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.task-speed { color: var(--text-secondary); font-size: 12px; }
.progress-value { margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
.mobile-task-list { display: grid; gap: 8px; }
.mobile-task { border-bottom: 1px solid var(--border-subtle); border-radius: 0; }
.task-title--mobile { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style>
