<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { type QTableColumn, useQuasar } from 'quasar'
import {
  cancelCacheJob, checkCacheStorage, clearSystemCache, getCacheJob, getSystemCacheInfo, recoverCacheMigration,
  retryCacheRestart, startCacheMigration,
  type CacheBackendStatus, type CacheStorageCandidate, type CacheStorageJob, type SystemCache
} from '@/api/cache'
import { useModalStore } from '@/stores/modal'

const modal = useModalStore()
const $q = useQuasar()
const caches = ref<SystemCache[]>([])
const loading = ref(false)
const clearing = ref('')
const error = ref('')
const backend = ref<CacheBackendStatus | null>(null)
const migrationOpen = ref(false)
const checkingStorage = ref(false)
const startingMigration = ref(false)
const checkId = ref('')
const checkResult = ref<{ unchanged?: boolean; same_store?: boolean; summary?: Array<{ namespace: string; entries: number }>; excluded?: Array<{ name: string; reason: string }> } | null>(null)
const task = ref<CacheStorageJob | null>(null)
const pollingJobId = ref('')
const migrationForm = reactive<CacheStorageCandidate>({
  backend: 'memory_disk', host: '127.0.0.1', port: 6379, db: 0,
  auth_mode: 'none', username: '', password: '', connect_timeout: 0.5, retry_interval: 30
})
const backendLabels: Record<string, string> = { memory: '内存', memory_disk: '内存 + 本地持久化', redis: 'Redis', valkey: 'Valkey' }
const remoteBackend = computed(() => ['redis', 'valkey'].includes(migrationForm.backend))
const total = computed(() => caches.value.reduce((count, cache) => count + cache.entries, 0))
const missingMemoryStats = computed(() => caches.value.some((cache) => !hasMemoryStats(cache)))
const totalMemory = computed(() => missingMemoryStats.value || !caches.value.length
  ? null
  : caches.value.reduce((bytes, cache) => bytes + cache.memory_bytes!, 0))
const columns: QTableColumn<SystemCache>[] = [
  { name: 'label', label: '缓存类型', field: 'label', align: 'left' },
  { name: 'entries', label: '有效条数', field: 'entries', align: 'right' },
  { name: 'memory_bytes', label: '内存占用（估算）', field: 'memory_bytes', align: 'right', sortable: true },
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
    }
    if (result.backend?.current_task) {
      task.value = result.backend.current_task
      void watchJob(result.backend.current_task.job_id)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载缓存信息失败'
  } finally {
    loading.value = false
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

async function checkStorage() {
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
    task.value = result.job || null
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
  try {
    while (pollingJobId.value === jobId) {
      const result = await getCacheJob(jobId)
      if (result.code !== 0 || !result.job) break
      task.value = result.job
      if (terminal.has(result.job.status) || result.job.status === 'RESTART_PENDING') break
      await new Promise((resolve) => window.setTimeout(resolve, 1500))
    }
    await refresh()
  } catch {
    // 页面刷新后会从后端恢复任务状态。
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

onMounted(refresh)
defineExpose({ refresh })
</script>

<template>
  <section class="q-mb-lg">
    <div class="row items-center q-gutter-sm q-mb-md">
      <div class="text-subtitle1">系统缓存 · {{ total }} 条</div>
      <div class="text-caption text-secondary">{{ totalMemory === null ? '合计内存暂不可用' : `合计内存约 ${formatBytes(totalMemory)}` }}</div>
      <q-space />
      <q-btn outline color="primary" icon="swap_horiz" label="迁移保存方式" :disable="loading || Boolean(clearing) || Boolean(backend?.maintenance)" @click="migrationOpen = true" />
      <q-btn flat color="primary" icon="refresh" label="刷新统计" :loading="loading" :disable="Boolean(clearing)" @click="refresh" />
      <q-btn outline color="negative" label="清理全部缓存" :loading="clearing === 'all'" :disable="loading || Boolean(clearing)" @click="clear('all', '全部缓存')" />
    </div>
    <div v-if="backend" class="text-caption text-secondary q-mb-sm">
      活动保存方式：{{ backendLabels[backend.active_backend || backend.backend] || backend.backend }}
      <template v-if="backend.configured_backend !== (backend.active_backend || backend.backend)"> · 配置目标：{{ backendLabels[backend.configured_backend] || backend.configured_backend }}</template>
      <template v-if="backend.restart_required"> · 等待重启</template>
    </div>
    <q-banner v-if="backend?.fallback" class="bg-warning text-white q-mb-md" rounded>{{ backend.reason }}。<template v-if="['redis', 'valkey'].includes(backend.configured_backend)">当前使用内存缓存，连接恢复后会自动切回。</template></q-banner>
    <q-banner v-if="task && !['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED'].includes(task.status)" class="bg-info text-white q-mb-md" rounded>
      <div class="row items-center q-gutter-sm"><span>缓存任务：{{ task.stage }} · {{ task.status }}</span><q-space /><q-btn v-if="task.status === 'RESTART_PENDING'" flat dense color="white" label="重试重启" @click="retryRestart" /><q-btn v-else-if="task.status === 'RECOVERY_REQUIRED'" flat dense color="white" label="重试恢复原缓存" @click="recoverMigration" /><q-btn v-else-if="['CHECKING', 'READY', 'QUIESCING', 'SNAPSHOTTING', 'MIGRATING', 'VALIDATING', 'VALIDATED'].includes(task.status)" flat dense color="white" label="取消任务" @click="cancelMigration" /></div>
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
    <q-table flat bordered :rows="caches" :columns="columns" row-key="name" :loading="loading" :grid="$q.screen.lt.sm" :pagination="{ rowsPerPage: 0 }" hide-pagination no-data-label="暂无缓存信息" wrap-cells>
      <template #item="props">
        <q-card flat bordered class="cache-card q-ma-xs">
          <q-card-section class="row items-start no-wrap q-pb-sm">
            <div class="col"><div class="text-subtitle2">{{ props.row.label }}</div><div class="text-caption text-secondary">{{ props.row.entries }} 条有效缓存<span v-if="props.row.max_entries === 1"> · 上限 1 条</span></div></div>
            <q-btn flat dense color="negative" label="清理" :loading="clearing === props.row.name" :disable="loading || Boolean(clearing)" @click="clear(props.row.name, props.row.label)" />
          </q-card-section>
          <q-separator />
          <q-card-section class="text-caption cache-card-stats">
            <div>内存占用{{ props.row.stats_estimated ? '（估算）' : '' }}：{{ formatBytes(props.row.memory_bytes) }}</div>
            <div v-if="props.row.bytes !== undefined">缓存数据量：{{ formatBytes(props.row.bytes) }}</div>
            <div v-if="props.row.store_bytes !== undefined">本地文件占用：{{ formatBytes(props.row.store_bytes) }}</div>
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
      <template #body-cell-persistent="props">
        <q-td :props="props"><q-badge :color="props.row.backend && props.row.backend !== 'memory' ? 'positive' : 'grey'">{{ backendLabels[props.row.backend] || (props.row.persistent ? '持久保存' : '内存') }}</q-badge></q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props"><q-btn flat dense color="negative" label="清理" :loading="clearing === props.row.name" :disable="loading || Boolean(clearing)" @click="clear(props.row.name, props.row.label)" /></q-td>
      </template>
    </q-table>

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
            <q-input v-model="migrationForm.host" outlined dense label="服务器地址" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-model.number="migrationForm.port" outlined dense type="number" label="端口" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-model.number="migrationForm.db" outlined dense type="number" label="数据库编号" @update:model-value="checkId = ''; checkResult = null" />
            <q-select v-model="migrationForm.auth_mode" outlined dense label="认证方式" emit-value map-options :options="[
              { value: 'none', label: '无密码认证' }, { value: 'password', label: '密码认证' }
            ]" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-if="migrationForm.auth_mode === 'password'" v-model="migrationForm.username" outlined dense label="用户名（可选）" placeholder="同一目标留空表示保持" autocomplete="off" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-if="migrationForm.auth_mode === 'password'" v-model="migrationForm.password" outlined dense type="password" label="密码" placeholder="同一目标留空表示保持；新目标需填写" autocomplete="new-password" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-model.number="migrationForm.connect_timeout" outlined dense type="number" label="连接超时（秒）" @update:model-value="checkId = ''; checkResult = null" />
            <q-input v-model.number="migrationForm.retry_interval" outlined dense type="number" label="故障恢复探测间隔（秒）" @update:model-value="checkId = ''; checkResult = null" />
          </template>
        </q-card-section>
        <q-banner v-if="checkResult" class="q-mx-md q-mb-md" :class="checkResult.unchanged ? 'bg-blue-1' : 'bg-green-1'" rounded>
          {{ checkResult.unchanged ? '存储配置没有变化，无需迁移。' : checkResult.same_store ? '存储空间相同，将验证缓存并保存连接参数。' : `目标检查通过，将迁移 ${checkResult.summary?.reduce((sum, item) => sum + item.entries, 0) || 0} 条有效缓存。` }}
          <div v-if="checkResult.excluded?.length" class="q-mt-sm">不迁移的本机临时缓存：{{ checkResult.excluded.map((item) => `${item.name}（${item.reason}）`).join('；') }}。</div>
        </q-banner>
        <q-card-actions align="right">
          <q-btn flat label="关闭" :disable="checkingStorage || startingMigration" @click="migrationOpen = false" />
          <q-btn outline color="primary" label="检查目标" :loading="checkingStorage" :disable="startingMigration" @click="checkStorage" />
          <q-btn color="primary" unelevated label="迁移并重启" :loading="startingMigration" :disable="!checkId || checkingStorage" @click="beginMigration" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </section>
</template>

<style scoped>
.cache-card { width: 100%; }
.cache-card-stats { display: grid; gap: 4px; overflow-wrap: anywhere; }
.migration-dialog { width: min(640px, 100vw); max-width: 100vw; }
.migration-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 599px) {
  .migration-fields { grid-template-columns: minmax(0, 1fr); }
}
</style>
