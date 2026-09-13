<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import ExploreSearchBar from '@/components/ExploreSearchBar.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import { useDiscovery, type TypeConfig } from '@/composables/useDiscovery'

const route = useRoute()
const router = useRouter()

const ROUTE_TYPE_MAP: Record<string, TypeConfig> = {
  douban_movie: { type: 'DOUBANTAG', subtype: 'MOV', title: '豆瓣电影' },
  douban_tv: { type: 'DOUBANTAG', subtype: 'TV', title: '豆瓣剧集' },
  tmdb_movie: { type: 'DISCOVER', subtype: 'MOV', title: 'TMDB电影' },
  tmdb_tv: { type: 'DISCOVER', subtype: 'TV', title: 'TMDB剧集' },
  downloaded: { type: 'DOWNLOADED', title: '最近下载' }
}

const TABS = [
  { label: '推荐', name: 'recommend' },
  { label: '豆瓣电影', name: 'douban_movie' },
  { label: '豆瓣剧集', name: 'douban_tv' },
  { label: 'TMDB电影', name: 'tmdb_movie' },
  { label: 'TMDB剧集', name: 'tmdb_tv' }
]

const activeTab = computed(() => String(route.name || 'recommend'))
const typeConfig = computed<TypeConfig>(() => {
  const name = String(route.name || 'recommend')
  if (name === 'recommend') {
    const query = route.query
    return {
      type: (query.type as string) || 'TRENDING',
      subtype: (query.subtype as string) || undefined,
      title: (query.title as string) || '推荐',
      subtitle: (query.subtitle as string) || undefined,
      week: (query.week as string) || undefined,
      tmdbid: (query.tmdbid as string) || undefined,
      personid: (query.personid as string) || undefined,
      keyword: (query.keyword as string) || undefined,
      source: (query.source as string) || undefined
    }
  }
  return ROUTE_TYPE_MAP[name] || { type: 'TRENDING', title: '推荐' }
})

const { items, loading, noMore, initializing, onFavChange, proxyDoubanImage, init, destroy } = useDiscovery(
  typeConfig,
  [() => route.name, () => route.query.type, () => route.query.subtype, () => route.query.week, () => route.query.tmdbid, () => route.query.personid, () => route.query.keyword]
)

function switchTab(name: string) {
  if (name !== activeTab.value) void router.push({ name })
}

onMounted(init)
onBeforeUnmount(destroy)
</script>

<template>
  <div class="recommend-page">
    <ExploreSearchBar />
    <PageHeader :title="typeConfig.title" :description="typeConfig.subtitle || '按来源浏览媒体内容'">
      <template #actions>
        <q-tabs :model-value="activeTab" dense no-caps inline-label active-color="primary" indicator-color="primary" class="source-tabs" @update:model-value="switchTab">
          <q-route-tab v-for="tab in TABS" :key="tab.name" :name="tab.name" :to="{ name: tab.name }" :label="tab.label" />
        </q-tabs>
      </template>
    </PageHeader>

    <div v-if="initializing && !items.length" class="loading-state"><q-spinner-orbit color="primary" size="42px" /><span>正在加载媒体…</span></div>
    <div v-else-if="!loading && items.length === 0" class="empty-state"><q-icon name="movie_filter" size="48px" color="grey-5" /><span>暂无可展示的媒体</span></div>
    <div v-else class="media-grid">
      <MediaCard
        v-for="(item, index) in items"
        :key="`${item.id}-${index}`"
        :tmdb-id="item.id"
        :title="item.title"
        :image="proxyDoubanImage(item.image)"
        :fav="item.fav"
        :vote="item.vote"
        :year="item.year"
        :overview="item.overview"
        :date="item.date"
        :media-type="item.type"
        :res-type="item.media_type"
        show-sub="1"
        :site="item.site"
        :weekday="item.weekday"
        @fav-change="onFavChange(index, $event)"
      />
    </div>

    <div v-if="loading && items.length" class="load-tip"><q-spinner-dots color="primary" size="24px" /><span>加载更多…</span></div>
    <div v-else-if="noMore && items.length" class="load-tip"><q-icon name="done" size="18px" /><span>已经到底了</span></div>
    <ScrollToTop />
  </div>
</template>

<style scoped>
.recommend-page { max-width: 1600px; margin: 0 auto; padding: 24px 32px 40px; }
.source-tabs { max-width: min(720px, 100%); }
.source-tabs :deep(.q-tab) { min-height: 42px; padding-inline: 12px; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
.loading-state, .empty-state, .load-tip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-secondary); font-size: 13px; }
.loading-state { min-height: 360px; }
.empty-state { min-height: 280px; }
.load-tip { flex-direction: row; padding: 28px 0 8px; }
@media (max-width: 1439px) { .recommend-page { padding-inline: 24px; } }
@media (max-width: 1023px) { .media-grid { grid-template-columns: repeat(auto-fill, minmax(144px, 1fr)); gap: 12px; } }
@media (max-width: 599px) { .recommend-page { padding: 16px 16px calc(32px + var(--safe-bottom)); } .source-tabs { width: 100%; overflow: auto; } .source-tabs :deep(.q-tabs__content) { justify-content: flex-start; } .source-tabs :deep(.q-tab) { padding-inline: 8px; font-size: 12px; } .media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
</style>
