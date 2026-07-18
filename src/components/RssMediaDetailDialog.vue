<script setup lang="ts">
import { computed } from 'vue'
import { Refresh, Search, Edit, Close, Delete } from '@element-plus/icons-vue'
import { removeRssMedia, refreshRss, type RssMediaItem, type RssType } from '@/api/rss'
import { useModalStore } from '@/stores/modal'

const props = defineProps<{
  modelValue: boolean
  item: RssMediaItem | null
  type: RssType
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'edit', rssid: string | number): void
  (e: 'removed'): void
  (e: 'searched'): void
  (e: 'refreshed'): void
}>()

const modal = useModalStore()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const item = computed(() => props.item)

const hasBadges = computed(() =>
  item.value && (item.value.over_edition || item.value.fuzzy_match || item.value.filter_restype || item.value.filter_pix || item.value.filter_team)
)

function stateMeta(state?: string) {
  switch (state) {
    case 'D': return { label: '队列中', type: 'info' as const }
    case 'S': return { label: '正在搜索', type: 'warning' as const }
    case 'R': return { label: '正在订阅', type: 'success' as const }
    default: return { label: '完成', type: 'primary' as const }
  }
}

function progressOf(item: RssMediaItem) {
  const total = item.total || 0
  if (total <= 0) return 0
  const done = total - (item.lack || 0)
  return Math.round((done * 100) / total)
}

function doneOf(item: RssMediaItem) {
  const total = item.total || 0
  if (total <= 0) return null
  return `${total - (item.lack || 0)}/${total}`
}

async function onRemove() {
  if (!item.value) return
  const ok = await modal.confirm(`确认删除订阅「${item.value.name}」？`, '取消订阅')
  if (!ok) return
  try {
    const res = await removeRssMedia({
      name: item.value.name,
      type: props.type,
      year: item.value.year,
      season: item.value.season,
      rssid: item.value.id,
      tmdbid: item.value.tmdbid
    })
    if (res.code === 0) {
      modal.success('取消订阅成功')
      visible.value = false
      emit('removed')
    } else {
      modal.error(res.msg || '取消订阅失败')
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '取消订阅失败')
  }
}

function onEdit() {
  if (!item.value) return
  visible.value = false
  emit('edit', item.value.id)
}

async function onSearch() {
  if (!item.value) return
  try {
    const res = await refreshRss(item.value.id, props.type)
    if (res.code === 0) {
      modal.success('已触发搜索')
      emit('searched')
    } else {
      modal.error(res.msg || '触发搜索失败')
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '触发搜索失败')
  }
}

async function onRefresh() {
  if (!item.value) return
  try {
    const res = await refreshRss(item.value.id, props.type)
    if (res.code === 0) {
      modal.success('已触发刷新')
      emit('refreshed')
    } else {
      modal.error(res.msg || '触发刷新失败')
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '触发刷新失败')
  }
}

function goTmdb() {
  if (!item.value?.tmdbid) return
  const base = props.type === 'TV' ? 'https://www.themoviedb.org/tv' : 'https://www.themoviedb.org/movie'
  window.open(`${base}/${item.value.tmdbid}`, '_blank')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="item?.name || ''"
    width="680px"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    top="6vh"
  >
    <div v-if="item" class="detail-body">
      <div class="detail-left">
        <el-image :src="item.image" fit="cover" class="detail-poster">
          <template #error>
            <div class="poster-placeholder">
              <el-icon :size="36"><el-icon-film /></el-icon>
            </div>
          </template>
        </el-image>
      </div>
      <div class="detail-right">
        <div class="detail-header">
          <div class="detail-title">
            <span v-if="item.tmdbid" class="name tmdb-link" @click="goTmdb">{{ item.name }}</span>
            <span v-else class="name">{{ item.name }}</span>
            <span v-if="item.year" class="year">({{ item.year }})</span>
            <span v-if="item.season && item.season !== 'S00'" class="season">{{ item.season }}</span>
          </div>
          <div class="detail-rating" v-if="item.vote">
            <el-tag size="small" type="warning" effect="dark">{{ item.vote }}</el-tag>
          </div>
        </div>

        <div class="detail-meta">
          <el-tag size="small" :type="stateMeta(item.state).type" effect="light">
            {{ stateMeta(item.state).label }}
          </el-tag>
          <span v-if="doneOf(item)" class="ep-count">{{ doneOf(item) }}</span>
          <el-progress
            v-if="type === 'TV' && item.total && item.total > 0"
            :percentage="progressOf(item)"
            :show-text="false"
            :stroke-width="4"
            class="detail-progress"
          />
        </div>

        <div v-if="item.overview" class="detail-overview">{{ item.overview }}</div>

        <div v-if="hasBadges" class="detail-badges">
          <el-tag v-if="item.over_edition" size="small" type="danger" effect="dark">洗版</el-tag>
          <el-tag v-if="item.fuzzy_match" size="small" type="warning" effect="dark">模糊匹配</el-tag>
          <el-tag v-if="item.filter_restype" size="small">{{ item.filter_restype }}</el-tag>
          <el-tag v-if="item.filter_pix" size="small">{{ item.filter_pix }}</el-tag>
          <el-tag v-if="item.filter_team" size="small" effect="plain">{{ item.filter_team }}</el-tag>
        </div>

        <div v-if="item.rss_sites?.length" class="detail-sites">
          <span class="sites-label">订阅站点：</span>
          <el-tag v-for="s in item.rss_sites" :key="s" size="small" effect="plain" type="info">{{ s }}</el-tag>
        </div>
        <div v-if="item.search_sites?.length" class="detail-sites">
          <span class="sites-label">搜索站点：</span>
          <el-tag v-for="s in item.search_sites" :key="s" size="small" effect="plain" type="success">{{ s }}</el-tag>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="detail-actions">
        <el-button :icon="Edit" @click="onEdit">编辑</el-button>
        <el-button :icon="Delete" type="danger" @click="onRemove">取消订阅</el-button>
        <el-button :icon="Search" @click="onSearch">搜索</el-button>
        <el-button :icon="Refresh" @click="onRefresh">刷新</el-button>
        <el-button :icon="Close" @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.detail-body {
  display: flex;
  gap: 20px;
}
.detail-left {
  flex-shrink: 0;
  width: 180px;
}
.detail-poster {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  display: block;
}
.poster-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  color: var(--el-text-color-placeholder);
}
.detail-right {
  flex: 1;
  min-width: 0;
}
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.detail-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.3;
}
.detail-title .name.tmdb-link {
  cursor: pointer;
  color: var(--el-color-primary);
  transition: color 0.2s;
}
.detail-title .name.tmdb-link:hover {
  color: var(--el-color-primary-light-3);
}
.detail-title .year,
.detail-title .season {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
  margin-left: 4px;
}
.detail-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
.ep-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.detail-progress {
  flex: 1;
  min-width: 80px;
}
.detail-overview {
  font-size: 13px;
  color: var(--el-text-color-regular);
  line-height: 1.6;
  margin-bottom: 12px;
  display: -webkit-box;
  -webkit-line-clamp: 7;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.detail-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 8px;
}
.detail-sites {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
  align-items: center;
}
.sites-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  flex-shrink: 0;
}
.detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
</style>