<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import NameTestResult from '@/components/NameTestResult.vue'
import { useModalStore } from '@/stores/modal'
import { getConfig, updateConfig, type AppConfig } from '@/api/config'
import {
  runScheduler,
  truncateBlacklist,
  truncateRsshistory,
  nameTest,
  netTest,
  type NameTestData,
  type NameTestError,
  type NetTestResult
} from '@/api/system'

interface ServiceItem {
  id: string
  name: string
  type: 'scheduler' | 'manual'
  interval: string
  state: boolean
  editable?: 'search' | 'recognition-cleanup'
}

const modal = useModalStore()
const route = useRoute()
const loading = ref(false)
const loadError = ref('')
const services = ref<ServiceItem[]>([])
const actionBusy = ref('')
const configSnapshot = ref<AppConfig>({})
const scheduleDialog = ref(false)
const scheduleSaving = ref(false)
const scheduleForm = ref({
  id: '' as ServiceItem['editable'],
  name: '',
  enabled: true,
  interval: 30,
  retentionDays: 30
})

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
  const stringValue = String(value ?? '').trim()
  if (!/^\d+$/.test(stringValue)) return null
  return Number(stringValue)
}

function buildServices(config: AppConfig): ServiceItem[] {
  const pt = (config.pt || {}) as Record<string, unknown>
  const douban = (config.douban || {}) as Record<string, unknown>
  const recognition = (config.recognition || {}) as Record<string, unknown>
  const records = (recognition.records || {}) as Record<string, unknown>
  const cleanup = (records.cleanup || {}) as Record<string, unknown>
  const list: ServiceItem[] = []
  let search = asDigit(pt.search_rss_interval)
  const searchEnabled = search !== null && search > 0
  if (searchEnabled && search !== null && search < 6) search = 6
  list.push({ id: 'subscribe_search_all', name: '订阅搜索', type: 'scheduler', editable: 'search', interval: searchEnabled ? `每 ${search} 小时` : '未启用', state: searchEnabled })
  const cleanupEnabled = Boolean(cleanup.enabled)
  const retentionDays = asDigit(cleanup.retention_days) || 30
  list.push({ id: 'recognition_record_cleanup', name: '清理过期媒体识别记录', type: 'scheduler', editable: 'recognition-cleanup', interval: `每天清理，保留 ${retentionDays} 天`, state: cleanupEnabled })
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
    const response = await getConfig()
    if (response.code === 0) {
      configSnapshot.value = response.config || {}
      services.value = buildServices(configSnapshot.value)
    }
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
  const recognition = (configSnapshot.value.recognition || {}) as Record<string, unknown>
  const records = (recognition.records || {}) as Record<string, unknown>
  const cleanup = (records.cleanup || {}) as Record<string, unknown>
  const retentionDays = asDigit(cleanup.retention_days) || 30
  const runMessage = service.id === 'recognition_record_cleanup'
    ? `将立即删除超过 ${retentionDays} 天的媒体识别记录及其解析明细，仍在运行的请求会跳过。是否继续？`
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
  const recognition = (config.recognition || {}) as Record<string, unknown>
  const records = (recognition.records || {}) as Record<string, unknown>
  const cleanup = (records.cleanup || {}) as Record<string, unknown>
  if (service.editable === 'search') {
    const hours = asDigit(pt.search_rss_interval) || 6
    scheduleForm.value = { id: service.editable, name: service.name,
      enabled: (asDigit(pt.search_rss_interval) || 0) > 0,
      interval: Math.max(6, hours), retentionDays: 30 }
  } else {
    scheduleForm.value = { id: service.editable, name: service.name,
      enabled: Boolean(cleanup.enabled), interval: 24,
      retentionDays: asDigit(cleanup.retention_days) || 30 }
  }
  scheduleDialog.value = true
}

async function saveSchedule() {
  if (scheduleSaving.value) return
  const form = scheduleForm.value
  const items: Record<string, unknown> = {}
  if (form.id === 'search') {
    const hours = Number(form.interval)
    if (form.enabled && (!Number.isInteger(hours) || hours < 6 || hours > 8760)) {
      modal.warning('订阅搜索周期须为 6 小时至 365 天')
      return
    }
    items['pt.search_rss_interval'] = form.enabled ? hours : 0
  } else if (form.id === 'recognition-cleanup') {
    const days = Number(form.retentionDays)
    if (!Number.isInteger(days) || days < 1 || days > 36500) {
      modal.warning('保留时间须为 1 至 36500 天')
      return
    }
    items['recognition.records.cleanup.enabled'] = form.enabled
    items['recognition.records.cleanup.retention_days'] = days
  } else return

  scheduleSaving.value = true
  try {
    const response = await updateConfig(items)
    if (response.code === 0) {
      modal.success('服务周期已保存，定时任务已重载')
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

onMounted(() => {
  void load()
  if (route.query.tool === 'name-test') openNameTest()
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
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><q-btn v-if="slotProps.row.editable" flat dense color="primary" icon="edit" label="周期设置" @click="openScheduleEditor(slotProps.row)" /><q-btn flat dense :color="slotProps.row.type === 'manual' ? 'negative' : 'primary'" :icon="slotProps.row.type === 'manual' ? 'delete' : 'play_arrow'" :label="slotProps.row.type === 'manual' ? '清理' : '运行'" :loading="actionBusy === slotProps.row.id" @click="runService(slotProps.row)" /></q-td></template>
      </q-table>
      <div v-else class="mobile-service-list">
        <q-card v-for="service in services" :key="service.id" flat bordered class="service-item">
          <q-card-section class="row items-center q-gutter-sm"><q-icon :name="service.type === 'manual' ? 'cleaning_services' : 'schedule'" :color="service.state ? 'positive' : 'grey-6'" size="26px" /><div class="col"><div class="text-subtitle1 text-weight-medium">{{ service.name }}</div><div class="row items-center q-gutter-xs q-mt-xs"><q-badge outline :color="service.type === 'scheduler' ? 'primary' : 'grey-7'" :label="service.type === 'scheduler' ? '定时任务' : '手动操作'" /><span class="text-caption text-secondary">{{ service.interval }}</span></div></div><q-badge :color="service.state ? 'positive' : 'grey-6'" :label="service.state ? 'ON' : 'OFF'" /></q-card-section>
          <q-separator /><q-card-actions align="right"><q-btn v-if="service.editable" flat color="primary" icon="edit" label="周期设置" @click="openScheduleEditor(service)" /><q-btn flat :color="service.type === 'manual' ? 'negative' : 'primary'" :icon="service.type === 'manual' ? 'delete' : 'play_arrow'" :label="service.type === 'manual' ? '清理' : '立即运行'" :loading="actionBusy === service.id" @click="runService(service)" /></q-card-actions>
        </q-card>
      </div>
    </q-card>

    <q-dialog v-model="scheduleDialog" :maximized="$q.screen.lt.sm" persistent>
      <q-card class="tool-dialog schedule-dialog">
        <q-card-section class="row items-center"><div class="text-h6">{{ scheduleForm.name }}周期设置</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="scheduleDialog = false" /></q-card-section>
        <q-separator />
        <q-card-section class="q-gutter-md">
          <q-toggle v-model="scheduleForm.enabled" color="primary" label="启用定时任务" />
          <q-input v-if="scheduleForm.id === 'search'" v-model.number="scheduleForm.interval" outlined type="number" min="6" max="8760" label="运行间隔（小时）" :disable="!scheduleForm.enabled" hint="最短 6 小时，最长 365 天" />
          <template v-else-if="scheduleForm.id === 'recognition-cleanup'">
            <div class="text-body2 text-secondary">每天执行一次，删除超过保留期限的识别记录及其解析明细；正在运行的识别请求会跳过。</div>
            <q-input v-model.number="scheduleForm.retentionDays" outlined type="number" min="1" max="36500" label="最长数据保存时间（天）" hint="范围 1 至 36500 天；关闭任务不会自动删除记录" />
          </template>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="scheduleSaving" @click="scheduleDialog = false" /><q-btn color="primary" unelevated label="保存并重载定时任务" :loading="scheduleSaving" @click="saveSchedule" /></q-card-actions>
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
