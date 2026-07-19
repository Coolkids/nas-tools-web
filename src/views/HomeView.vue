<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { Refresh, Film, Monitor, Headset, User } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import {
  getLibraryMediacount,
  getLibrarySpacesize,
  getTransferStatistics,
  getLibraryPlayhistory,
  type MediaCountResult,
  type LibrarySpaceResult,
  type TransferStatisticsResult,
  type PlayHistoryItem
} from '@/api/system'

const modal = useModalStore()
const loading = ref(false)

const mediaCount = ref<MediaCountResult>({ code: -1 })
const space = ref<LibrarySpaceResult>({ code: -1 })
const stat = ref<TransferStatisticsResult>({
  code: -1,
  MovieChartLabels: [],
  MovieNums: [],
  TvChartLabels: [],
  TvNums: [],
  AnimeNums: []
})
const history = ref<PlayHistoryItem[]>([])

const serverOk = computed(() => mediaCount.value.code === 0)

const chartLabels = computed(() => stat.value.TvChartLabels || [])
const chartMax = computed(() => {
  const all = [...(stat.value.TvNums || []), ...(stat.value.AnimeNums || [])]
  return Math.max(1, ...all)
})

function smoothLinePath(data: number[], width: number, height: number): string {
  if (data.length < 2) return ''
  const stepX = width / (data.length - 1)
  const points = data.map((v, i) => ({
    x: i * stepX,
    y: height - (v / chartMax.value) * height * 0.9
  }))
  let path = `M${points[0].x},${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p2.x - p0.x) / 6
    const cp2y = p2.y - (p2.y - p0.y) / 6
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return path
}

const usedPercentNum = computed(() => {
  const v = space.value.UsedPercent
  if (v === undefined || v === null || v === '') return 0
  const n = typeof v === 'number' ? v : Number.parseFloat(v)
  return Number.isFinite(n) ? n : 0
})

async function load() {
  loading.value = true
  const [mc, sp, st, ph] = await Promise.allSettled([
    getLibraryMediacount(),
    getLibrarySpacesize(),
    getTransferStatistics(),
    getLibraryPlayhistory()
  ])
  if (mc.status === 'fulfilled') mediaCount.value = mc.value
  if (sp.status === 'fulfilled') space.value = sp.value
  if (st.status === 'fulfilled') stat.value = st.value
  if (ph.status === 'fulfilled' && ph.value.code === 0) history.value = ph.value.result || []
  if (mc.status === 'rejected') modal.error('媒体数量加载失败')
  loading.value = false
}

onMounted(load)
</script>

<template>
  <div class="home" v-loading="loading">
    <PageHeader title="我的媒体库" description="系统概览与媒体库统计">
      <template #actions>
        <el-button :icon="Refresh" @click="load" :loading="loading">刷新</el-button>
      </template>
    </PageHeader>

    <el-alert
      v-if="!loading && !serverOk"
      type="error"
      title="媒体服务器连接失败"
      description="当前无法连接媒体服务器获取数据，请确认 Emby/Jellyfin/Plex 配置是否正确。"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <el-row :gutter="16" class="stat-row">
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <el-icon class="stat-icon" color="var(--el-color-primary)"><Film /></el-icon>
            <div class="stat-body">
              <div class="stat-label">电影</div>
              <div class="stat-value">{{ mediaCount.Movie || 0 }}</div>
              <div class="stat-sub" />
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover" class="tv-card">
          <div class="stat-card">
            <el-icon class="stat-icon" color="var(--el-color-success)"><Monitor /></el-icon>
            <div class="stat-body">
              <div class="stat-label">电视剧/动漫</div>
              <div class="stat-value">{{ mediaCount.Series || 0 }}</div>
              <div class="stat-sub">集数 {{ mediaCount.Episodes || 0 }}</div>
            </div>
          </div>
          <svg class="chart-bg" viewBox="0 0 300 80" preserveAspectRatio="none" v-if="chartLabels.length > 1">
            <path :d="smoothLinePath(stat.TvNums, 300, 80)" fill="none" stroke="var(--el-color-success)" stroke-width="1.5" opacity="0.3" />
            <path :d="smoothLinePath(stat.AnimeNums, 300, 80)" fill="none" stroke="var(--el-color-warning)" stroke-width="1.5" opacity="0.3" />
          </svg>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <el-icon class="stat-icon" color="var(--el-color-warning)"><Headset /></el-icon>
            <div class="stat-body">
              <div class="stat-label">音乐</div>
              <div class="stat-value">{{ mediaCount.Music || 0 }}</div>
              <div class="stat-sub" />
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6">
        <el-card shadow="hover">
          <div class="stat-card">
            <el-icon class="stat-icon" color="var(--el-color-danger)"><User /></el-icon>
            <div class="stat-body">
              <div class="stat-label">活跃用户</div>
              <div class="stat-value">{{ mediaCount.User ?? 0 }}</div>
              <div class="stat-sub" />
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" class="block">
      <div class="space-head">
        <span>存储空间共 <strong>{{ space.TotalSpace || '-' }}</strong></span>
        <span class="space-detail">
          已使用 <strong>{{ space.UsedSapce || '-' }}</strong>
          ，空闲 <strong>{{ space.FreeSpace || '-' }}</strong>
        </span>
      </div>
      <el-progress
        :percentage="usedPercentNum"
        :stroke-width="14"
        :format="() => `已使用 ${usedPercentNum}%`"
      />
    </el-card>



    <el-card shadow="never" class="block">
      <template #header>
        <span class="block-title">播放历史</span>
      </template>
      <el-table :data="history" size="small" empty-text="暂无播放记录" max-height="360">
        <el-table-column label="事件" min-width="320">
          <template #default="{ row }">
            <div class="history-row">
              <el-icon class="history-icon">
                <User v-if="row.type === 'LG'" />
                <VideoPlay v-else />
              </el-icon>
              <span class="history-event">{{ row.event }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="date" label="时间" width="180" />
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.home {
  padding: 16px;
}
.stat-row {
  margin-bottom: 16px;
}
.stat-row .el-col {
  margin-bottom: 12px;
}
.stat-card {
  display: flex;
  align-items: center;
  gap: 14px;
}
.stat-icon {
  font-size: 34px;
}
.stat-body {
  flex: 1;
  min-width: 0;
}
.stat-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
.stat-value {
  font-size: 26px;
  font-weight: 600;
  line-height: 1.2;
}
.stat-sub {
  font-size: 12px;
  color: var(--el-color-success);
  min-height: 18px;
}
.block {
  margin-bottom: 16px;
}
.block-title {
  font-weight: 600;
}
.space-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
  font-size: 14px;
}
.space-detail {
  color: var(--el-text-color-secondary);
}
.transfer-summary .el-col {
  margin-bottom: 8px;
}
.transfer-item {
  padding: 0 4px;
}
.transfer-name {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 13px;
}
.transfer-count {
  margin-left: auto;
  font-weight: 600;
}
.history-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.history-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.history-event {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tv-card {
  position: relative;
  overflow: hidden;
}
.chart-bg {
  position: absolute;
  bottom: 4px;
  left: 0;
  width: 100%;
  height: 80px;
  pointer-events: none;
}
</style>
