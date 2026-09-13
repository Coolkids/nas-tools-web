<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { QTableColumn } from 'quasar'
import { getTransferHistory, deleteHistory, reIdentification, restoreHistory, type TransferHistoryItem } from '@/api/rename'
import { mediaDetail } from '@/api/discovery'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'

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

const columns: QTableColumn<TransferHistoryItem>[] = [
  { name: 'media', label: '媒体信息', field: 'TITLE', align: 'left' },
  { name: 'file', label: '文件信息', field: 'SOURCE_FILENAME', align: 'left' },
  { name: 'time', label: '时间', field: 'DATE', align: 'left', sortable: true },
  { name: 'actions', label: '操作', field: 'ID', align: 'right' }
]

function goToFileManager(path: string) { if (path) router.push({ name: 'mediafile', query: { path } }) }
onMounted(load)

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await getTransferHistory({ page: currentPage.value, keyword: keyword.value, pagenum: pageSize })
    if (response.code === 0) { list.value = response.result || []; total.value = response.total || 0; loadPosters(list.value) }
    else loadError.value = response.msg || '加载转移历史失败'
  } catch (error) { loadError.value = error instanceof Error ? error.message : '加载转移历史失败' }
  finally { loading.value = false }
}

function doSearch() { currentPage.value = 1; load() }
function pageChange(page: number) { currentPage.value = page; load() }
function loadPosters(rows: TransferHistoryItem[]) {
  const tasks = rows.filter((row) => row.TMDBID && !(String(row.TMDBID) in posters.value)).map(async (row) => {
    const key = String(row.TMDBID)
    try { const response = await mediaDetail(row.TYPE === '电影' ? 'MOV' : 'TV', key); posters.value[key] = response.code === 0 && response.data?.image ? response.data.image : '' }
    catch { posters.value[key] = '' }
  })
  Promise.allSettled(tasks)
}
function posterUrl(row: TransferHistoryItem) { return row.TMDBID ? posters.value[String(row.TMDBID)] || '' : '' }
function tmdbUrl(row: TransferHistoryItem) { return row.TMDBID ? `https://www.themoviedb.org/${row.TYPE === '电影' ? 'movie' : 'tv'}/${row.TMDBID}` : '' }
function isMoveType(row: TransferHistoryItem) { return row.RMT_MODE === 'move' || row.MODE === 'move' || row.SYNC_MODE === 'move' }
function isSelected(row: TransferHistoryItem) { return selected.value.some((item) => item.ID === row.ID) }
function toggleSelected(row: TransferHistoryItem) { selected.value = isSelected(row) ? selected.value.filter((item) => item.ID !== row.ID) : [...selected.value, row] }

async function reIdentify(rows: TransferHistoryItem[]) {
  if (!rows.length) { modal.warning('请先选择记录'); return }
  actionBusy.value = true
  modal.showLoading('重新识别中…')
  try { const response = await reIdentification('history', rows.map((row) => row.ID)); response.retcode === 0 ? modal.success(response.retmsg || '重新识别成功') : modal.warning(response.retmsg || '识别失败'); await load() }
  catch (error) { modal.error(error instanceof Error ? error.message : '识别失败') }
  finally { actionBusy.value = false; modal.hideLoading() }
}

async function remove(flag: 'del_source' | 'del_dest' | 'del_all', rows: TransferHistoryItem[]) {
  if (!rows.length) { modal.warning('请先选择记录'); return }
  const label = flag === 'del_all' ? '源文件及媒体库' : flag === 'del_source' ? '源' : '媒体库'
  const name = rows.map((row) => `${row.TITLE} (${row.YEAR}) ${row.SEASON_EPISODE || ''}`).join('、')
  if (!await modal.confirm(`${name} 对应${label}文件将被同步删除，是否确认？`, '删除转移记录')) return
  actionBusy.value = true
  try { const response = await deleteHistory(flag, rows.map((row) => row.ID)); if (response.code === 0) { modal.success('删除成功'); selected.value = []; await load() } else modal.error(response.msg || '删除失败') }
  catch (error) { modal.error(error instanceof Error ? error.message : '删除失败') }
  finally { actionBusy.value = false }
}

async function restore(row: TransferHistoryItem) {
  if (!await modal.confirm(`确认恢复 ${row.TITLE} (${row.YEAR}) ${row.SEASON_EPISODE || ''} 的源文件？`, '恢复源文件')) return
  modal.showLoading('恢复中…')
  try { const response = await restoreHistory(row.ID); response.retcode === 0 ? modal.success(response.retmsg || '恢复成功') : modal.error(response.retmsg || '恢复失败'); await load() }
  catch (error) { modal.error(error instanceof Error ? error.message : '恢复失败') }
  finally { modal.hideLoading() }
}
async function batchRestore(rows: TransferHistoryItem[]) {
  const movable = rows.filter(isMoveType)
  if (!movable.length) { modal.warning('所选记录中没有可恢复的移动类型'); return }
  if (!await modal.confirm(`确认恢复以下 ${movable.length} 条记录的源文件？\n${movable.map((row) => row.TITLE).join('、')}`, '批量恢复')) return
  modal.showLoading('批量恢复中…')
  try { for (const row of movable) await restoreHistory(row.ID); modal.success('批量恢复成功'); selected.value = []; await load() }
  catch (error) { modal.error(error instanceof Error ? error.message : '批量恢复失败') }
  finally { modal.hideLoading() }
}
</script>

<template>
  <div class="page-shell history">
    <PageHeader title="转移历史" description="文件整理转移记录">
      <template #actions><q-input v-model="keyword" outlined dense clearable class="search-input" placeholder="搜索标题…" @keyup.enter="doSearch"><template #prepend><q-icon name="search" /></template></q-input><q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" /><q-btn color="primary" unelevated icon="manage_search" label="重新识别" :disable="!selected.length || actionBusy" @click="reIdentify(selected)" /><q-btn flat icon="restore" label="批量恢复" :disable="!selected.length || actionBusy" @click="batchRestore(selected)" /><q-btn-dropdown color="negative" unelevated icon="delete" label="批量删除" :disable="!selected.length || actionBusy"><q-list><q-item clickable v-close-popup @click="remove('del_source', selected)"><q-item-section>删除源文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_dest', selected)"><q-item-section>删除媒体库文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_all', selected)"><q-item-section>删除源及媒体库文件</q-item-section></q-item></q-list></q-btn-dropdown></template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="primary" label="重试" @click="load" /></template></q-banner>
    <q-card flat bordered class="history-card">
      <q-table v-if="!$q.screen.lt.sm" v-model:selected="selected" flat selection="multiple" :rows="list" :columns="columns" row-key="ID" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有转移历史">
        <template #body-cell-media="slotProps"><q-td :props="slotProps"><div class="media-cell"><q-img v-if="posterUrl(slotProps.row)" :src="posterUrl(slotProps.row)" fit="cover" class="poster"><template #error><div class="poster-placeholder"><q-icon name="movie" /></div></template></q-img><div v-else class="poster poster-placeholder"><q-icon :name="slotProps.row.TYPE === '电影' ? 'movie' : 'tv'" /></div><div class="media-info"><a v-if="slotProps.row.TMDBID" :href="tmdbUrl(slotProps.row)" target="_blank" rel="noreferrer" class="media-title">{{ slotProps.row.TITLE }} ({{ slotProps.row.YEAR }})</a><div v-else class="media-title">{{ slotProps.row.TITLE }} ({{ slotProps.row.YEAR }})</div><div v-if="slotProps.row.SEASON_EPISODE" class="text-caption text-warning">{{ slotProps.row.SEASON_EPISODE }}</div><div v-if="slotProps.row.CATEGORY" class="text-caption text-secondary">类别：{{ slotProps.row.CATEGORY }}</div></div></div></q-td></template>
        <template #body-cell-file="slotProps"><q-td :props="slotProps"><div class="file-line" :title="slotProps.row.SOURCE_FILENAME || '—'">{{ slotProps.row.SOURCE_FILENAME || '—' }}</div><div v-if="slotProps.row.DEST_PATH || slotProps.row.DEST_FILENAME" class="file-line text-positive" :title="slotProps.row.DEST_FILENAME || slotProps.row.DEST_PATH"><span class="text-secondary">› </span><span class="dest-link" @click="goToFileManager(slotProps.row.DEST_PATH)">{{ slotProps.row.DEST_FILENAME || slotProps.row.DEST_PATH }}</span></div></q-td></template>
        <template #body-cell-time="slotProps"><q-td :props="slotProps"><div class="time-cell"><span>{{ slotProps.row.DATE }}</span><span class="text-caption text-secondary">来自：{{ slotProps.row.SOURCE || '—' }}</span><span class="text-caption text-secondary">方式：{{ slotProps.row.SYNC_MODE || slotProps.row.MODE || '—' }}</span></div></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><q-btn-dropdown flat dense color="primary" label="更多"><q-list><q-item clickable v-close-popup @click="reIdentify([slotProps.row])"><q-item-section>重新识别</q-item-section></q-item><q-item v-if="isMoveType(slotProps.row)" clickable v-close-popup @click="restore(slotProps.row)"><q-item-section>恢复</q-item-section></q-item><template v-else><q-item clickable v-close-popup @click="remove('del_source', [slotProps.row])"><q-item-section>删除源文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_dest', [slotProps.row])"><q-item-section>删除媒体库文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_all', [slotProps.row])"><q-item-section>删除源及媒体库文件</q-item-section></q-item></template></q-list></q-btn-dropdown></q-td></template>
      </q-table>
      <div v-else class="mobile-history-list"><q-card v-for="row in list" :key="row.ID" flat bordered class="history-item"><q-card-section class="row no-wrap q-gutter-sm"><q-checkbox :model-value="isSelected(row)" color="primary" class="self-start" @update:model-value="toggleSelected(row)" /><q-img v-if="posterUrl(row)" :src="posterUrl(row)" fit="cover" class="poster mobile-poster"><template #error><div class="poster-placeholder"><q-icon name="movie" /></div></template></q-img><div v-else class="poster mobile-poster poster-placeholder"><q-icon :name="row.TYPE === '电影' ? 'movie' : 'tv'" /></div><div class="col min-width-0"><a v-if="row.TMDBID" :href="tmdbUrl(row)" target="_blank" rel="noreferrer" class="media-title ellipsis-2-lines">{{ row.TITLE }} ({{ row.YEAR }})</a><div v-else class="media-title ellipsis-2-lines">{{ row.TITLE }} ({{ row.YEAR }})</div><div v-if="row.SEASON_EPISODE" class="text-caption text-warning q-mt-xs">{{ row.SEASON_EPISODE }}</div><div class="file-line q-mt-sm" :title="row.SOURCE_FILENAME || '—'">{{ row.SOURCE_FILENAME || '—' }}</div><div v-if="row.DEST_FILENAME" class="file-line text-positive" :title="row.DEST_FILENAME">› {{ row.DEST_FILENAME }}</div><div class="text-caption text-secondary q-mt-xs">{{ row.DATE }} · {{ row.SYNC_MODE || row.MODE || '—' }}</div></div></q-card-section><q-separator /><q-card-actions align="right"><q-btn flat color="primary" icon="manage_search" label="识别" @click="reIdentify([row])" /><q-btn v-if="isMoveType(row)" flat color="primary" icon="restore" label="恢复" @click="restore(row)" /><q-btn-dropdown flat color="negative" label="删除"><q-list><q-item clickable v-close-popup @click="remove('del_source', [row])"><q-item-section>删除源文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_dest', [row])"><q-item-section>删除媒体库文件</q-item-section></q-item><q-item clickable v-close-popup @click="remove('del_all', [row])"><q-item-section>删除源及媒体库文件</q-item-section></q-item></q-list></q-btn-dropdown></q-card-actions></q-card><q-item v-if="!loading && !list.length"><q-item-section class="text-center text-secondary q-py-xl">没有转移历史</q-item-section></q-item></div>
      <q-separator v-if="total > pageSize" /><div v-if="total > pageSize" class="row justify-center q-pa-md"><q-pagination v-model="currentPage" :max="Math.ceil(total / pageSize)" :max-pages="7" direction-links boundary-links @update:model-value="pageChange" /></div>
    </q-card>
  </div>
</template>

<style scoped>
.history { max-width: 1600px; margin: 0 auto; }
.search-input { width: min(220px, 42vw); }
.history-card { overflow: hidden; }
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
.mobile-history-list { display: grid; gap: 10px; padding: 12px; }
.history-item { border-radius: 12px; }
.min-width-0 { min-width: 0; }
</style>
