<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import AddRssMediaDialog from '@/components/AddRssMediaDialog.vue'
import RssMediaDetailDialog from '@/components/RssMediaDetailDialog.vue'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'
import { getMovieRssList, getTvRssList, type RssMediaItem, type RssType } from '@/api/rss'

const props = defineProps<{ type: RssType }>()
const router = useRouter()
const modal = useModalStore()
const loading = ref(false)
const items = ref<RssMediaItem[]>([])
const loadError = ref('')
const nameFilter = ref('')
const addDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const selectedItem = ref<RssMediaItem | null>(null)
const editRssid = ref<string | number>('')
const editDialogVisible = ref(false)
const filterRuleMap = ref<Record<string, string>>({})

const title = computed(() => props.type === 'TV' ? '电视剧订阅' : '电影订阅')
const description = computed(() => props.type === 'TV' ? '管理已订阅的电视剧' : '管理已订阅的电影')
const emptyDescription = computed(() => props.type === 'TV' ? '当前没有正在订阅的电视剧。' : '当前没有正在订阅的电影。')
const filteredItems = computed(() => {
  const query = nameFilter.value.trim().toLowerCase()
  return query ? items.value.filter((item) => (item.name || '').toLowerCase().includes(query)) : items.value
})

async function loadFilterRules() {
  try {
    const response = await doAction<{ code: number; ruleGroups?: Array<{ id: number | string; name: string }> }>('get_filterrules', {})
    if (response.code === 0) filterRuleMap.value = Object.fromEntries((response.ruleGroups || []).map((group) => [String(group.id), group.name]))
  } catch { filterRuleMap.value = {} }
}

function ruleName(id: string | number) { return filterRuleMap.value[String(id)] || String(id) }

async function load(options: { notify?: boolean } = {}) {
  loading.value = true
  try {
    const response = props.type === 'TV' ? await getTvRssList() : await getMovieRssList()
    if (response.code === 0) {
      items.value = Object.values(response.result || {})
      loadError.value = ''
    } else {
      loadError.value = response.msg || `获取${title.value}失败`
      if (options.notify) modal.error(loadError.value)
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : `获取${title.value}失败`
    if (options.notify) modal.error(loadError.value)
  } finally { loading.value = false }
}

function stateMeta(state?: string) {
  if (state === 'D') return { label: '队列中', color: 'info' }
  if (state === 'S') return { label: '正在搜索', color: 'warning' }
  if (state === 'R') return { label: '正在订阅', color: 'positive' }
  return { label: '完成', color: 'primary' }
}

function episodeText(item: RssMediaItem) {
  if (props.type === 'TV') {
    if (!item.total || item.total <= 0) return ''
    return `${item.total - (item.lack || 0)}/${item.total}`
  }
  return item.total_ep && item.current_ep ? `${item.current_ep}/${item.total_ep}` : ''
}

function progressOf(item: RssMediaItem) {
  if (!item.total || item.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((item.total - (item.lack || 0)) * 100) / item.total)))
}

function openDetail(item: RssMediaItem) { selectedItem.value = item; detailDialogVisible.value = true }
function openEdit(id: string | number) { editRssid.value = id; editDialogVisible.value = true }
function goHistory() { void router.push({ path: '/rss_history', query: { t: props.type } }) }
function onSuccess(message: string) { modal.success(message); addDialogVisible.value = false; void load() }
function onEditSuccess() { modal.success('编辑订阅成功'); editDialogVisible.value = false; void load() }

onMounted(() => { void loadFilterRules(); void load() })
</script>

<template>
  <div class="rss-page">
    <PageHeader :title="title" :description="description">
      <template #actions>
        <q-input v-model="nameFilter" outlined dense clearable class="search-input" placeholder="搜索标题"><template #prepend><q-icon name="search" /></template></q-input>
        <span class="filter-count">共 {{ filteredItems.length }} 条</span>
        <q-btn color="primary" unelevated icon="add" label="新增订阅" @click="addDialogVisible = true" />
        <q-btn outline icon="history" label="订阅历史" @click="goHistory" />
        <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load({ notify: true })" />
      </template>
    </PageHeader>

    <q-banner v-if="loadError" rounded class="load-alert q-mb-md" inline-actions><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="negative" label="重试" @click="load({ notify: true })" /></template></q-banner>

    <div v-if="!loading && !filteredItems.length" class="empty-state"><q-icon name="subscriptions" size="48px" color="grey-5" /><span>{{ emptyDescription }}</span><q-btn outline color="primary" label="新增订阅" class="q-mt-sm" @click="addDialogVisible = true" /></div>
    <div v-else class="rss-grid">
      <q-card v-for="item in filteredItems" :key="item.id" flat bordered class="rss-card">
        <div class="card-background"><q-img v-if="item.image" :src="item.image" class="background-image" fit="cover" /><div class="background-overlay" /><q-btn flat round icon="more_horiz" color="white" class="more-button" aria-label="查看订阅详情" @click.stop="openDetail(item)" /><div class="card-content"><div class="card-main"><q-img v-if="item.poster || item.image" :src="item.poster || item.image" ratio=".8" class="card-poster" fit="cover" /><div v-else class="card-poster poster-placeholder"><q-icon name="movie" size="28px" /></div><div class="card-info"><div class="meta-line"><span v-if="item.year">{{ item.year }}</span><q-badge rounded :color="stateMeta(item.state).color" :label="stateMeta(item.state).label" /><span v-if="episodeText(item)" class="episode-text">{{ episodeText(item) }}</span><q-badge v-if="item.over_edition" rounded color="negative" label="洗版" /></div><div class="item-name" :title="item.name">{{ item.name }}</div><div v-if="item.season && item.season !== 'S00'" class="info-line">{{ item.season }}</div><div v-if="item.filter_team" class="info-line">{{ item.filter_team }}</div><div v-if="item.filter_rule" class="info-line">{{ ruleName(item.filter_rule) }}</div><div v-if="item.search_sites?.length" class="info-line info-sites">{{ item.search_sites.join(' / ') }}</div></div></div><q-linear-progress v-if="props.type === 'TV' && item.total && item.total > 0" :value="progressOf(item) / 100" color="primary" track-color="grey-4" size="5px" class="card-progress" /></div></div>
      </q-card>
    </div>

    <AddRssMediaDialog v-model="addDialogVisible" :type="type" @success="onSuccess('添加订阅成功')" @error="modal.error($event)" />
    <RssMediaDetailDialog v-model="detailDialogVisible" :item="selectedItem" :type="type" @edit="openEdit" @removed="load" @searched="load" @refreshed="load" />
    <AddRssMediaDialog v-model="editDialogVisible" :type="type" :rssid="editRssid" @success="onEditSuccess" @error="modal.error($event)" />
  </div>
</template>

<style scoped>
.rss-page { max-width: 1600px; margin: 0 auto; padding: 24px 32px 40px; }
.search-input { width: 260px; }
.filter-count { color: var(--text-secondary); font-size: 13px; }
.load-alert { color: var(--text-primary); background: color-mix(in srgb, var(--q-negative) 10%, var(--surface)); }
.rss-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
.rss-card { overflow: hidden; background: var(--surface); border-color: var(--border-subtle); transition: transform .18s ease, box-shadow .18s ease; }
.rss-card:hover { transform: translateY(-2px); box-shadow: 0 8px 20px rgba(20, 29, 48, .14); }
.card-background { position: relative; min-height: 220px; overflow: hidden; background: var(--surface-muted); }
.background-image, .background-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.background-overlay { background: linear-gradient(110deg, rgba(8, 12, 22, .88), rgba(8, 12, 22, .5) 54%, rgba(8, 12, 22, .76)); backdrop-filter: blur(8px); }
.more-button { position: absolute; top: 8px; right: 8px; z-index: 2; }
.card-content { position: relative; z-index: 1; padding: 18px 16px 14px; color: #fff; }
.card-main { display: flex; gap: 14px; min-height: 150px; }
.card-poster { flex: 0 0 100px; width: 100px; height: 125px; border-radius: 7px; background: rgba(255,255,255,.12); box-shadow: 0 3px 10px rgba(0,0,0,.3); }
.poster-placeholder { display: grid; place-items: center; color: rgba(255,255,255,.55); }
.card-info { min-width: 0; padding-top: 2px; }
.meta-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; color: rgba(255,255,255,.8); font-size: 13px; }
.meta-line :deep(.q-badge) { line-height: 20px; }
.episode-text { padding: 1px 6px; border-radius: 4px; background: rgba(49,91,214,.55); }
.item-name { display: -webkit-box; overflow: hidden; margin-top: 8px; color: #fff; font-size: 18px; font-weight: 650; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.info-line { overflow: hidden; margin-top: 6px; color: rgba(255,255,255,.74); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.info-sites { color: rgba(255,255,255,.54); }
.card-progress { position: absolute; right: 0; bottom: 0; left: 0; }
.empty-state { display: flex; min-height: 320px; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-secondary); font-size: 13px; }
@media (max-width: 1439px) { .rss-page { padding-inline: 24px; } }
@media (max-width: 599px) { .rss-page { padding: 16px 16px calc(32px + var(--safe-bottom)); } .search-input { width: 100%; } .rss-grid { grid-template-columns: 1fr; gap: 10px; } .card-content { padding: 16px 14px 12px; } }
</style>
