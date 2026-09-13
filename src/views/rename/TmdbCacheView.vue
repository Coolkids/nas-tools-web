<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRouter } from 'vue-router'
import type { QTableColumn } from 'quasar'
import { getTmdbCache, deleteTmdbCache, modifyTmdbCache, clearTmdbCache, type TmdbCacheItem } from '@/api/rename'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import ImagePreviewDialog from '@/components/ImagePreviewDialog.vue'
import { getPageScrollTarget, getPageScrollTop, type PageScrollTarget } from '@/utils/pageScroll'

const $q = useQuasar()
const modal = useModalStore()
const router = useRouter()
const list = ref<TmdbCacheItem[]>([])
const loading = ref(false)
const loadError = ref('')
const total = ref(0)
const currentPage = ref(1)
const pageSize = 30
const keyword = ref('')
const hasMore = ref(false)
const mobileSearchExpanded = ref(false)
const mobileSearchButtonVisible = ref(false)
const lastLoadWasAppend = ref(false)
let pendingReload = false
let loadGeneration = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let scroller: PageScrollTarget | null = null

const modifyVisible = ref(false)
const modifying = ref(false)
const modifyKey = ref('')
const modifyTitle = ref('')
const previewVisible = ref(false)
const previewImage = ref('')

const columns: QTableColumn<TmdbCacheItem>[] = [
  { name: 'index', label: '索引', field: (item) => item[2], align: 'left' },
  { name: 'title', label: '标题', field: (item) => item[1].title, align: 'left', sortable: true },
  { name: 'tmdb', label: 'TMDB', field: (item) => item[1].id, align: 'left' },
  { name: 'poster', label: '海报', field: (item) => item[1].poster_path, align: 'left' },
  { name: 'actions', label: '操作', field: (item) => item[0], align: 'right' }
]

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
    const response = await getTmdbCache({ page: requestPage, keyword: requestKeyword, pagenum: pageSize })
    if (requestGeneration !== loadGeneration || requestPage !== currentPage.value || requestKeyword !== keyword.value) return false
    if (response.code !== 0) {
      loadError.value = response.msg || '加载 TMDB 缓存失败'
      hasMore.value = false
      return false
    }

    const rows = response.result || []
    if (append) {
      const existingKeys = new Set(list.value.map((item) => item[0]))
      list.value = [...list.value, ...rows.filter((item) => !existingKeys.has(item[0]))]
    } else {
      list.value = rows
    }
    total.value = response.total || 0
    const totalPages = response.totalPage || Math.ceil(total.value / pageSize)
    hasMore.value = rows.length > 0 && currentPage.value < totalPages
    return true
  } catch (error) {
    if (requestGeneration !== loadGeneration || requestPage !== currentPage.value || requestKeyword !== keyword.value) return false
    loadError.value = error instanceof Error ? error.message : '加载 TMDB 缓存失败'
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
  hasMore.value = false
}

function doSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  loadGeneration += 1
  resetMobileList()
  void load()
}

function refreshCache() {
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

function retryLoad() { void load(lastLoadWasAppend.value) }
function updateMobileSearchButton() { mobileSearchButtonVisible.value = Boolean(scroller && getPageScrollTop(scroller) > 180) }
function openMobileSearch() { mobileSearchExpanded.value = true }
function closeMobileSearch() { mobileSearchExpanded.value = false }
function submitMobileSearch() { doSearch(); closeMobileSearch() }
function scheduleMobileSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(doSearch, 350)
}

function posterUrl(item: TmdbCacheItem) { return item[1].poster_path ? `https://image.tmdb.org/t/p/w500${item[1].poster_path}` : '' }
function tmdbUrl(item: TmdbCacheItem) { return `https://www.themoviedb.org/${item[1].media_type === '电影' ? 'movie' : 'tv'}/${item[1].id}` }
function typeLabel(item: TmdbCacheItem) { return item[1].media_type === '电影' ? '电影' : '电视剧' }
function openPreview(item: TmdbCacheItem) {
  const url = posterUrl(item)
  if (url) { previewImage.value = url; previewVisible.value = true }
}
function openModify(item: TmdbCacheItem) {
  modifyKey.value = item[0]
  modifyTitle.value = item[1].title
  modifyVisible.value = true
}

async function submitModify() {
  if (!modifyTitle.value.trim()) { modal.warning('标题不能为空'); return }
  modifying.value = true
  try {
    const response = await modifyTmdbCache(modifyKey.value, modifyTitle.value.trim())
    if (response.code === 0) { modifyVisible.value = false; modal.success('修改成功'); await reloadAfterAction() }
    else modal.error(response.msg || '修改失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '修改失败') }
  finally { modifying.value = false }
}

async function remove(item: TmdbCacheItem) {
  const ok = await modal.confirm(`${item[2]} 对应的缓存 TMDB 条目将被删除，是否确认？`, '删除 TMDB 缓存')
  if (!ok) return
  try {
    const response = await deleteTmdbCache(item[0])
    if (response.code === 0) { modal.success('删除成功'); await reloadAfterAction() }
    else modal.error(response.msg || '删除失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '删除失败') }
}

async function clearAll() {
  const ok = await modal.confirm('清空 TMDB 缓存后会增加 API 请求次数和搜索响应时间，但可以解决改名后本地缓存未更新的问题，是否确认？', '清空 TMDB 缓存')
  if (!ok) return
  modal.showLoading('清理中…')
  try {
    const response = await clearTmdbCache()
    if (response.code === 0) { modal.success('TMDB 缓存清理完成'); await reloadAfterAction() }
    else modal.error(response.msg || '清理失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '清理失败') }
  finally { modal.hideLoading() }
}
</script>

<template>
  <div class="page-shell tmdb-cache">
    <PageHeader title="TMDB 缓存" description="本地 TMDB 识别缓存管理">
      <template #actions>
        <div v-if="$q.screen.lt.sm" class="mobile-cache-actions">
          <q-btn dense color="primary" unelevated icon="search" label="查询" aria-label="搜索缓存" @click="openMobileSearch"><q-tooltip>搜索缓存</q-tooltip></q-btn>
          <q-btn dense color="negative" unelevated icon="delete_sweep" label="清空" aria-label="清空缓存" @click="clearAll"><q-tooltip>清空缓存</q-tooltip></q-btn>
          <q-btn dense outline icon="refresh" label="刷新" aria-label="刷新" :loading="loading" @click="refreshCache"><q-tooltip>刷新</q-tooltip></q-btn>
        </div>
        <template v-else>
          <q-btn color="negative" unelevated icon="delete_sweep" label="清空缓存" @click="clearAll" />
          <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="refreshCache" />
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
      <q-btn v-if="$q.screen.lt.sm && mobileSearchButtonVisible && !mobileSearchExpanded" round unelevated color="primary" icon="search" class="mobile-search-button" aria-label="搜索缓存" @click="openMobileSearch"><q-tooltip>搜索缓存</q-tooltip></q-btn>
    </Transition>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="primary" label="重试" @click="retryLoad" /></template></q-banner>

    <q-card flat bordered class="cache-card">
      <q-card-section v-if="!$q.screen.lt.sm" class="cache-toolbar row items-center q-gutter-sm"><q-input v-model="keyword" outlined dense clearable class="search-input" placeholder="搜索缓存…" @keyup.enter="doSearch"><template #prepend><q-icon name="search" /></template></q-input><q-btn color="primary" unelevated icon="search" label="搜索" @click="doSearch" /><q-space /><span class="text-caption text-secondary">共 {{ total }} 条</span></q-card-section>
      <q-card-section v-else class="mobile-cache-total"><span>缓存记录</span><span class="text-caption text-secondary">共 {{ total }} 条</span></q-card-section>
      <q-separator />

      <q-table v-if="!$q.screen.lt.sm" flat :rows="list" :columns="columns" row-key="0" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有缓存记录">
        <template #body-cell-index="slotProps"><q-td :props="slotProps"><div class="index-cell"><q-icon :name="slotProps.row[1].media_type === '电影' ? 'movie' : 'tv'" color="primary" /><span class="ellipsis index-name">{{ slotProps.row[2] }}</span></div></q-td></template>
        <template #body-cell-title="slotProps"><q-td :props="slotProps"><div class="title-cell"><span>{{ slotProps.row[1].title }}</span><q-badge outline color="primary" :label="typeLabel(slotProps.row)" /></div></q-td></template>
        <template #body-cell-tmdb="slotProps"><q-td :props="slotProps"><a :href="tmdbUrl(slotProps.row)" target="_blank" rel="noreferrer" class="tmdb-link">{{ slotProps.row[1].id }} <q-icon name="open_in_new" size="14px" /></a></q-td></template>
        <template #body-cell-poster="slotProps"><q-td :props="slotProps"><q-img v-if="posterUrl(slotProps.row)" :src="posterUrl(slotProps.row)" fit="cover" class="poster" loading="lazy" @click="openPreview(slotProps.row)"><template #error><div class="poster-placeholder"><q-icon name="image_not_supported" /></div></template></q-img><span v-else class="text-secondary">—</span></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="修改" @click="openModify(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="remove(slotProps.row)" /></div></q-td></template>
      </q-table>

      <div v-else class="mobile-cache-list">
        <div v-if="loading && !list.length" class="mobile-list-state"><q-spinner-dots color="primary" size="28px" /><span>加载中…</span></div>
        <q-infinite-scroll v-else-if="list.length || hasMore" class="mobile-cache-scroll" :offset="180" :disable="!hasMore" @load="loadNextPage">
          <q-card v-for="item in list" :key="item[0]" flat bordered class="cache-item">
            <q-card-section class="cache-item-content">
              <div class="cache-item-summary">
                <q-img v-if="posterUrl(item)" :src="posterUrl(item)" fit="cover" class="poster mobile-poster" @click="openPreview(item)"><template #error><div class="poster-placeholder"><q-icon name="image_not_supported" /></div></template></q-img>
                <div v-else class="poster mobile-poster poster-placeholder"><q-icon :name="item[1].media_type === '电影' ? 'movie' : 'tv'" /></div>
                <div class="cache-item-media col min-width-0">
                  <div class="cache-title">{{ item[1].title }}</div>
                  <div class="cache-item-meta row items-center q-gutter-xs q-mt-xs"><q-badge outline color="primary" :label="typeLabel(item)" /><a :href="tmdbUrl(item)" target="_blank" rel="noreferrer" class="tmdb-link">TMDB {{ item[1].id }}</a></div>
                  <div class="cache-index-line"><span class="cache-index-label">索引</span><span class="cache-index-value">{{ item[2] }}</span></div>
                </div>
              </div>
            </q-card-section>
            <q-separator />
            <q-card-actions align="right" class="cache-item-actions"><q-btn dense flat color="primary" icon="edit" label="修改" @click="openModify(item)" /><q-btn dense flat color="negative" icon="delete" label="删除" @click="remove(item)" /></q-card-actions>
          </q-card>
          <template #loading><div class="mobile-list-loading"><q-spinner-dots color="primary" size="24px" /><span>加载下一页…</span></div></template>
        </q-infinite-scroll>
        <q-item v-else-if="!loading"><q-item-section class="text-center text-secondary q-py-xl">没有缓存记录</q-item-section></q-item>
        <div v-if="list.length && !hasMore && !loading" class="mobile-list-end">已加载全部 {{ list.length }} 条记录</div>
      </div>

      <q-separator v-if="!$q.screen.lt.sm && total > pageSize" />
      <div v-if="!$q.screen.lt.sm && total > pageSize" class="row justify-center q-pa-md"><q-pagination v-model="currentPage" :max="Math.ceil(total / pageSize)" :max-pages="7" direction-links boundary-links @update:model-value="pageChange" /></div>
    </q-card>

    <q-dialog v-model="modifyVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm"><q-card class="modify-dialog"><q-card-section class="row items-center"><div class="text-h6">修改 TMDB 缓存</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator /><q-card-section><q-input v-model="modifyTitle" outlined autofocus label="标题" placeholder="标题" :disable="modifying" /></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="modifying" v-close-popup /><q-btn color="primary" unelevated label="确定" :loading="modifying" @click="submitModify" /></q-card-actions></q-card></q-dialog>
    <ImagePreviewDialog v-model="previewVisible" :src="previewImage" />
    <ScrollToTop />
  </div>
</template>

<style scoped>
.tmdb-cache { width: 100%; max-width: 1600px; min-width: 0; margin: 0 auto; }
.cache-card { max-width: 100%; min-width: 0; overflow: hidden; }
.search-input { width: min(320px, 60vw); }
.index-cell, .title-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.index-name { max-width: 310px; }
.tmdb-link { color: var(--q-primary); text-decoration: none; }
.tmdb-link:hover { text-decoration: underline; }
.poster { width: 44px; height: 66px; border-radius: 5px; cursor: zoom-in; background: var(--surface-muted); }
.poster-placeholder { display: grid; width: 100%; height: 100%; place-items: center; color: var(--text-secondary); }
.mobile-cache-list { display: grid; gap: 8px; padding: 8px; min-width: 0; max-width: 100%; box-sizing: border-box; }
.mobile-cache-scroll { display: grid; gap: 8px; min-width: 0; max-width: 100%; }
.cache-item { width: 100%; max-width: 100%; min-width: 0; border-radius: 10px; overflow: hidden; }
.cache-item-content { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px; }
.cache-item-summary { display: flex; align-items: flex-start; min-width: 0; gap: 8px; }
.cache-item-media { min-width: 0; width: 0; flex: 1 1 0; padding-top: 1px; }
.cache-title { min-width: 0; color: var(--text-primary); font-size: 15px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.cache-item-meta { min-width: 0; flex-wrap: wrap; }
.cache-index-line { display: flex; align-items: flex-start; min-width: 0; gap: 6px; margin-top: 8px; padding-top: 7px; border-top: 1px solid var(--border-subtle); color: var(--text-primary); font-size: 12px; line-height: 1.45; }
.cache-index-label { flex: 0 0 auto; color: var(--text-secondary); }
.cache-index-value { min-width: 0; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
.cache-item-actions { min-height: 36px; padding: 3px 6px; }
.min-width-0 { min-width: 0; }
.mobile-cache-total { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; }
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
.modify-dialog { width: min(480px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) {
  .mobile-poster { width: 56px; height: 84px; flex: 0 0 auto; }
  .mobile-cache-actions { display: flex; width: 100%; align-items: center; flex-wrap: nowrap; gap: 8px; overflow-x: auto; padding: 0 4px; box-sizing: border-box; scrollbar-width: none; }
  .mobile-cache-actions::-webkit-scrollbar { display: none; }
  .mobile-cache-actions :deep(.q-btn) { min-width: auto; min-height: 36px !important; flex: 0 0 auto; padding: 0 8px; white-space: nowrap; }
  .cache-item-actions { gap: 8px; }
  .cache-item-actions :deep(.q-btn) { min-height: 32px; padding-inline: 8px; font-size: 12px; }
  .cache-item-actions :deep(.q-btn__content) { gap: 4px; }
  .modify-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }
  .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); }
  .dialog-actions :deep(.q-btn) { min-height: 44px; }
}
</style>
