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

const FILTERS: Record<string, FilterField> = {
  with_genres: {
    name: '类型',
    options: [
      { label: '全部', value: '' }, { label: '冒险', value: '12' },
      { label: '动画', value: '16' }, { label: '喜剧', value: '35' },
      { label: '犯罪', value: '80' }, { label: '剧情', value: '18' },
      { label: '奇幻', value: '14' }, { label: '恐怖', value: '27' },
      { label: '悬疑', value: '9648' }, { label: '爱情', value: '10749' },
      { label: '科幻', value: '878' }, { label: '惊悚', value: '53' },
      { label: '战争', value: '10752' }
    ]
  },
  with_original_language: {
    name: '语言',
    options: [
      { label: '全部', value: '' }, { label: '中文', value: 'zh' },
      { label: '英语', value: 'en' }, { label: '日语', value: 'ja' },
      { label: '韩语', value: 'ko' }, { label: '法语', value: 'fr' },
      { label: '德语', value: 'de' }, { label: '俄语', value: 'ru' },
      { label: '印地语', value: 'hi' }
    ]
  }
}

const cfgRef = computed<TypeConfig>(() => ({ type: 'DISCOVER', subtype: 'MOV', title: 'TMDB电影' }))
const filterFields = computed(() => FILTERS)
const { items, loading, noMore, initializing, filterParams, setFilter, currentFilterLabel, onFavChange, proxyDoubanImage, init } = useDiscovery(cfgRef)
onMounted(init)
</script>

<template>
  <div class="page">
    <PageHeader title="TMDB电影">
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
