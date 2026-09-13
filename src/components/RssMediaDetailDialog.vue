<script setup lang="ts">
import { computed } from 'vue'
import { removeRssMedia, refreshRss, type RssMediaItem, type RssType } from '@/api/rss'
import { useModalStore } from '@/stores/modal'

const props = defineProps<{ modelValue: boolean; item: RssMediaItem | null; type: RssType }>()
const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'edit', rssid: string | number): void
  (event: 'removed'): void
  (event: 'searched'): void
  (event: 'refreshed'): void
}>()

const modal = useModalStore()
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) })
const item = computed(() => props.item)
const hasBadges = computed(() => Boolean(item.value && (item.value.over_edition || item.value.fuzzy_match || item.value.filter_restype || item.value.filter_pix || item.value.filter_team)))

function stateMeta(state?: string) {
  if (state === 'D') return { label: '队列中', color: 'info' }
  if (state === 'S') return { label: '正在搜索', color: 'warning' }
  if (state === 'R') return { label: '正在订阅', color: 'positive' }
  return { label: '完成', color: 'primary' }
}

function progressOf(value: RssMediaItem) {
  if (!value.total || value.total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(((value.total - (value.lack || 0)) * 100) / value.total)))
}

function doneOf(value: RssMediaItem) {
  if (!value.total || value.total <= 0) return ''
  return `${value.total - (value.lack || 0)}/${value.total}`
}

async function onRemove() {
  if (!item.value) return
  const ok = await modal.confirm(`确认删除订阅「${item.value.name}」？`, '取消订阅')
  if (!ok) return
  try {
    const response = await removeRssMedia({ name: item.value.name, type: props.type, year: item.value.year, season: item.value.season, rssid: item.value.id, tmdbid: item.value.tmdbid })
    if (response.code === 0) { modal.success('取消订阅成功'); visible.value = false; emit('removed') }
    else modal.error(response.msg || '取消订阅失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '取消订阅失败') }
}

function onEdit() { if (item.value) { visible.value = false; emit('edit', item.value.id) } }

async function triggerRefresh(event: 'searched' | 'refreshed', message: string) {
  if (!item.value) return
  try {
    const response = await refreshRss(item.value.id, props.type)
    if (response.code === 0) {
      modal.success(message)
      if (event === 'searched') emit('searched')
      else emit('refreshed')
    }
    else modal.error(response.msg || `${message}失败`)
  } catch (error) { modal.error(error instanceof Error ? error.message : `${message}失败`) }
}

function goTmdb() {
  if (!item.value?.tmdbid) return
  const base = props.type === 'TV' ? 'https://www.themoviedb.org/tv' : 'https://www.themoviedb.org/movie'
  window.open(`${base}/${item.value.tmdbid}`, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm">
    <q-card class="detail-card">
      <q-card-section class="row items-center q-pb-sm"><div class="text-h6 ellipsis">{{ item?.name || '' }}</div><q-space /><q-btn flat round icon="close" aria-label="关闭" v-close-popup /></q-card-section>
      <q-separator />
      <q-card-section v-if="item" class="detail-body">
        <q-img v-if="item.image" :src="item.image" class="detail-poster" fit="cover" ratio=".67"><template #error><div class="poster-placeholder"><q-icon name="movie" size="36px" /></div></template></q-img>
        <div v-else class="detail-poster poster-placeholder"><q-icon name="movie" size="36px" /></div>
        <div class="detail-content">
          <div class="detail-title"><span :class="{ 'tmdb-link': item.tmdbid }" @click="goTmdb">{{ item.name }}</span><span v-if="item.year" class="muted">（{{ item.year }}）</span><span v-if="item.season && item.season !== 'S00'" class="muted">{{ item.season }}</span><q-badge v-if="item.vote" color="warning" class="q-ml-sm" :label="item.vote" /></div>
          <div class="detail-meta"><q-badge rounded :color="stateMeta(item.state).color" :label="stateMeta(item.state).label" /><span v-if="doneOf(item)" class="muted">{{ doneOf(item) }}</span><q-linear-progress v-if="type === 'TV' && item.total && item.total > 0" :value="progressOf(item) / 100" color="primary" size="6px" class="detail-progress" /></div>
          <div v-if="item.overview" class="detail-overview">{{ item.overview }}</div>
          <div v-if="hasBadges" class="detail-badges"><q-chip v-if="item.over_edition" dense color="negative" text-color="white" label="洗版" /><q-chip v-if="item.fuzzy_match" dense color="warning" text-color="white" label="模糊匹配" /><q-chip v-if="item.filter_restype" dense outline :label="item.filter_restype" /><q-chip v-if="item.filter_pix" dense outline :label="item.filter_pix" /><q-chip v-if="item.filter_team" dense outline :label="item.filter_team" /></div>
          <div v-if="item.rss_sites?.length" class="site-row"><span>订阅站点</span><q-chip v-for="site in item.rss_sites" :key="site" dense color="info" outline :label="site" /></div>
          <div v-if="item.search_sites?.length" class="site-row"><span>搜索站点</span><q-chip v-for="site in item.search_sites" :key="site" dense color="positive" outline :label="site" /></div>
        </div>
      </q-card-section>
      <q-card-actions align="right" class="detail-actions"><q-btn flat icon="edit" :label="$q.screen.lt.sm ? '' : '编辑'" aria-label="编辑" @click="onEdit" /><q-btn flat color="negative" icon="delete" :label="$q.screen.lt.sm ? '' : '取消订阅'" aria-label="取消订阅" @click="onRemove" /><q-btn outline icon="search" :label="$q.screen.lt.sm ? '' : '搜索'" aria-label="搜索" @click="triggerRefresh('searched', '已触发搜索')" /><q-btn outline icon="refresh" :label="$q.screen.lt.sm ? '' : '刷新'" aria-label="刷新" @click="triggerRefresh('refreshed', '已触发刷新')" /><q-btn color="primary" unelevated icon="close" :label="$q.screen.lt.sm ? '' : '关闭'" aria-label="关闭" v-close-popup /></q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.detail-card { width: min(720px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.detail-body { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 20px; }
.detail-poster { width: 180px; height: 270px; border-radius: 8px; background: var(--surface-muted); }
.poster-placeholder { display: grid; place-items: center; color: var(--text-secondary); }
.detail-content { min-width: 0; }
.detail-title { color: var(--text-primary); font-size: 18px; font-weight: 650; line-height: 1.45; }
.tmdb-link { color: var(--q-primary); cursor: pointer; }
.muted { margin-left: 5px; color: var(--text-secondary); font-size: 13px; font-weight: 400; }
.detail-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; margin-top: 12px; }
.detail-progress { flex: 1; min-width: 90px; }
.detail-overview { display: -webkit-box; overflow: hidden; margin-top: 14px; color: var(--text-secondary); font-size: 13px; line-height: 1.65; -webkit-box-orient: vertical; -webkit-line-clamp: 7; }
.detail-badges, .site-row { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; margin-top: 12px; }
.detail-badges :deep(.q-chip), .site-row :deep(.q-chip) { margin: 0; }
.site-row > span { flex: 0 0 auto; color: var(--text-secondary); font-size: 12px; }
.detail-actions { gap: 6px; }
@media (max-width: 599px) { .detail-card { display: flex; width: 100%; min-height: 100dvh; flex-direction: column; border-radius: 0; } .detail-body { display: flex; min-height: 0; flex: 1; flex-direction: column; gap: 14px; overflow-y: auto; } .detail-poster { width: 128px; height: 192px; align-self: center; } .detail-actions { position: sticky; bottom: 0; display: flex; flex-wrap: nowrap; gap: 2px; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .detail-actions :deep(.q-btn) { width: auto; min-width: 0; min-height: 44px; flex: 1 1 0; padding-inline: 0; font-size: 12px; } .detail-actions :deep(.q-btn__content) { gap: 0; white-space: nowrap; } .detail-actions :deep(.q-btn__icon) { margin: 0; font-size: 20px; } }
</style>
