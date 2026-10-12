<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { type QTableColumn, useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import StorageStatusCard from '@/components/StorageStatusCard.vue'
import {
  cancelCacheJob, checkCacheStorage, clearSystemCache, getCacheJob, getSystemCacheInfo, recoverCacheMigration,
  retryCacheRestart, startCacheMigration,
  type CacheBackendStatus, type CacheStorageCandidate, type CacheStorageJob, type SystemCache
} from '@/api/cache'
import { useModalStore } from '@/stores/modal'

const modal = useModalStore()
const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const caches = ref<SystemCache[]>([])
const loading = ref(false)
const initialLoading = ref(true)
const clearing = ref('')
const error = ref('')
const backend = ref<CacheBackendStatus | null>(null)
const migrationOpen = ref(false)
const migrationBaselineKey = ref('')
const migrationErrors = reactive<Record<string, string>>({})
const migrationHostField = ref<{ focus: () => void } | null>(null)
const migrationPortField = ref<{ focus: () => void } | null>(null)
const migrationDbField = ref<{ focus: () => void } | null>(null)
const checkingStorage = ref(false)
const startingMigration = ref(false)
const checkId = ref('')
const checkResult = ref<{ unchanged?: boolean; same_store?: boolean; summary?: Array<{ namespace: string; entries: number }>; excluded?: Array<{ name: string; reason: string }> } | null>(null)
const task = ref<CacheStorageJob | null>(null)
const pollingJobId = ref('')
const now = ref(Date.now())
const search = ref('')
const cacheType = ref('all')
const migrationForm = reactive<CacheStorageCandidate>({
  backend: 'memory_disk', host: '127.0.0.1', port: 6379, db: 0,
  auth_mode: 'none', username: '', password: '', connect_timeout: 0.5, retry_interval: 30
})
const backendLabels: Record<string, string> = { memory: '内存', memory_disk: '内存 + 本地持久化', redis: 'Redis', valkey: 'Valkey' }
const remoteBackend = computed(() => ['redis', 'valkey'].includes(migrationForm.backend))
const migrationCandidateDirty = computed(() => Boolean(migrationBaselineKey.value)
  && JSON.stringify(storageCandidate()) !== migrationBaselineKey.value)
const total = computed(() => caches.value.reduce((count, cache) => count + cache.entries, 0))
const taskProgress = computed(() => {
  const direct = task.value?.progress
  if (typeof direct === 'number' && Number.isFinite(direct) && direct >= 0 && direct <= 1) return direct
  const events = task.value?.events || []
  const latest = events[events.length - 1]
  return typeof latest?.progress === 'number' && Number.isFinite(latest.progress)
    && latest.progress >= 0 && latest.progress <= 1 ? latest.progress : null
})
const taskElapsed = computed(() => {
  const created = Number(task.value?.created_at || task.value?.updated_at || 0)
  return created ? Math.max(0, Math.floor(now.value / 1000 - created)) : 0
})
const taskMessage = computed(() => {
  const events = task.value?.events || []
  return events[events.length - 1]?.message || task.value?.message || ''
})
const missingMemoryStats = computed(() => caches.value.some((cache) => !hasMemoryStats(cache)))
const totalMemory = computed(() => missingMemoryStats.value || !caches.value.length
  ? null
  : caches.value.reduce((bytes, cache) => bytes + cache.memory_bytes!, 0))
const persistentBytes = computed(() => {
  if ((backend.value?.active_backend || backend.value?.backend) === 'memory') return 0
  if (backend.value?.memory_scope === 'remote') {
    const values = caches.value.filter((cache) => cache.backend === 'redis' || cache.backend === 'valkey').map((cache) => cache.bytes)
    if (!values.length || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return null
    return values.reduce<number>((sum, value) => sum + Number(value), 0)
  }
  const values = caches.value.filter((cache) => cache.persistent).map((cache) => cache.store_bytes)
  if (!values.length || values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) return null
  // SQLite 文件总大小会在每个命名空间行重复返回，取一次即可。
  return Math.max(...values.map(Number))
})
const latestStatsAt = computed(() => Math.max(0, ...caches.value.map((cache) => Number(cache.stats_at || 0))))
const filteredCaches = computed(() => caches.value.filter((cache) => {
  const query = search.value.trim().toLocaleLowerCase()
  const matchesSearch = !query || `${cache.label} ${cache.name}`.toLocaleLowerCase().includes(query)
  const matchesType = cacheType.value === 'all'
    || (cacheType.value === 'persistent' && cache.persistent)
    || (cacheType.value === 'memory' && !cache.persistent)
    || (cacheType.value === 'recognition' && /recognition|parse|ai/i.test(`${cache.name} ${cache.label}`))
    || (cacheType.value === 'wallpaper' && /wallpaper/i.test(`${cache.name} ${cache.label}`))
  return matchesSearch && matchesType
}))
const columns: QTableColumn<SystemCache>[] = [
  { name: 'label', label: '缓存类型', field: 'label', align: 'left' },
  { name: 'entries', label: '有效条数', field: 'entries', align: 'right', sortable: true },
  { name: 'memory_bytes', label: '内存占用（估算）', field: 'memory_bytes', align: 'right', sortable: true },
  { name: 'ttl_seconds', label: '有效期', field: 'ttl_seconds', align: 'right', sortable: true },
  { name: 'persistent', label: '保存方式', field: 'persistent', align: 'left' },
  { name: 'actions', label: '操作', field: 'name', align: 'right' }
]

function hasMemoryStats(cache: SystemCache) {
  return typeof cache.memory_bytes === 'number' && Number.isFinite(cache.memory_bytes) && cache.memory_bytes >= 0
}

function formatBytes(bytes?: number | null) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** unit).toFixed(unit ? 2 : 0)} ${units[unit]}`
}

function formatTime(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '统计时间未知'
  return `统计于 ${new Date(value * 1000).toLocaleString()}`
}

function formatTtl(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  if (value <= 0) return '不自动过期'
  if (value >= 86400) return `${Math.floor(value / 86400)} 天`
  if (value >= 3600) return `${Math.floor(value / 3600)} 小时`
  if (value >= 60) return `${Math.floor(value / 60)} 分钟`
  return `${value} 秒`
}

function setTask(value: CacheStorageJob, syncQuery = true) {
  task.value = value
  if (syncQuery && route.query.task !== value.job_id) {
    void router.replace({ query: { ...route.query, tab: 'cache', task: value.job_id } })
  }
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await getSystemCacheInfo()
    if (result.code !== 0) throw new Error(result.msg || '加载缓存信息失败')
    caches.value = result.caches
    backend.value = result.backend || null
    if (result.backend?.connection && !migrationOpen.value) {
      Object.assign(migrationForm, result.backend.connection, {
        backend: result.backend.configured_backend,
        username: '',
        password: ''
      })
      migrationBaselineKey.value = JSON.stringify(storageCandidate())
    }
    if (result.backend?.current_task) {
      setTask(result.backend.current_task, route.query.tab === 'cache')
      if (!['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(result.backend.current_task.status)) {
        void watchJob(result.backend.current_task.job_id)
      }
    } else if (result.backend?.recent_task && !task.value) {
      setTask(result.backend.recent_task, route.query.tab === 'cache')
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载缓存信息失败'
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

function storageCandidate(): CacheStorageCandidate {
  return {
    backend: migrationForm.backend,
    host: migrationForm.host,
    port: Number(migrationForm.port),
    db: Number(migrationForm.db),
    auth_mode: migrationForm.auth_mode,
    username: migrationForm.username,
    password: migrationForm.password,
    connect_timeout: Number(migrationForm.connect_timeout),
    retry_interval: Number(migrationForm.retry_interval)
  }
}

async function closeMigration() {
  if (migrationCandidateDirty.value && !await modal.confirm(
    '候选缓存参数尚未提交，关闭后会丢弃这些修改。', '放弃候选参数')) return
  migrationOpen.value = false
}

function clearMigrationError(field: string) {
  delete migrationErrors[field]
}

async function focusMigrationField(field: string) {
  await nextTick()
  const fields: Record<string, { focus: () => void } | null> = {
    host: migrationHostField.value,
    port: migrationPortField.value,
    db: migrationDbField.value
  }
  fields[field]?.focus()
}

function validateMigrationCandidate() {
  Object.keys(migrationErrors).forEach((field) => delete migrationErrors[field])
  if (!remoteBackend.value) return true

  if (!migrationForm.host.trim()) migrationErrors.host = '请输入 Redis/Valkey 主机地址。'
  if (!Number.isInteger(Number(migrationForm.port)) || Number(migrationForm.port) < 1 || Number(migrationForm.port) > 65535) {
    migrationErrors.port = '端口必须是 1～65535 之间的整数。'
  }
  if (!Number.isInteger(Number(migrationForm.db)) || Number(migrationForm.db) < 0) {
    migrationErrors.db = '数据库编号必须是非负整数。'
  }
  if (!Number.isFinite(Number(migrationForm.connect_timeout)) || Number(migrationForm.connect_timeout) <= 0 || Number(migrationForm.connect_timeout) > 120) {
    migrationErrors.connect_timeout = '连接超时必须大于 0 且不超过 120 秒。'
  }
  if (!Number.isFinite(Number(migrationForm.retry_interval)) || Number(migrationForm.retry_interval) < 1 || Number(migrationForm.retry_interval) > 3600) {
    migrationErrors.retry_interval = '故障恢复探测间隔必须是 1～3600 秒。'
  }

  const firstInvalid = ['host', 'port', 'db', 'connect_timeout', 'retry_interval'].find((field) => migrationErrors[field])
  if (firstInvalid) {
    void focusMigrationField(firstInvalid)
    return false
  }
  return true
}

async function confirmLeave() {
  if (!migrationOpen.value) return true
  if (task.value && !['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(task.value.status)) {
    migrationOpen.value = false
    return true
  }
  return closeMigration()
}

async function checkStorage() {
  if (!validateMigrationCandidate()) return
  checkingStorage.value = true
  checkId.value = ''
  checkResult.value = null
  try {
    const result = await checkCacheStorage(storageCandidate())
    if (result.code !== 0) throw new Error(result.msg || '缓存目标检查失败')
    checkId.value = result.check_id || ''
    checkResult.value = result
  } catch (cause) {
    modal.error(cause instanceof Error ? cause.message : '缓存目标检查失败')
    if (remoteBackend.value) void focusMigrationField('host')
  } finally {
    checkingStorage.value = false
  }
}

async function beginMigration() {
  if (!checkId.value) return
  const count = checkResult.value?.summary?.reduce((sum, item) => sum + item.entries, 0) || 0
  const action = checkResult.value?.unchanged
    ? '存储设置没有变化，不需要迁移或重启'
    : checkResult.value?.same_store
      ? '校验当前缓存、保存连接参数并重启缓存服务'
      : `迁移 ${count} 条缓存并重启缓存服务`
  if (!await modal.confirm(`${action}。迁移校验完成后才会保存设置，期间缓存写入会暂停。`, '确认缓存迁移')) return
  startingMigration.value = true
  try {
    const result = await startCacheMigration({ ...storageCandidate(), check_id: checkId.value })
    if (result.code !== 0 || !result.job_id) throw new Error(result.msg || '无法启动缓存迁移')
    if (result.job) setTask(result.job)
    migrationOpen.value = false
    void watchJob(result.job_id)
  } catch (cause) {
    modal.error(cause instanceof Error ? cause.message : '无法启动缓存迁移')
  } finally {
    startingMigration.value = false
  }
}

async function watchJob(jobId: string) {
  if (pollingJobId.value === jobId) return
  pollingJobId.value = jobId
  const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'RECOVERY_REQUIRED'])
  let delay = 1500
  let disconnectedAt = 0
  try {
    while (mounted && pollingJobId.value === jobId) {
      try {
        const result = await getCacheJob(jobId)
        if (result.code !== 0 || !result.job) throw new Error(result.msg || '任务暂时不可读取')
        disconnectedAt = 0
        setTask(result.job, false)
        if (terminal.has(result.job.status)) {
          await refresh()
          break
        }
        delay = result.job.status === 'RESTART_PENDING' || result.job.status === 'VERIFYING_STARTUP'
          ? Math.min(15000, Math.round(delay * 1.35)) : 1500
      } catch {
        if (!disconnectedAt) disconnectedAt = Date.now()
        delay = Math.min(15000, Math.round(delay * 1.5))
        if (Date.now() - disconnectedAt > 5 * 60 * 1000) break
      }
      await new Promise((resolve) => window.setTimeout(resolve, delay))
    }
  } finally {
    if (pollingJobId.value === jobId) pollingJobId.value = ''
  }
}

async function cancelMigration() {
  if (!task.value) return
  try {
    const result = await cancelCacheJob(task.value.job_id)
    if (result.code !== 0) throw new Error(result.msg || '当前阶段不能取消')
    await watchJob(task.value.job_id)
  } catch (cause) {
    modal.error(cause instanceof Error ? cause.message : '无法取消缓存迁移')
  }
}

async function retryRestart() {
  if (!task.value) return
  const result = await retryCacheRestart(task.value.job_id)
  if (result.code !== 0) modal.error(result.msg || '重启请求失败')
}

async function recoverMigration() {
  if (!task.value) return
  const result = await recoverCacheMigration(task.value.job_id)
  if (result.code !== 0) {
    modal.error(result.msg || '缓存恢复失败')
    return
  }
  modal.success('已恢复原缓存目标，活动配置未改变')
  task.value = null
  await refresh()
}

async function clear(name: string, label: string) {
  if (!await modal.confirm(`清理${label}后，系统将在需要时重新获取数据。`, `清理${label}`)) return
  clearing.value = name
  try {
    const result = await clearSystemCache(name)
    if (result.code !== 0) throw new Error(result.msg || '清理缓存失败')
    modal.success(`已清理 ${result.cleared_entries} 条缓存`)
    await refresh()
  } catch (cause) {
    modal.error(cause instanceof Error ? cause.message : '清理缓存失败')
  } finally {
    clearing.value = ''
  }
}

let mounted = true
let elapsedTimer = 0
onMounted(() => {
  void refresh()
  elapsedTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  mounted = false
  pollingJobId.value = ''
  window.clearInterval(elapsedTimer)
})
watch(() => [route.query.tab, route.query.task], ([tab, value]) => {
  if (tab !== 'cache') return
  const id = String(value || '')
  if (!id || id === task.value?.job_id) return
  void getCacheJob(id).then((result) => {
    if (result.code === 0 && result.job) {
      setTask(result.job, false)
      if (!['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'RECOVERY_REQUIRED'].includes(result.job.status)) {
        void watchJob(id)
      }
    }
  }).catch(() => undefined)
}, { immediate: true })
defineExpose({ refresh, confirmLeave })
</script>

<template>
  <section class="q-mb-lg">
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="text-subtitle1">系统缓存 · {{ backend ? total : '暂不可用' }} 条</div>
      <div class="text-caption text-secondary">{{ totalMemory === null ? '合计内存暂不可用' : `合计内存约 ${formatBytes(totalMemory)}` }}</div>
      <div v-if="loading && !initialLoading" class="text-caption text-secondary" role="status" aria-live="polite">更新中，保留上次统计</div>
      <q-space />
      <q-btn outline color="primary" icon="swap_horiz" label="迁移保存方式" :disable="loading || Boolean(clearing) || Boolean(backend?.maintenance)" @click="migrationOpen = true" />
      <q-btn flat color="primary" icon="refresh" label="刷新统计" :loading="loading" :disable="Boolean(clearing)" @click="refresh" />
    </div>
    <div v-if="initialLoading" class="cache-loading-skeleton" role="status" aria-live="polite" aria-label="正在加载缓存状态" aria-busy="true">
      <div class="cache-metrics">
        <q-skeleton v-for="index in 4" :key="index" type="rect" height="92px" class="cache-metric" />
      </div>
      <q-skeleton type="rect" height="280px" class="cache-loading-table" />
    </div>
    <template v-else>
    <StorageStatusCard v-if="backend" class="cache-status-card q-mb-md"
      :title="`当前使用：${backendLabels[backend.active_backend || backend.backend] || backend.backend}`"
      :subtitle="backend.fallback ? '远程目标不可用，当前使用内存缓存' : '缓存后端连接正常'"
      :status="backend.fallback ? 'warning' : 'ok'"
      :status-label="backend.fallback ? '已降级' : '运行正常'"
      :icon="backend.fallback ? 'sync_problem' : 'storage'">
      <template #details>
      <div class="cache-status-details">
        <span v-if="backend.configured_backend !== (backend.active_backend || backend.backend)">配置目标：{{ backendLabels[backend.configured_backend] || backend.configured_backend }} · 等待重启</span>
        <span v-else>配置目标与活动保存方式一致</span>
        <span v-if="backend.store_path">固定本地路径：{{ backend.store_path }}</span>
        <span v-if="backend.connection && ['redis', 'valkey'].includes(backend.configured_backend)">远程目标：{{ backend.connection.host }}:{{ backend.connection.port }} / {{ backend.connection.db }}</span>
        <span>内存统计口径：{{ backend.memory_scope === 'remote' ? '远程缓存服务' : '本机' }}</span>
      </div>
      </template>
      <template #notice>
      <q-banner v-if="backend.fallback" dense rounded class="bg-warning text-dark q-mt-sm">{{ backend.reason }}。<template v-if="['redis', 'valkey'].includes(backend.configured_backend)">当前使用内存缓存，连接恢复后会自动切回。</template></q-banner>
      </template>
    </StorageStatusCard>
    <div v-if="backend" class="cache-metrics q-mb-md">
      <q-card flat bordered class="cache-metric"><span>有效条数</span><strong>{{ total.toLocaleString() }}</strong><small>当前活动命名空间</small></q-card>
      <q-card flat bordered class="cache-metric"><span>{{ backend.memory_scope === 'remote' ? '远程内存估算' : '本机内存估算' }}</span><strong>{{ totalMemory === null ? '暂不可用' : formatBytes(totalMemory) }}</strong><small>估算值，不与持久化占用相加</small></q-card>
      <q-card flat bordered class="cache-metric"><span>{{ backend.memory_scope === 'remote' ? '远程缓存占用' : '本地持久化占用' }}</span><strong>{{ persistentBytes === null ? '暂不可用' : formatBytes(persistentBytes) }}</strong><small>{{ backend.memory_scope === 'remote' ? '按远程命名空间统计' : 'SQLite 文件大小仅计算一次' }}</small></q-card>
      <q-card flat bordered class="cache-metric"><span>最近统计</span><strong>{{ latestStatsAt ? new Date(latestStatsAt * 1000).toLocaleTimeString() : '暂不可用' }}</strong><small>{{ latestStatsAt ? new Date(latestStatsAt * 1000).toLocaleDateString() : '统计时间未知' }}</small></q-card>
    </div>
    <q-banner v-if="task && !['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(task.status)" class="bg-info text-white q-mb-md" rounded>
      <div class="row items-center q-gutter-sm"><strong>缓存任务：{{ task.stage }}</strong><span class="cache-task-elapsed">{{ Math.floor(taskElapsed / 60) ? `${Math.floor(taskElapsed / 60)} 分 ` : '' }}{{ taskElapsed % 60 }} 秒 · {{ task.status }}</span><q-space /><q-btn v-if="task.status === 'RESTART_PENDING'" flat dense color="white" label="重试重启" @click="retryRestart" /><q-btn v-else-if="task.status === 'RECOVERY_REQUIRED'" flat dense color="white" label="重试恢复原缓存" @click="recoverMigration" /><q-btn v-else-if="['CHECKING', 'READY', 'QUIESCING', 'SNAPSHOTTING', 'MIGRATING', 'VALIDATING', 'VALIDATED'].includes(task.status)" flat dense color="white" label="取消任务" @click="cancelMigration" /></div>
      <div v-if="taskMessage" class="q-mt-sm">{{ taskMessage }}</div>
      <q-linear-progress v-if="taskProgress !== null" :value="taskProgress" color="white" rounded class="q-mt-sm" aria-label="缓存任务进度" />
      <div v-if="task.error" class="q-mt-sm">{{ task.error }}</div>
      <div v-if="Number(task.result?.expired_during_migration) > 0" class="q-mt-sm">迁移期间到期并跳过 {{ task.result?.expired_during_migration }} 条缓存。</div>
      <div v-if="Number(task.result?.wallpaper_entries_limited) > 0" class="q-mt-sm">登录壁纸按上限保留一条，跳过 {{ task.result?.wallpaper_entries_limited }} 条旧记录。</div>
    </q-banner>
    <q-banner v-else-if="task?.status === 'FAILED'" class="bg-negative text-white q-mb-md" rounded>缓存迁移失败：{{ task.error || '活动配置未变更' }}</q-banner>
    <q-banner v-else-if="task?.status === 'SUCCEEDED'" class="bg-positive text-white q-mb-md" rounded>
      缓存存储迁移已完成。
      <div v-if="Number(task.result?.expired_during_migration) > 0">迁移期间到期并跳过 {{ task.result?.expired_during_migration }} 条缓存。</div>
      <div v-if="Number(task.result?.wallpaper_entries_limited) > 0">登录壁纸按上限保留一条，跳过 {{ task.result?.wallpaper_entries_limited }} 条旧记录。</div>
    </q-banner>
    <div class="text-caption text-secondary q-mb-md">磁盘模式重启后恢复未过期缓存；内存模式重启后清空。Redis / Valkey 的持久化由服务端配置决定。认证令牌和配置加载缓存始终保存在本机内存中。</div>
    <div v-if="backend?.store_path" class="text-caption text-secondary q-mb-md">本地缓存文件：{{ backend.store_path }}</div>
    <div class="text-caption text-secondary q-mb-md">内存统计按{{ backend?.memory_scope === 'remote' ? '远程服务' : '本机' }}口径展示；数据量为估算统计，不影响缓存写入。</div>
    <q-banner v-if="error" class="bg-negative text-white q-mb-md" rounded>{{ error }}</q-banner>
    <q-banner v-if="missingMemoryStats" class="bg-warning text-white q-mb-md" rounded>{{ backend ? '部分缓存未提供内存统计；远程模式请检查服务端 MEMORY USAGE 权限。' : '当前接口未提供完整的内存统计，请重启后端后刷新。' }}</q-banner>
    <div class="cache-filters q-mb-sm">
      <q-input v-model="search" outlined dense clearable label="搜索缓存名称" class="cache-search"><template #prepend><q-icon name="search" /></template></q-input>
      <q-select v-model="cacheType" outlined dense emit-value map-options label="类型筛选" class="cache-type-filter" :options="[
        { value: 'all', label: '全部缓存' }, { value: 'persistent', label: '持久化' },
        { value: 'memory', label: '仅内存' }, { value: 'recognition', label: '识别 / AI' }, { value: 'wallpaper', label: '登录壁纸' }
      ]" />
    </div>
    <q-table flat bordered :rows="filteredCaches" :columns="columns" row-key="name" :loading="loading" :grid="$q.screen.lt.sm" :pagination="{ rowsPerPage: 0, sortBy: 'entries', descending: true }" hide-pagination no-data-label="暂无符合条件的缓存" wrap-cells>
      <template #item="props">
        <q-card flat bordered class="cache-card q-ma-xs">
          <q-card-section class="row items-start no-wrap q-pb-sm">
            <div class="col"><div class="text-subtitle2">{{ props.row.label }}</div><div class="text-caption text-secondary">{{ props.row.entries }} 条有效缓存<span v-if="props.row.max_entries === 1"> · 上限 1 条</span></div></div>
            <q-btn flat dense color="negative" label="清理" :loading="clearing === props.row.name" :disable="loading || Boolean(clearing) || Boolean(backend?.maintenance)" @click="clear(props.row.name, props.row.label)" />
          </q-card-section>
          <q-separator />
          <q-card-section class="text-caption cache-card-stats">
            <div>内存占用{{ props.row.stats_estimated ? '（估算）' : '' }}：{{ formatBytes(props.row.memory_bytes) }}</div>
            <div v-if="props.row.bytes !== undefined">缓存数据量：{{ formatBytes(props.row.bytes) }}</div>
            <div v-if="props.row.store_bytes !== undefined">本地文件占用：{{ formatBytes(props.row.store_bytes) }}</div>
            <div>有效期：{{ formatTtl(props.row.ttl_seconds) }}</div>
            <div>{{ backendLabels[props.row.backend] || (props.row.persistent ? '持久保存' : '内存') }} · {{ formatTime(props.row.stats_at) }}</div>
          </q-card-section>
        </q-card>
      </template>
      <template #body-cell-entries="props">
        <q-td :props="props">{{ props.row.entries }}<q-badge v-if="props.row.max_entries === 1" class="q-ml-sm" color="grey">上限 1 条</q-badge></q-td>
      </template>
      <template #body-cell-memory_bytes="props">
        <q-td :props="props">
          <div>{{ props.row.stats_estimated ? '约 ' : '' }}{{ formatBytes(props.row.memory_bytes) }}</div>
          <div v-if="props.row.bytes !== undefined" class="text-caption text-secondary">数据量 {{ formatBytes(props.row.bytes) }}</div>
          <div v-if="props.row.store_bytes !== undefined" class="text-caption text-secondary">本地文件 {{ formatBytes(props.row.store_bytes) }}</div>
        </q-td>
      </template>
      <template #body-cell-ttl_seconds="props"><q-td :props="props">{{ formatTtl(props.row.ttl_seconds) }}</q-td></template>
      <template #body-cell-persistent="props">
        <q-td :props="props"><q-badge :color="props.row.backend && props.row.backend !== 'memory' ? 'positive' : 'grey'">{{ backendLabels[props.row.backend] || (props.row.persistent ? '持久保存' : '内存') }}</q-badge></q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props"><q-btn flat dense color="negative" label="清理" :loading="clearing === props.row.name" :disable="loading || Boolean(clearing) || Boolean(backend?.maintenance)" @click="clear(props.row.name, props.row.label)" /></q-td>
      </template>
    </q-table>

    <q-card flat bordered class="cache-maintenance-card q-mt-md">
      <div><div class="text-subtitle1">维护操作</div><div class="text-caption text-secondary">清理缓存后，后续请求会在需要时重新获取数据；迁移记录不受影响。</div></div>
      <q-btn outline color="negative" label="清理全部缓存" :loading="clearing === 'all'" :disable="loading || Boolean(clearing) || Boolean(backend?.maintenance)" @click="clear('all', '全部缓存')" />
    </q-card>

    <q-dialog v-model="migrationOpen" persistent :maximized="$q.screen.lt.sm">
      <q-card class="migration-dialog">
        <q-card-section><div class="text-h6">迁移缓存保存方式</div><div class="text-caption text-secondary">先检查候选目标，再复制和校验当前缓存。只有校验通过后才保存配置并重启。</div></q-card-section>
        <q-separator />
        <q-card-section class="migration-fields">
          <q-select v-model="migrationForm.backend" outlined dense label="保存方式" emit-value map-options :options="[
            { value: 'memory', label: '内存' }, { value: 'memory_disk', label: '内存 + 本地持久化' },
            { value: 'redis', label: 'Redis' }, { value: 'valkey', label: 'Valkey' }
          ]" @update:model-value="checkId = ''; checkResult = null" />
          <template v-if="remoteBackend">
            <q-input ref="migrationHostField" v-model.trim="migrationForm.host" outlined dense label="服务器地址" :error="Boolean(migrationErrors.host)" :error-message="migrationErrors.host" @update:model-value="clearMigrationError('host'); checkId = ''; checkResult = null" />
            <q-input ref="migrationPortField" v-model.number="migrationForm.port" outlined dense type="number" label="端口" :error="Boolean(migrationErrors.port)" :error-message="migrationErrors.port" @update:model-value="clearMigrationError('port'); checkId = ''; checkResult = null" />
            <q-input ref="migrationDbField" v-model.number="migrationForm.db" outlined dense type="number" label="数据库编号" :error="Boolean(migrationErrors.db)" :error-message="migrationErrors.db" @update:model-value="clearMigrationError('db'); checkId = ''; checkResult = null" />
            <q-select v-model="migrationForm.auth_mode" outlined dense label="认证方式" emit-value map-options :options="[
              { value: 'none', label: '无密码认证' }, { value: 'password', label: '密码认证' }
            ]" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-if="migrationForm.auth_mode === 'password'" v-model="migrationForm.username" outlined dense label="用户名（可选）" placeholder="同一目标留空表示保持" autocomplete="off" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-if="migrationForm.auth_mode === 'password'" v-model="migrationForm.password" outlined dense type="password" label="密码" placeholder="同一目标留空表示保持；新目标需填写" autocomplete="new-password" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-model.number="migrationForm.connect_timeout" outlined dense type="number" label="连接超时（秒）" :error="Boolean(migrationErrors.connect_timeout)" :error-message="migrationErrors.connect_timeout" @update:model-value="clearMigrationError('connect_timeout'); checkId = ''; checkResult = null" />
            <q-input v-model.number="migrationForm.retry_interval" outlined dense type="number" label="故障恢复探测间隔（秒）" :error="Boolean(migrationErrors.retry_interval)" :error-message="migrationErrors.retry_interval" @update:model-value="clearMigrationError('retry_interval'); checkId = ''; checkResult = null" />
          </template>
        </q-card-section>
        <q-banner v-if="checkResult" class="q-mx-md q-mb-md" :class="checkResult.unchanged ? 'bg-blue-1' : 'bg-green-1'" rounded>
          {{ checkResult.unchanged ? '存储配置没有变化，无需迁移。' : checkResult.same_store ? '存储空间相同，将验证缓存并保存连接参数。' : `目标检查通过，将迁移 ${checkResult.summary?.reduce((sum, item) => sum + item.entries, 0) || 0} 条有效缓存。` }}
          <div v-if="checkResult.excluded?.length" class="q-mt-sm">不迁移的本机临时缓存：{{ checkResult.excluded.map((item) => `${item.name}（${item.reason}）`).join('；') }}。</div>
        </q-banner>
        <q-banner v-if="migrationForm.backend === 'memory' && !checkResult?.unchanged" dense rounded class="q-mx-md q-mb-md bg-grey-2 text-secondary">
          本次切换会通过受限临时快照在新进程恢复未过期缓存；之后普通重启仍会清空内存缓存。
        </q-banner>
        <q-card-actions align="right">
          <q-btn flat label="关闭" :disable="checkingStorage || startingMigration" @click="closeMigration" />
          <q-btn outline color="primary" label="检查目标" :loading="checkingStorage" :disable="startingMigration" @click="checkStorage" />
          <q-btn color="primary" unelevated label="迁移并重启" :loading="startingMigration" :disable="!checkId || checkingStorage" @click="beginMigration" />
        </q-card-actions>
      </q-card>
    </q-dialog>
    </template>
  </section>
</template>

<style scoped>
.cache-card { width: 100%; }
.cache-loading-skeleton { display: grid; gap: 14px; }
.cache-loading-skeleton .q-skeleton { background: var(--surface); }
.cache-loading-table { border: 1px solid var(--border-subtle); border-radius: 12px; }
.cache-card-stats { display: grid; gap: 4px; overflow-wrap: anywhere; }
.cache-status-card { padding: 16px 18px; }
.cache-metric, .cache-maintenance-card { border-color: var(--border-subtle); border-radius: 16px; background: var(--surface); }
.cache-status-details { display: flex; flex-wrap: wrap; gap: 8px 18px; margin: 12px 0 0 60px; color: var(--text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.cache-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.cache-metric { padding: 14px 16px; min-width: 0; display: flex; flex-direction: column; gap: 6px; }.cache-metric span, .cache-metric small { color: var(--text-secondary); font-size: 12px; }.cache-metric strong { font-size: 22px; overflow-wrap: anywhere; }
.cache-maintenance-card { padding: 16px 18px; display: flex; justify-content: space-between; align-items: center; gap: 14px; }
.migration-dialog { width: min(640px, 100vw); max-width: 100vw; max-height: min(90vh, 900px); display: flex; flex-direction: column; }
.migration-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; overflow-y: auto; flex: 1; }
.cache-filters { display: grid; grid-template-columns: minmax(180px, 1fr) minmax(180px, 260px); gap: 10px; }
.cache-search, .cache-type-filter { min-width: 0; }
@media (max-width: 599px) {
  section :deep(.q-btn) { min-height: 44px; }
  .migration-dialog { min-height: 100dvh; max-height: 100dvh; }.migration-dialog :deep(.q-card__actions) { padding-bottom: calc(12px + var(--safe-bottom)); }
  .migration-fields { grid-template-columns: minmax(0, 1fr); }
  .cache-filters { grid-template-columns: minmax(0, 1fr); }
  .cache-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.cache-metric { padding: 12px; }.cache-metric strong { font-size: 18px; }
  .cache-status-card { padding: 14px; }.cache-status-details { margin-left: 0; flex-direction: column; gap: 6px; }
  .cache-maintenance-card { align-items: stretch; flex-direction: column; }.cache-maintenance-card :deep(.q-btn) { min-height: 44px; }
}
</style>
