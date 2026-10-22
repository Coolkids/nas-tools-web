<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import NameTestResult from '@/components/NameTestResult.vue'
import RecognitionSettingsPanel from '@/components/recognition/RecognitionSettingsPanel.vue'
import RecognitionCleanupActions from '@/components/recognition/RecognitionCleanupActions.vue'
import { getRecognitionStatistics } from '@/api/recognition'
import { useModalStore } from '@/stores/modal'
import { getConfig, updateConfig, type AppConfig } from '@/api/config'
import {
  runScheduler,
  getSchedulerJobs,
  truncateBlacklist,
  truncateRsshistory,
  nameTest,
  netTest,
  type NameTestData,
  type NameTestError,
  type NetTestResult,
  type SchedulerJob
} from '@/api/system'

type CleanupEditorId = 'recognition-cleanup' | 'transfer-history-cleanup' | 'subscription-history-cleanup' | 'download-history-cleanup'
type ScheduleEditorId = 'search' | 'database-statistics' | CleanupEditorId

interface ServiceItem {
  id: string
  name: string
  type: 'scheduler' | 'manual'
  interval: string
  state: boolean
  editable?: ScheduleEditorId
}

const modal = useModalStore()
const route = useRoute()
const loading = ref(false)
const loadError = ref('')
const configuredServices = ref<ServiceItem[]>([])
const schedulerJobs = ref<SchedulerJob[]>([])
const schedulerTimezone = ref('')
const scheduleError = ref('')
const schedulesLoading = ref(false)
const canManageRecognition = ref(false)
const services = computed(() => configuredServices.value.map(service => {
  if (service.id !== 'autoremovetorrents') return service
  const jobs = schedulerJobs.value.filter(job => job.namespace === 'torrent_remover')
  return jobs.length ? { ...service, state: jobs.some(job => job.next_run_time !== null),
    interval: `${jobs.length} 个删种任务` } : service
}).concat(canManageRecognition.value ? [{ id: 'recognition_record_manual_cleanup', name: '手动清理媒体识别记录',
  type: 'manual' as const, interval: '按已保存规则执行，也可清理全部记录', state: false }] : []))
let scheduleRefreshTimer: ReturnType<typeof setInterval> | undefined
const actionBusy = ref('')
const recognitionSchedule = ref<InstanceType<typeof RecognitionSettingsPanel>>()
function recognitionScheduleSaved() {
  modal.success('识别清理设置已保存')
  scheduleDialog.value = false
  void load()
}

async function closeSchedule() {
  if (recognitionSchedule.value && !await recognitionSchedule.value.confirmLeave()) return
  scheduleDialog.value = false
}
const configSnapshot = ref<AppConfig>({})
const scheduleDialog = ref(false)
const scheduleSaving = ref(false)
const statisticsInterval = ref(12)
const statisticsIntervalUnit = ref<'hour' | 'day'>('hour')
const scheduleForm = ref({
  id: '' as ScheduleEditorId | '',
  name: '',
  enabled: true,
  intervalHours: 24,
  retentionValue: 30,
  retentionUnit: 'day' as 'day' | 'month',
  maxRecords: 200
})

const runningCount = computed(() => services.value.filter((service) => service.state).length)
const schedulerCount = computed(() => services.value.filter((service) => service.type === 'scheduler').length)
const manualCount = computed(() => services.value.filter((service) => service.type === 'manual').length)
const columns: QTableColumn<ServiceItem>[] = [
  { name: 'name', label: '名称', field: 'name', align: 'left', sortable: true },
  { name: 'type', label: '类型', field: 'type', align: 'left' },
  { name: 'state', label: '状态', field: 'state', align: 'left' },
  { name: 'interval', label: '执行策略', field: 'interval', align: 'left',
    style: 'white-space: normal; min-width: 180px; max-width: 280px' },
  { name: 'nextRun', label: '下一次执行时间', field: nextExecutionLabel, align: 'left' },
  { name: 'actions', label: '操作', field: 'id', align: 'right' }
]

function asDigit(value: unknown): number | null {
  const stringValue = String(value ?? '').trim()
  if (!/^\d+$/.test(stringValue)) return null
  return Number(stringValue)
}

function nextExecutionLabel(service: ServiceItem): string {
  if (service.type === 'manual') return '手动执行'
  if (service.id === 'sync') return '实时监控'
  if (scheduleError.value) return '读取失败'
  if (schedulesLoading.value && !schedulerJobs.value.length) return '读取中…'
  const jobs = schedulerJobs.value.filter(job => service.id === 'autoremovetorrents'
    ? job.namespace === 'torrent_remover'
    : job.namespace === 'main' && job.id === service.id)
  if (!jobs.length) return service.state ? '未调度' : '未启用'
  const times = jobs.flatMap(job => job.next_run_time === null ? [] : [Date.parse(job.next_run_time)])
  if (!times.length) return '已暂停'
  const next = new Date(Math.min(...times))
  if (!Number.isFinite(next.getTime())) return '暂不可用'
  const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }
  if (schedulerTimezone.value) options.timeZone = schedulerTimezone.value
  try {
    return next.toLocaleString('zh-CN', options)
  } catch {
    return next.toLocaleString('zh-CN')
  }
}

async function loadSchedules() {
  if (schedulesLoading.value) return
  schedulesLoading.value = true
  try {
    const response = await getSchedulerJobs()
    if (response.code !== 0 || !Array.isArray(response.jobs)) throw new Error(response.msg || '读取下一次执行时间失败')
    schedulerJobs.value = response.jobs
    schedulerTimezone.value = response.timezone || ''
    scheduleError.value = ''
  } catch (error) {
    schedulerJobs.value = []
    scheduleError.value = error instanceof Error ? error.message : '读取下一次执行时间失败'
  } finally {
    schedulesLoading.value = false
  }
}

function refreshVisibleSchedules() {
  if (!document.hidden) void loadSchedules()
}

const cleanupDefaultLimits: Record<CleanupEditorId, number> = {
  'recognition-cleanup': 200,
  'transfer-history-cleanup': 200,
  'subscription-history-cleanup': 100,
  'download-history-cleanup': 100
}

function readCleanup(cleanup: Record<string, unknown>, defaultMaxRecords = 200): {
  intervalHours: number
  retentionValue: number
  retentionUnit: 'day' | 'month'
  maxRecords: number
} {
  const legacyValue = asDigit(cleanup.retention_days)
  const retentionValue = asDigit(cleanup.retention_value) || legacyValue || 30
  const retentionUnit = cleanup.retention_unit === 'month' ? 'month' : 'day'
  return {
    intervalHours: asDigit(cleanup.interval_hours) || 24,
    retentionValue,
    retentionUnit,
    maxRecords: asDigit(cleanup.max_records) || defaultMaxRecords
  }
}

function retentionLabel(value: number, unit: 'day' | 'month') {
  return `${value} ${unit === 'month' ? '个月' : '天'}`
}

const historyCleanupKeys: Record<Exclude<CleanupEditorId, 'recognition-cleanup'>, string> = {
  'transfer-history-cleanup': 'transfer_history',
  'subscription-history-cleanup': 'subscription_history',
  'download-history-cleanup': 'download_history'
}

function isCleanupEditor(editor?: ScheduleEditorId | ''): editor is CleanupEditorId {
  return Boolean(editor && editor !== 'search' && editor !== 'database-statistics')
}

function readStatisticsSchedule(config: AppConfig) {
  const settings = (config.scheduler?.database_statistics || {}) as Record<string, unknown>
  return {
    enabled: settings.enabled === undefined ? true : Boolean(settings.enabled),
    value: asDigit(settings.interval_value) || 12,
    unit: settings.interval_unit === 'day' ? 'day' as const : 'hour' as const
  }
}

function cleanupForEditor(config: AppConfig, editor: CleanupEditorId) {
  if (editor === 'recognition-cleanup') {
    const recognition = (config.recognition || {}) as Record<string, unknown>
    const records = (recognition.records || {}) as Record<string, unknown>
    return (records.cleanup || {}) as Record<string, unknown>
  }
  const history = (config.history || {}) as Record<string, unknown>
  const cleanup = (history.cleanup || {}) as Record<string, unknown>
  return (cleanup[historyCleanupKeys[editor]] || {}) as Record<string, unknown>
}

function cleanupConfigPath(editor: CleanupEditorId) {
  if (editor === 'recognition-cleanup') return 'recognition.records.cleanup'
  return `history.cleanup.${historyCleanupKeys[editor]}`
}

function buildServices(config: AppConfig): ServiceItem[] {
  const pt = (config.pt || {}) as Record<string, unknown>
  const douban = (config.douban || {}) as Record<string, unknown>
  const recognition = (config.recognition || {}) as Record<string, unknown>
  const records = (recognition.records || {}) as Record<string, unknown>
  const cleanup = (records.cleanup || {}) as Record<string, unknown>
  const recognitionSchedule = readCleanup(cleanup)
  const list: ServiceItem[] = []
  let search = asDigit(pt.search_rss_interval)
  const searchEnabled = search !== null && search > 0
  if (searchEnabled && search !== null && search < 6) search = 6
  list.push({ id: 'subscribe_search_all', name: '订阅搜索', type: 'scheduler', editable: 'search', interval: searchEnabled ? `每 ${search} 小时` : '未启用', state: searchEnabled })
  const statistics = readStatisticsSchedule(config)
  list.push({ id: 'database_statistics', name: '数据库精确统计', type: 'scheduler', editable: 'database-statistics',
    interval: `每 ${statistics.value} ${statistics.unit === 'day' ? '天' : '小时'}`, state: statistics.enabled })
  const cleanupEnabled = Boolean(cleanup.enabled)
  list.push({ id: 'recognition_record_cleanup', name: '清理过期媒体识别记录', type: 'scheduler', editable: 'recognition-cleanup', interval: `每 ${recognitionSchedule.intervalHours} 小时，保留 ${retentionLabel(recognitionSchedule.retentionValue, recognitionSchedule.retentionUnit)}，上限 ${recognitionSchedule.maxRecords} 条`, state: cleanupEnabled })
  const history = (config.history || {}) as Record<string, unknown>
  const historyCleanup = (history.cleanup || {}) as Record<string, unknown>
  const cleanupServices = [
    { key: 'transfer_history', editor: 'transfer-history-cleanup', id: 'transfer_history_cleanup', name: '清理过期转移历史' },
    { key: 'subscription_history', editor: 'subscription-history-cleanup', id: 'subscription_history_cleanup', name: '清理过期订阅历史' },
    { key: 'download_history', editor: 'download-history-cleanup', id: 'download_history_cleanup', name: '清理过期最近下载记录' }
  ] as const
  for (const item of cleanupServices) {
    const settings = (historyCleanup[item.key] || {}) as Record<string, unknown>
    const schedule = readCleanup(settings, cleanupDefaultLimits[item.editor])
    list.push({
      id: item.id,
      name: item.name,
      type: 'scheduler',
      editable: item.editor,
      interval: `每 ${schedule.intervalHours} 小时，保留 ${retentionLabel(schedule.retentionValue, schedule.retentionUnit)}，上限 ${schedule.maxRecords} 条`,
      state: Boolean(settings.enabled)
    })
  }
  const monitor = !!pt.pt_monitor
  list.push({ id: 'pttransfer', name: '下载文件转移', type: 'scheduler', interval: monitor ? '5 分钟' : '未启用', state: monitor })
  list.push({ id: 'autoremovetorrents', name: '自动删种', type: 'scheduler', interval: '需配置删种任务', state: false })
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
    const [configResult] = await Promise.allSettled([getConfig(), loadSchedules()])
    if (configResult.status === 'rejected') throw configResult.reason
    if (configResult.value.code !== 0) throw new Error('加载服务配置失败')
    configSnapshot.value = configResult.value.config || {}
    configuredServices.value = buildServices(configSnapshot.value)
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
  const cleanup = isCleanupEditor(service.editable)
    ? cleanupForEditor(configSnapshot.value, service.editable)
    : {}
  const defaultLimit = isCleanupEditor(service.editable)
    ? cleanupDefaultLimits[service.editable] : 200
  const schedule = readCleanup(cleanup, defaultLimit)
  const runMessage = service.id === 'recognition_record_cleanup'
    ? `将清理超过 ${retentionLabel(schedule.retentionValue, schedule.retentionUnit)} 的媒体识别记录及其解析明细，再按 ${schedule.maxRecords} 条上限保留最新记录；仍在运行的请求会跳过，可能暂时超过上限。是否继续？`
    : isCleanupEditor(service.editable)
      ? `将清理超过 ${retentionLabel(schedule.retentionValue, schedule.retentionUnit)} 的${service.name.replace('清理过期', '')}，再按 ${schedule.maxRecords} 条上限保留最新记录。是否继续？`
      : service.id === 'database_statistics'
        ? '将立即刷新数据库数据概览中所有应用表的精确记录数，手动执行不受 12 小时间隔限制，任务在后台执行。是否继续？'
        : `是否立即运行 ${service.name}？`
  if (!await modal.confirm(runMessage)) return
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

function openScheduleEditor(service: ServiceItem) {
  if (!service.editable) return
  const config = configSnapshot.value
  const pt = (config.pt || {}) as Record<string, unknown>
  if (service.editable === 'database-statistics') {
    const schedule = readStatisticsSchedule(config)
    statisticsInterval.value = schedule.value
    statisticsIntervalUnit.value = schedule.unit
    scheduleForm.value = { ...scheduleForm.value, id: service.editable, name: service.name, enabled: schedule.enabled }
  } else if (service.editable === 'search') {
    const hours = asDigit(pt.search_rss_interval) || 6
    scheduleForm.value = { id: service.editable, name: service.name,
      enabled: (asDigit(pt.search_rss_interval) || 0) > 0,
      intervalHours: Math.max(6, hours), retentionValue: 30, retentionUnit: 'day', maxRecords: 200 }
  } else {
    const cleanup = cleanupForEditor(config, service.editable)
    const schedule = readCleanup(cleanup, cleanupDefaultLimits[service.editable])
    scheduleForm.value = { id: service.editable, name: service.name,
      enabled: Boolean(cleanup.enabled), ...schedule }
  }
  scheduleDialog.value = true
}

async function saveSchedule() {
  if (scheduleSaving.value) return
  const form = scheduleForm.value
  if (form.id === 'recognition-cleanup') return // versioned panel owns this policy
  const items: Record<string, unknown> = {}
  if (form.id === 'search') {
    const hours = Number(form.intervalHours)
    if (form.enabled && (!Number.isInteger(hours) || hours < 6 || hours > 8760)) {
      modal.warning('订阅搜索周期须为 6 小时至 365 天')
      return
    }
    items['pt.search_rss_interval'] = form.enabled ? hours : 0
  } else if (form.id === 'database-statistics') {
    const value = Number(statisticsInterval.value)
    const hours = value * (statisticsIntervalUnit.value === 'day' ? 24 : 1)
    if (!Number.isSafeInteger(value) || value < 1 || !Number.isSafeInteger(hours) || hours < 12) {
      modal.warning('统计间隔须为正整数，且不能低于 12 小时')
      return
    }
    items['scheduler.database_statistics.enabled'] = form.enabled
    items['scheduler.database_statistics.interval_value'] = value
    items['scheduler.database_statistics.interval_unit'] = statisticsIntervalUnit.value
  } else if (isCleanupEditor(form.id)) {
    const hours = Number(form.intervalHours)
    if (!Number.isInteger(hours) || hours < 1 || hours > 8760) {
      modal.warning('执行周期须为 1 至 8760 小时')
      return
    }
    const retention = Number(form.retentionValue)
    const maximum = form.retentionUnit === 'month' ? 1200 : 36500
    if (!Number.isInteger(retention) || retention < 1 || retention > maximum) {
      modal.warning(form.retentionUnit === 'month' ? '保留时间须为 1 至 1200 个月' : '保留时间须为 1 至 36500 天')
      return
    }
    const maxRecords = Number(form.maxRecords)
    if (!Number.isSafeInteger(maxRecords) || maxRecords < 1) {
      modal.warning('记录上限须为大于 0 的整数')
      return
    }
    const path = cleanupConfigPath(form.id)
    items[`${path}.enabled`] = form.enabled
    items[`${path}.interval_hours`] = hours
    items[`${path}.retention_value`] = retention
    items[`${path}.retention_unit`] = form.retentionUnit
    items[`${path}.max_records`] = maxRecords
  } else return

  scheduleSaving.value = true
  try {
    const response = await updateConfig(items)
    if (response.code === 0) {
      modal.success('服务设置已保存，定时任务已重载')
      scheduleDialog.value = false
      await load()
    } else modal.error(response.msg || '保存服务周期失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '保存服务周期失败')
  } finally {
    scheduleSaving.value = false
  }
}

const nameTestVisible = ref(false)
const nameTestInput = ref('')
const nameTestSubmitted = ref('')
const nameTestLoading = ref(false)
const nameTestResult = ref<NameTestData | NameTestError | null>(null)
let nameTestRequest = 0

function openNameTest() {
  nameTestInput.value = ''
  nameTestSubmitted.value = ''
  nameTestResult.value = null
  nameTestVisible.value = true
}

async function doNameTest() {
  const name = nameTestInput.value.trim()
  if (!name) { modal.warning('请输入资源名称'); return }
  nameTestLoading.value = true
  nameTestSubmitted.value = name
  nameTestResult.value = null
  const requestId = ++nameTestRequest
  try {
    const response = await nameTest(name)
    if (requestId !== nameTestRequest) return
    if (response.code === 0 && response.data) nameTestResult.value = response.data
    else nameTestResult.value = { name: response.msg || '识别请求失败，服务未返回具体原因' }
  } catch (error) {
    if (requestId !== nameTestRequest) return
    nameTestResult.value = { name: error instanceof Error ? error.message : '识别失败' }
  } finally {
    nameTestLoading.value = false
  }
}

const netTestVisible = ref(false)
const netTestLoading = ref(false)
const netTestError = ref('')
const netTestResults = ref<NetTestResult[]>([])
const netColumns: QTableColumn<NetTestResult>[] = [
  { name: 'target', label: '测试对象', field: 'target', align: 'left' },
  { name: 'result', label: '连通性', field: 'res', align: 'left' },
  { name: 'time', label: '耗时', field: 'time', align: 'left' }
]

async function openNetTest() {
  netTestVisible.value = true
  if (netTestLoading.value) return
  netTestLoading.value = true
  netTestError.value = ''
  netTestResults.value = []
  try {
    const result = await netTest()
    if (!Array.isArray(result.results)) throw new Error('网络检测未返回有效结果')
    netTestResults.value = result.results
  } catch (error) {
    netTestError.value = error instanceof Error ? error.message : String(error)
  } finally {
    netTestLoading.value = false
  }
}

onMounted(async () => {
  scheduleRefreshTimer = setInterval(refreshVisibleSchedules, 30_000)
  document.addEventListener('visibilitychange', refreshVisibleSchedules)
  await load()
  void getRecognitionStatistics().then(value => { canManageRecognition.value = value.can_manage }).catch(() => {})
  const requestedService = services.value.find(service => service.id === route.query.task)
  if (requestedService) openScheduleEditor(requestedService)
  if (route.query.tool === 'name-test') openNameTest()
})

onUnmounted(() => {
  clearInterval(scheduleRefreshTimer)
  document.removeEventListener('visibilitychange', refreshVisibleSchedules)
})
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
    <q-banner v-if="scheduleError" class="q-mb-md" rounded inline-actions dense>
      {{ scheduleError }}
      <template #action><q-btn flat color="primary" label="重试执行时间" :loading="schedulesLoading" @click="loadSchedules" /></template>
    </q-banner>

    <div class="stat-grid">
      <q-card flat bordered class="stat-card"><q-icon name="construction" color="primary" size="32px" /><div><div class="stat-label">服务总数</div><div class="stat-value">{{ services.length }}</div></div></q-card>
      <q-card flat bordered class="stat-card"><q-icon name="play_circle" color="positive" size="32px" /><div><div class="stat-label">运行中</div><div class="stat-value">{{ runningCount }}</div></div></q-card>
      <q-card flat bordered class="stat-card"><q-icon name="schedule" color="warning" size="32px" /><div><div class="stat-label">定时任务</div><div class="stat-value">{{ schedulerCount }}</div></div></q-card>
      <q-card flat bordered class="stat-card"><q-icon name="cleaning_services" color="negative" size="32px" /><div><div class="stat-label">手动操作</div><div class="stat-value">{{ manualCount }}</div></div></q-card>
    </div>

    <q-card flat bordered class="content-card">
      <q-card-section class="row items-center q-py-sm"><div><div class="text-subtitle1 text-weight-medium">服务列表</div><div class="text-caption text-secondary">执行时间时区：{{ schedulerTimezone || '浏览器本地' }} · 每 30 秒更新</div></div><q-space /><q-spinner-dots v-if="loading" color="primary" size="20px" /></q-card-section>
      <q-separator />
      <q-table v-if="!$q.screen.lt.sm" flat :rows="services" :columns="columns" row-key="id" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有开启任何后台服务">
        <template #body-cell-type="slotProps"><q-td :props="slotProps"><q-badge outline :color="slotProps.row.type === 'scheduler' ? 'primary' : 'grey-7'" :label="slotProps.row.type === 'scheduler' ? '定时任务' : '手动操作'" /></q-td></template>
        <template #body-cell-state="slotProps"><q-td :props="slotProps"><q-badge :color="slotProps.row.state ? 'positive' : 'grey-6'" :label="slotProps.row.state ? 'ON' : 'OFF'" /></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><RecognitionCleanupActions v-if="slotProps.row.id === 'recognition_record_manual_cleanup'" compact @completed="load" /><template v-else><q-btn v-if="slotProps.row.editable" flat dense color="primary" icon="edit" :label="isCleanupEditor(slotProps.row.editable) ? '清理设置' : '周期设置'" @click="openScheduleEditor(slotProps.row)" /><q-btn flat dense :color="slotProps.row.type === 'manual' ? 'negative' : 'primary'" :icon="slotProps.row.type === 'manual' ? 'delete' : 'play_arrow'" :label="slotProps.row.type === 'manual' ? '清理' : '运行'" :loading="actionBusy === slotProps.row.id" @click="runService(slotProps.row)" /></template></q-td></template>
      </q-table>
      <div v-else class="mobile-service-list">
        <q-card v-for="service in services" :key="service.id" flat bordered class="service-item">
          <q-card-section class="row items-center q-gutter-sm"><q-icon :name="service.type === 'manual' ? 'cleaning_services' : 'schedule'" :color="service.state ? 'positive' : 'grey-6'" size="26px" /><div class="col"><div class="text-subtitle1 text-weight-medium">{{ service.name }}</div><div class="row items-center q-gutter-xs q-mt-xs"><q-badge outline :color="service.type === 'scheduler' ? 'primary' : 'grey-7'" :label="service.type === 'scheduler' ? '定时任务' : '手动操作'" /><span class="text-caption text-secondary">{{ service.interval }}</span></div></div><q-badge :color="service.state ? 'positive' : 'grey-6'" :label="service.state ? 'ON' : 'OFF'" /></q-card-section>
          <q-card-section v-if="service.type === 'scheduler'" class="q-pt-none text-caption text-secondary">下一次执行{{ service.id === 'autoremovetorrents' ? '（最早任务）' : '' }}：{{ nextExecutionLabel(service) }}</q-card-section>
          <q-separator /><q-card-actions align="right"><RecognitionCleanupActions v-if="service.id === 'recognition_record_manual_cleanup'" compact @completed="load" /><template v-else><q-btn v-if="service.editable" flat color="primary" icon="edit" :label="isCleanupEditor(service.editable) ? '清理设置' : '周期设置'" @click="openScheduleEditor(service)" /><q-btn flat :color="service.type === 'manual' ? 'negative' : 'primary'" :icon="service.type === 'manual' ? 'delete' : 'play_arrow'" :label="service.type === 'manual' ? '清理' : '立即运行'" :loading="actionBusy === service.id" @click="runService(service)" /></template></q-card-actions>
        </q-card>
      </div>
    </q-card>

    <q-dialog v-model="scheduleDialog" :maximized="$q.screen.lt.sm" persistent>
      <q-card class="tool-dialog schedule-dialog">
        <q-card-section class="row items-center"><div class="text-h6">{{ scheduleForm.name }}设置</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="closeSchedule" /></q-card-section>
        <q-separator />
        <q-card-section v-if="scheduleForm.id === 'recognition-cleanup'"><RecognitionSettingsPanel ref="recognitionSchedule" cleanup-only @saved="recognitionScheduleSaved" /></q-card-section>
        <q-card-section v-else class="q-gutter-y-md">
          <q-toggle v-model="scheduleForm.enabled" color="primary" label="启用定时任务" />
          <q-input v-if="scheduleForm.id === 'search'" v-model.number="scheduleForm.intervalHours" outlined type="number" min="6" max="8760" label="运行间隔（小时）" :disable="!scheduleForm.enabled" hint="最短 6 小时，最长 365 天" />
          <template v-else-if="scheduleForm.id === 'database-statistics'">
            <div class="text-body2 text-secondary">定时刷新数据库数据概览中的精确记录数，默认每 12 小时执行。12 小时下限仅适用于定时任务；手动刷新可随时执行，关闭定时任务后仍可使用。</div>
            <div class="row q-col-gutter-x-md">
              <div class="col-7"><q-input v-model.number="statisticsInterval" outlined type="number" :min="statisticsIntervalUnit === 'hour' ? 12 : 1" step="1" label="执行间隔" hint="须为正整数，最短 12 小时" /></div>
              <div class="col-5"><q-select v-model="statisticsIntervalUnit" outlined emit-value map-options label="间隔单位" :options="[{ label: '小时', value: 'hour' }, { label: '天', value: 'day' }]" /></div>
            </div>
          </template>
          <template v-else-if="scheduleForm.id">
            <div class="text-body2 text-secondary">每次执行会清理过期记录，再按记录上限保留最新记录；关闭任务后仍可手动运行清理。</div>
            <q-input v-model.number="scheduleForm.intervalHours" outlined type="number" min="1" max="8760" label="执行周期（小时）" :disable="!scheduleForm.enabled" hint="范围 1 至 8760 小时" />
            <div class="row q-col-gutter-md">
              <div class="col-7"><q-input v-model.number="scheduleForm.retentionValue" outlined type="number" min="1" :max="scheduleForm.retentionUnit === 'month' ? 1200 : 36500" label="数据保存时间" /></div>
              <div class="col-5"><q-select v-model="scheduleForm.retentionUnit" outlined emit-value map-options label="数据保存单位" :options="[{ label: '天', value: 'day' }, { label: '月', value: 'month' }]" /></div>
            </div>
            <q-input v-model.number="scheduleForm.maxRecords" outlined type="number" min="1" step="1" label="记录上限（条）" hint="每次清理优先保留最新记录，须为大于 0 的整数" />
          </template>
        </q-card-section>
        <q-separator />
        <q-card-actions v-if="scheduleForm.id !== 'recognition-cleanup'" align="right" class="dialog-actions"><q-btn flat label="取消" :disable="scheduleSaving" @click="scheduleDialog = false" /><q-btn color="primary" unelevated label="保存并重载定时任务" :loading="scheduleSaving" @click="saveSchedule" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-card flat bordered class="content-card">
      <q-card-section class="row items-center"><div><div class="text-subtitle1 text-weight-medium">测试工具</div><div class="text-caption text-secondary q-mt-xs">诊断名称识别与外部服务网络连通性</div></div></q-card-section>
      <q-separator /><q-card-section class="row q-gutter-sm"><q-btn outline icon="manage_search" label="名称识别测试" @click="openNameTest" /><q-btn outline icon="lan" label="网络连通性测试" @click="openNetTest" /></q-card-section>
    </q-card>

    <q-dialog v-model="nameTestVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="tool-dialog name-test-dialog">
        <q-card-section class="row items-center"><div class="text-h6">名称识别测试</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section class="name-test-dialog-body">
          <q-input v-model="nameTestInput" outlined clearable autofocus label="资源名称" placeholder="输入种子名或文件名" :loading="nameTestLoading" @keyup.enter="doNameTest"><template #prepend><q-icon name="search" /></template></q-input>
          <NameTestResult v-if="nameTestResult" :result="nameTestResult" :input="nameTestSubmitted" />
          <div v-else-if="!nameTestLoading" class="name-test-empty"><q-icon name="manage_search" size="42px" color="grey-5" /><div>输入种子名或文件名，查看识别结果</div></div>
        </q-card-section>
        <q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="关闭" v-close-popup /><q-btn color="primary" unelevated :loading="nameTestLoading" :label="nameTestSubmitted ? '重新识别' : '开始识别'" @click="doNameTest" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="netTestVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="tool-dialog network-dialog"><q-card-section class="row items-center"><div class="text-h6">网络连通性测试</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section>
          <q-banner v-if="netTestError" class="q-mb-md text-negative" rounded>{{ netTestError }}</q-banner>
          <q-table flat :rows="netTestResults" :columns="netColumns" row-key="target" :loading="netTestLoading" hide-pagination :rows-per-page-options="[0]" :no-data-label="netTestLoading ? '正在检测…' : '暂无检测结果'" class="network-table">
            <template #body-cell-result="slotProps">
              <q-td :props="slotProps" style="white-space: normal; min-width: 220px">
                <q-badge :color="slotProps.row.res ? 'positive' : 'negative'" :label="slotProps.row.res ? '可连通' : '失败'" />
                <div v-if="slotProps.row.reason || !slotProps.row.res" :class="['text-caption q-mt-xs', slotProps.row.res ? 'text-grey-7' : 'text-negative']">{{ slotProps.row.reason || '未知错误' }}</div>
              </q-td>
            </template>
            <template #body-cell-time="slotProps"><q-td :props="slotProps"><span :class="slotProps.row.res ? 'text-positive' : 'text-negative'">{{ slotProps.row.time || '—' }}</span></q-td></template>
          </q-table>
          <div class="network-mobile-list">
            <div v-if="netTestLoading" class="row justify-center items-center q-pa-md q-gutter-sm"><q-spinner-dots color="primary" /><span>正在检测…</span></div>
            <q-item v-for="row in netTestResults" :key="row.target">
              <q-item-section><q-item-label>{{ row.target }}</q-item-label><q-item-label caption>{{ row.time }}</q-item-label></q-item-section>
              <q-item-section side class="items-end">
                <q-badge :color="row.res ? 'positive' : 'negative'" :label="row.res ? '可连通' : '失败'" />
                <q-item-label v-if="row.reason || !row.res" caption :class="row.res ? 'text-grey-7 text-right' : 'text-negative text-right'" style="max-width: 60vw; white-space: normal">{{ row.reason || '未知错误' }}</q-item-label>
              </q-item-section>
            </q-item>
          </div>
        </q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="关闭" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.service { max-width: 1600px; margin: 0 auto; }
.stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat-card { display: flex; align-items: center; gap: 14px; padding: 18px; border-radius: 12px; }
.stat-label { color: var(--text-secondary); font-size: 12px; }
.stat-value { margin-top: 3px; color: var(--text-primary); font-size: 24px; font-weight: 700; }
.content-card { margin-bottom: 16px; overflow: hidden; }
.mobile-service-list { display: grid; gap: 10px; padding: 12px; }
.service-item { border-radius: 12px; }
.tool-dialog { width: min(680px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.name-test-dialog { width: min(920px, calc(100vw - 32px)); }
.network-dialog { width: min(760px, calc(100vw - 32px)); }
.name-test-dialog-body { max-height: 75vh; overflow-y: auto; }
.name-test-empty { display: grid; justify-items: center; gap: 8px; padding: 48px 16px; color: var(--text-secondary); text-align: center; }
.dialog-actions { gap: 8px; }
.network-mobile-list { display: none; }
@media (max-width: 900px) { .stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599px) {
  .stat-grid { gap: 8px; }
  .stat-card { padding: 14px; }
  .stat-value { font-size: 21px; }
  .tool-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }
  .name-test-dialog-body { max-height: none; flex: 1; overflow-y: auto; }
  .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); }
  .dialog-actions :deep(.q-btn) { min-height: 44px; }
  .network-table { display: none; }
  .network-mobile-list { display: block; }
}
</style>
