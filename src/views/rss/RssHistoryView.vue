<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import { getRssHistory, deleteRssHistory, type RssHistoryItem, type RssType } from '@/api/rss'
import AddRssMediaDialog from '@/components/AddRssMediaDialog.vue'

const route = useRoute()
const router = useRouter()
const modal = useModalStore()

const loading = ref(false)
const loadError = ref('')
const list = ref<RssHistoryItem[]>([])
const activeType = ref<RssType | ''>('')
const page = ref(1)
const pageSize = 30
const total = ref(0)

const reRssDialogVisible = ref(false)
const reRssType = ref<RssType>('MOV')
const reRssInitial = ref({ name: '', year: '', season: '', totalEp: '', currentEp: '' })

const tabs = [
  { label: '全部', value: '' },
  { label: '电影', value: 'MOV' },
  { label: '电视剧', value: 'TV' }
]

const columns: QTableColumn<RssHistoryItem>[] = [
  { name: 'media', label: '媒体', field: 'NAME', align: 'left', sortable: true },
  { name: 'description', label: '简介', field: 'DESC', align: 'left' },
  { name: 'finish', label: '完成时间', field: 'FINISH_TIME', align: 'left', sortable: true },
  { name: 'actions', label: '操作', field: 'ID', align: 'right' }
]

const countLabel = computed(() => `共 ${total.value || list.value.length} 条记录`)

onMounted(() => {
  const type = route.query.t as string
  if (type === 'MOV' || type === 'TV') activeType.value = type
  load()
})

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await getRssHistory(activeType.value || undefined, page.value, pageSize)
    if (res.code === 0) {
      list.value = res.result || []
      total.value = res.total ?? 0
    } else {
      loadError.value = res.msg || '获取订阅历史失败'
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '获取订阅历史失败'
  } finally {
    loading.value = false
  }
}

function onTypeChange(value: string) {
  activeType.value = (value || '') as RssType | ''
  page.value = 1
  load()
}

function onPageChange(value: number) {
  page.value = value
  load()
}

function tmdbUrl(item: RssHistoryItem) {
  if (!item.TMDBID) return ''
  return `https://www.themoviedb.org/${item.TYPE === 'MOV' ? 'movie' : 'tv'}/${item.TMDBID}`
}

function totalEpisodes(item: RssHistoryItem) { return item.TOTAL && item.TOTAL > 0 ? item.TOTAL : null }

function typeLabel(type?: string) {
  return type === 'TV' ? '电视剧' : '电影'
}

async function onDelete(item: RssHistoryItem) {
  const ok = await modal.confirm(`确认删除「${item.NAME}」的订阅历史记录？`, '删除订阅历史')
  if (!ok) return
  try {
    const res = await deleteRssHistory(item.ID)
    if (res.code === 0) {
      modal.success('删除成功')
      await load()
    } else modal.error(res.msg || '删除失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '删除失败')
  }
}

function onReRss(item: RssHistoryItem) {
  const type = (item.TYPE || activeType.value) as RssType
  if (type !== 'MOV' && type !== 'TV') {
    modal.error('无法确定订阅类型')
    return
  }
  reRssType.value = type
  reRssInitial.value = {
    name: item.NAME || '',
    year: item.YEAR || '',
    season: item.SEASON || '',
    totalEp: item.TOTAL ? String(item.TOTAL) : '',
    currentEp: item.START ? String(item.START) : ''
  }
  reRssDialogVisible.value = true
}

function onReRssSuccess() {
  modal.success('重新订阅成功')
  reRssDialogVisible.value = false
  load()
}

function onReRssError(message: string) {
  modal.error(`重新订阅失败：${message}`)
}

function goBack() {
  router.push(activeType.value === 'TV' ? '/tv_rss' : '/movie_rss')
}
</script>

<template>
  <div class="page-shell rss-history">
    <PageHeader title="订阅历史" description="查看已完成或已取消的订阅记录">
      <template #actions>
        <q-btn-toggle
          :model-value="activeType"
          :options="tabs"
          unelevated
          toggle-color="primary"
          color="grey-2"
          text-color="grey-8"
          @update:model-value="onTypeChange"
        />
        <q-btn flat icon="arrow_back" label="返回" @click="goBack" />
        <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" />
      </template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense>
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ loadError }}
      <template #action><q-btn flat color="primary" label="重试" @click="load" /></template>
    </q-banner>

    <q-card flat bordered class="history-card">
      <q-card-section class="row items-center q-py-sm">
        <div class="text-caption text-secondary">{{ countLabel }}</div>
        <q-space />
        <q-spinner-dots v-if="loading" color="primary" size="20px" />
      </q-card-section>
      <q-separator />

      <q-table
        v-if="!$q.screen.lt.sm"
        flat
        :rows="list"
        :columns="columns"
        row-key="ID"
        :loading="loading"
        hide-pagination
        :rows-per-page-options="[0]"
        no-data-label="没有订阅历史"
        class="history-table"
      >
        <template #body-cell-media="slotProps">
          <q-td :props="slotProps">
            <div class="media-cell">
              <q-img :src="slotProps.row.IMAGE" fit="cover" class="history-poster">
                <template #error><div class="poster-placeholder"><q-icon name="movie" /></div></template>
              </q-img>
              <div class="media-copy">
                <div class="media-title ellipsis-2-lines">
                  {{ slotProps.row.NAME }}
                  <span v-if="slotProps.row.YEAR" class="text-secondary">（{{ slotProps.row.YEAR }}）</span>
                  <span v-if="slotProps.row.SEASON" class="text-secondary"> {{ slotProps.row.SEASON }}</span>
                </div>
                <div class="row items-center q-gutter-xs q-mt-xs">
                  <q-badge outline color="primary" :label="typeLabel(slotProps.row.TYPE)" />
                  <a v-if="slotProps.row.TMDBID" :href="tmdbUrl(slotProps.row)" target="_blank" rel="noreferrer" class="tmdb-link">TMDB {{ slotProps.row.TMDBID }}</a>
                  <span v-if="totalEpisodes(slotProps.row)" class="text-caption text-secondary">总集数 {{ totalEpisodes(slotProps.row) }} 集</span>
                </div>
              </div>
            </div>
          </q-td>
        </template>
        <template #body-cell-description="slotProps"><q-td :props="slotProps"><div class="description ellipsis-3-lines">{{ slotProps.row.DESC || '暂无简介' }}</div></q-td></template>
        <template #body-cell-actions="slotProps">
          <q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="star" label="重新订阅" @click="onReRss(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="onDelete(slotProps.row)" /></div></q-td>
        </template>
      </q-table>

      <div v-else class="mobile-history-list">
        <q-card v-for="item in list" :key="item.ID" flat bordered class="history-item">
          <q-card-section class="row no-wrap q-gutter-md">
            <q-img :src="item.IMAGE" fit="cover" class="history-poster mobile-poster"><template #error><div class="poster-placeholder"><q-icon name="movie" /></div></template></q-img>
            <div class="col min-width-0">
              <div class="media-title ellipsis-2-lines">{{ item.NAME }} <span v-if="item.YEAR" class="text-secondary">（{{ item.YEAR }}）</span></div>
              <div class="row items-center q-gutter-xs q-mt-xs"><q-badge outline color="primary" :label="typeLabel(item.TYPE)" /><span v-if="item.SEASON" class="text-caption text-secondary">{{ item.SEASON }}</span><span v-if="totalEpisodes(item)" class="text-caption text-secondary">总集数 {{ totalEpisodes(item) }} 集</span><span class="text-caption text-secondary">{{ item.FINISH_TIME || '未记录时间' }}</span></div>
              <div v-if="item.DESC" class="description ellipsis-2-lines q-mt-sm">{{ item.DESC }}</div>
            </div>
          </q-card-section>
          <q-separator />
          <q-card-actions align="right"><q-btn flat color="primary" icon="star" label="重新订阅" @click="onReRss(item)" /><q-btn flat color="negative" icon="delete" label="删除" @click="onDelete(item)" /></q-card-actions>
        </q-card>
        <q-item v-if="!loading && !list.length"><q-item-section class="text-center text-secondary q-py-xl">没有订阅历史</q-item-section></q-item>
      </div>

      <q-separator v-if="total > pageSize" />
      <div v-if="total > pageSize" class="row justify-center q-pa-md"><q-pagination v-model="page" :max="Math.ceil(total / pageSize)" :max-pages="7" direction-links boundary-links @update:model-value="onPageChange" /></div>
    </q-card>

    <AddRssMediaDialog
      v-model="reRssDialogVisible"
      :type="reRssType"
      :initial-name="reRssInitial.name"
      :initial-year="reRssInitial.year"
      :initial-season="reRssInitial.season"
      :initial-total-ep="reRssInitial.totalEp"
      :initial-current-ep="reRssInitial.currentEp"
      @success="onReRssSuccess"
      @error="onReRssError"
    />
  </div>
</template>

<style scoped>
.rss-history { max-width: 1440px; margin: 0 auto; }
.history-card { overflow: hidden; }
.media-cell { display: flex; align-items: center; gap: 12px; min-width: 260px; }
.history-poster { width: 48px; height: 72px; flex: 0 0 auto; border-radius: 6px; background: var(--surface-muted); }
.mobile-poster { width: 64px; height: 96px; }
.poster-placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--text-secondary); }
.media-copy { min-width: 0; }
.media-title { color: var(--text-primary); font-weight: 650; line-height: 1.4; }
.tmdb-link { color: var(--q-primary); font-size: 12px; text-decoration: none; }
.tmdb-link:hover { text-decoration: underline; }
.description { max-width: 420px; color: var(--text-secondary); font-size: 13px; line-height: 1.55; }
.history-table :deep(td) { vertical-align: middle; }
.mobile-history-list { display: grid; gap: 10px; padding: 12px; }
.history-item { border-radius: 12px; }
.min-width-0 { min-width: 0; }
</style>
