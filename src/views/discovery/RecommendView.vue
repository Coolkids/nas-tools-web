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
      { label: '喜剧', value: '喜剧' },
      { label: '爱情', value: '爱情' },
      { label: '动作', value: '动作' },
      { label: '科幻', value: '科幻' },
      { label: '动画', value: '动画' },
      { label: '悬疑', value: '悬疑' },
      { label: '犯罪', value: '犯罪' },
      { label: '惊悚', value: '惊悚' },
      { label: '冒险', value: '冒险' },
      { label: '奇幻', value: '奇幻' },
      { label: '恐怖', value: '恐怖' },
      { label: '战争', value: '战争' },
      { label: '武侠', value: '武侠' },
      { label: '灾难', value: '灾难' }
    ]
  }
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
      { label: '华语', value: '华语' },
      { label: '中国大陆', value: '中国大陆' },
      { label: '中国香港', value: '中国香港' },
      { label: '中国台湾', value: '中国台湾' },
      { label: '欧美', value: '欧美' },
      { label: '韩国', value: '韩国' },
      { label: '日本', value: '日本' },
      { label: '印度', value: '印度' },
      { label: '泰国', value: '泰国' }
    ]
  }
}

const TMDB_MOVIE_FILTERS: Record<string, FilterField> = {
  with_genres: {
    name: '类型',
    options: [
      { label: '全部', value: '' },
      { label: '冒险', value: '12' },
      { label: '动画', value: '16' },
      { label: '喜剧', value: '35' },
      { label: '犯罪', value: '80' },
      { label: '剧情', value: '18' },
      { label: '奇幻', value: '14' },
      { label: '恐怖', value: '27' },
      { label: '悬疑', value: '9648' },
      { label: '爱情', value: '10749' },
      { label: '科幻', value: '878' },
      { label: '惊悚', value: '53' },
      { label: '战争', value: '10752' }
    ]
  },
  with_original_language: {
    name: '语言',
    options: [
      { label: '全部', value: '' },
      { label: '中文', value: 'zh' },
      { label: '英语', value: 'en' },
      { label: '日语', value: 'ja' },
      { label: '韩语', value: 'ko' },
      { label: '法语', value: 'fr' },
      { label: '德语', value: 'de' },
      { label: '俄语', value: 'ru' },
      { label: '印地语', value: 'hi' }
    ]
  }
}

const TMDB_TV_FILTERS: Record<string, FilterField> = {
  with_genres: {
    name: '类型',
    options: [
      { label: '全部', value: '' },
      { label: '动作冒险', value: '10759' },
      { label: '动画', value: '16' },
      { label: '喜剧', value: '35' },
      { label: '犯罪', value: '80' },
      { label: '纪录', value: '99' },
      { label: '剧情', value: '18' },
      { label: '儿童', value: '10762' },
      { label: '悬疑', value: '9648' },
      { label: '真人秀', value: '10764' },
      { label: '科幻', value: '10765' }
    ]
  },
  with_original_language: {
    name: '语言',
    options: [
      { label: '全部', value: '' },
      { label: '中文', value: 'zh' },
      { label: '英语', value: 'en' },
      { label: '日语', value: 'ja' },
      { label: '韩语', value: 'ko' },
      { label: '法语', value: 'fr' },
      { label: '德语', value: 'de' },
      { label: '俄语', value: 'ru' },
      { label: '印地语', value: 'hi' }
    ]
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
  if (name === 'douban_movie') return DOUBAN_MOVIE_FILTERS
  if (name === 'douban_tv') return DOUBAN_TV_FILTERS
  if (name === 'tmdb_movie') return TMDB_MOVIE_FILTERS
  if (name === 'tmdb_tv') return TMDB_TV_FILTERS
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
  if (v === undefined || v === null) return field.name
  const opt = field.options.find((o) => o.value === v)
  return opt ? opt.label : v
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
