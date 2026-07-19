<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import { useDiscovery, type TypeConfig } from '@/composables/useDiscovery'

const cfgRef = computed<TypeConfig>(() => ({ type: 'DOWNLOADED', title: '最近下载' }))
const { items, loading, noMore, initializing, onFavChange, proxyDoubanImage, init } = useDiscovery(cfgRef)
onMounted(init)
</script>

<template>
  <div class="page">
    <PageHeader title="最近下载" />
    <el-empty v-if="!initializing && !loading && items.length === 0" description="没有数据" />
    <div v-else class="media-grid">
      <MediaCard v-for="(item, idx) in items" :key="`${item.id}-${idx}`" :tmdb-id="item.id" :title="item.title" :image="proxyDoubanImage(item.image)" :fav="item.fav" :vote="item.vote" :year="item.year" :overview="item.overview" :date="item.date" :media-type="item.type" :res-type="item.media_type" :show-sub="'1'" :site="item.site" :weekday="item.weekday" @fav-change="onFavChange(idx, $event)" />
    </div>
    <div v-if="loading" class="load-tip"><el-icon class="is-loading"><Loading /></el-icon><span>加载中...</span></div>
    <div v-else-if="noMore && items.length > 0" class="load-tip"><span>没有更多了</span></div>
  </div>
</template>

<style scoped>
.page { padding: 16px; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
.load-tip { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 24px 0; color: var(--el-text-color-secondary); font-size: 13px; }
</style>
