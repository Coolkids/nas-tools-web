<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import ExploreSearchBar from '@/components/ExploreSearchBar.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import { personMedias, proxyDoubanImage, type RecommendItem } from '@/api/discovery'
import { useModalStore } from '@/stores/modal'

const route = useRoute()
const router = useRouter()
const modal = useModalStore()
const personId = computed(() => (route.query.id as string) || (route.query.tmdbid as string) || '')
const personName = computed(() => (route.query.name as string) || (route.query.title as string) || '人物')
const creditType = ref<'MOV' | 'TV'>(((route.query.type as string) || 'MOV').toUpperCase() === 'TV' ? 'TV' : 'MOV')
const items = ref<RecommendItem[]>([])
const page = ref(1)
const loading = ref(false)
const noMore = ref(false)
const loadError = ref('')
let generation = 0
let activeLoad: Promise<void> | null = null

function chooseType(type: 'MOV' | 'TV') {
  if (type === creditType.value) return
  creditType.value = type
  void router.replace({ path: route.path, query: { ...route.query, type } })
}

async function loadPage(currentGeneration = generation) {
  if (loading.value || noMore.value || !personId.value) return
  loading.value = true
  const request = (async () => {
    try {
      const response = await personMedias(personId.value, creditType.value, page.value)
      if (currentGeneration !== generation) return
      if (response.code === 0) {
        const list = response.data || []
        if (!list.length) noMore.value = true
        else {
          items.value.push(...list)
          page.value += 1
          if (list.length < 20) noMore.value = true
        }
        loadError.value = ''
      } else {
        noMore.value = true
        loadError.value = response.msg || '人物作品加载失败'
      }
    } catch (error) {
      if (currentGeneration !== generation) return
      noMore.value = true
      loadError.value = error instanceof Error ? error.message : '人物作品加载失败'
    }
  })()
  activeLoad = request
  try { await request } finally {
    if (activeLoad === request) activeLoad = null
    loading.value = false
  }
}

async function reset() {
  const currentGeneration = ++generation
  if (activeLoad) await activeLoad
  if (currentGeneration !== generation) return
  items.value = []
  page.value = 1
  noMore.value = false
  loadError.value = ''
  await loadPage(currentGeneration)
}

function onScroll() {
  if (loading.value || noMore.value) return
  const scrollTop = document.documentElement.scrollTop || document.body.scrollTop
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = document.documentElement.clientHeight
  if (scrollHeight - clientHeight - scrollTop < 240) void loadPage()
}

onMounted(() => { void reset(); window.addEventListener('scroll', onScroll, { passive: true }) })
onBeforeUnmount(() => { generation += 1; window.removeEventListener('scroll', onScroll) })
watch([personId, creditType], () => { void reset() })
watch(() => route.query.type, (value) => {
  const next = String(value || 'MOV').toUpperCase() === 'TV' ? 'TV' : 'MOV'
  if (next !== creditType.value) creditType.value = next
})
</script>

<template>
  <div class="person-page">
    <ExploreSearchBar />
    <PageHeader title="人物作品" :description="personName">
      <template #actions>
        <q-btn-toggle :model-value="creditType" unelevated toggle-color="primary" :options="[{ label: '参演电影', value: 'MOV' }, { label: '参演剧集', value: 'TV' }]" @update:model-value="chooseType" />
      </template>
    </PageHeader>

    <q-card flat bordered class="person-header">
      <q-avatar color="primary" text-color="white" size="88px" icon="person" />
      <div class="person-meta"><h2>{{ personName }}</h2><div class="text-caption text-grey-7">{{ creditType === 'MOV' ? '参演电影' : '参演剧集' }}</div></div>
    </q-card>
    <q-banner v-if="loadError" rounded class="person-alert q-mb-md" inline-actions><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="negative" label="重试" @click="reset" /></template></q-banner>

    <div v-if="loading && !items.length" class="loading-state"><q-spinner-orbit color="primary" size="42px" /><span>正在加载作品…</span></div>
    <div v-else-if="!loading && !items.length && !loadError" class="empty-state"><q-icon name="movie_filter" size="48px" color="grey-5" /><span>暂无作品</span></div>
    <div v-else class="media-grid">
      <MediaCard v-for="(item, index) in items" :key="`${item.id}-${index}`" :tmdb-id="item.id" :title="item.title" :image="proxyDoubanImage(item.image)" :fav="item.fav" :vote="item.vote" :year="item.year" :overview="item.overview" :date="item.date" :media-type="item.type" :res-type="item.media_type" show-sub="1" />
    </div>
    <div v-if="loading && items.length" class="load-tip"><q-spinner-dots color="primary" size="24px" /><span>加载更多…</span></div>
    <div v-else-if="noMore && items.length" class="load-tip"><q-icon name="done" size="18px" /><span>已经到底了</span></div>
    <ScrollToTop />
  </div>
</template>

<style scoped>
.person-page { max-width: 1600px; margin: 0 auto; padding: 24px 32px 40px; }
.person-alert { color: var(--text-primary); background: color-mix(in srgb, var(--q-negative) 10%, var(--surface)); }
.person-header { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; padding: 20px; background: var(--surface); border-color: var(--border-subtle); }
.person-meta { min-width: 0; }
.person-meta h2 { margin: 0; color: var(--text-primary); font-size: 22px; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
.loading-state, .empty-state, .load-tip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-secondary); font-size: 13px; }
.loading-state { min-height: 320px; }
.empty-state { min-height: 280px; }
.load-tip { flex-direction: row; padding: 28px 0 8px; }
@media (max-width: 1439px) { .person-page { padding-inline: 24px; } }
@media (max-width: 599px) { .person-page { padding: 16px 16px calc(32px + var(--safe-bottom)); } .person-header { padding: 16px; } .media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
</style>
