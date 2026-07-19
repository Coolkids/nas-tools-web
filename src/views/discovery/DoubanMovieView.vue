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

const DOUBAN_MOVIE_FILTERS: Record<string, FilterField> = {
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
    name: '类型',
    options: [
      { label: '全部', value: '' },
      { label: '喜剧', value: '喜剧' }, { label: '爱情', value: '爱情' },
      { label: '动作', value: '动作' }, { label: '科幻', value: '科幻' },
      { label: '动画', value: '动画' }, { label: '悬疑', value: '悬疑' },
      { label: '犯罪', value: '犯罪' }, { label: '惊悚', value: '惊悚' },
      { label: '冒险', value: '冒险' }, { label: '奇幻', value: '奇幻' },
      { label: '恐怖', value: '恐怖' }, { label: '战争', value: '战争' },
      { label: '武侠', value: '武侠' }, { label: '灾难', value: '灾难' }
    ]
  }
}

const typeConfig: TypeConfig = { type: 'DOUBANTAG', subtype: 'MOV', title: '豆瓣电影' }
const cfgRef = computed(() => typeConfig)
const filterFields = computed(() => DOUBAN_MOVIE_FILTERS)

const { items, loading, noMore, initializing, filterParams, setFilter, currentFilterLabel, onFavChange, proxyDoubanImage, init } = useDiscovery(cfgRef)
onMounted(init)
</script>

<template>
  <div class="page">
    <PageHeader title="豆瓣电影">
      <template #actions>
        <el-radio-group :model-value="activeTab" @change="switchTab($event as string)">
          <el-radio-button v-for="tab in TABS" :key="tab.name" :value="tab.name">
            {{ tab.label }}
          </el-radio-button>
        </el-radio-group>
        <el-dropdown v-for="(field, key) in filterFields" :key="key" trigger="click" popper-class="recommend-filter-popper" @command="(v: string) => setFilter(key, v)">
          <el-button>
            {{ currentFilterLabel(key, field) }}<el-icon class="el-icon--right"><ArrowDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu class="recommend-filter-menu">
              <el-dropdown-item v-for="opt in field.options" :key="opt.value" :command="opt.value" :class="{ 'selected': filterParams[key] === opt.value }">
                {{ opt.label }}
              </el-dropdown-item>
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
