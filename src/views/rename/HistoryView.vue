<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import type { QTableColumn } from 'quasar'
import { getTransferHistory, deleteHistory, reIdentification, restoreHistory, type TransferHistoryItem } from '@/api/rename'
import { mediaDetail } from '@/api/discovery'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import { getPageScrollTarget, getPageScrollTop, type PageScrollTarget } from '@/utils/pageScroll'

const $q = useQuasar()
const modal = useModalStore()
const router = useRouter()
const list = ref<TransferHistoryItem[]>([])
const selected = ref<TransferHistoryItem[]>([])
const loading = ref(false)
const loadError = ref('')
const total = ref(0)
const currentPage = ref(1)
const pageSize = 30
const keyword = ref('')
const posters = ref<Record<string, string>>({})
const actionBusy = ref(false)
const hasMore = ref(false)
const mobileSearchExpanded = ref(false)
const mobileSearchButtonVisible = ref(false)
const lastLoadWasAppend = ref(false)
let pendingReload = false
let loadGeneration = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let scroller: PageScrollTarget | null = null

const columns: QTableColumn<TransferHistoryItem>[] = [
  { name: 'media', label: '媒体信息', field: 'TITLE', align: 'left' },
  { name: 'file', label: '文件信息', field: 'SOURCE_FILENAME', align: 'left' },
  { name: 'time', label: '时间', field: 'DATE', align: 'left', sortable: true },
  { name: 'actions', label: '操作', field: 'ID', align: 'right' }
]

function goToFileManager(path: string) {
  if (path) void router.push({ name: 'mediafile', query: { path } })
}

onMounted(() => {
  void load()
  scroller = getPageScrollTarget()
  scroller.addEventListener('scroll', updateMobileSearchButton, { passive: true })
  updateMobileSearchButton()
})

onBeforeUnmount(() => {
  scroller?.removeEventListener('scroll', updateMobileSearchButton)
  if (searchTimer) clearTimeout(searchTimer)
})

async function load(append = false): Promise<boolean> {
  if (loading.value) {
    if (!append) pendingReload = true
    return false
  }
  const requestGeneration = loadGeneration
  const requestPage = currentPage.value
  const requestKeyword = keyword.value
  loading.value = true
  lastLoadWasAppend.value = append
  loadError.value = ''
  try {
    const response = await getTransferHistory({ page: currentPage.value, keyword: keyword.value, pagenum: pageSize })
    if (requestGeneration !== loadGeneration || requestPage !== currentPage.value || requestKeyword !== keyword.value) return false
    if (response.code !== 0) {
      loadError.value = response.msg || '加载转移历史失败'
      hasMore.value = false
      return false
    }

    const rows = response.result || []
    if (append) {
      const existingIds = new Set(list.value.map((row) => row.ID))
      list.value = [...list.value, ...rows.filter((row) => !existingIds.has(row.ID))]
    } else {
      list.value = rows
    }
    total.value = response.total || 0
    const totalPages = response.totalPage || Math.ceil(total.value / pageSize)
    hasMore.value = rows.length > 0 && currentPage.value < totalPages
    loadPosters(rows)
    return true
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载转移历史失败'
    hasMore.value = false
    return false
  } finally {
    loading.value = false
    if (pendingReload) {
      pendingReload = false
      void load()
    }
  }
}

function resetMobileList() {
  currentPage.value = 1
  list.value = []
  selected.value = []
  hasMore.value = false
}

function doSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  loadGeneration += 1
  resetMobileList()
  void load()
}

function refreshHistory() {
  if ($q.screen.lt.sm) {
    loadGeneration += 1
    resetMobileList()
  }
  void load()
}

async function reloadAfterAction() {
  if ($q.screen.lt.sm) {
    loadGeneration += 1
    resetMobileList()
  }
  await load()
}

function pageChange(page: number) {
  currentPage.value = page
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
  currentPage.value += 1
  const loaded = await load(true)
  done(!loaded || !hasMore.value)
}

function retryLoad() {
  void load(lastLoadWasAppend.value)
}

function updateMobileSearchButton() {
  mobileSearchButtonVisible.value = Boolean(scroller && getPageScrollTop(scroller) > 180)
}

function openMobileSearch() { mobileSearchExpanded.value = true }
function closeMobileSearch() { mobileSearchExpanded.value = false }
function submitMobileSearch() { doSearch(); closeMobileSearch() }

function scheduleMobileSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(doSearch, 350)
}

function loadPosters(rows: TransferHistoryItem[]) {
  const tasks = rows
    .filter((row) => row.TMDBID && !(String(row.TMDBID) in posters.value))
    .map(async (row) => {
      const key = String(row.TMDBID)
      try {
        const response = await mediaDetail(row.TYPE === '电影' ? 'MOV' : 'TV', key)
        posters.value[key] = response.code === 0 && response.data?.image ? response.data.image : ''
      } catch {
        posters.value[key] = ''
      }
    })
  Promise.allSettled(tasks)
}

function posterUrl(row: TransferHistoryItem) { return row.TMDBID ? posters.value[String(row.TMDBID)] || '' : '' }
function tmdbUrl(row: TransferHistoryItem) { return row.TMDBID ? `https://www.themoviedb.org/${row.TYPE === '电影' ? 'movie' : 'tv'}/${row.TMDBID}` : '' }
function isMoveType(row: TransferHistoryItem) { return row.RMT_MODE === 'move' || row.MODE === 'move' || row.SYNC_MODE === 'move' }
function isSelected(row: TransferHistoryItem) { return selected.value.some((item) => item.ID === row.ID) }
function toggleSelected(row: TransferHistoryItem) {
  selected.value = isSelected(row) ? selected.value.filter((item) => item.ID !== row.ID) : [...selected.value, row]
}

async function reIdentify(rows: TransferHistoryItem[]) {
  if (!rows.length) { modal.warning('请先选择记录'); return }
  actionBusy.value = true
  modal.showLoading('重新识别中…')
  try {
    const response = await reIdentification('history', rows.map((row) => row.ID))
    response.retcode === 0 ? modal.success(response.retmsg || '重新识别成功') : modal.warning(response.retmsg || '识别失败')
    await reloadAfterAction()
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '识别失败')
  } finally {
    actionBusy.value = false
    modal.hideLoading()
  }
}

async function remove(flag: 'del_source' | 'del_dest' | 'del_all', rows: TransferHistoryItem[]) {
  if (!rows.length) { modal.warning('请先选择记录'); return }
  const label = flag === 'del_all' ? '源文件及媒体库' : flag === 'del_source' ? '源' : '媒体库'
  const name = rows.map((row) => `${row.TITLE} (${row.YEAR}) ${row.SEASON_EPISODE || ''}`).join('、')
  if (!await modal.confirm(`${name} 对应${label}文件将被同步删除，是否确认？`, '删除转移记录')) return
  actionBusy.value = true
  try {
    const response = await deleteHistory(flag, rows.map((row) => row.ID))
    if (response.code === 0) {
      modal.success('删除成功')
      selected.value = []
      await reloadAfterAction()
    } else modal.error(response.msg || '删除失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '删除失败')
  } finally {
    actionBusy.value = false
  }
}

async function restore(row: TransferHistoryItem) {
  if (!await modal.confirm(`确认恢复 ${row.TITLE} (${row.YEAR}) ${row.SEASON_EPISODE || ''} 的源文件？`, '恢复源文件')) return
  modal.showLoading('恢复中…')
  try {
    const response = await restoreHistory(row.ID)
    response.retcode === 0 ? modal.success(response.retmsg || '恢复成功') : modal.error(response.retmsg || '恢复失败')
    await reloadAfterAction()
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '恢复失败')
  } finally {
    modal.hideLoading()
  }
}

async function batchRestore(rows: TransferHistoryItem[]) {
  const movable = rows.filter(isMoveType)
  if (!movable.length) { modal.warning('所选记录中没有可恢复的移动类型'); return }
  if (!await modal.confirm(`确认恢复以下 ${movable.length} 条记录的源文件？\n${movable.map((row) => row.TITLE).join('、')}`, '批量恢复')) return
  modal.showLoading('批量恢复中…')
  try {
    for (const row of movable) await restoreHistory(row.ID)
    modal.success('批量恢复成功')
    selected.value = []
    await reloadAfterAction()
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '批量恢复失败')
  } finally {
    modal.hideLoading()
  }
}
</script>

<template>
  <div class="page-shell history">
    <PageHeader title="转移历史" description="文件整理转移记录">
      <template #actions>
        <div v-if="$q.screen.lt.sm" class="mobile-history-actions">
          <q-btn dense unelevated color="primary" icon="search" label="查询" aria-label="按标题过滤" @click="openMobileSearch"><q-tooltip>按标题过滤</q-tooltip></q-btn>
          <q-btn dense outline icon="refresh" label="刷新" aria-label="刷新" :loading="loading" @click="refreshHistory"><q-tooltip>刷新</q-tooltip></q-btn>
          <q-btn dense color="primary" unelevated icon="manage_search" label="识别" aria-label="重新识别" :disable="!selected.length || actionBusy" @click="reIdentify(selected)"><q-tooltip>重新识别</q-tooltip></q-btn>
          <q-btn dense flat icon="restore" label="恢复" aria-label="批量恢复" :disable="!selected.length || actionBusy" @click="batchRestore(selected)"><q-tooltip>批量恢复</q-tooltip></q-btn>
          <q-btn-dropdown dense color="negative" unelevated icon="delete" label="删除" dropdown-icon="expand_more" aria-label="批量删除" :disable="!selected.length || actionBusy">
            <q-list>
              <q-item clickable v-close-popup @click="remove('del_source', selected)"><q-item-section>删除源文件</q-item-section></q-item>
              <q-item clickable v-close-popup @click="remove('del_dest', selected)"><q-item-section>删除媒体库文件</q-item-section></q-item>
              <q-item clickable v-close-popup @click="remove('del_all', selected)"><q-item-section>删除源及媒体库文件</q-item-section></q-item>
            </q-list>
          </q-btn-dropdown>
        </div>
        <template v-else>
          <q-input v-model="keyword" outlined dense clearable class="search-input" placeholder="搜索标题…" @keyup.enter="doSearch"><template #prepend><q-icon name="search" /></template></q-input>
          <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="refreshHistory" />
          <q-btn color="primary" unelevated icon="manage_search" label="重新识别" :disable="!selected.length || actionBusy" @click="reIdentify(selected)" />
          <q-btn flat icon="restore" label="批量恢复" :disable="!selected.length || actionBusy" @click="batchRestore(selected)" />
          <q-btn-dropdown color="negative" unelevated icon="delete" label="批量删除" :disable="!selected.length || actionBusy">
            <q-list>
              <q-item clickable v-close-popup @click="remove('del_source', selected)"><q-item-section>删除源文件</q-item-section></q-item>
              <q-item clickable v-close-popup @click="remove('del_dest', selected)"><q-item-section>删除媒体库文件</q-item-section></q-item>
              <q-item clickable v-close-popup @click="remove('del_all', selected)"><q-item-section>删除源及媒体库文件</q-item-section></q-item>
            </q-list>
          </q-btn-dropdown>
        </template>
      </template>
    </PageHeader>

    <Transition name="mobile-search-panel">
      <q-card v-if="$q.screen.lt.sm && mobileSearchExpanded" flat bordered class="mobile-search-panel">
        <q-form class="mobile-search-form" @submit.prevent="submitMobileSearch">
          <q-input v-model="keyword" autofocus outlined dense clearable class="mobile-search-input" placeholder="按标题快速过滤" @update:model-value="scheduleMobileSearch"><template #prepend><q-icon name="search" /></template></q-input>
          <q-btn round dense unelevated color="primary" icon="search" type="submit" aria-label="查询" />
          <q-btn round dense flat icon="close" aria-label="关闭查询" @click="closeMobileSearch" />
        </q-form>
      </q-card>
    </Transition>
    <Transition name="mobile-search-button">
      <q-btn v-if="$q.screen.lt.sm && mobileSearchButtonVisible && !mobileSearchExpanded" round unelevated color="primary" icon="search" class="mobile-search-button" aria-label="按标题过滤" @click="openMobileSearch"><q-tooltip>按标题过滤</q-tooltip></q-btn>
    </Transition>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="primary" label="重试" @click="retryLoad" /></template></q-banner>
    <q-card flat bordered class="history-card">
      <q-table v-if="!$q.screen.lt.sm" v-model:selected="selected" flat selection="multiple" :rows="list" :columns="columns" row-key="ID" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有转移历史">
        <template #body-cell-media="slotProps"><q-td :props="slotProps"><div class="media-cell"><q-img v-if="posterUrl(slotProps.row)" :src="posterUrl(slotProps.row)" fit="cover" class="poster"><template #error><div class="poster-placeholder"><q-icon name="movie" /></div></template></q-img><div v-else class="poster poster-placeholder"><q-icon :name="slotProps.row.TYPE === '电影' ? 'movie' : 'tv'" /></div><div class="media-info"><a v-if="slotProps.row.TMDBID" :href="tmdbUrl(slotProps.row)" target="_blank" rel="noreferrer" class="media-title">{{ slotProps.row.TITLE }} ({{ slotProps.row.YEAR }})</a><div v-else class="media-title">{{ slotProps.row.TITLE }} ({{ slotProps.row.YEAR }})</div><div v-if="slotProps.row.SEASON_EPISODE" class="text-caption text-warning">{{ slotProps.row.SEASON_EPISODE }}</div><div v-if="slotProps.row.CATEGORY" class="text-caption text-secondary">类别：{{ slotProps.row.CATEGORY }}</div></div></div></q-td></template>
        <template #body-cell-file="slotProps"><q-td :props="slotProps"><div class="file-line" :title="slotProps.row.SOURCE_FILENAME || '—'">{{ slotProps.row.SOURCE_FILENAME || '—' }}<q-tooltip v-if="slotProps.row.SOURCE_FILENAME">{{ slotProps.row.SOURCE_FILENAME }}</q-tooltip></div><div v-if="slotProps.row.DEST_PATH || slotProps.row.DEST_FILENAME" class="file-line text-positive" :title="slotProps.row.DEST_FILENAME || slotProps.row.DEST_PATH"><span class="text-secondary">› </span><span class="dest-link" @click="goToFileManager(slotProps.row.DEST_PATH)">{{ slotProps.row.DEST_FILENAME || slotProps.row.DEST_PATH }}</span><q-tooltip>{{ slotProps.row.DEST_FILENAME || slotProps.row.DEST_PATH }}</q-tooltip></div></q-td></template>
        <template #body-cell-time="slotProps"><q-td :props="slotProps"><div class="time-cell"><span>{{ slotProps.row.DATE }}</span><span class="text-caption text-secondary">来自：{{ slotProps.row.SOURCE || '—' }}</span><span class="text-caption text-secondary">方式：{{ slotProps.row.SYNC_MODE || slotProps.row.MODE || '—' }}</span></div></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><q-btn-dropdown flat dense color="primary" label="更多"><q-list><q-item clickable v-close-popup @click="reIdentify([slotProps.row])"><q-item-section>重新识别</q-item-section></q-item><q-item v-if="isMoveType(slotProps.row)" clickable v-close-popup @click="restore(slotProps.row)"><q-item-section>恢复</q-item-section></q-item><template v-else><q-item clickable v-close-popup @click="remove('del_source', [slotProps.row])"><q-item-section>删除源文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_dest', [slotProps.row])"><q-item-section>删除媒体库文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_all', [slotProps.row])"><q-item-section>删除源及媒体库文件</q-item-section></q-item></template></q-list></q-btn-dropdown></q-td></template>
      </q-table>

      <div v-else class="mobile-history-list">
        <div v-if="loading && !list.length" class="mobile-list-state"><q-spinner-dots color="primary" size="28px" /><span>加载中…</span></div>
        <q-infinite-scroll v-else-if="list.length || hasMore" class="mobile-history-scroll" :offset="180" :disable="!hasMore" @load="loadNextPage">
          <q-card v-for="row in list" :key="row.ID" flat bordered class="history-item">
            <q-card-section class="history-item-content">
              <div class="history-item-summary">
                <q-checkbox :model-value="isSelected(row)" color="primary" class="self-start history-checkbox" @update:model-value="toggleSelected(row)" />
                <q-img v-if="posterUrl(row)" :src="posterUrl(row)" fit="cover" class="poster mobile-poster"><template #error><div class="poster-placeholder"><q-icon name="movie" /></div></template></q-img>
                <div v-else class="poster mobile-poster poster-placeholder"><q-icon :name="row.TYPE === '电影' ? 'movie' : 'tv'" /></div>
                <div class="history-item-media col min-width-0">
                  <a v-if="row.TMDBID" :href="tmdbUrl(row)" target="_blank" rel="noreferrer" class="media-title ellipsis-2-lines">{{ row.TITLE }} ({{ row.YEAR }})</a>
                  <div v-else class="media-title ellipsis-2-lines">{{ row.TITLE }} ({{ row.YEAR }})</div>
                  <div v-if="row.SEASON_EPISODE" class="text-caption text-warning q-mt-xs">{{ row.SEASON_EPISODE }}</div>
                  <div class="text-caption text-secondary q-mt-xs">{{ row.DATE }} · {{ row.SYNC_MODE || row.MODE || '—' }}</div>
                </div>
              </div>
              <div class="mobile-file-details">
                <div class="mobile-file-line"><span class="mobile-file-label">源文件</span><span class="mobile-file-name">{{ row.SOURCE_FILENAME || '—' }}</span></div>
                <div v-if="row.DEST_FILENAME || row.DEST_PATH" class="mobile-file-line text-positive"><span class="mobile-file-label text-secondary">目标</span><span class="mobile-file-name dest-link" @click="goToFileManager(row.DEST_PATH)">{{ row.DEST_FILENAME || row.DEST_PATH }}</span></div>
              </div>
            </q-card-section>
            <q-separator />
            <q-card-actions align="right" class="history-item-actions">
              <q-btn dense flat color="primary" icon="manage_search" label="识别" @click="reIdentify([row])" />
              <q-btn v-if="isMoveType(row)" dense flat color="primary" icon="restore" label="恢复" @click="restore(row)" />
              <q-btn-dropdown dense flat color="negative" icon="delete" dropdown-icon="expand_more" aria-label="删除"><q-list><q-item clickable v-close-popup @click="remove('del_source', [row])"><q-item-section>删除源文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_dest', [row])"><q-item-section>删除媒体库文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_all', [row])"><q-item-section>删除源及媒体库文件</q-item-section></q-item></q-list></q-btn-dropdown>
            </q-card-actions>
          </q-card>
          <template #loading><div class="mobile-list-loading"><q-spinner-dots color="primary" size="24px" /><span>加载下一页…</span></div></template>
        </q-infinite-scroll>
        <q-item v-else-if="!loading"><q-item-section class="text-center text-secondary q-py-xl">没有转移历史</q-item-section></q-item>
        <div v-if="list.length && !hasMore && !loading" class="mobile-list-end">已加载全部 {{ list.length }} 条记录</div>
      </div>

      <q-separator v-if="!$q.screen.lt.sm && total > pageSize" />
      <div v-if="!$q.screen.lt.sm && total > pageSize" class="row justify-center q-pa-md"><q-pagination v-model="currentPage" :max="Math.ceil(total / pageSize)" :max-pages="7" direction-links boundary-links @update:model-value="pageChange" /></div>
    </q-card>
    <ScrollToTop />
  </div>
</template>

<style scoped>
.history { width: 100%; max-width: 1600px; min-width: 0; margin: 0 auto; }
.search-input { width: min(220px, 42vw); }
.history-card { max-width: 100%; min-width: 0; overflow: hidden; }
.media-cell { display: flex; align-items: center; gap: 10px; min-width: 240px; }
.poster { width: 48px; height: 68px; flex: 0 0 auto; border-radius: 5px; background: var(--surface-muted); }
.mobile-poster { width: 58px; height: 84px; }
.poster-placeholder { display: grid; place-items: center; color: var(--text-secondary); }
.media-info { min-width: 0; }
.media-title { color: var(--q-primary); font-weight: 600; text-decoration: none; }
.media-title:hover, .dest-link:hover { text-decoration: underline; }
.file-line { overflow: hidden; max-width: 520px; color: var(--text-primary); font-size: 13px; line-height: 1.55; text-overflow: ellipsis; white-space: nowrap; }
.dest-link { cursor: pointer; }
.time-cell { display: grid; gap: 3px; color: var(--text-primary); font-size: 12px; }
.mobile-history-list { display: grid; gap: 8px; padding: 8px; min-width: 0; max-width: 100%; box-sizing: border-box; }
.mobile-history-scroll { display: grid; gap: 8px; min-width: 0; max-width: 100%; }
.history-item { width: 100%; max-width: 100%; min-width: 0; border-radius: 10px; overflow: hidden; }
.history-item-content { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px; gap: 8px; }
.history-item-summary { display: flex; align-items: flex-start; min-width: 0; gap: 8px; }
.history-item-media { min-width: 0; padding-top: 1px; }
.mobile-file-details { display: grid; gap: 5px; min-width: 0; margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--border-subtle); }
.mobile-file-line { display: flex; align-items: flex-start; min-width: 0; gap: 6px; color: var(--text-primary); font-size: 12px; line-height: 1.45; }
.mobile-file-label { flex: 0 0 auto; color: var(--text-secondary); }
.mobile-file-name { min-width: 0; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.history-checkbox { flex: 0 0 auto; }
.history-item-actions { min-height: 36px; padding: 3px 6px; }
.min-width-0 { min-width: 0; }
.mobile-list-state, .mobile-list-loading, .mobile-list-end { display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text-secondary); font-size: 13px; }
.mobile-list-state { min-height: 160px; }
.mobile-list-loading { padding: 10px 0 4px; }
.mobile-list-end { padding: 8px 0 4px; }
.mobile-search-button { position: fixed; top: calc(var(--app-header-height) + 8px); right: 16px; z-index: 20; box-shadow: 0 4px 12px rgba(23, 32, 51, .18); }
.mobile-search-panel { position: fixed; top: calc(var(--app-header-height) + 8px); right: 16px; z-index: 30; width: calc(100vw - 32px); max-width: 460px; background: var(--surface); border-color: var(--border-subtle); box-shadow: 0 12px 32px rgba(23, 32, 51, .2); }
.mobile-search-form { display: flex; align-items: center; gap: 6px; padding: 8px; }
.mobile-search-input { flex: 1; min-width: 0; }
.mobile-search-button-enter-active, .mobile-search-button-leave-active, .mobile-search-panel-enter-active, .mobile-search-panel-leave-active { transition: opacity .16s ease, transform .16s ease; }
.mobile-search-button-enter-from, .mobile-search-button-leave-to, .mobile-search-panel-enter-from, .mobile-search-panel-leave-to { opacity: 0; transform: translateY(-6px); }

@media (max-width: 599px) {
  .mobile-history-actions { display: flex; width: 100%; align-items: center; flex-wrap: nowrap; gap: 4px; overflow-x: auto; scrollbar-width: none; }
  .mobile-history-actions::-webkit-scrollbar { display: none; }
  .mobile-history-actions :deep(.q-btn) { min-width: auto; min-height: 36px !important; flex: 0 0 auto; padding: 0 8px; white-space: nowrap; }
  .history-item-content :deep(.q-checkbox) { padding: 0; }
  .mobile-poster { width: 46px; height: 66px; }
  .mobile-file-details { margin-top: 8px; padding-top: 7px; }
  .mobile-file-line { font-size: 12px; }
  .history-item-actions :deep(.q-btn) { min-height: 32px; padding-inline: 7px; font-size: 12px; }
  .history-item-actions :deep(.q-btn__content) { gap: 4px; }
}
</style>
