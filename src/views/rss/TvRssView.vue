<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, Clock, Film, Plus, MoreFilled, Search } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'
import { getTvRssList, type RssMediaItem } from '@/api/rss'
import AddRssMediaDialog from '@/components/AddRssMediaDialog.vue'
import RssMediaDetailDialog from '@/components/RssMediaDetailDialog.vue'

const router = useRouter()
const modal = useModalStore()

const loading = ref(false)
const items = ref<RssMediaItem[]>([])
const nameFilter = ref('')
const addDialogVisible = ref(false)
const detailDialogVisible = ref(false)
const selectedItem = ref<RssMediaItem | null>(null)
const editRssid = ref<string | number>('')
const editDialogVisible = ref(false)

const filterRuleMap = ref<Record<string, string>>({})

async function loadFilterRules() {
  try {
    const res = await doAction<{ code: number; ruleGroups?: Array<{ id: number | string; name: string }> }>('get_filterrules', {})
    if (res.code === 0 && res.ruleGroups) {
      const map: Record<string, string> = {}
      for (const g of res.ruleGroups) map[String(g.id)] = g.name
      filterRuleMap.value = map
    }
  } catch {
    // 忽略
  }
}

function ruleName(id: string | number): string {
  return filterRuleMap.value[String(id)] || String(id)
}

onMounted(() => {
  loadFilterRules()
  load()
})

function addSuccess() {
  modal.success('添加订阅成功')
  addDialogVisible.value = false
  load()
}

function addError(msg: string) {
  modal.error(msg)
}

async function load() {
  loading.value = true
  try {
    const res = await getTvRssList()
    if (res.code === 0) items.value = Object.values(res.result || {})
    else modal.error(res.msg || '获取电视剧订阅失败')
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '获取电视剧订阅失败')
  } finally {
    loading.value = false
  }
}

const filteredItems = computed(() => {
  if (!nameFilter.value.trim()) return items.value
  const q = nameFilter.value.trim().toLowerCase()
  return items.value.filter(item => (item.name || '').toLowerCase().includes(q))
})

const count = computed(() => filteredItems.value.length)

function stateMeta(state?: string) {
  switch (state) {
    case 'D':
      return { label: '队列中', type: 'info' as const }
    case 'S':
      return { label: '正在搜索', type: 'warning' as const }
    case 'R':
      return { label: '正在订阅', type: 'success' as const }
    default:
      return { label: '完成', type: 'primary' as const }
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

function openDetail(item: RssMediaItem) {
  selectedItem.value = item
  detailDialogVisible.value = true
}

function onDetailRemoved() { load() }
function onDetailSearched() { load() }
function onDetailRefreshed() { load() }

function onDetailEdit(rssid: string | number) {
  editRssid.value = rssid
  editDialogVisible.value = true
}

function onEditSuccess() {
  modal.success('编辑订阅成功')
  editDialogVisible.value = false
  load()
}

function onEditError(msg: string) {
  modal.error(msg)
}

function goHistory() {
  router.push({ path: '/rss_history', query: { t: 'TV' } })
}
</script>

<template>
  <div class="tv-rss">
    <PageHeader title="电视剧订阅" description="管理已订阅的电视剧">
      <template #actions>
        <el-input
          v-model="nameFilter"
          placeholder="搜索标题..."
          :prefix-icon="Search"
          clearable
          class="search-input"
        />
        <span class="filter-count">共 {{ filteredItems.length }} 条</span>
        <el-button :icon="Plus" type="primary" @click="addDialogVisible = true">新增订阅</el-button>
        <el-button :icon="Clock" @click="goHistory">订阅历史</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
      </template>
    </PageHeader>

    <el-empty
      v-if="!loading && filteredItems.length === 0"
      description="当前没有正在订阅的电视剧。"
    />

      <div v-else v-loading="loading" class="card-grid">
        <el-card
          v-for="item in filteredItems"
          :key="item.id"
          class="rss-card"
          shadow="hover"
          :body-style="{ padding: '0' }"
        >
          <div class="card-bg">
            <img :src="item.image" class="bg-image" alt="" />
            <div class="card-bg-overlay" />
            <div class="card-top-right" @click.stop="openDetail(item)">
              <el-icon :size="20" class="more-icon"><MoreFilled /></el-icon>
            </div>
            <div class="card-content">
              <div class="card-top">
                <el-image :src="item.poster || item.image" fit="cover" class="card-poster">
                  <template #error>
                    <div class="poster-placeholder-sm">
                      <el-icon :size="22"><Film /></el-icon>
                    </div>
                  </template>
                </el-image>
                <div class="card-info">
                  <div class="info-row-top">
                    <span v-if="item.year" class="info-year">{{ item.year }}</span>
                    <el-tag size="small" :type="stateMeta(item.state).type" effect="dark">
                      {{ stateMeta(item.state).label }}
                    </el-tag>
                    <span v-if="doneOf(item)" class="info-ep">{{ doneOf(item) }}</span>
                    <el-tag v-if="item.over_edition" size="small" type="danger" effect="dark">洗版</el-tag>
                  </div>
                  <div class="info-title">
                    <span class="info-name" :title="item.name">{{ item.name }}</span>
                    <span v-if="item.season && item.season !== 'S00'" class="info-season">{{ item.season }}</span>
                  </div>
                  <div v-if="item.filter_team" class="info-line info-team" :title="item.filter_team">{{ item.filter_team }}</div>
                  <div v-if="item.filter_rule" class="info-line info-rule" :title="ruleName(item.filter_rule)">{{ ruleName(item.filter_rule) }}</div>
                  <div v-if="item.search_sites?.length" class="info-line info-sites" :title="item.search_sites.join(' / ')">{{ item.search_sites.join(' / ') }}</div>
                </div>
              </div>
            </div>
            <el-progress
              v-if="item.total && item.total > 0"
              :percentage="progressOf(item)"
              :show-text="false"
              :stroke-width="4"
              class="card-progress-bar"
            />
          </div>
        </el-card>
      </div>
    <AddRssMediaDialog
      v-model="addDialogVisible"
      type="TV"
      @success="addSuccess"
      @error="addError"
    />
    <RssMediaDetailDialog
      v-model="detailDialogVisible"
      :item="selectedItem"
      type="TV"
      @edit="onDetailEdit"
      @removed="onDetailRemoved"
      @searched="onDetailSearched"
      @refreshed="onDetailRefreshed"
    />
    <AddRssMediaDialog
      v-model="editDialogVisible"
      type="TV"
      :rssid="editRssid"
      @success="onEditSuccess"
      @error="onEditError"
    />
  </div>
</template>

<style scoped>
.tv-rss {
  padding: 16px;
}
.search-input {
  width: 280px;
}
.filter-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.rss-card {
  overflow: hidden;
  transition: transform 0.15s;
  border-radius: 8px;
}
.rss-card:hover {
  transform: translateY(-2px);
}
.card-bg {
  position: relative;
  height: 220px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.bg-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
}
.card-bg-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1;
}
.card-top-right {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 3;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: background 0.2s;
}
.card-top-right:hover {
  background: rgba(0,0,0,0.6);
}
.more-icon {
  color: rgba(255,255,255,0.85);
}
.card-content {
  position: relative;
  z-index: 2;
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
}
.card-top {
  display: flex;
  gap: 12px;
}
.card-poster {
  width: 100px;
  height: 125px;
  border-radius: 4px;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.poster-placeholder-sm {
  width: 64px;
  height: 86px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  border-radius: 4px;
  color: var(--el-text-color-placeholder);
}
.card-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 2px;
  overflow: hidden;
}
.info-row-top {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.info-year {
  font-size: 15px;
  color: rgba(255,255,255,0.8);
}
.info-ep {
  font-size: 13px;
  color: rgba(255,255,255,0.85);
  background: rgba(64,158,255,0.3);
  padding: 0 6px;
  border-radius: 3px;
  line-height: 20px;
  white-space: nowrap;
}
.info-title {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.info-name {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.info-season {
  font-size: 15px;
  color: rgba(255,255,255,0.65);
}
.info-line {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  line-height: 1.4;
  padding: 0 2px;
}
.info-team {
  color: rgba(255,255,255,0.85);
}
.info-rule {
  color: rgba(255,255,255,0.7);
}
.info-sites {
  color: rgba(255,255,255,0.5);
}
.card-progress-bar {
  flex-shrink: 0;
  z-index: 6;
  margin-top: -10px;
}
.card-progress-bar :deep(.el-progress-bar__outer) {
  border-radius: 0;
  background: rgba(255,255,255,0.15);
}
.card-progress-bar :deep(.el-progress-bar__inner) {
  border-radius: 0;
}
</style>
