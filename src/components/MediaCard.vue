<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { search } from '@/api/media'
import { removeRssMedia } from '@/api/rss'
import { useModalStore } from '@/stores/modal'
import AddRssMediaDialog from './AddRssMediaDialog.vue'

const props = defineProps<{
  tmdbId?: string | number
  title?: string
  image?: string
  fav?: string
  vote?: string | number
  year?: string
  overview?: string
  date?: string
  mediaType?: string
  resType?: string
  showSub?: string
  site?: string
  weekday?: string
}>()

const emit = defineEmits<{ (e: 'fav-change', fav: string): void }>()
const router = useRouter()
const modal = useModalStore()
const rssDialogVisible = ref(false)
const imageFailed = ref(false)

watch(() => props.image, () => { imageFailed.value = false })

function goDetail() {
  if (props.tmdbId && props.mediaType) router.push({ path: '/media_detail', query: { type: props.mediaType, id: String(props.tmdbId) } })
}

async function onSearchClick(event: Event) {
  event.stopPropagation()
  if (!props.tmdbId || !props.title) return
  modal.showLoading(`正在搜索 ${props.title} ...`)
  try {
    const response = await search({ tmdbid: props.tmdbId, search_word: props.title, media_type: props.mediaType })
    if (response.code === 0) router.push({ path: '/search', query: { q: props.title } })
    else modal.error(response.msg || '搜索失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '搜索请求失败')
  } finally {
    modal.hideLoading()
  }
}

async function onLoveClick(event: Event) {
  event.stopPropagation()
  if (!props.title || !props.tmdbId) return
  if (props.fav === '1') {
    const ok = await modal.confirm(`是否确定将 ${props.title} 从订阅中移除？`)
    if (!ok) return
    try {
      const response = await removeRssMedia({ name: props.title, type: props.mediaType === 'TV' ? 'TV' : 'MOV', year: props.year, tmdbid: props.tmdbId })
      if (response.code === 0) {
        emit('fav-change', '0')
        modal.success('已取消订阅')
      } else modal.error(response.msg || '取消订阅失败')
    } catch (error) {
      modal.error(error instanceof Error ? error.message : '取消订阅失败')
    }
  } else {
    rssDialogVisible.value = true
  }
}

function onRssSuccess() {
  emit('fav-change', '1')
  rssDialogVisible.value = false
}

function formatVote(value: string | number | undefined) {
  if (value === undefined || value === null) return ''
  const text = String(value).replace(/[\[\]]/g, '').trim()
  return !text || text === '0' || text === '0.0' ? '' : text
}

const voteText = computed(() => formatVote(props.vote))
</script>

<template>
  <article class="media-card" :aria-label="title || '媒体'" tabindex="0" @click="goDetail" @keyup.enter="goDetail">
    <div class="card-poster">
      <q-img v-if="image && !imageFailed" :src="image" :alt="title || '媒体海报'" class="poster-img" fit="cover" @error="imageFailed = true" />
      <div v-else class="poster-placeholder" aria-hidden="true"><q-icon name="movie" size="36px" /></div>

      <span v-if="weekday" class="badge badge-weekday">{{ weekday }}</span>
      <span v-else-if="resType" class="badge" :class="resType === '电影' ? 'badge-movie' : 'badge-tv'">{{ resType }}</span>
      <div v-if="fav === '2'" class="badge badge-downloaded" title="已下载"><q-icon name="check" size="16px" /></div>
      <div v-else-if="voteText" class="badge badge-vote">{{ voteText }}</div>

      <div class="card-overlay">
        <div class="overlay-content">
          <div v-if="site || year" class="overlay-year">{{ site || year }}</div>
          <h3 v-if="title" class="overlay-title">{{ title }}</h3>
          <p v-if="overview" class="overlay-overview">{{ overview }}</p>
          <small v-if="date" class="overlay-date">{{ date }}</small>
        </div>
        <div v-if="showSub === '1'" class="overlay-actions">
          <q-btn flat round icon="search" color="white" aria-label="搜索资源" @click.stop="onSearchClick" />
          <q-btn flat round :icon="fav === '1' ? 'star' : 'star_border'" :color="fav === '1' ? 'pink-4' : 'white'" aria-label="加入或取消订阅" @click.stop="onLoveClick" />
        </div>
      </div>
    </div>
  </article>

  <AddRssMediaDialog v-model="rssDialogVisible" :type="mediaType === 'TV' ? 'TV' : 'MOV'" :initial-name="title" :initial-year="year" :initial-keyword="title" @success="onRssSuccess" />
</template>

<style scoped>
.media-card { position: relative; overflow: hidden; aspect-ratio: 2 / 3; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-muted); cursor: pointer; box-shadow: 0 2px 8px rgba(20, 29, 48, .08); transition: transform .18s ease, box-shadow .18s ease; }
.media-card:hover, .media-card:focus-within { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(20, 29, 48, .16); }
.card-poster { position: relative; width: 100%; height: 100%; }
.poster-img { display: block; width: 100%; height: 100%; }
.poster-placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--text-secondary); background: var(--surface-muted); }
.badge { position: absolute; top: 8px; padding: 3px 8px; border-radius: 12px; color: #fff; font-size: 12px; line-height: 1.2; }
.badge-weekday, .badge-movie { left: 8px; background: var(--q-positive); }
.badge-weekday { background: #e86b2e; }
.badge-tv { left: 8px; background: var(--q-info); }
.badge-downloaded { right: 8px; display: grid; place-items: center; padding: 4px; background: var(--q-positive); }
.badge-vote { right: 8px; background: #7452c8; }
.card-overlay { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; padding: 12px; color: #fff; background: linear-gradient(180deg, rgba(8, 12, 22, .78), rgba(8, 12, 22, .18) 42%, rgba(8, 12, 22, .86)); opacity: 0; transition: opacity .2s ease; }
.media-card:hover .card-overlay, .media-card:focus-within .card-overlay { opacity: 1; }
.overlay-content { overflow: hidden; }
.overlay-year { margin-bottom: 5px; font-size: 12px; font-weight: 650; }
.overlay-title { display: -webkit-box; overflow: hidden; margin: 0 0 6px; font-size: 16px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.overlay-overview { display: -webkit-box; overflow: hidden; margin: 0 0 6px; font-size: 12px; line-height: 1.45; -webkit-box-orient: vertical; -webkit-line-clamp: 6; }
.overlay-date { font-size: 11px; }
.overlay-actions { display: flex; align-items: center; justify-content: space-between; }
@media (max-width: 599px) {
  .card-overlay { padding: 10px; opacity: 1; background: linear-gradient(180deg, rgba(8, 12, 22, .35), rgba(8, 12, 22, .9)); }
  .overlay-overview { -webkit-line-clamp: 3; }
  .overlay-content { padding-top: 24px; }
  .overlay-title { font-size: 14px; }
}
@media (prefers-reduced-motion: reduce) { .media-card { transition: none; } }
</style>
