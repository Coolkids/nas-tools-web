<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Star, Search, Check } from '@element-plus/icons-vue'
import { search } from '@/api/media'
import { removeRssMedia } from '@/api/rss'
import { useModalStore } from '@/stores/modal'
import AddRssMediaDialog from './AddRssMediaDialog.vue'

const props = defineProps<{
  tmdbId?: string | number
  title?: string
  image?: string
  fav?: string // "0" 未订阅 "1" 已订阅 "2" 已下载
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

function goDetail() {
  if (props.tmdbId && props.mediaType) {
    router.push({ path: '/media_detail', query: { type: props.mediaType, id: String(props.tmdbId) } })
  }
}

async function onSearchClick(e: MouseEvent) {
  e.stopPropagation()
  if (!props.tmdbId || !props.title) return
  modal.showLoading(`正在搜索 ${props.title} ...`)
  try {
    const res = await search({ tmdbid: props.tmdbId, search_word: props.title, media_type: props.mediaType })
    if (res.code === 0) {
      router.push({ path: '/search', query: { q: props.title } })
    } else {
      modal.error(res.msg || '搜索失败')
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '搜索请求失败')
  } finally {
    modal.hideLoading()
  }
}

async function onLoveClick(e: MouseEvent) {
  e.stopPropagation()
  if (!props.title || !props.tmdbId) return

  if (props.fav === '1') {
    const ok = await modal.confirm(`是否确定将 ${props.title} 从订阅中移除？`)
    if (!ok) return
    try {
      const res = await removeRssMedia({
        name: props.title,
        type: props.mediaType === 'TV' ? 'TV' : 'MOV',
        year: props.year,
        tmdbid: props.tmdbId
      })
      if (res.code === 0) {
        emit('fav-change', '0')
        modal.success('已取消订阅')
      } else {
        modal.error(res.msg || '取消订阅失败')
      }
    } catch (e) {
      modal.error(e instanceof Error ? e.message : '取消订阅失败')
    }
  } else {
    rssDialogVisible.value = true
  }
}

function onRssSuccess() {
  emit('fav-change', '1')
  rssDialogVisible.value = false
}

function formatVote(v: string | number | undefined): string {
  if (v === undefined || v === null) return ''
  const s = String(v).replace(/[\[\]]/g, '').trim()
  if (!s || s === '0' || s === '0.0') return ''
  return s
}

const voteText = computed(() => formatVote(props.vote))
</script>

<template>
  <div class="media-card" @click="goDetail">
    <div class="card-poster">
      <img
        v-if="image"
        :src="image"
        :alt="title"
        class="poster-img"
        @error="($event.target as HTMLImageElement).style.display = 'none'"
      />
      <div v-else class="poster-placeholder">
        <el-icon :size="32"><Film /></el-icon>
      </div>

      <span v-if="weekday" class="badge badge-weekday">{{ weekday }}</span>
      <span v-else-if="resType" class="badge" :class="resType === '电影' ? 'badge-movie' : 'badge-tv'">{{ resType }}</span>

      <div v-if="fav === '2'" class="badge badge-downloaded">
        <el-icon><Check /></el-icon>
      </div>
      <div v-else-if="voteText" class="badge badge-vote">{{ voteText }}</div>

      <div class="card-overlay">
        <div class="overlay-content">
          <div v-if="site || year" class="overlay-year">{{ site || year }}</div>
          <h3 v-if="title" class="overlay-title">{{ title }}</h3>
          <p v-if="overview" class="overlay-overview">{{ overview }}</p>
          <small v-if="date" class="overlay-date">{{ date }}</small>
        </div>
        <div v-if="showSub === '1'" class="overlay-actions">
          <el-icon class="action-icon" title="搜索资源" @click="onSearchClick"><Search /></el-icon>
          <el-icon
            class="action-icon"
            :class="{ 'icon-filled': fav === '1' }"
            title="加入/取消订阅"
            @click="onLoveClick"
          >
            <Star />
          </el-icon>
        </div>
      </div>
    </div>
  </div>

  <AddRssMediaDialog
    v-model="rssDialogVisible"
    :type="mediaType === 'TV' ? 'TV' : 'MOV'"
    :initial-name="title"
    :initial-year="year"
    :initial-keyword="title"
    @success="onRssSuccess"
  />
</template>

<style scoped>
.media-card {
  cursor: pointer;
  border-radius: 8px;
  overflow: hidden;
  position: relative;
  aspect-ratio: 2 / 3;
  background-color: var(--el-fill-color-light);
  box-shadow: 0 0 0 1px var(--el-border-color);
  transition: transform 0.15s;
}
.media-card:hover {
  transform: translateY(-2px);
}
.card-poster {
  width: 100%;
  height: 100%;
  position: relative;
}
.poster-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.poster-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--el-text-color-placeholder);
}
.badge {
  position: absolute;
  top: 8px;
  border-radius: 12px;
  padding: 2px 8px;
  font-size: 12px;
  color: #fff;
}
.badge-weekday { left: 8px; background: #e8590c; }
.badge-movie { left: 8px; background: #2fb344; }
.badge-tv { left: 8px; background: #4299e1; }
.badge-downloaded { right: 8px; background: #2fb344; padding: 4px; }
.badge-vote { right: 8px; background: #8957e5; }
.card-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.2s;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 10px;
}
.media-card:hover .card-overlay {
  opacity: 1;
}
.overlay-content {
  color: #fff;
  overflow: hidden;
}
.overlay-year { font-weight: 700; margin-bottom: 4px; }
.overlay-title {
  margin: 0 0 4px;
  font-size: 16px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.overlay-overview {
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 6;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.overlay-date { font-size: 11px; }
.overlay-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.action-icon {
  color: #fff;
  font-size: 20px;
  cursor: pointer;
}
.icon-filled {
  color: #e03997;
}
</style>
