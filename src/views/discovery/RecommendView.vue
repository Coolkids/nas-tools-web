<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import { useDiscovery, type TypeConfig, type FilterField } from '@/composables/useDiscovery'

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

const activeTab = computed(() => route.name as string)

function switchTab(name: string) {
  if (name === activeTab.value) return
  router.push({ name })
}

const typeConfig = computed<TypeConfig>(() => {
  const name = route.name as string
  if (name === 'recommend') {
    const q = route.query
    return {
      type: (q.type as string) || 'TRENDING',
      subtype: (q.subtype as string) || undefined,
      title: (q.title as string) || '推荐',
      subtitle: (q.subtitle as string) || undefined,
      week: (q.week as string) || undefined,
      tmdbid: (q.tmdbid as string) || undefined,
      personid: (q.personid as string) || undefined,
      keyword: (q.keyword as string) || undefined,
      source: (q.source as string) || undefined
    }
  }
  return ROUTE_TYPE_MAP[name] || { type: 'TRENDING', title: '推荐' }
})

const { items, loading, noMore, initializing, onFavChange, proxyDoubanImage, init, destroy } = useDiscovery(
  typeConfig,
  [() => route.name, () => route.query.type, () => route.query.subtype, () => route.query.week, () => route.query.tmdbid, () => route.query.personid, () => route.query.keyword]
)

onMounted(init)
onBeforeUnmount(destroy)
</script>

<template>
  <div class="recommend-view">
    <PageHeader :title="typeConfig.title" :description="typeConfig.subtitle">
      <template #actions>
        <el-radio-group :model-value="activeTab" @change="switchTab($event as string)">
          <el-radio-button v-for="tab in TABS" :key="tab.name" :value="tab.name">
            {{ tab.label }}
          </el-radio-button>
        </el-radio-group>
      </template>
    </PageHeader>

    <el-empty v-if="!initializing && !loading && items.length === 0" description="没有数据" />

    <div v-else class="media-grid">
      <MediaCard
        v-for="(item, idx) in items"
        :key="`${item.id}-${idx}`"
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
        :show-sub="'1'"
        :site="item.site"
        :weekday="item.weekday"
        @fav-change="onFavChange(idx, $event)"
      />
    </div>

    <div v-if="loading" class="load-tip">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>加载中...</span>
    </div>
    <div v-else-if="noMore && items.length > 0" class="load-tip">
      <span>没有更多了</span>
    </div>
  </div>
</template>

<style scoped>
.recommend-view { padding: 16px; }
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.load-tip {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 24px 0; color: var(--el-text-color-secondary); font-size: 13px;
}
</style>
