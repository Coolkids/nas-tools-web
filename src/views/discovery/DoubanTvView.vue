<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import { useDiscovery, type TypeConfig, type FilterField } from '@/composables/useDiscovery'

const TABS = [
  { label: '推荐', name: 'recommend' },
  { label: '豆瓣电影', name: 'douban_movie' },
  { label: '豆瓣剧集', name: 'douban_tv' },
  { label: 'TMDB电影', name: 'tmdb_movie' },
  { label: 'TMDB剧集', name: 'tmdb_tv' }
]
const route = useRoute()
const router = useRouter()
const activeTab = computed(() => route.name as string)
function switchTab(name: string) {
  if (name === activeTab.value) return
  router.push({ name })
}

const DOUBAN_TV_FILTERS: Record<string, FilterField> = {
  sort: {
    name: '排序',
    options: [
      { label: '默认', value: '' },
      { label: '综合排序', value: 'U' },
      { label: '首播时间', value: 'T' },
      { label: '高分优先', value: 'S' },
      { label: '近期热度', value: 'R' }
    ]
  },
  tags: {
    name: '地区',
    options: [
      { label: '全部', value: '' },
      { label: '华语', value: '华语' }, { label: '中国大陆', value: '中国大陆' },
      { label: '中国香港', value: '中国香港' }, { label: '中国台湾', value: '中国台湾' },
      { label: '欧美', value: '欧美' }, { label: '韩国', value: '韩国' },
      { label: '日本', value: '日本' }, { label: '印度', value: '印度' },
      { label: '泰国', value: '泰国' }
    ]
  }
}

const typeConfig: TypeConfig = { type: 'DOUBANTAG', subtype: 'TV', title: '豆瓣剧集' }
const cfgRef = computed(() => typeConfig)
const filterFields = computed(() => DOUBAN_TV_FILTERS)

const { items, loading, noMore, initializing, filterParams, setFilter, currentFilterLabel, onFavChange, proxyDoubanImage, init } = useDiscovery(cfgRef)
onMounted(init)
</script>

<template>
  <div class="page">
    <PageHeader title="豆瓣剧集">
      <template #actions>
        <el-radio-group :model-value="activeTab" @change="switchTab($event as string)">
          <el-radio-button v-for="tab in TABS" :key="tab.name" :value="tab.name">
            {{ tab.label }}
          </el-radio-button>
        </el-radio-group>
        <el-dropdown v-for="(field, key) in filterFields" :key="key" trigger="click" popper-class="recommend-filter-popper" @command="(v: string) => setFilter(key, v)">
          <el-button>{{ currentFilterLabel(key, field) }}<el-icon class="el-icon--right"><ArrowDown /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu class="recommend-filter-menu">
              <el-dropdown-item v-for="opt in field.options" :key="opt.value" :command="opt.value" :class="{ 'selected': filterParams[key] === opt.value }">{{ opt.label }}</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </template>
    </PageHeader>
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
