<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import { getTmdbCache, deleteTmdbCache, modifyTmdbCache, clearTmdbCache, type TmdbCacheItem } from '@/api/rename'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'

const modal = useModalStore()
const list = ref<TmdbCacheItem[]>([])
const loading = ref(false)
const loadError = ref('')
const total = ref(0)
const currentPage = ref(1)
const pageSize = 30
const keyword = ref('')
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

onMounted(load)

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await getTmdbCache({ page: currentPage.value, keyword: keyword.value, pagenum: pageSize })
    if (response.code === 0) { list.value = response.result || []; total.value = response.total || 0 }
    else loadError.value = response.msg || '加载 TMDB 缓存失败'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载 TMDB 缓存失败'
  } finally { loading.value = false }
}

function doSearch() { currentPage.value = 1; load() }
function pageChange(page: number) { currentPage.value = page; load() }
function posterUrl(item: TmdbCacheItem) { return item[1].poster_path ? `https://image.tmdb.org/t/p/w500${item[1].poster_path}` : '' }
function tmdbUrl(item: TmdbCacheItem) { return `https://www.themoviedb.org/${item[1].media_type === '电影' ? 'movie' : 'tv'}/${item[1].id}` }
function typeLabel(item: TmdbCacheItem) { return item[1].media_type === '电影' ? '电影' : '电视剧' }
function openPreview(item: TmdbCacheItem) { const url = posterUrl(item); if (url) { previewImage.value = url; previewVisible.value = true } }
function openModify(item: TmdbCacheItem) { modifyKey.value = item[0]; modifyTitle.value = item[1].title; modifyVisible.value = true }

async function submitModify() {
  if (!modifyTitle.value.trim()) { modal.warning('标题不能为空'); return }
  modifying.value = true
  try {
    const response = await modifyTmdbCache(modifyKey.value, modifyTitle.value.trim())
    if (response.code === 0) { modifyVisible.value = false; modal.success('修改成功'); await load() }
    else modal.error(response.msg || '修改失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '修改失败') }
  finally { modifying.value = false }
}

async function remove(item: TmdbCacheItem) {
  const ok = await modal.confirm(`${item[2]} 对应的缓存 TMDB 条目将被删除，是否确认？`, '删除 TMDB 缓存')
  if (!ok) return
  try {
    const response = await deleteTmdbCache(item[0])
    if (response.code === 0) { modal.success('删除成功'); await load() }
    else modal.error(response.msg || '删除失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '删除失败') }
}

async function clearAll() {
  const ok = await modal.confirm('清空 TMDB 缓存后会增加 API 请求次数和搜索响应时间，但可以解决改名后本地缓存未更新的问题，是否确认？', '清空 TMDB 缓存')
  if (!ok) return
  modal.showLoading('清理中…')
  try {
    const response = await clearTmdbCache()
    if (response.code === 0) { modal.success('TMDB 缓存清理完成'); await load() }
    else modal.error(response.msg || '清理失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '清理失败') }
  finally { modal.hideLoading() }
}
</script>

<template>
  <div class="page-shell tmdb-cache">
    <PageHeader title="TMDB 缓存" description="本地 TMDB 识别缓存管理">
      <template #actions><q-btn color="negative" unelevated icon="delete_sweep" label="清空缓存" @click="clearAll" /><q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" /></template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="primary" label="重试" @click="load" /></template></q-banner>

    <q-card flat bordered class="cache-card">
      <q-card-section class="row items-center q-gutter-sm"><q-input v-model="keyword" outlined dense clearable class="search-input" placeholder="搜索缓存…" @keyup.enter="doSearch" /><q-btn color="primary" unelevated icon="search" label="搜索" @click="doSearch" /><q-space /><span class="text-caption text-secondary">共 {{ total }} 条</span></q-card-section><q-separator />
      <q-table v-if="!$q.screen.lt.sm" flat :rows="list" :columns="columns" row-key="0" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有缓存记录">
        <template #body-cell-index="slotProps"><q-td :props="slotProps"><div class="index-cell"><q-icon :name="slotProps.row[1].media_type === '电影' ? 'movie' : 'tv'" color="primary" /><span class="ellipsis index-name">{{ slotProps.row[2] }}</span></div></q-td></template>
        <template #body-cell-title="slotProps"><q-td :props="slotProps"><div class="title-cell"><span>{{ slotProps.row[1].title }}</span><q-badge outline color="primary" :label="typeLabel(slotProps.row)" /></div></q-td></template>
        <template #body-cell-tmdb="slotProps"><q-td :props="slotProps"><a :href="tmdbUrl(slotProps.row)" target="_blank" rel="noreferrer" class="tmdb-link">{{ slotProps.row[1].id }} <q-icon name="open_in_new" size="14px" /></a></q-td></template>
        <template #body-cell-poster="slotProps"><q-td :props="slotProps"><q-img v-if="posterUrl(slotProps.row)" :src="posterUrl(slotProps.row)" fit="cover" class="poster" loading="lazy" @click="openPreview(slotProps.row)"><template #error><div class="poster-placeholder"><q-icon name="image_not_supported" /></div></template></q-img><span v-else class="text-secondary">—</span></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="修改" @click="openModify(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="remove(slotProps.row)" /></div></q-td></template>
      </q-table>
      <div v-else class="mobile-cache-list">
        <q-card v-for="item in list" :key="item[0]" flat bordered class="cache-item"><q-card-section class="row no-wrap q-gutter-md"><q-img v-if="posterUrl(item)" :src="posterUrl(item)" fit="cover" class="poster mobile-poster" @click="openPreview(item)"><template #error><div class="poster-placeholder"><q-icon name="image_not_supported" /></div></template></q-img><div v-else class="poster mobile-poster poster-placeholder"><q-icon name="movie" /></div><div class="col min-width-0"><div class="text-subtitle1 text-weight-medium ellipsis-2-lines">{{ item[1].title }}</div><div class="row items-center q-gutter-xs q-mt-xs"><q-badge outline color="primary" :label="typeLabel(item)" /><a :href="tmdbUrl(item)" target="_blank" rel="noreferrer" class="tmdb-link">TMDB {{ item[1].id }}</a></div><div class="text-caption text-secondary ellipsis q-mt-sm">{{ item[2] }}</div></div></q-card-section><q-separator /><q-card-actions align="right"><q-btn flat color="primary" icon="edit" label="修改" @click="openModify(item)" /><q-btn flat color="negative" icon="delete" label="删除" @click="remove(item)" /></q-card-actions></q-card>
        <q-item v-if="!loading && !list.length"><q-item-section class="text-center text-secondary q-py-xl">没有缓存记录</q-item-section></q-item>
      </div>
      <q-separator v-if="total > pageSize" /><div v-if="total > pageSize" class="row justify-center q-pa-md"><q-pagination v-model="currentPage" :max="Math.ceil(total / pageSize)" direction-links boundary-links @update:model-value="pageChange" /></div>
    </q-card>

    <q-dialog v-model="modifyVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm"><q-card class="modify-dialog"><q-card-section class="row items-center"><div class="text-h6">修改 TMDB 缓存</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator /><q-card-section><q-input v-model="modifyTitle" outlined autofocus label="标题" placeholder="标题" :disable="modifying" /></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="modifying" v-close-popup /><q-btn color="primary" unelevated label="确定" :loading="modifying" @click="submitModify" /></q-card-actions></q-card></q-dialog>
    <q-dialog v-model="previewVisible"><q-card class="preview-dialog"><q-img :src="previewImage" fit="contain" class="preview-image" /><q-btn class="preview-close" round color="dark" icon="close" aria-label="关闭" @click="previewVisible = false" /></q-card></q-dialog>
  </div>
</template>

<style scoped>
.tmdb-cache { max-width: 1440px; margin: 0 auto; }
.cache-card { overflow: hidden; }
.search-input { width: min(320px, 60vw); }
.index-cell, .title-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.index-name { max-width: 310px; }
.tmdb-link { color: var(--q-primary); text-decoration: none; }
.tmdb-link:hover { text-decoration: underline; }
.poster { width: 44px; height: 66px; border-radius: 5px; cursor: zoom-in; background: var(--surface-muted); }
.poster-placeholder { display: grid; width: 100%; height: 100%; place-items: center; color: var(--text-secondary); }
.mobile-cache-list { display: grid; gap: 10px; padding: 12px; }
.cache-item { border-radius: 12px; }
.mobile-poster { width: 64px; height: 96px; flex: 0 0 auto; }
.min-width-0 { min-width: 0; }
.modify-dialog { width: min(480px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.dialog-actions { gap: 8px; }
.preview-dialog { position: relative; max-width: min(90vw, 720px); background: transparent; box-shadow: none; }
.preview-image { max-height: 85vh; min-width: 240px; }
.preview-close { position: absolute; top: 10px; right: 10px; opacity: .85; }
@media (max-width: 599px) { .tmdb-cache { padding-bottom: 8px; } .modify-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
