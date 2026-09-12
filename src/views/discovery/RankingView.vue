<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import { getRecommend, proxyDoubanImage, type RecommendItem } from '@/api/discovery'

interface DiscoveryCategory { type: string; title: string; subtype?: string; week?: string }

const DISCOVERY_LIST: Record<string, DiscoveryCategory[]> = {
  RANKING: [
    { type: 'MOV', title: '正在热映', subtype: 'dbom' }, { type: 'MOV', title: '即将上映', subtype: 'dbnm' },
    { type: 'TRENDING', title: 'TMDB流行趋势', subtype: 'tmdb' }, { type: 'MOV', title: '豆瓣最新电影', subtype: 'dbnm' },
    { type: 'MOV', title: '豆瓣热门电影', subtype: 'dbhm' }, { type: 'MOV', title: '豆瓣电影TOP250', subtype: 'dbtop' },
    { type: 'TV', title: '豆瓣热门电视剧', subtype: 'dbht' }, { type: 'TV', title: '华语口碑剧集榜', subtype: 'dbct' },
    { type: 'TV', title: '全球口碑剧集榜', subtype: 'dbgt' }
  ],
  BANGUMI: [
    { type: 'TV', title: '星期一', subtype: 'bangumi', week: '1' }, { type: 'TV', title: '星期二', subtype: 'bangumi', week: '2' },
    { type: 'TV', title: '星期三', subtype: 'bangumi', week: '3' }, { type: 'TV', title: '星期四', subtype: 'bangumi', week: '4' },
    { type: 'TV', title: '星期五', subtype: 'bangumi', week: '5' }, { type: 'TV', title: '星期六', subtype: 'bangumi', week: '6' },
    { type: 'TV', title: '星期日', subtype: 'bangumi', week: '7' }
  ]
}

const route = useRoute()
const router = useRouter()
const tabs = [{ label: '榜单', name: 'ranking' }, { label: 'Bangumi 每日放送', name: 'bangumi' }]
const activeTab = computed(() => String(route.name || 'ranking'))
const discoveryType = computed(() => route.name === 'bangumi' ? 'BANGUMI' : 'RANKING')
const pageTitle = computed(() => discoveryType.value === 'BANGUMI' ? 'Bangumi 每日放送' : '榜单')
const categories = computed(() => DISCOVERY_LIST[discoveryType.value] || [])
const slideMap = ref<Record<string, RecommendItem[]>>({})
const loadingMap = ref<Record<string, boolean>>({})
const errorMap = ref<Record<string, boolean>>({})
let generation = 0

function switchTab(name: string) {
  if (name !== activeTab.value) void router.push({ name })
}

async function loadCategory(category: DiscoveryCategory, currentGeneration: number) {
  loadingMap.value[category.title] = true
  errorMap.value[category.title] = false
  try {
    const response = await getRecommend({ type: category.type, subtype: category.subtype, page: 1, week: category.week })
    if (currentGeneration !== generation) return
    if (response.code === 0) slideMap.value[category.title] = response.Items || []
    else errorMap.value[category.title] = true
  } catch {
    if (currentGeneration === generation) errorMap.value[category.title] = true
  } finally {
    if (currentGeneration === generation) loadingMap.value[category.title] = false
  }
}

function loadAll() {
  const currentGeneration = ++generation
  slideMap.value = {}
  loadingMap.value = {}
  errorMap.value = {}
  void Promise.all(categories.value.map((category) => loadCategory(category, currentGeneration)))
}

onMounted(loadAll)
watch(() => route.name, loadAll)
onBeforeUnmount(() => { generation += 1 })
</script>

<template>
  <div class="ranking-page">
    <PageHeader :title="pageTitle" description="按主题浏览媒体榜单">
      <template #actions>
        <q-tabs :model-value="activeTab" dense no-caps inline-label active-color="primary" indicator-color="primary" class="ranking-tabs" @update:model-value="switchTab">
          <q-route-tab v-for="tab in tabs" :key="tab.name" :name="tab.name" :to="{ name: tab.name }" :label="tab.label" />
        </q-tabs>
      </template>
    </PageHeader>

    <div class="sections">
      <q-card v-for="category in categories" :key="category.title" flat bordered class="ranking-section">
        <q-card-section class="section-heading"><div class="section-title">{{ category.title }}</div><q-icon name="chevron_right" color="grey-5" /></q-card-section>
        <q-card-section class="section-content">
          <div v-if="loadingMap[category.title]" class="section-state"><q-spinner-dots color="primary" size="28px" /><span>加载中…</span></div>
          <div v-else-if="errorMap[category.title]" class="section-state"><q-icon name="error_outline" color="negative" size="28px" /><span>加载失败，请刷新重试</span></div>
          <div v-else-if="!slideMap[category.title]?.length" class="section-state"><q-icon name="movie_filter" color="grey-5" size="28px" /><span>暂无数据</span></div>
          <div v-else class="slide-row">
            <MediaCard v-for="(item, index) in slideMap[category.title]" :key="`${category.title}-${item.id}-${index}`" :tmdb-id="item.id" :title="item.title" :image="proxyDoubanImage(item.image)" :fav="item.fav" :vote="item.vote" :year="item.year" :overview="item.overview" :date="item.date" :media-type="item.type" :res-type="item.media_type" show-sub="1" :site="item.site" :weekday="item.weekday" />
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<style scoped>
.ranking-page { max-width: 1600px; margin: 0 auto; padding: 24px 32px 40px; }
.ranking-tabs { max-width: 420px; }
.ranking-tabs :deep(.q-tab) { min-height: 42px; padding-inline: 12px; }
.sections { display: grid; gap: 16px; }
.ranking-section { overflow: hidden; background: var(--surface); border-color: var(--border-subtle); }
.section-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; }
.section-title { padding-left: 10px; border-left: 3px solid var(--q-primary); color: var(--text-primary); font-size: 16px; font-weight: 650; }
.section-content { padding-top: 8px; }
.section-state { display: flex; min-height: 180px; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-secondary); font-size: 13px; }
.slide-row { display: grid; grid-auto-flow: column; grid-auto-columns: 160px; gap: 12px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; }
@media (max-width: 1439px) { .ranking-page { padding-inline: 24px; } }
@media (max-width: 599px) { .ranking-page { padding: 16px 16px calc(32px + var(--safe-bottom)); } .ranking-tabs { width: 100%; overflow: auto; } .ranking-tabs :deep(.q-tabs__content) { justify-content: flex-start; } .ranking-tabs :deep(.q-tab) { padding-inline: 8px; font-size: 12px; } .slide-row { grid-auto-columns: 136px; gap: 10px; } }
</style>
