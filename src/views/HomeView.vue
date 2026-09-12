<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { QTableProps } from 'quasar'
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
const loadInFlight = ref(false)
const loadError = ref('')

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

const mediaReady = computed(() => mediaCount.value.code === 0)
const spaceReady = computed(() => space.value.code === 0)
const statReady = computed(() => stat.value.code === 0)
const historyReady = ref(false)

const chartLabels = computed(() => {
  const labels = stat.value.TvChartLabels?.length ? stat.value.TvChartLabels : stat.value.MovieChartLabels
  return labels || []
})
const chartMax = computed(() => {
  const all = [
    ...(stat.value.MovieNums || []),
    ...(stat.value.TvNums || []),
    ...(stat.value.AnimeNums || [])
  ]
  return Math.max(1, ...all.map((value) => Number(value) || 0))
})

const transferLatest = computed(() => ({
  movie: stat.value.MovieNums?.[stat.value.MovieNums.length - 1] || 0,
  tv: stat.value.TvNums?.[stat.value.TvNums.length - 1] || 0,
  anime: stat.value.AnimeNums?.[stat.value.AnimeNums.length - 1] || 0
}))

const usedPercent = computed(() => {
  const value = space.value.UsedPercent
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value || '0')
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
})

const historyColumns: QTableProps['columns'] = [
  { name: 'event', label: '事件', field: 'event', align: 'left' },
  { name: 'date', label: '时间', field: 'date', align: 'right' }
]

function valueOrDash(value: string | number | undefined | null) {
  return value === undefined || value === null || value === '' ? '—' : value
}

function smoothLinePath(data: number[], width: number, height: number): string {
  if (data.length < 2) return ''
  const stepX = width / (data.length - 1)
  const points = data.map((raw, index) => ({
    x: index * stepX,
    y: height - ((Number(raw) || 0) / chartMax.value) * height * 0.88 - height * 0.06
  }))
  let path = `M${points[0].x},${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = index > 0 ? points[index - 1] : points[index]
    const p1 = points[index]
    const p2 = points[index + 1]
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p2.x - p0.x) / 6
    const cp2y = p2.y - (p2.y - p0.y) / 6
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return path
}

function compactNumber(value: string | number | undefined) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '—'
  return new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(number)
}

async function load(options: { notify?: boolean } = {}) {
  if (loadInFlight.value) return
  loadInFlight.value = true
  loading.value = true
  loadError.value = ''
  const failures: string[] = []

  try {
    const [mc, sp, st, ph] = await Promise.allSettled([
      getLibraryMediacount(),
      getLibrarySpacesize(),
      getTransferStatistics(),
      getLibraryPlayhistory()
    ])

    if (mc.status === 'fulfilled') {
      mediaCount.value = mc.value
      if (mc.value.code !== 0) failures.push('媒体数量')
    } else failures.push('媒体数量')

    if (sp.status === 'fulfilled') {
      space.value = sp.value
      if (sp.value.code !== 0) failures.push('存储空间')
    } else failures.push('存储空间')

    if (st.status === 'fulfilled') {
      stat.value = st.value
      if (st.value.code !== 0) failures.push('转移统计')
    } else failures.push('转移统计')

    if (ph.status === 'fulfilled') {
      historyReady.value = ph.value.code === 0
      if (historyReady.value) history.value = ph.value.result || []
      else failures.push('播放历史')
    } else {
      historyReady.value = false
      failures.push('播放历史')
    }

    if (failures.length) {
      loadError.value = `${failures.join('、')}加载失败，可点击刷新重试。`
      if (options.notify) modal.error(loadError.value)
    }
  } finally {
    loading.value = false
    loadInFlight.value = false
  }
}

onMounted(() => { void load() })
</script>

<template>
  <div class="home-page">
    <PageHeader title="概览" description="媒体库、存储空间与近期活动">
      <template #actions>
        <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load({ notify: true })" />
      </template>
    </PageHeader>

    <q-banner v-if="loadError" rounded class="home-alert q-mb-md" inline-actions>
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ loadError }}
      <template #action><q-btn flat color="negative" label="重试" :loading="loading" @click="load({ notify: true })" /></template>
    </q-banner>

    <div class="metric-grid">
      <q-card flat bordered class="metric-card">
        <q-card-section class="row items-center no-wrap">
          <q-avatar color="primary" text-color="white" icon="movie" size="44px" />
          <div class="metric-copy q-ml-md">
            <div class="metric-label">电影</div>
            <div v-if="mediaReady" class="metric-value">{{ valueOrDash(mediaCount.Movie) }}</div>
            <q-skeleton v-else-if="loading" type="text" width="60px" />
            <div v-else class="metric-value">—</div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="metric-card">
        <q-card-section class="row items-center no-wrap">
          <q-avatar color="positive" text-color="white" icon="live_tv" size="44px" />
          <div class="metric-copy q-ml-md">
            <div class="metric-label">电视剧 / 动漫</div>
            <div v-if="mediaReady" class="metric-value">{{ valueOrDash(mediaCount.Series) }}</div>
            <q-skeleton v-else-if="loading" type="text" width="60px" />
            <div v-else class="metric-value">—</div>
            <div class="metric-sub">集数 {{ mediaReady ? valueOrDash(mediaCount.Episodes) : '—' }}</div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="metric-card">
        <q-card-section class="row items-center no-wrap">
          <q-avatar color="warning" text-color="white" icon="headphones" size="44px" />
          <div class="metric-copy q-ml-md">
            <div class="metric-label">音乐</div>
            <div v-if="mediaReady" class="metric-value">{{ valueOrDash(mediaCount.Music) }}</div>
            <q-skeleton v-else-if="loading" type="text" width="60px" />
            <div v-else class="metric-value">—</div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="metric-card">
        <q-card-section class="row items-center no-wrap">
          <q-avatar color="info" text-color="white" icon="group" size="44px" />
          <div class="metric-copy q-ml-md">
            <div class="metric-label">活跃用户</div>
            <div v-if="mediaReady" class="metric-value">{{ valueOrDash(mediaCount.User) }}</div>
            <q-skeleton v-else-if="loading" type="text" width="60px" />
            <div v-else class="metric-value">—</div>
          </div>
        </q-card-section>
      </q-card>
    </div>

    <q-card flat bordered class="content-card">
      <q-card-section>
        <div class="section-heading">
          <div>
            <div class="section-title">存储空间</div>
            <div class="section-description">当前媒体库所在存储的使用情况</div>
          </div>
          <q-icon name="storage" size="24px" color="primary" />
        </div>
        <div class="storage-summary">
          <span>已使用 <strong>{{ spaceReady ? valueOrDash(space.UsedSapce) : '—' }}</strong></span>
          <span>空闲 <strong>{{ spaceReady ? valueOrDash(space.FreeSpace) : '—' }}</strong></span>
          <span>总空间 <strong>{{ spaceReady ? valueOrDash(space.TotalSpace) : '—' }}</strong></span>
        </div>
        <q-linear-progress rounded size="14px" :value="spaceReady ? usedPercent / 100 : 0" color="primary" track-color="grey-3" />
        <div class="progress-caption">{{ spaceReady ? `已使用 ${usedPercent}%` : (loading ? '正在读取存储信息…' : '暂无存储信息') }}</div>
      </q-card-section>
    </q-card>

    <div class="dashboard-grid">
      <q-card flat bordered class="content-card transfer-card">
        <q-card-section>
          <div class="section-heading">
            <div>
              <div class="section-title">转移趋势</div>
              <div class="section-description">最近周期的媒体入库数量</div>
            </div>
            <q-icon name="show_chart" size="24px" color="positive" />
          </div>
          <div v-if="statReady && chartLabels.length > 1" class="chart-wrap">
            <svg viewBox="0 0 600 180" role="img" aria-label="电影、电视剧和动漫转移趋势图" preserveAspectRatio="none">
              <line x1="0" y1="166" x2="600" y2="166" stroke="currentColor" opacity=".14" />
              <path :d="smoothLinePath(stat.MovieNums, 600, 166)" fill="none" stroke="var(--q-primary)" stroke-width="3" stroke-linecap="round" />
              <path :d="smoothLinePath(stat.TvNums, 600, 166)" fill="none" stroke="var(--q-positive)" stroke-width="3" stroke-linecap="round" />
              <path :d="smoothLinePath(stat.AnimeNums, 600, 166)" fill="none" stroke="var(--q-warning)" stroke-width="3" stroke-linecap="round" />
            </svg>
            <div class="chart-labels"><span v-for="label in chartLabels" :key="label">{{ label }}</span></div>
          </div>
          <q-skeleton v-else-if="loading" type="rect" height="180px" />
          <div v-else class="empty-state"><q-icon name="show_chart" size="32px" color="grey-5" /><span>暂无转移统计</span></div>
          <div v-if="statReady" class="legend-row">
            <span><i class="legend-dot dot-primary" />电影 {{ compactNumber(transferLatest.movie) }}</span>
            <span><i class="legend-dot dot-positive" />电视剧 {{ compactNumber(transferLatest.tv) }}</span>
            <span><i class="legend-dot dot-warning" />动漫 {{ compactNumber(transferLatest.anime) }}</span>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="content-card history-card">
        <q-card-section class="section-heading">
          <div>
            <div class="section-title">播放历史</div>
            <div class="section-description">最近的播放和登录活动</div>
          </div>
          <q-icon name="history" size="24px" color="info" />
        </q-card-section>
        <q-table
          v-if="$q.screen.gt.xs"
          flat
          hide-pagination
          :rows="history"
          :columns="historyColumns"
          row-key="date"
          :rows-per-page-options="[0]"
          :loading="loading"
          class="history-table"
        >
          <template #body-cell-event="props">
            <q-td :props="props">
              <div class="history-event"><q-icon :name="props.row.type === 'LG' ? 'person' : 'play_circle'" color="primary" size="20px" /><span>{{ props.row.event }}</span></div>
            </q-td>
          </template>
        </q-table>
        <div v-else class="mobile-history-list">
          <div v-for="item in history" :key="`${item.date}-${item.event}`" class="mobile-history-item">
            <q-icon :name="item.type === 'LG' ? 'person' : 'play_circle'" color="primary" size="20px" />
            <div class="mobile-history-copy"><div>{{ item.event }}</div><span>{{ item.date }}</span></div>
          </div>
          <div v-if="!history.length && !loading" class="empty-state"><q-icon name="history" size="32px" color="grey-5" /><span>暂无播放记录</span></div>
        </div>
        <q-card-section v-if="!historyReady && !loading" class="text-caption text-grey-6 q-pt-none">播放历史暂不可用</q-card-section>
      </q-card>
    </div>
  </div>
</template>

<style scoped>
.home-page { max-width: 1600px; margin: 0 auto; padding: 24px 32px 40px; }
.home-alert { color: var(--text-primary); background: color-mix(in srgb, var(--q-negative) 10%, var(--surface)); }
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.metric-card, .content-card { background: var(--surface); border-color: var(--border-subtle); }
.metric-card { min-height: 112px; }
.metric-label { color: var(--text-secondary); font-size: 13px; }
.metric-value { margin-top: 3px; color: var(--text-primary); font-size: 26px; font-weight: 700; line-height: 1.2; }
.metric-sub { min-height: 18px; margin-top: 2px; color: var(--text-secondary); font-size: 12px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.section-title { color: var(--text-primary); font-size: 16px; font-weight: 650; }
.section-description { margin-top: 3px; color: var(--text-secondary); font-size: 12px; }
.storage-summary { display: flex; flex-wrap: wrap; gap: 18px; margin: 22px 0 12px; color: var(--text-secondary); font-size: 13px; }
.storage-summary strong { margin-left: 3px; color: var(--text-primary); font-weight: 600; }
.progress-caption { margin-top: 8px; color: var(--text-secondary); font-size: 12px; text-align: right; }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(360px, .85fr); gap: 16px; margin-top: 16px; }
.chart-wrap { margin-top: 20px; }
.chart-wrap svg { display: block; width: 100%; height: 180px; color: var(--text-secondary); overflow: visible; }
.chart-labels { display: flex; justify-content: space-between; gap: 8px; overflow: hidden; color: var(--text-secondary); font-size: 11px; }
.chart-labels span { overflow: hidden; max-width: 90px; text-overflow: ellipsis; white-space: nowrap; }
.legend-row { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 18px; color: var(--text-secondary); font-size: 12px; }
.empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; min-height: 132px; color: var(--text-secondary); font-size: 13px; }
.legend-row span { display: inline-flex; align-items: center; gap: 6px; }
.legend-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.dot-primary { background: var(--q-primary); }
.dot-positive { background: var(--q-positive); }
.dot-warning { background: var(--q-warning); }
.history-table :deep(th) { color: var(--text-secondary); font-weight: 500; }
.history-event { display: flex; align-items: center; gap: 10px; min-width: 0; }
.history-event span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mobile-history-list { padding: 0 16px 12px; }
.mobile-history-item { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--border-subtle); }
.mobile-history-copy { min-width: 0; color: var(--text-primary); font-size: 14px; }
.mobile-history-copy > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mobile-history-copy span { display: block; margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
@media (max-width: 1439px) { .home-page { padding-inline: 24px; } .dashboard-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 1023px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599px) { .home-page { padding: 16px 16px calc(32px + var(--safe-bottom)); } .metric-grid { gap: 10px; } .metric-card { min-height: 96px; } .metric-card .q-card__section { padding: 14px 12px; } .metric-value { font-size: 22px; } .storage-summary { gap: 8px 16px; margin-top: 18px; } .dashboard-grid { gap: 10px; margin-top: 10px; } .content-card .q-card__section { padding: 16px; } }
</style>
