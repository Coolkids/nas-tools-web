<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Loading, ArrowDown } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import { getRecommend, proxyDoubanImage, type RecommendItem } from '@/api/discovery'
import { useModalStore } from '@/stores/modal'

interface TypeConfig {
  type: string
  subtype?: string
  title: string
  subtitle?: string
  week?: string
  tmdbid?: string
  personid?: string
  keyword?: string
  source?: string
}

interface FilterField {
  name: string
  options: Array<{ label: string; value: string }>
}

const ROUTE_TYPE_MAP: Record<string, TypeConfig> = {
  douban_movie: { type: 'DOUBANTAG', subtype: 'MOV', title: '豆瓣电影' },
  douban_tv: { type: 'DOUBANTAG', subtype: 'TV', title: '豆瓣剧集' },
  tmdb_movie: { type: 'DISCOVER', subtype: 'MOV', title: 'TMDB电影' },
  tmdb_tv: { type: 'DISCOVER', subtype: 'TV', title: 'TMDB剧集' },
  downloaded: { type: 'DOWNLOADED', title: '最近下载' }
}

const DOUBAN_FILTERS: Record<string, FilterField> = {
  tag: {
    name: '标签',
    options: [
      { label: '热门', value: '热门' },
      { label: '最新', value: '最新' },
      { label: '经典', value: '经典' },
      { label: '冷门', value: '冷门' }
    ]
  },
  sort: {
    name: '排序',
    options: [
      { label: '综合排序', value: 'rank' },
      { label: '评分排序', value: 'rating' },
      { label: '时间排序', value: 'time' }
    ]
  }
}

const TMDB_FILTERS: Record<string, FilterField> = {
  with_genres: {
    name: '类型',
    options: [
      { label: '全部', value: '' },
      { label: '动作', value: '28' },
      { label: '冒险', value: '12' },
      { label: '动画', value: '16' },
      { label: '喜剧', value: '35' },
      { label: '犯罪', value: '80' },
      { label: '纪录片', value: '99' },
      { label: '剧情', value: '18' },
      { label: '家庭', value: '10751' },
      { label: '奇幻', value: '14' },
      { label: '历史', value: '36' },
      { label: '恐怖', value: '27' },
      { label: '音乐', value: '10402' },
      { label: '悬疑', value: '9648' },
      { label: '爱情', value: '10749' },
      { label: '科幻', value: '878' },
      { label: '战争', value: '10752' },
      { label: '西部', value: '37' }
    ]
  },
  sort_by: {
    name: '排序',
    options: [
      { label: '热门', value: 'popularity.desc' },
      { label: '评分', value: 'vote_average.desc' },
      { label: '上映日期', value: 'primary_release_date.desc' }
    ]
  },
  year: {
    name: '年份',
    options: (() => {
      const y = new Date().getFullYear()
      const opts = [{ label: '全部', value: '' }]
      for (let i = y; i >= 2000; i--) opts.push({ label: `${i}`, value: `${i}` })
      return opts
    })()
  }
}

const TABS: Array<{ label: string; name: string }> = [
  { label: '推荐', name: 'recommend' },
  { label: '豆瓣电影', name: 'douban_movie' },
  { label: '豆瓣剧集', name: 'douban_tv' },
  { label: 'TMDB电影', name: 'tmdb_movie' },
  { label: 'TMDB剧集', name: 'tmdb_tv' }
]

const route = useRoute()
const router = useRouter()
const modal = useModalStore()

const items = ref<RecommendItem[]>([])
const page = ref(1)
const loading = ref(false)
const noMore = ref(false)
const initializing = ref(false)
const filterParams = ref<Record<string, string>>({})

const isFilterable = computed(() => {
  const name = route.name as string
  return ['douban_movie', 'douban_tv', 'tmdb_movie', 'tmdb_tv'].includes(name)
})

const filterFields = computed(() => {
  const name = route.name as string
  if (name.startsWith('douban')) return DOUBAN_FILTERS
  if (name.startsWith('tmdb')) return TMDB_FILTERS
  return {}
})

const typeConfig = computed<TypeConfig>(() => {
  const name = route.name as string
  if (name === 'recommend') {
    const q = route.query
    const type = (q.type as string) || 'TRENDING'
    return {
      type,
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

const activeTab = computed(() => route.name as string)

function switchTab(name: string) {
  if (name === activeTab.value) return
  filterParams.value = {}
  router.push({ name })
}

function setFilter(key: string, value: string) {
  filterParams.value = { ...filterParams.value, [key]: value }
  reset()
}

function currentFilterLabel(fieldId: string, field: FilterField): string {
  const v = filterParams.value[fieldId]
  if (!v) return field.name
  const opt = field.options.find((o) => o.value === v)
  return opt ? opt.label : field.name
}

async function loadPage() {
  if (loading.value || noMore.value) return
  loading.value = true
  try {
    const cfg = typeConfig.value
    const params: Record<string, unknown> = {
      type: cfg.type,
      page: page.value
    }
    if (cfg.subtype) params.subtype = cfg.subtype
    if (cfg.week) params.week = cfg.week
    if (cfg.tmdbid) params.tmdbid = cfg.tmdbid
    if (cfg.personid) params.personid = cfg.personid
    if (cfg.keyword) params.keyword = cfg.keyword
    if (cfg.source) params.source = cfg.source
    const fp = filterParams.value
    if (Object.keys(fp).length) params.params = fp

    const res = await getRecommend(params as any)
    if (res.code === 0) {
      const list = res.Items || []
      if (list.length === 0) {
        noMore.value = true
      } else {
        items.value.push(...list)
        page.value += 1
      }
    } else {
      modal.error(res.msg || '加载失败')
      noMore.value = true
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '加载失败')
    noMore.value = true
  } finally {
    loading.value = false
  }
}

async function reset() {
  items.value = []
  page.value = 1
  noMore.value = false
  initializing.value = true
  for (let i = 0; i < 3; i++) {
    if (noMore.value) break
    await loadPage()
  }
  initializing.value = false
}

function onScroll() {
  if (loading.value || noMore.value) return
  const el = document.querySelector('.app-main')
  if (!el) return
  const { scrollTop, scrollHeight, clientHeight } = el
  if (scrollHeight - clientHeight - scrollTop < 300) {
    loadPage()
  }
}

function onFavChange(idx: number, fav: string) {
  if (items.value[idx]) items.value[idx].fav = fav
}

onMounted(() => {
  reset()
  const el = document.querySelector('.app-main')
  if (el) el.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => {
  const el = document.querySelector('.app-main')
  if (el) el.removeEventListener('scroll', onScroll)
})

watch(
  () => [route.name, route.query.type, route.query.subtype, route.query.week, route.query.tmdbid, route.query.personid, route.query.keyword],
  () => reset()
)
</script>

<template>
  <div class="recommend-view">
    <PageHeader :title="typeConfig.title" :description="typeConfig.subtitle">
      <template #actions>
        <el-radio-group :model-value="activeTab" size="default" @change="switchTab($event as string)">
          <el-radio-button v-for="tab in TABS" :key="tab.name" :value="tab.name">
            {{ tab.label }}
          </el-radio-button>
        </el-radio-group>
        <template v-if="isFilterable">
          <el-dropdown v-for="(field, key) in filterFields" :key="key" trigger="click" popper-class="recommend-filter-popper" @command="(v: string) => setFilter(key, v)">
            <el-button size="small">
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
      </template>
    </PageHeader>

    <el-empty
      v-if="!initializing && !loading && items.length === 0"
      description="没有数据"
    />

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
.recommend-view {
  padding: 16px;
}
.media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}
.load-tip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 24px 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
:deep(.el-dropdown-menu__item.selected) {
  color: var(--el-color-primary);
  font-weight: 600;
}
</style>
<style>
.recommend-filter-popper .el-dropdown-menu {
  max-height: 50vh;
  overflow-y: auto;
}
</style>
