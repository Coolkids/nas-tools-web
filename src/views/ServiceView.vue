<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import { getConfig, type AppConfig } from '@/api/config'
import {
  runScheduler,
  truncateBlacklist,
  truncateRsshistory,
  nameTest,
  netTest,
  NETTEST_TARGETS,
  type NameTestData,
  type NetTestResult
} from '@/api/system'

interface ServiceItem {
  id: string
  name: string
  type: 'scheduler' | 'manual'
  interval: string
  state: boolean
}

interface NetTestRow {
  target: string
  res?: boolean
  time?: string
  testing: boolean
}

const modal = useModalStore()
const loading = ref(false)
const loadError = ref('')
const services = ref<ServiceItem[]>([])
const actionBusy = ref('')

const runningCount = computed(() => services.value.filter((service) => service.state).length)
const schedulerCount = computed(() => services.value.filter((service) => service.type === 'scheduler').length)
const manualCount = computed(() => services.value.filter((service) => service.type === 'manual').length)
const columns: QTableColumn<ServiceItem>[] = [
  { name: 'name', label: '名称', field: 'name', align: 'left', sortable: true },
  { name: 'type', label: '类型', field: 'type', align: 'left' },
  { name: 'state', label: '状态', field: 'state', align: 'left' },
  { name: 'interval', label: '运行周期', field: 'interval', align: 'left' },
  { name: 'actions', label: '操作', field: 'id', align: 'right' }
]

function asDigit(value: unknown): number | null {
  const stringValue = String(value ?? '')
  return /^\d+$/.test(stringValue) ? Number(stringValue) : null
}

function buildServices(config: AppConfig): ServiceItem[] {
  const pt = (config.pt || {}) as Record<string, unknown>
  const douban = (config.douban || {}) as Record<string, unknown>
  const list: ServiceItem[] = []
  const rss = asDigit(pt.pt_check_interval)
  list.push({ id: 'rssdownload', name: 'RSS订阅', type: 'scheduler', interval: rss !== null ? `${Math.round(rss / 60)} 分钟` : '未启用', state: rss !== null })
  let search = asDigit(pt.search_rss_interval)
  if (search !== null && search < 6) search = 6
  list.push({ id: 'subscribe_search_all', name: '订阅搜索', type: 'scheduler', interval: search !== null ? `${search} 小时` : '未启用', state: search !== null })
  const monitor = !!pt.pt_monitor
  list.push({ id: 'pttransfer', name: '下载文件转移', type: 'scheduler', interval: monitor ? '5 分钟' : '未启用', state: monitor })
  list.push({ id: 'autoremovetorrents', name: '自动删种', type: 'scheduler', interval: '需配置删种任务', state: false })
  const signin = pt.ptsignin_cron
  const signinInterval = signin ? (String(signin).includes(':') ? String(signin) : `${signin} 小时`) : '未启用'
  list.push({ id: 'ptsignin', name: '站点签到', type: 'scheduler', interval: signinInterval, state: !!signin })
  list.push({ id: 'sync', name: '目录同步', type: 'scheduler', interval: '实时监控', state: true })
  const doubanInterval = douban.interval
  list.push({ id: 'douban', name: '豆瓣想看', type: 'scheduler', interval: doubanInterval ? `${doubanInterval} 小时` : '未启用', state: !!doubanInterval })
  list.push({ id: 'blacklist', name: '清理转移缓存', type: 'manual', interval: '手动', state: false })
  list.push({ id: 'rsshistory', name: '清理RSS缓存', type: 'manual', interval: '手动', state: false })
  return list
}

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await getConfig()
    if (response.code === 0) services.value = buildServices(response.config || {})
    else loadError.value = '加载服务配置失败'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '加载服务配置失败'
  } finally {
    loading.value = false
  }
}

async function runService(service: ServiceItem) {
  if (actionBusy.value) return
  if (service.type === 'manual') {
    const message = service.id === 'blacklist'
      ? '清理文件整理缓存后，已转移过的文件允许重新转移（包括识别错误的文件），是否确认？'
      : service.id === 'rsshistory'
        ? '清理 RSS 缓存后，已订阅下载但未入库的资源可能会被重新下载，是否确认？'
        : ''
    if (!message) return
    if (!await modal.confirm(message)) return
    actionBusy.value = service.id
    try {
      const response = service.id === 'blacklist' ? await truncateBlacklist() : await truncateRsshistory()
      if (response.code === 0) modal.success(service.id === 'blacklist' ? '文件缓存清理完成' : 'RSS 缓存清理完成')
      else modal.error(response.msg || '清理失败')
    } catch (error) {
      modal.error(error instanceof Error ? error.message : '清理失败')
    } finally {
      actionBusy.value = ''
    }
    return
  }
  if (!await modal.confirm(`是否立即运行 ${service.name}？`)) return
  actionBusy.value = service.id
  try {
    const response = await runScheduler(service.id)
    if (response.retmsg) modal.success(`${service.name}：${response.retmsg}`)
    else modal.success(`${service.name} 服务已启动，正在后台运行`)
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '服务启动失败')
  } finally {
    actionBusy.value = ''
  }
}

const nameTestVisible = ref(false)
const nameTestInput = ref('')
const nameTestLoading = ref(false)
const nameTestResult = ref<NameTestData | { name: string } | null>(null)
const nameData = computed(() => nameTestResult.value && 'title' in nameTestResult.value ? nameTestResult.value as NameTestData : null)

function openNameTest() {
  nameTestInput.value = ''
  nameTestResult.value = null
  nameTestVisible.value = true
}

async function doNameTest() {
  const name = nameTestInput.value.trim()
  if (!name) { modal.warning('请输入资源名称'); return }
  nameTestLoading.value = true
  nameTestResult.value = null
  try {
    const response = await nameTest(name)
    if (response.code === 0 && response.data) nameTestResult.value = response.data
    else nameTestResult.value = { name: '无法识别' }
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '识别失败')
  } finally {
    nameTestLoading.value = false
  }
}

function copyText(value: string) {
  navigator.clipboard.writeText(value).then(() => modal.success('已复制到剪贴板')).catch(() => modal.error('复制失败'))
}
function openUrl(url?: string) { if (url) window.open(url, '_blank', 'noopener,noreferrer') }
function searchTmdb(query: string) { if (query) openUrl(`https://www.themoviedb.org/search?query=${encodeURIComponent(query)}`) }
function toArray(value: unknown): string[] { return Array.isArray(value) ? value.filter(Boolean).map(String) : typeof value === 'string' && value ? [value] : [] }
function replacedWords(data: NameTestData) { return toArray(data.replaced_words) }
function showOrgString(data: NameTestData) { return !!data.org_string && (replacedWords(data).length > 0 || !data.tmdbid) }

const netTestVisible = ref(false)
const netTestLoading = ref(false)
const netTestResults = ref<NetTestRow[]>([])
const netColumns: QTableColumn<NetTestRow>[] = [
  { name: 'target', label: '测试对象', field: 'target', align: 'left' },
  { name: 'result', label: '连通性', field: 'res', align: 'left' },
  { name: 'time', label: '耗时', field: 'time', align: 'left' }
]

function openNetTest() {
  netTestResults.value = NETTEST_TARGETS.map((target) => ({ target, testing: true }))
  netTestLoading.value = true
  netTestVisible.value = true
  Promise.all(netTestResults.value.map((row) => netTest(row.target).then((result: NetTestResult) => { row.res = result.res; row.time = result.time }).catch(() => { row.res = false; row.time = '失败' }).finally(() => { row.testing = false }))).finally(() => { netTestLoading.value = false })
}

onMounted(load)
</script>

<template>
  <div class="page-shell service">
    <PageHeader title="服务与工具" description="定时任务、缓存维护和连通性诊断">
      <template #actions><q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" /></template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense>
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ loadError }}
      <template #action><q-btn flat color="primary" label="重试" @click="load" /></template>
    </q-banner>

    <div class="stat-grid">
      <q-card flat bordered class="stat-card"><q-icon name="construction" color="primary" size="32px" /><div><div class="stat-label">服务总数</div><div class="stat-value">{{ services.length }}</div></div></q-card>
      <q-card flat bordered class="stat-card"><q-icon name="play_circle" color="positive" size="32px" /><div><div class="stat-label">运行中</div><div class="stat-value">{{ runningCount }}</div></div></q-card>
      <q-card flat bordered class="stat-card"><q-icon name="schedule" color="warning" size="32px" /><div><div class="stat-label">定时任务</div><div class="stat-value">{{ schedulerCount }}</div></div></q-card>
      <q-card flat bordered class="stat-card"><q-icon name="cleaning_services" color="negative" size="32px" /><div><div class="stat-label">手动操作</div><div class="stat-value">{{ manualCount }}</div></div></q-card>
    </div>

    <q-card flat bordered class="content-card">
      <q-card-section class="row items-center q-py-sm"><div class="text-subtitle1 text-weight-medium">服务列表</div><q-space /><q-spinner-dots v-if="loading" color="primary" size="20px" /></q-card-section>
      <q-separator />
      <q-table v-if="!$q.screen.lt.sm" flat :rows="services" :columns="columns" row-key="id" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有开启任何后台服务">
        <template #body-cell-type="slotProps"><q-td :props="slotProps"><q-badge outline :color="slotProps.row.type === 'scheduler' ? 'primary' : 'grey-7'" :label="slotProps.row.type === 'scheduler' ? '定时任务' : '手动操作'" /></q-td></template>
        <template #body-cell-state="slotProps"><q-td :props="slotProps"><q-badge :color="slotProps.row.state ? 'positive' : 'grey-6'" :label="slotProps.row.state ? 'ON' : 'OFF'" /></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><q-btn flat dense :color="slotProps.row.type === 'manual' ? 'negative' : 'primary'" :icon="slotProps.row.type === 'manual' ? 'delete' : 'play_arrow'" :label="slotProps.row.type === 'manual' ? '清理' : '运行'" :loading="actionBusy === slotProps.row.id" @click="runService(slotProps.row)" /></q-td></template>
      </q-table>
      <div v-else class="mobile-service-list">
        <q-card v-for="service in services" :key="service.id" flat bordered class="service-item">
          <q-card-section class="row items-center q-gutter-sm"><q-icon :name="service.type === 'manual' ? 'cleaning_services' : 'schedule'" :color="service.state ? 'positive' : 'grey-6'" size="26px" /><div class="col"><div class="text-subtitle1 text-weight-medium">{{ service.name }}</div><div class="row items-center q-gutter-xs q-mt-xs"><q-badge outline :color="service.type === 'scheduler' ? 'primary' : 'grey-7'" :label="service.type === 'scheduler' ? '定时任务' : '手动操作'" /><span class="text-caption text-secondary">{{ service.interval }}</span></div></div><q-badge :color="service.state ? 'positive' : 'grey-6'" :label="service.state ? 'ON' : 'OFF'" /></q-card-section>
          <q-separator /><q-card-actions align="right"><q-btn flat :color="service.type === 'manual' ? 'negative' : 'primary'" :icon="service.type === 'manual' ? 'delete' : 'play_arrow'" :label="service.type === 'manual' ? '清理' : '立即运行'" :loading="actionBusy === service.id" @click="runService(service)" /></q-card-actions>
        </q-card>
      </div>
    </q-card>

    <q-card flat bordered class="content-card">
      <q-card-section class="row items-center"><div><div class="text-subtitle1 text-weight-medium">测试工具</div><div class="text-caption text-secondary q-mt-xs">诊断名称识别与外部服务网络连通性</div></div></q-card-section>
      <q-separator /><q-card-section class="row q-gutter-sm"><q-btn outline icon="manage_search" label="名称识别测试" @click="openNameTest" /><q-btn outline icon="lan" label="网络连通性测试" @click="openNetTest" /></q-card-section>
    </q-card>

    <q-dialog v-model="nameTestVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="tool-dialog">
        <q-card-section class="row items-center"><div class="text-h6">名称识别测试</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section>
          <q-input v-model="nameTestInput" outlined clearable autofocus placeholder="种子名 / 文件名等" :loading="nameTestLoading" @keyup.enter="doNameTest"><template #prepend><q-icon name="search" /></template></q-input>
          <div v-if="nameData" class="name-test-result">
            <div class="result-row"><q-chip clickable color="warning" text-color="white" icon="title" :label="`识别名称：${nameData.name}`" @click="searchTmdb(nameData.name)" /><q-chip v-if="showOrgString(nameData)" outline color="warning" :label="`识别用名：${nameData.org_string}`" /></div>
            <div v-if="replacedWords(nameData).length" class="result-row"><span class="result-label">应用替换词</span><q-chip v-for="word in replacedWords(nameData)" :key="word" dense color="grey-3" text-color="grey-8" :label="word" /></div>
            <div class="result-row"><q-chip clickable color="positive" text-color="white" :label="`标题：${nameData.title}`" @click="copyText(nameData.title)" /><q-chip v-if="nameData.tmdbid" clickable color="positive" text-color="white" :label="`TMDB ID：${nameData.tmdbid}`" @click="openUrl(nameData.tmdblink)" /><q-chip v-if="nameData.year" color="warning" text-color="white" :label="`年份：${nameData.year}`" /><q-chip v-if="nameData.season_episode" clickable color="warning" text-color="white" :label="`季集：${nameData.season_episode}`" @click="openUrl(nameData.tmdb_S_E_link)" /></div>
            <div class="result-row"><q-chip v-for="entry in [{ label: '质量', value: nameData.restype }, { label: '特性', value: nameData.effect }, { label: '类别', value: nameData.category }, { label: '分辨率', value: nameData.pix }, { label: '视频编码', value: nameData.video_codec }, { label: '音频编码', value: nameData.audio_codec }, { label: '制作组/字幕组', value: nameData.team }, { label: '分集', value: nameData.part }].filter((item) => item.value)" :key="entry.label" dense outline :label="`${entry.label}：${entry.value}`" /></div>
          </div>
          <q-banner v-else-if="nameTestResult" class="q-mt-md" dense rounded><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ nameTestResult.name }}</q-banner>
        </q-card-section>
        <q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="关闭" v-close-popup /><q-btn color="primary" unelevated :loading="nameTestLoading" label="识别" @click="doNameTest" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="netTestVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="tool-dialog network-dialog"><q-card-section class="row items-center"><div class="text-h6">网络连通性测试</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section>
          <q-table flat :rows="netTestResults" :columns="netColumns" row-key="target" :loading="netTestLoading" hide-pagination :rows-per-page-options="[0]" class="network-table"><template #body-cell-result="slotProps"><q-td :props="slotProps"><q-badge v-if="slotProps.row.testing" color="grey-6" label="测试中" /><q-badge v-else :color="slotProps.row.res ? 'positive' : 'negative'" :label="slotProps.row.res ? '可连通' : '失败'" /></q-td></template><template #body-cell-time="slotProps"><q-td :props="slotProps"><span :class="slotProps.row.res ? 'text-positive' : 'text-negative'">{{ slotProps.row.time || '—' }}</span></q-td></template></q-table>
          <div class="network-mobile-list"><q-item v-for="row in netTestResults" :key="row.target"><q-item-section><q-item-label>{{ row.target }}</q-item-label><q-item-label caption>{{ row.time || '等待测试' }}</q-item-label></q-item-section><q-item-section side><q-spinner-dots v-if="row.testing" color="primary" /><q-badge v-else :color="row.res ? 'positive' : 'negative'" :label="row.res ? '可连通' : '失败'" /></q-item-section></q-item></div>
        </q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="关闭" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.service { max-width: 1440px; margin: 0 auto; }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 18px; border-radius: 12px; }
.stat-label { color: var(--text-secondary); font-size: 12px; }
.stat-value { margin-top: 3px; color: var(--text-primary); font-size: 24px; font-weight: 700; }
.content-card { margin-bottom: 16px; overflow: hidden; }
.mobile-service-list { display: grid; gap: 10px; padding: 12px; }
.service-item { border-radius: 12px; }
.tool-dialog { width: min(680px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.network-dialog { width: min(760px, calc(100vw - 32px)); }
.name-test-result { display: grid; gap: 10px; margin-top: 16px; }
.result-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.result-label { color: var(--text-secondary); font-size: 13px; }
.dialog-actions { gap: 8px; }
.network-mobile-list { display: none; }
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599px) {
  .service { padding-bottom: 8px; }
  .stat-grid { gap: 8px; }
  .stat-card { padding: 14px; }
  .stat-value { font-size: 21px; }
  .tool-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }
  .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); }
  .dialog-actions :deep(.q-btn) { min-height: 44px; }
  .network-table { display: none; }
  .network-mobile-list { display: block; }
}
</style>
