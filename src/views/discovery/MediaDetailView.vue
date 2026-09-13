<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import PersonCard from '@/components/PersonCard.vue'
import AddRssMediaDialog from '@/components/AddRssMediaDialog.vue'
import ExploreSearchBar from '@/components/ExploreSearchBar.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import { mediaDetail, mediaRecommendations, mediaPerson, proxyDoubanImage, type MediaDetail, type RecommendItem, type PersonItem } from '@/api/discovery'
import { search } from '@/api/media'
import { removeRssMedia } from '@/api/rss'
import { useModalStore } from '@/stores/modal'

const route = useRoute()
const router = useRouter()
const modal = useModalStore()
const media = ref<MediaDetail | null>(null)
const recommendations = ref<RecommendItem[]>([])
const persons = ref<PersonItem[]>([])
const loading = ref(false)
const loadingRec = ref(false)
const loadingPerson = ref(false)
const errMsg = ref('')
const recError = ref('')
const personError = ref('')
const rssDialogVisible = ref(false)
let generation = 0

const mediaType = computed(() => (route.query.type as string) || 'movie')
const backdropStyle = computed(() => media.value?.background ? { backgroundImage: `url(${media.value.background})` } : {})

async function loadAll() {
  const currentGeneration = ++generation
  const id = (route.query.id as string) || ''
  if (!id) { errMsg.value = '未指定媒体 ID'; return }
  loading.value = true
  errMsg.value = ''
  recError.value = ''
  personError.value = ''
  media.value = null
  recommendations.value = []
  persons.value = []
  try {
    const response = await mediaDetail(mediaType.value, id)
    if (currentGeneration !== generation) return
    if (response.code !== 0 || !response.data) { errMsg.value = response.msg || '未查询到媒体信息'; return }
    media.value = response.data
    loadingRec.value = true
    loadingPerson.value = true
    const [rec, people] = await Promise.allSettled([mediaRecommendations(mediaType.value, response.data.tmdbid), mediaPerson(mediaType.value, response.data.tmdbid)])
    if (currentGeneration !== generation) return
    if (rec.status === 'fulfilled' && rec.value.code === 0) recommendations.value = rec.value.data || []
    else recError.value = '推荐内容暂不可用'
    if (people.status === 'fulfilled' && people.value.code === 0) persons.value = people.value.data || []
    else personError.value = '演职员信息暂不可用'
  } catch (error) {
    if (currentGeneration === generation) errMsg.value = error instanceof Error ? error.message : '加载失败'
  } finally {
    if (currentGeneration === generation) {
      loading.value = false
      loadingRec.value = false
      loadingPerson.value = false
    }
  }
}

async function onSearchResource() {
  if (!media.value) return
  modal.showLoading(`正在搜索 ${media.value.title} ...`)
  try {
    const response = await search({ tmdbid: media.value.tmdbid, search_word: media.value.title, media_type: mediaType.value })
    if (response.code === 0) void router.push({ path: '/search', query: { q: media.value.title } })
    else modal.error(response.msg || '搜索失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '搜索请求失败')
  } finally {
    modal.hideLoading()
  }
}

async function onToggleFav() {
  if (!media.value) return
  if (media.value.fav === '1') {
    const ok = await modal.confirm(`是否确定将 ${media.value.title} 从订阅中移除？`)
    if (!ok) return
    try {
      const response = await removeRssMedia({ name: media.value.title, type: mediaType.value.toUpperCase() === 'TV' ? 'TV' : 'MOV', year: media.value.year, tmdbid: media.value.tmdbid })
      if (response.code === 0) { media.value.fav = '0'; modal.success('已取消订阅') }
      else modal.error(response.msg || '取消订阅失败')
    } catch (error) {
      modal.error(error instanceof Error ? error.message : '取消订阅失败')
    }
  } else rssDialogVisible.value = true
}

function onRssSuccess() {
  if (media.value) media.value.fav = '1'
  rssDialogVisible.value = false
}

onMounted(loadAll)
watch(() => [route.query.type, route.query.id], loadAll)
onBeforeUnmount(() => { generation += 1 })
</script>

<template>
  <div class="detail-page">
    <ExploreSearchBar />
    <PageHeader title="媒体详情">
      <template #actions><q-btn flat icon="arrow_back" label="返回" @click="router.back" /></template>
    </PageHeader>

    <q-banner v-if="errMsg" rounded class="detail-alert" inline-actions><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ errMsg }}<template #action><q-btn flat color="negative" label="重试" @click="loadAll" /></template></q-banner>
    <div v-else-if="loading && !media" class="loading-state"><q-spinner-orbit color="primary" size="42px" /><span>正在加载媒体信息…</span></div>

    <template v-else-if="media">
      <section class="hero" :style="backdropStyle">
        <div class="hero-mask" />
        <div class="hero-content">
          <q-img v-if="media.image" :src="media.image" :alt="media.title" ratio=".67" class="hero-poster" />
          <div v-else class="hero-poster poster-placeholder"><q-icon name="movie" size="42px" /></div>
          <div class="hero-info">
            <q-badge v-if="media.fav === '2'" color="positive" label="已下载" class="q-mb-sm" />
            <h1>{{ media.title }} <span v-if="media.year">（{{ media.year }}）</span></h1>
            <div class="meta-row"><q-chip v-if="media.tmdbid" dense color="info" text-color="white" :label="`TMDB: ${media.tmdbid}`" /><q-chip v-if="media.vote && media.vote !== '0'" dense color="warning" text-color="white" :label="`评分 ${media.vote}`" /><span v-if="media.runtime">{{ media.runtime }}</span><span v-if="media.genres">{{ media.genres }}</span></div>
            <div class="hero-actions"><q-btn color="primary" unelevated icon="search" label="搜索资源" @click="onSearchResource" /><q-btn :outline="media.fav !== '1'" :color="media.fav === '1' ? 'negative' : 'white'" :icon="media.fav === '1' ? 'star' : 'star_border'" :label="media.fav === '1' ? '删除订阅' : '添加订阅'" @click="onToggleFav" /></div>
          </div>
        </div>
      </section>

      <div class="info-grid q-mt-lg">
        <q-card flat bordered class="info-card"><q-card-section><h2 class="section-title">简介</h2><p class="overview">{{ media.overview || '暂无简介' }}</p><div v-if="media.crews?.length" class="crew-list"><div v-for="(crew, index) in media.crews" :key="index" class="crew-item"><strong>{{ Object.keys(crew)[0] }}</strong><span>{{ Object.values(crew)[0] }}</span></div></div></q-card-section></q-card>
        <q-card v-if="media.fact?.length" flat bordered class="info-card"><q-card-section><h2 class="section-title">发布信息</h2><div class="fact-list"><div v-for="(fact, index) in media.fact" :key="index" class="fact-row"><span>{{ Object.keys(fact)[0] }}</span><strong>{{ Object.values(fact)[0] }}</strong></div></div></q-card-section></q-card>
      </div>

      <section class="content-section"><div class="section-heading"><h2 class="section-title">演员阵容</h2><span v-if="persons.length" class="section-count">{{ persons.length }} 人</span></div><div v-if="loadingPerson" class="section-state"><q-spinner-dots color="primary" size="28px" /><span>加载中…</span></div><div v-else-if="personError" class="section-state"><q-icon name="error_outline" color="negative" size="28px" /><span>{{ personError }}</span></div><div v-else-if="!persons.length" class="section-state"><q-icon name="group" color="grey-5" size="32px" /><span>暂无演员信息</span></div><div v-else class="person-grid"><PersonCard v-for="person in persons" :key="person.id" :person-id="person.id" :image="person.image" :name="person.name" :role="person.role" /></div></section>
      <section class="content-section"><div class="section-heading"><h2 class="section-title">推荐影片</h2><span v-if="recommendations.length" class="section-count">{{ recommendations.length }} 部</span></div><div v-if="loadingRec" class="section-state"><q-spinner-dots color="primary" size="28px" /><span>加载中…</span></div><div v-else-if="recError" class="section-state"><q-icon name="error_outline" color="negative" size="28px" /><span>{{ recError }}</span></div><div v-else-if="!recommendations.length" class="section-state"><q-icon name="movie_filter" color="grey-5" size="32px" /><span>暂无推荐</span></div><div v-else class="media-grid"><MediaCard v-for="(item, index) in recommendations" :key="`${item.id}-${index}`" :tmdb-id="item.id" :title="item.title" :image="proxyDoubanImage(item.image)" :fav="item.fav" :vote="item.vote" :year="item.year" :overview="item.overview" :date="item.date" :media-type="item.type" :res-type="item.media_type" show-sub="1" /></div></section>
    </template>

    <AddRssMediaDialog v-model="rssDialogVisible" :type="mediaType.toUpperCase() === 'TV' ? 'TV' : 'MOV'" :initial-name="media?.title" :initial-year="media?.year" :initial-keyword="media?.title" @success="onRssSuccess" />
    <ScrollToTop />
  </div>
</template>

<style scoped>
.detail-page { max-width: 1600px; margin: 0 auto; }
.detail-alert { color: var(--text-primary); background: color-mix(in srgb, var(--q-negative) 10%, var(--surface)); }
.loading-state, .section-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 240px; color: var(--text-secondary); font-size: 13px; }
.hero { position: relative; overflow: hidden; min-height: 360px; border-radius: 14px; background-color: var(--surface-muted); background-position: center; background-size: cover; }
.hero-mask { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(7, 12, 22, .85), rgba(7, 12, 22, .5) 55%, rgba(7, 12, 22, .76)); }
.hero-content { position: relative; display: flex; align-items: flex-end; gap: 24px; min-height: 360px; padding: 28px; }
.hero-poster { flex: 0 0 160px; width: 160px; height: 240px; border-radius: 10px; background: rgba(255,255,255,.12); box-shadow: 0 8px 20px rgba(0,0,0,.35); }
.poster-placeholder { display: grid; place-items: center; color: rgba(255,255,255,.65); }
.hero-info { min-width: 0; color: #fff; }
.hero-info h1 { margin: 0 0 10px; font-size: 28px; line-height: 1.3; }
.hero-info h1 span { opacity: .78; font-size: 18px; font-weight: 400; }
.meta-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 18px; color: rgba(255,255,255,.78); font-size: 13px; }
.meta-row :deep(.q-chip) { margin: 0; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.info-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(280px, 1fr); gap: 16px; }
.info-card { background: var(--surface); border-color: var(--border-subtle); }
.section-title { margin: 0; padding-left: 10px; border-left: 3px solid var(--q-primary); color: var(--text-primary); font-size: 17px; font-weight: 650; }
.overview { margin: 16px 0 0; color: var(--text-primary); line-height: 1.75; white-space: pre-line; }
.crew-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin-top: 20px; }
.crew-item { display: flex; flex-direction: column; gap: 3px; color: var(--text-secondary); font-size: 13px; }
.crew-item strong { color: var(--text-primary); }
.fact-list { margin-top: 16px; }
.fact-row { display: flex; justify-content: space-between; gap: 14px; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); color: var(--text-secondary); font-size: 13px; }
.fact-row:last-child { border-bottom: 0; }
.fact-row strong { color: var(--text-primary); text-align: right; word-break: break-word; }
.content-section { margin-top: 28px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.section-count { color: var(--text-secondary); font-size: 12px; }
.person-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
@media (max-width: 1023px) { .info-grid { grid-template-columns: 1fr; } }
@media (max-width: 599px) { .hero, .hero-content { min-height: 0; } .hero-content { flex-direction: column; align-items: center; padding: 24px 18px; text-align: center; } .hero-poster { flex-basis: 190px; width: 128px; height: 190px; } .hero-info h1 { font-size: 23px; } .meta-row, .hero-actions { justify-content: center; } .info-grid { gap: 10px; } .person-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; } .media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
</style>
