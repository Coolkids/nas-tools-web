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

const trendSeries = computed(() => [
  { key: 'movie', label: '电影', color: 'var(--q-primary)', values: stat.value.MovieNums || [] },
  { key: 'tv', label: '电视剧', color: 'var(--q-positive)', values: stat.value.TvNums || [] },
  { key: 'anime', label: '动漫', color: 'var(--q-warning)', values: stat.value.AnimeNums || [] }
])

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
    y: chartPointY(raw, height)
  }))
  const slopes = points.map((point, index) => {
    if (index === 0) return (points[1].y - point.y) / stepX
    if (index === points.length - 1) return (point.y - points[index - 1].y) / stepX
    const previous = (point.y - points[index - 1].y) / stepX
    const next = (points[index + 1].y - point.y) / stepX
    if (previous * next <= 0) return 0
    return (previous + next) / 2
  })
  let path = `M${points[0].x},${points[0].y}`
  for (let index = 0; index < points.length - 1; index += 1) {
    const p1 = points[index]
    const p2 = points[index + 1]
    const segmentWidth = p2.x - p1.x
    const cp1x = p1.x + segmentWidth / 3
    const cp1y = p1.y + slopes[index] * segmentWidth / 3
    const cp2x = p2.x - segmentWidth / 3
    const cp2y = p2.y - slopes[index + 1] * segmentWidth / 3
    path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return path
}

function smoothAreaPath(data: number[], width: number, height: number): string {
  const line = smoothLinePath(data, width, height)
  return line ? `${line} L${width},${height} L0,${height} Z` : ''
}

function chartPointX(index: number, length: number, width: number) {
  return length > 1 ? (index * width) / (length - 1) : width / 2
}

function chartPointY(value: number, height: number) {
  return height - ((Number(value) || 0) / chartMax.value) * height * 0.82 - height * 0.09
}

function chartLabelAt(index: number) {
  return chartLabels.value[index] || `第 ${index + 1} 期`
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

      <q-card flat bordered class="metric-card series-metric-card">
        <div v-if="statReady && chartLabels.length > 1" class="metric-chart-background">
          <svg viewBox="0 0 600 112" role="img" aria-label="电视剧、动漫和电影转移趋势" preserveAspectRatio="none">
            <defs>
              <linearGradient v-for="series in trendSeries" :id="`trend-fill-${series.key}`" :key="`fill-${series.key}`" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="series.color" stop-opacity=".2" />
                <stop offset="100%" :stop-color="series.color" stop-opacity="0" />
              </linearGradient>
            </defs>
            <line x1="0" y1="102" x2="600" y2="102" stroke="currentColor" opacity=".12" />
            <g v-for="series in trendSeries" :key="series.key">
              <path :d="smoothAreaPath(series.values, 600, 102)" :fill="`url(#trend-fill-${series.key})`" opacity=".7" />
              <path :d="smoothLinePath(series.values, 600, 102)" fill="none" :stroke="series.color" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" opacity=".62" />
              <g
                v-for="(value, index) in series.values"
                :key="`${series.key}-${index}`"
                class="metric-chart-point"
                :transform="`translate(${chartPointX(index, series.values.length, 600)} ${chartPointY(value, 102)})`"
                :aria-label="`${series.label} · ${chartLabelAt(index)}：${valueOrDash(value)}`"
              >
                <circle r="12" fill="transparent" />
                <q-tooltip anchor="top middle" self="bottom middle" :offset="[0, 8]">{{ series.label }} · {{ chartLabelAt(index) }}：{{ valueOrDash(value) }}</q-tooltip>
              </g>
            </g>
          </svg>
        </div>
        <div v-if="statReady && chartLabels.length > 1" class="metric-chart-legend" aria-label="趋势图例">
          <span v-for="series in trendSeries" :key="`legend-${series.key}`" class="metric-chart-legend-item">
            <i class="metric-chart-legend-line" :style="{ backgroundColor: series.color }" aria-hidden="true" />{{ series.label }}
          </span>
        </div>
        <q-card-section class="row items-center no-wrap">
          <q-avatar color="positive" text-color="white" icon="live_tv" size="44px" />
          <div class="metric-copy series-metric-copy q-ml-md">
            <div class="metric-label">电视剧 / 动漫</div>
            <div v-if="mediaReady" class="metric-value">{{ valueOrDash(mediaCount.Series) }}</div>
            <q-skeleton v-else-if="loading" type="text" width="60px" />
            <div v-else class="metric-value">—</div>
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

    <div class="history-section">
      <q-card flat bordered class="content-card history-card">
        <q-card-section class="section-heading">
          <div>
            <div class="section-title">播放历史</div>
            <div class="section-description">播放和登录活动</div>
          </div>
          <q-icon name="history" size="24px" color="info" />
        </q-card-section>
        <q-table
          flat
          hide-pagination
          :rows="history"
          :columns="historyColumns"
          :visible-columns="$q.screen.lt.sm ? ['event'] : ['event', 'date']"
          row-key="date"
          :rows-per-page-options="[0]"
          :loading="loading"
          virtual-scroll
          :virtual-scroll-item-size="$q.screen.lt.sm ? 64 : 48"
          :virtual-scroll-sticky-size-start="48"
          no-data-label="暂无播放记录"
          class="history-table"
        >
          <template #body-cell-event="props">
            <q-td :props="props">
              <div class="history-event">
                <q-icon :name="props.row.type === 'LG' ? 'person' : 'play_circle'" color="primary" size="20px" />
                <div class="history-event-copy">
                  <div class="history-event-title">{{ props.row.event }}</div>
                  <span class="history-event-date">{{ props.row.date }}</span>
                </div>
              </div>
            </q-td>
          </template>
        </q-table>
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
.series-metric-card { position: relative; overflow: hidden; background: linear-gradient(135deg, var(--surface) 20%, color-mix(in srgb, var(--q-positive) 6%, var(--surface))); }
.metric-chart-background { position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: .5; }
.metric-chart-background svg { display: block; width: 100%; height: 100%; color: var(--text-secondary); overflow: visible; }
.metric-chart-point { pointer-events: all; cursor: help; }
.metric-chart-legend { position: absolute; top: 10px; right: 12px; z-index: 2; display: flex; align-items: center; gap: 8px; color: var(--text-secondary); font-size: 10px; pointer-events: none; }
.metric-chart-legend-item { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.metric-chart-legend-line { display: inline-block; width: 11px; height: 2px; border-radius: 2px; }
.series-metric-card > .q-card__section { position: relative; z-index: 1; }
.series-metric-copy { position: relative; z-index: 3; min-width: 0; }
.metric-label { color: var(--text-secondary); font-size: 13px; }
.metric-value { margin-top: 3px; color: var(--text-primary); font-size: 26px; font-weight: 700; line-height: 1.2; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.section-title { color: var(--text-primary); font-size: 16px; font-weight: 650; }
.section-description { margin-top: 3px; color: var(--text-secondary); font-size: 12px; }
.storage-summary { display: flex; flex-wrap: wrap; gap: 18px; margin: 22px 0 12px; color: var(--text-secondary); font-size: 13px; }
.storage-summary strong { margin-left: 3px; color: var(--text-primary); font-weight: 600; }
.progress-caption { margin-top: 8px; color: var(--text-secondary); font-size: 12px; text-align: right; }
.history-section { margin-top: 16px; }
.history-table { height: 420px; }
.history-table :deep(.q-table__middle) { height: 100%; overflow-y: auto; }
.history-table :deep(thead) { position: sticky; top: 0; z-index: 1; background: var(--surface); }
.history-table :deep(th) { color: var(--text-secondary); font-weight: 500; }
.history-event { display: flex; align-items: center; gap: 10px; min-width: 0; }
.history-event-copy { min-width: 0; }
.history-event-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-event-date { display: none; }
@media (max-width: 1439px) { .home-page { padding-inline: 24px; } }
@media (max-width: 1023px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 1023px) { .history-table { height: 380px; } }
@media (max-width: 599px) { .home-page { padding: 16px 16px calc(32px + var(--safe-bottom)); } .metric-grid { gap: 10px; } .metric-card { min-height: 96px; } .metric-card .q-card__section { padding: 14px 12px; } .metric-value { font-size: 22px; } .storage-summary { gap: 8px 16px; margin-top: 18px; } .history-section { margin-top: 10px; } .content-card .q-card__section { padding: 16px; } .metric-chart-legend { display: none; } .history-table { height: 360px; } .history-table :deep(table) { table-layout: fixed; } .history-table :deep(th), .history-table :deep(td) { padding-inline: 12px; } .history-table :deep(tbody td) { height: 64px; } .history-event { align-items: flex-start; gap: 8px; } .history-event-date { display: block; margin-top: 2px; color: var(--text-secondary); font-size: 12px; line-height: 1.2; } }
</style>
