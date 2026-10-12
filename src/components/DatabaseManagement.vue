<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { type QTableColumn, useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import StorageStatusCard from '@/components/StorageStatusCard.vue'
import {
  cancelDatabaseJob, checkDatabase, checkDatabaseBackup, checkDatabaseBackupDownload, databaseBackupDownloadUrl,
  getDatabaseInfo, getDatabaseJob, prepareSqliteTarget, retryDatabaseRestart,
  startDatabaseBackup, startDatabaseMigration, startDatabaseRestore, startDatabaseSpaceReclaim,
  startDatabaseStatisticsRefresh,
  uploadDatabaseBackup,
  type DatabaseCandidate, type DatabaseCheck, type DatabaseInfo, type DatabaseJob, type DatabaseType
} from '@/api/database'
import { useModalStore } from '@/stores/modal'

const props = defineProps<{ taskId?: string }>()
const modal = useModalStore()
const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const info = ref<DatabaseInfo | null>(null)
const loading = ref(false)
const initialLoading = ref(true)
const error = ref('')
const task = ref<DatabaseJob | null>(null)
const pollingJobId = ref('')
const mounted = ref(true)
const now = ref(Date.now())
const migrationOpen = ref(false)
const migrationStep = ref(1)
const checking = ref(false)
const checkReport = ref<DatabaseCheck | null>(null)
const checkId = ref('')
const targetExclusiveConfirmed = ref(false)
const checkedCandidateKey = ref('')
const candidateBaselineKey = ref('')
const candidateErrors = reactive<Record<string, string>>({})
const candidateHostField = ref<{ focus: () => void } | null>(null)
const candidatePortField = ref<{ focus: () => void } | null>(null)
const candidateNameField = ref<{ focus: () => void } | null>(null)
const candidateUsernameField = ref<{ focus: () => void } | null>(null)
const preparingTarget = ref(false)
const startingMigration = ref(false)
const reclaiming = ref(false)
const statisticsStarting = ref(false)
const creatingBackup = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const backupFile = ref<File | null>(null)
const uploadId = ref('')
const restoreCheck = ref<DatabaseJob | null>(null)
const restoreSourceSummary = ref<Record<string, unknown> | null>(null)
const search = ref('')
const fileDropActive = ref(false)
let elapsedTimer = 0

const candidate = reactive<DatabaseCandidate>({ type: 'sqlite', host: '', port: 5432, name: '', username: '', password: '', connect_timeout: 5, ssl: {} })
const typeOptions = [
  { value: 'sqlite', label: 'SQLite' }, { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' }, { value: 'mariadb', label: 'MariaDB' }
]
const terminalStatuses = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'READY'])
const databaseTypeLabel: Record<string, string> = { sqlite: 'SQLite', postgresql: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB' }
const active = computed(() => info.value?.active || {})
const configured = computed(() => info.value?.configured || {})
const activeType = computed(() => String(active.value.type || (info.value ? 'sqlite' : '')))
const candidateRemote = computed(() => candidate.type !== 'sqlite')
const candidateDirty = computed(() => Boolean(candidateBaselineKey.value)
  && candidateKey() !== candidateBaselineKey.value)
const checkStillValid = computed(() => Boolean(checkId.value && checkReport.value
  && candidateKey() === checkedCandidateKey.value))
const domains = computed(() => Object.entries(info.value?.logical_domains || {}).map(([name, tables]) => ({
  name,
  label: name === 'main' ? '业务数据' : name === 'media' ? '媒体索引' : name,
  rows: Object.entries(tables || {}).map(([table, count]) => ({ table, count }))
})))
const filteredDomains = computed(() => domains.value.map((domain) => ({
  ...domain,
  rows: domain.rows.filter((row) => !search.value || row.table.toLowerCase().includes(search.value.toLowerCase()))
})))
const totalRows = computed(() => {
  const counts = domains.value.flatMap((domain) => domain.rows.map((row) => row.count))
  if (!counts.length || counts.some((count) => typeof count !== 'number')) return null
  return counts.reduce<number>((sum, count) => sum + Number(count), 0)
})
const latestBackup = computed(() => info.value?.maintenance_jobs?.database_backup || null)
const lastBackupResult = computed(() => latestBackup.value?.result || null)
const sqlite = computed(() => info.value?.sqlite || null)
const isSqlite = computed(() => activeType.value === 'sqlite')
const reclaimSummary = computed(() => task.value?.kind === 'database_space_reclaim'
  ? task.value.result as { before?: { database_size_bytes?: number; wal_size_bytes?: number }; after?: { database_size_bytes?: number; wal_size_bytes?: number; freed_bytes?: number }; vacuum_completed?: boolean } | null
  : null)
const taskProgress = computed(() => {
  if (!task.value) return null
  const direct = Number((task.value as DatabaseJob & { progress?: number }).progress)
  if (Number.isFinite(direct) && direct >= 0 && direct <= 1) return direct
  const events = task.value.events || []
  const latest = events[events.length - 1]
  return typeof latest?.progress === 'number' ? latest.progress : null
})
const elapsed = computed(() => {
  const created = Number(task.value?.created_at || task.value?.updated_at || 0)
  return created ? Math.max(0, Math.floor(now.value / 1000 - created)) : 0
})
const taskMessage = computed(() => {
  const events = task.value?.events || []
  return events[events.length - 1]?.message || task.value?.message || task.value?.stage || ''
})
const conflictBusy = computed(() => Boolean(task.value && !terminalStatuses.has(task.value.status)))
const tableColumns: QTableColumn<{ table: string; count: number | null }>[] = [
  { name: 'table', label: '表名', field: 'table', align: 'left', sortable: true },
  { name: 'count', label: '记录数', field: 'count', align: 'right', sortable: true, format: (value) => value === null ? '暂不可用' : Number(value).toLocaleString() }
]

function bytes(value?: number | null) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '暂不可用'
  if (!value) return '0 B'
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index ? 2 : 0)} ${units[index]}`
}

function countLabel(value?: number | null) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '暂不可用'
}

function domainRowCount(rows: Array<{ count: number | null }>) {
  if (rows.some((row) => typeof row.count !== 'number')) return null
  return rows.reduce<number>((sum, row) => sum + Number(row.count), 0)
}

function formatDate(value?: unknown) {
  if (value === undefined || value === null || value === '') return '暂无'
  const timestamp = typeof value === 'number' ? value * 1000 : typeof value === 'string' ? Date.parse(value) : Number.NaN
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : String(value)
}

function elapsedLabel(seconds: number) {
  if (seconds < 60) return `${seconds} 秒`
  return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`
}

function canCancelTask(job: DatabaseJob) {
  const cancellable: Record<string, string[]> = {
    database_migration: ['QUIESCING', 'SNAPSHOTTING', 'MIGRATING', 'VALIDATING', 'VALIDATED', 'PUBLISHING'],
    database_target_prepare: ['PREPARING_TARGET', 'TARGET_BACKED_UP'],
    database_space_reclaim: ['QUEUED', 'QUIESCING'],
    database_backup: ['SNAPSHOTTING', 'EXPORTING'],
    database_backup_check: ['CHECKING_BACKUP', 'READY'],
    database_restore: ['BACKING_UP_CURRENT', 'BUILDING_STAGE']
  }
  return cancellable[job.kind]?.includes(job.status) || false
}

function humanError(cause: unknown, fallback: string) {
  if (cause && typeof cause === 'object' && 'response' in cause) {
    const data = (cause as { response?: { data?: { msg?: string } } }).response?.data
    if (data?.msg) return data.msg
  }
  return cause instanceof Error ? cause.message : fallback
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await getDatabaseInfo()
    if (result.code !== 0 || !result.database) throw new Error(result.msg || '读取数据库状态失败')
    info.value = result.database
    const jobs = [result.database.current_job, result.database.pending_database_job,
      result.database.statistics_job].filter(Boolean) as DatabaseJob[]
    const current = jobs.find((job) => !terminalStatuses.has(job.status)) || jobs[0]
    if (current && (!task.value || task.value.job_id === current.job_id)) {
      setTask(current, route.query.tab === 'database')
      if (!terminalStatuses.has(current.status)) void watchJob(current.job_id)
    }
  } catch (cause) {
    error.value = humanError(cause, '读取数据库状态失败')
  } finally {
    loading.value = false
    initialLoading.value = false
  }
}

async function refreshExactStatistics() {
  if (statisticsStarting.value) return
  statisticsStarting.value = true
  try {
    const result = await startDatabaseStatisticsRefresh()
    if (result.code !== 0 || !result.job) throw new Error(result.msg || '无法启动精确统计')
    setTask(result.job)
    if (!terminalStatuses.has(result.job.status)) void watchJob(result.job.job_id)
  } catch (cause) {
    $q.notify({ type: 'negative', message: humanError(cause, '无法启动精确统计') })
  } finally {
    statisticsStarting.value = false
  }
}

function setTask(next: DatabaseJob, updateQuery = true) {
  task.value = next
  if (updateQuery && route.query.task !== next.job_id) {
    void router.replace({ query: { ...route.query, tab: 'database', task: next.job_id } })
  }
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function watchJob(jobId: string) {
  if (!jobId || pollingJobId.value === jobId) return
  pollingJobId.value = jobId
  let delay = 1600
  let disconnectedAt = 0
  try {
    while (mounted.value && pollingJobId.value === jobId) {
      try {
        const result = await getDatabaseJob(jobId)
        if (result.code !== 0 || !result.job) throw new Error(result.msg || '任务暂时不可读取')
        disconnectedAt = 0
        const current = result.job
        setTask(current, false)
        if (current.kind === 'database_backup_check') restoreCheck.value = current
        if (current.kind === 'database_target_prepare' && current.status === 'SUCCEEDED') {
          const newCheckId = String(current.result?.new_check_id || '')
          if (newCheckId) {
            const prepared = await getDatabaseJob(newCheckId)
            if (prepared.code === 0 && prepared.job?.result) {
              checkReport.value = { ...(prepared.job.result as DatabaseCheck), check_id: newCheckId }
              checkId.value = newCheckId
              checkedCandidateKey.value = candidateKey()
              migrationStep.value = 2
            }
          }
        }
        if (terminalStatuses.has(current.status) || current.status === 'READY' || current.status === 'RECOVERY_REQUIRED') {
          await refresh()
          break
        }
        delay = current.status === 'RESTART_PENDING' || current.status === 'VERIFYING_STARTUP'
          ? Math.min(15000, Math.round(delay * 1.35)) : 1600
      } catch {
        if (!disconnectedAt) disconnectedAt = Date.now()
        // 配置保存后的受控重启会短暂断开连接；采用退避轮询，并保留任务状态。
        delay = Math.min(15000, Math.round(delay * 1.5))
        if (Date.now() - disconnectedAt > 5 * 60 * 1000) break
      }
      await wait(delay)
    }
  } finally {
    if (pollingJobId.value === jobId) pollingJobId.value = ''
  }
}

function candidateKey() {
  return JSON.stringify({ ...candidate, password: candidate.password || '' })
}

function hasSavedUsernameForCandidate() {
  const currentType = String(configured.value.type || activeType.value)
  const currentPort = Number(configured.value.port || (currentType === 'postgresql' ? 5432 : 3306))
  return Boolean(configured.value.username_set)
    && candidate.type === currentType
    && String(candidate.host || '').trim().replace(/\.$/, '').toLocaleLowerCase()
      === String(configured.value.host || '').trim().replace(/\.$/, '').toLocaleLowerCase()
    && Number(candidate.port) === currentPort
    && String(candidate.name || '') === String(configured.value.name || '')
}

async function closeMigration() {
  if (candidateDirty.value && !await modal.confirm(
    '候选数据库参数尚未提交，关闭后会丢弃这些修改。', '放弃候选参数')) return
  migrationOpen.value = false
}

function clearCandidateError(field: string) {
  delete candidateErrors[field]
}

async function focusCandidateField(field: string) {
  await nextTick()
  const fields: Record<string, { focus: () => void } | null> = {
    host: candidateHostField.value,
    port: candidatePortField.value,
    name: candidateNameField.value,
    username: candidateUsernameField.value
  }
  fields[field]?.focus()
}

function validateCandidate() {
  Object.keys(candidateErrors).forEach((field) => delete candidateErrors[field])
  if (!candidateRemote.value) return true

  if (!String(candidate.host || '').trim()) candidateErrors.host = '请输入数据库主机。'
  if (!Number.isInteger(Number(candidate.port)) || Number(candidate.port) < 1 || Number(candidate.port) > 65535) {
    candidateErrors.port = '端口必须是 1～65535 之间的整数。'
  }
  if (!String(candidate.name || '').trim()) candidateErrors.name = '请输入数据库名。'
  if (!String(candidate.username || '').trim() && !hasSavedUsernameForCandidate()) {
    candidateErrors.username = '请输入数据库用户名；仅同一已保存目标可以留空保持。'
  }
  if (!Number.isFinite(Number(candidate.connect_timeout)) || Number(candidate.connect_timeout) <= 0 || Number(candidate.connect_timeout) > 120) {
    candidateErrors.connect_timeout = '连接超时必须大于 0 且不超过 120 秒。'
  }

  const firstInvalid = ['host', 'port', 'name', 'username', 'connect_timeout'].find((field) => candidateErrors[field])
  if (firstInvalid) {
    void focusCandidateField(firstInvalid)
    return false
  }
  return true
}

async function confirmLeave() {
  if (!migrationOpen.value) return true
  if (conflictBusy.value) {
    migrationOpen.value = false
    return true
  }
  return closeMigration()
}

watch(() => [candidate.type, candidate.host, candidate.port, candidate.name, candidate.username, candidate.password, candidate.connect_timeout, JSON.stringify(candidate.ssl)], () => {
  targetExclusiveConfirmed.value = false
  if (checkId.value && candidateKey() !== checkedCandidateKey.value) {
    checkId.value = ''
    checkReport.value = null
    migrationStep.value = 1
  }
})

watch(() => candidate.type, (type) => {
  candidate.port = type === 'postgresql' ? 5432 : 3306
})

watch(() => [route.query.tab, route.query.task], ([tab, value]) => {
  if (tab !== 'database') return
  const id = String(value || '')
  if (id && id !== task.value?.job_id && id !== props.taskId) {
    void getDatabaseJob(id).then((result) => {
      if (result.code === 0 && result.job) {
        setTask(result.job, false)
        if (!terminalStatuses.has(result.job.status) && result.job.status !== 'RECOVERY_REQUIRED') void watchJob(id)
      }
    }).catch(() => undefined)
  }
}, { immediate: true })

watch(() => props.taskId, (id) => {
  if (id && id !== task.value?.job_id) {
    void getDatabaseJob(id).then((result) => {
      if (result.code === 0 && result.job) {
        setTask(result.job, false)
        if (!terminalStatuses.has(result.job.status) && result.job.status !== 'RECOVERY_REQUIRED') void watchJob(id)
      }
    }).catch(() => undefined)
  }
}, { immediate: true })

async function openMigration() {
  const currentType = (String(configured.value.type || activeType.value) as DatabaseType)
  Object.assign(candidate, {
    type: currentType,
    host: String(configured.value.host || ''),
    port: Number(configured.value.port || (currentType === 'postgresql' ? 5432 : 3306)),
    name: String(configured.value.name || ''),
    username: String(configured.value.username || ''),
    password: '',
    connect_timeout: Number(configured.value.connect_timeout || 5),
    ssl: configured.value.ssl && typeof configured.value.ssl === 'object' ? configured.value.ssl : {}
  })
  candidateBaselineKey.value = candidateKey()
  checkReport.value = null
  checkId.value = ''
  checkedCandidateKey.value = ''
  migrationStep.value = 1
  migrationOpen.value = true
}

async function runCheck() {
  if (!validateCandidate()) return
  checking.value = true
  checkId.value = ''
  checkReport.value = null
  targetExclusiveConfirmed.value = false
  const submittedKey = candidateKey()
  try {
    const result = await checkDatabase({ ...candidate })
    if (result.code !== 0 || !result.check) throw new Error(result.msg || '数据库目标检查失败')
    checkReport.value = result.check
    checkId.value = result.check.check_id || result.job?.job_id || ''
    checkedCandidateKey.value = submittedKey
    migrationStep.value = 2
  } catch (cause) {
    modal.error(humanError(cause, '数据库目标检查失败'))
    if (candidateRemote.value) void focusCandidateField('host')
  } finally {
    checking.value = false
  }
}

async function prepareTarget() {
  if (!checkId.value || !checkStillValid.value) return
  const fileList = (checkReport.value?.target_files || []).map((path) => path.split(/[\\/]/).pop()).filter(Boolean)
  const list = fileList.length ? `\n将先备份并删除：${fileList.join('、')}` : ''
  if (!await modal.confirm(`旧 SQLite 文件会先备份，再从固定位置删除。新 SQLite 库只包含当前活动数据库的数据；准备过程不会更改活动数据库配置。${list}`, '准备 SQLite 空库')) return
  preparingTarget.value = true
  try {
    const result = await prepareSqliteTarget({ ...candidate, check_id: checkId.value })
    if (result.code !== 0 || !result.job_id || !result.job) throw new Error(result.msg || '无法准备 SQLite 目标')
    setTask(result.job)
    void watchJob(result.job_id)
  } catch (cause) {
    modal.error(humanError(cause, '无法准备 SQLite 目标'))
  } finally {
    preparingTarget.value = false
  }
}

async function migrate() {
  if (!checkStillValid.value || checkReport.value?.ok !== true) return
  if (candidateRemote.value && !targetExclusiveConfirmed.value) return
  if (!await modal.confirm('迁移期间数据库写入会暂停。数据校验通过后将保存新配置并自动重启服务；重启确认前页面仍显示原数据库为当前库。', '迁移并重启')) return
  startingMigration.value = true
  try {
    const result = await startDatabaseMigration({ ...candidate, check_id: checkId.value,
      confirm_target_exclusive: candidateRemote.value ? targetExclusiveConfirmed.value : undefined })
    if (result.code !== 0 || !result.job_id || !result.job) throw new Error(result.msg || '无法启动数据库迁移')
    setTask(result.job)
    migrationOpen.value = false
    void watchJob(result.job_id)
  } catch (cause) {
    modal.error(humanError(cause, '无法启动数据库迁移'))
  } finally {
    startingMigration.value = false
  }
}

async function startReclaim() {
  const estimated = bytes(sqlite.value?.estimated_reclaimable_bytes)
  if (!await modal.confirm(`将暂停数据库访问，对固定 SQLite 整库执行空间回收。当前空闲页估算可回收 ${estimated}；实际释放量以完成后的文件大小为准。`, '回收数据库空间')) return
  reclaiming.value = true
  try {
    const result = await startDatabaseSpaceReclaim()
    if (result.code !== 0 || !result.job_id || !result.job) throw new Error(result.msg || '无法启动空间回收')
    setTask(result.job)
    void watchJob(result.job_id)
  } catch (cause) {
    modal.error(humanError(cause, '无法启动空间回收'))
  } finally {
    reclaiming.value = false
  }
}

async function createBackup() {
  creatingBackup.value = true
  try {
    const result = await startDatabaseBackup()
    if (result.code !== 0 || !result.job_id || !result.job) throw new Error(result.msg || '无法启动完整备份')
    setTask(result.job)
    void watchJob(result.job_id)
  } catch (cause) {
    modal.error(humanError(cause, '无法启动完整备份'))
  } finally {
    creatingBackup.value = false
  }
}

function chooseFile(file: File | null) {
  if (task.value?.kind === 'database_backup_check') {
    if (task.value.status === 'READY' || !terminalStatuses.has(task.value.status)) {
      void cancelDatabaseJob(task.value.job_id)
    }
    task.value = null
    if (route.query.tab === 'database' && route.query.task) {
      const query = { ...route.query }
      delete query.task
      void router.replace({ query })
    }
  }
  backupFile.value = file
  uploadId.value = ''
  restoreCheck.value = null
  error.value = ''
}

async function uploadAndCheck() {
  if (!backupFile.value) return
  uploading.value = true
  uploadProgress.value = 0
  error.value = ''
  try {
    const uploaded = await uploadDatabaseBackup(backupFile.value, (percent) => { uploadProgress.value = percent })
    if (uploaded.code !== 0 || !uploaded.upload_id) throw new Error(uploaded.msg || '备份上传失败')
    uploadId.value = uploaded.upload_id
    const checked = await checkDatabaseBackup(uploaded.upload_id)
    if (checked.code !== 0 || !checked.job_id || !checked.job) throw new Error(checked.msg || '无法检查备份文件')
    restoreCheck.value = checked.job
    setTask(checked.job)
    void watchJob(checked.job_id)
  } catch (cause) {
    error.value = humanError(cause, '备份上传或检查失败')
  } finally {
    uploading.value = false
  }
}

async function restore() {
  const checked = restoreCheck.value
  if (!checked || checked.status !== 'READY') return
  const total = Number(checked.result?.total_rows || 0)
  if (!await modal.confirm(`当前活动数据库的内容将被备份文件替换（约 ${total.toLocaleString()} 条记录）。后端会先生成恢复前完整备份，再校验并恢复，完成后自动重启。`, '确认替换当前数据库')) return
  try {
    restoreSourceSummary.value = checked.result || null
    const result = await startDatabaseRestore(checked.job_id)
    if (result.code !== 0 || !result.job_id || !result.job) throw new Error(result.msg || '无法启动数据库恢复')
    restoreCheck.value = null
    setTask(result.job)
    void watchJob(result.job_id)
  } catch (cause) {
    modal.error(humanError(cause, '无法启动数据库恢复'))
  }
}

async function cancelTask() {
  if (!task.value) return
  try {
    const result = await cancelDatabaseJob(task.value.job_id)
    if (result.code !== 0) modal.error(result.msg || '当前阶段不能取消')
    else void watchJob(task.value.job_id)
  } catch (cause) {
    modal.error(humanError(cause, '无法取消数据库任务'))
  }
}

async function retryRestart() {
  if (!task.value) return
  const result = await retryDatabaseRestart(task.value.job_id)
  if (result.code !== 0) modal.error(result.msg || '重启请求失败')
  else void watchJob(task.value.job_id)
}

async function downloadBackup(id?: string) {
  if (!id) return
  try {
    await checkDatabaseBackupDownload(id)
    const link = document.createElement('a')
    link.href = databaseBackupDownloadUrl(id)
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } catch (cause) {
    modal.error(humanError(cause, '备份下载失败'))
  }
}

function downloadRestoreReport() {
  if (!task.value || task.value.kind !== 'database_restore') return
  const result = task.value.result || {}
  const report = {
    task_id: task.value.job_id,
    status: task.value.status,
    stage: task.value.stage,
    source_database_type: result.source_database_type || restoreSourceSummary.value?.source_database_type,
    schema_revision: result.schema_revision || restoreSourceSummary.value?.schema_revision,
    archive_sha256: result.restore_archive_sha256 || restoreSourceSummary.value?.archive_sha256,
    restored_tables: result.restored_digests || restoreSourceSummary.value?.tables,
    pre_restore_rows: result.pre_restore_rows,
    generated_at: new Date().toISOString()
  }
  const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = blobUrl
  link.download = `nastools-database-restore-${task.value.job_id.slice(0, 12)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0)
}

function onFileDrop(event: DragEvent) {
  fileDropActive.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) chooseFile(file)
}

onMounted(() => {
  void refresh()
  const jobId = String(route.query.tab === 'database' ? route.query.task || '' : props.taskId || '')
  if (jobId && !pollingJobId.value) void watchJob(jobId)
  elapsedTimer = window.setInterval(() => { now.value = Date.now() }, 1000)
})

onUnmounted(() => { mounted.value = false; pollingJobId.value = ''; window.clearInterval(elapsedTimer) })
defineExpose({ refresh, confirmLeave })
</script>

<template>
  <section class="database-management">
    <PageHeader title="数据库管理" description="查看活动数据库、完整备份、恢复与 SQLite 空间维护">
      <template #actions>
        <span v-if="loading && !initialLoading" class="refresh-status" role="status" aria-live="polite">更新中，保留上次统计</span>
        <q-btn flat color="primary" icon="refresh" label="刷新统计" :loading="loading" @click="refresh" />
        <q-btn color="primary" unelevated icon="swap_horiz" label="切换数据库" :disable="conflictBusy" @click="openMigration" />
      </template>
    </PageHeader>

    <div v-if="initialLoading" class="db-loading-skeleton" role="status" aria-live="polite" aria-label="正在加载数据库状态" aria-busy="true">
      <div class="db-metrics">
        <q-skeleton v-for="index in 4" :key="index" type="rect" height="104px" class="metric-card" />
      </div>
      <div class="db-content-grid">
        <q-skeleton type="rect" height="360px" class="db-section-card" />
        <q-skeleton type="rect" height="360px" class="db-section-card" />
      </div>
    </div>
    <template v-else>
    <q-banner v-if="error" rounded class="db-error q-mb-md"><template #avatar><q-icon name="error_outline" /></template>{{ error }}<template #action><q-btn flat label="重试" @click="refresh" /></template></q-banner>

    <StorageStatusCard class="db-status-card q-mb-md"
      :title="databaseTypeLabel[activeType] || activeType || '暂不可用'"
      :subtitle="info?.connected ? '当前数据库连接正常' : info ? '当前数据库未连接' : '当前数据库状态暂不可用'"
      :status="info?.connected ? 'ok' : info ? 'error' : 'unknown'"
      :status-label="info?.connected ? '连接正常' : info ? '未连接' : '暂不可用'"
      :icon="info?.connected ? 'database' : 'database_off'">
      <template #details>
        <div class="status-detail">当前使用 · 结构版本 {{ info?.schema_revision || '暂不可用' }}<span v-if="info?.server_version"> · 服务端 {{ info.server_version }}</span></div>
        <div v-if="info?.error" class="text-negative text-caption q-mt-xs">{{ info.error }}</div>
        <div class="status-footer"><template v-if="activeType === 'sqlite'">固定文件：&lt;配置文件目录&gt;/db/{{ sqlite?.database_file || 'nastools.db' }}</template><template v-else-if="activeType">{{ active.host || '主机未知' }}:{{ active.port || '默认端口' }} / {{ active.name || '数据库未知' }}</template><span> · 最近统计 {{ formatDate(info?.statistics_at) }}</span></div>
      </template>
      <template #notice>
        <div v-if="String(configured.type || 'sqlite') !== activeType" class="pending-target"><q-icon name="schedule" /> 已保存，等待重启：{{ databaseTypeLabel[String(configured.type)] || configured.type }}</div>
        <div v-else-if="info?.pending_database_job && !['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(info.pending_database_job.status)" class="pending-target"><q-icon name="sync" /> 数据库切换任务：{{ info.pending_database_job.stage }}</div>
      </template>
    </StorageStatusCard>

    <div class="db-metrics q-mb-md">
      <q-card flat bordered class="metric-card"><div class="metric-label">应用记录数</div><div class="metric-value">{{ countLabel(totalRows) }}</div><div class="metric-foot">main 与 media 逻辑域</div></q-card>
      <q-card flat bordered class="metric-card"><div class="metric-label">应用数据 / 索引</div><div class="metric-value metric-value-small">{{ bytes(info?.storage?.application_data_bytes) }} <span>/</span> {{ bytes(info?.storage?.application_index_bytes) }}</div><div class="metric-foot">后端支持时提供统计</div></q-card>
      <q-card flat bordered class="metric-card"><div class="metric-label">整库物理占用</div><div class="metric-value">{{ bytes(info?.storage?.database_size_bytes ?? sqlite?.database_size_bytes) }}</div><div class="metric-foot">仅统计一次 · {{ info?.storage?.measurement_reason || '统计时间见上方' }}</div></q-card>
      <q-card flat bordered class="metric-card"><div class="metric-label">最近完整备份</div><div class="metric-value metric-value-small">{{ lastBackupResult ? bytes(Number(lastBackupResult.size_bytes)) : '暂无' }}</div><div class="metric-foot">{{ formatDate(lastBackupResult?.created_at || latestBackup?.updated_at) }}</div></q-card>
    </div>

    <q-banner v-if="task && !terminalStatuses.has(task.status) || task?.status === 'RECOVERY_REQUIRED'" rounded class="db-task-banner q-mb-md">
      <div class="task-heading"><q-icon name="sync" /><strong>{{ task.kind === 'database_migration' ? '数据库切换' : task.kind === 'database_restore' ? '数据库恢复' : task.kind === 'database_backup' ? '完整备份' : task.kind === 'database_space_reclaim' ? '空间回收' : task.kind === 'database_target_prepare' ? 'SQLite 空库准备' : task.kind === 'database_statistics' ? '精确统计' : '备份检查' }}</strong><span>{{ task.stage }} · {{ elapsedLabel(elapsed) }}</span><q-space />
        <q-btn v-if="task.status === 'RESTART_PENDING'" flat dense label="重试重启" @click="retryRestart" />
        <q-btn v-else-if="canCancelTask(task)" flat dense label="取消任务" @click="cancelTask" />
      </div>
      <div class="task-message">{{ taskMessage || '正在处理' }}</div>
      <q-linear-progress v-if="taskProgress !== null" :value="taskProgress" color="primary" rounded class="q-mt-sm" />
      <div v-if="task.error" class="text-negative q-mt-sm">{{ task.error }}</div>
      <div v-if="task.status === 'RESTART_PENDING'" class="text-caption q-mt-sm">配置已保存，正在等待服务重启并验证活动数据库；请勿重复提交切换。</div>
    </q-banner>
    <q-banner v-else-if="task?.status === 'FAILED'" rounded class="db-error q-mb-md"><strong>任务失败：</strong>{{ task.error || taskMessage }}<div v-if="reclaimSummary?.vacuum_completed" class="q-mt-xs">VACUUM 已执行，但后续校验或重连失败；请刷新确认当前数据库状态，再决定是否重试。</div></q-banner>
    <q-banner v-else-if="task?.status === 'SUCCEEDED'" rounded class="db-success q-mb-md"><strong>任务已完成。</strong> {{ taskMessage }}<div v-if="reclaimSummary?.after" class="q-mt-xs">实际释放 {{ bytes(reclaimSummary.after.freed_bytes) }}；整库占用 {{ bytes(reclaimSummary.before?.database_size_bytes) }} → {{ bytes(reclaimSummary.after.database_size_bytes) }}，WAL {{ bytes(reclaimSummary.before?.wal_size_bytes) }} → {{ bytes(reclaimSummary.after.wal_size_bytes) }}。</div><div v-if="task.kind === 'database_restore'" class="row q-gutter-sm q-mt-xs"><q-btn flat dense label="下载恢复报告" @click="downloadRestoreReport" /><q-btn v-if="task.result?.pre_restore_sha256" flat dense label="下载恢复前备份" @click="downloadBackup(task.job_id)" /></div></q-banner>

    <div class="db-content-grid">
      <q-card flat bordered class="db-section-card overview-card">
        <div class="section-heading"><div><div class="text-subtitle1">数据概览</div><div class="text-caption text-secondary"><template v-if="info?.table_count_mode === 'exact'">精确记录数 · {{ formatDate(info?.exact_statistics_at) }}</template><template v-else>记录数为数据库目录估算；可在后台异步刷新精确值。</template> 权限不足或统计失败显示为暂不可用。 <span v-if="info?.table_count_reasons?._all">{{ info.table_count_reasons._all }}</span></div></div><div class="row q-gutter-xs"><q-btn flat dense color="primary" icon="refresh" aria-label="刷新数据库状态" :loading="loading" @click="refresh" /><q-btn outline dense color="primary" label="精确统计" :loading="statisticsStarting || (task?.kind === 'database_statistics' && !terminalStatuses.has(task.status))" :disable="conflictBusy || statisticsStarting" @click="refreshExactStatistics" /></div></div>
        <q-input v-model="search" dense outlined clearable label="搜索表名" class="table-search"><template #prepend><q-icon name="search" /></template></q-input>
        <q-expansion-item v-for="domain in filteredDomains" :key="domain.name" default-opened expand-separator header-class="domain-header">
          <template #header><q-item-section><q-item-label>{{ domain.label }}</q-item-label><q-item-label caption>{{ domain.rows.length }} 张表 · {{ countLabel(domainRowCount(domain.rows)) }} 条记录</q-item-label></q-item-section></template>
          <q-table v-if="$q.screen.gt.xs" flat dense :rows="domain.rows" :columns="tableColumns" row-key="table" :pagination="{ rowsPerPage: 0 }" hide-pagination />
          <q-list v-else separator class="mobile-table-list"><q-item v-for="row in domain.rows" :key="row.table"><q-item-section>{{ row.table }}</q-item-section><q-item-section side>{{ countLabel(row.count) }} 条</q-item-section></q-item></q-list>
        </q-expansion-item>
        <div v-if="!domains.length" class="empty-note">暂无可展示的表统计。</div>
      </q-card>

      <div class="maintenance-column">
        <q-card flat bordered class="db-section-card">
          <div class="section-heading"><div><div class="text-subtitle1">备份与恢复</div><div class="text-caption text-secondary">完整备份包含 main 与 media 全部业务表，不包含缓存。</div></div></div>
          <div class="backup-summary">
            <q-icon name="inventory_2" size="22px" /><div class="backup-summary-copy"><strong>{{ lastBackupResult?.filename || '尚无完整备份' }}</strong><span>{{ lastBackupResult ? `${bytes(Number(lastBackupResult.size_bytes))} · ${formatDate(latestBackup?.updated_at)}` : '创建后可下载 ZIP 文件' }}</span></div>
            <q-btn v-if="lastBackupResult?.backup_id" flat dense color="primary" icon="download" aria-label="下载最近完整备份" @click="downloadBackup(String(lastBackupResult.backup_id))" />
          </div>
          <q-btn class="full-width q-mt-sm" outline color="primary" icon="archive" label="创建完整备份" :loading="creatingBackup" :disable="conflictBusy || loading" @click="createBackup" />
          <q-separator class="q-my-md" />
          <div class="text-subtitle2 q-mb-xs">上传并恢复</div>
          <div class="text-caption text-secondary q-mb-sm">仅 ZIP 数据库备份。检查通过后才会开放替换确认。</div>
          <div class="file-drop" :class="{ active: fileDropActive }" @dragover.prevent="fileDropActive = true" @dragleave.prevent="fileDropActive = false" @drop.prevent="onFileDrop">
            <q-icon name="upload_file" size="26px" /><span>{{ backupFile?.name || '拖放 ZIP 文件到此处，或从设备选择' }}</span>
            <q-file :model-value="backupFile" accept=".zip,application/zip" dense borderless hide-bottom-space class="file-picker" label="选择备份文件" @update:model-value="chooseFile" />
          </div>
          <q-linear-progress v-if="uploading" :value="uploadProgress / 100" color="primary" rounded class="q-mt-sm" />
          <div v-if="uploading" class="text-caption text-secondary q-mt-xs">上传中 {{ uploadProgress }}%</div>
          <q-btn class="full-width q-mt-sm" outline color="primary" icon="fact_check" label="上传并检查备份" :loading="uploading" :disable="!backupFile || conflictBusy" @click="uploadAndCheck" />
          <div v-if="restoreCheck" class="restore-summary q-mt-md">
            <template v-if="restoreCheck.status === 'READY'">
              <div class="row items-center q-gutter-sm"><q-icon color="positive" name="verified" /><strong>备份检查通过</strong><q-space /><q-btn color="negative" outline label="确认恢复并重启" :disable="conflictBusy" @click="restore" /></div>
              <div class="text-caption text-secondary q-mt-sm">{{ databaseTypeLabel[String(restoreCheck.result?.source_database_type)] || restoreCheck.result?.source_database_type }} · {{ countLabel(Number(restoreCheck.result?.total_rows)) }} 条记录 · 结构版本 {{ restoreCheck.result?.schema_revision || '未知' }} · {{ bytes(Number(restoreCheck.result?.size_bytes)) }}</div>
              <div v-if="restoreCheck.result?.legacy_converted" class="text-caption text-secondary q-mt-xs">此为旧版完整 SQLite 双库备份，已在隔离区升级、合并并转换；备份内设置不会覆盖当前配置。</div>
            </template>
            <div v-else-if="restoreCheck.status === 'FAILED'" class="text-negative">备份检查失败：{{ restoreCheck.error || '文件无效' }}</div>
            <div v-else class="text-secondary">备份检查中：{{ restoreCheck.stage }}</div>
          </div>
        </q-card>

        <q-card v-if="isSqlite" flat bordered class="db-section-card reclaim-card">
          <div class="section-heading"><div><div class="text-subtitle1">SQLite 空间回收</div><div class="text-caption text-secondary">作用于固定位置的整库 nastools.db。</div></div><q-icon name="cleaning_services" color="primary" size="22px" /></div>
          <div class="space-stats"><div><span>数据库文件</span><strong>{{ bytes(sqlite?.database_size_bytes) }}</strong></div><div><span>WAL 文件</span><strong>{{ bytes(sqlite?.wal_size_bytes) }}</strong></div><div><span>空闲页估算</span><strong>{{ bytes(sqlite?.estimated_reclaimable_bytes) }}</strong></div></div>
          <div v-if="sqlite?.error || sqlite?.reclaim_allowed === false" class="text-caption text-warning q-mt-sm">{{ sqlite.error || '当前暂不可执行空间回收' }}</div>
          <div v-else-if="sqlite?.connections_to_drain" class="text-caption text-secondary q-mt-sm">当前有 {{ sqlite.connections_to_drain }} 个活动连接；任务会先等待请求和事务排空。</div>
          <q-btn class="full-width q-mt-md" outline color="primary" icon="compress" label="回收整库空间" :loading="reclaiming" :disable="conflictBusy || sqlite?.reclaim_allowed === false" @click="startReclaim" />
          <div class="text-caption text-secondary q-mt-sm">开始前会检查数据库完整性、空间余量和活动连接；完成后展示实际释放量。</div>
        </q-card>
        <q-card v-else flat bordered class="db-section-card"><div class="text-subtitle1">空间回收</div><div class="text-caption text-secondary q-mt-sm">当前数据库类型不支持 SQLite 空间回收。</div></q-card>
      </div>
    </div>

    <q-dialog v-model="migrationOpen" :maximized="$q.screen.lt.sm" persistent>
      <q-card class="migration-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">切换数据库</div><q-space /><q-btn flat round dense icon="close" :aria-label="conflictBusy ? '收起数据库切换向导' : '关闭数据库切换向导'" :disable="startingMigration || preparingTarget || checking" @click="closeMigration" /></q-card-section>
        <q-separator />
        <q-stepper v-model="migrationStep" flat color="primary" animated :vertical="$q.screen.lt.sm" class="migration-stepper">
          <q-step :name="1" title="目标连接" icon="tune" :done="migrationStep > 1">
            <div class="migration-form">
              <q-select v-model="candidate.type" outlined emit-value map-options label="数据库类型" :options="typeOptions" :disable="conflictBusy" />
              <div v-if="!candidateRemote" class="readonly-path"><q-icon name="lock" /><span><strong>固定 SQLite 文件</strong><small>由后端保存至配置目录的 db/nastools.db；此路径不可修改。</small></span></div>
              <template v-else>
                <q-input ref="candidateHostField" v-model.trim="candidate.host" outlined label="主机" autocomplete="off" :error="Boolean(candidateErrors.host)" :error-message="candidateErrors.host" @update:model-value="clearCandidateError('host')" />
                <q-input ref="candidatePortField" v-model.number="candidate.port" outlined type="number" label="端口" :error="Boolean(candidateErrors.port)" :error-message="candidateErrors.port" @update:model-value="clearCandidateError('port')" />
                <q-input ref="candidateNameField" v-model.trim="candidate.name" outlined label="数据库名" autocomplete="off" :error="Boolean(candidateErrors.name)" :error-message="candidateErrors.name" @update:model-value="clearCandidateError('name')" />
                <q-input ref="candidateUsernameField" v-model.trim="candidate.username" outlined label="用户名" :placeholder="hasSavedUsernameForCandidate() ? '留空保持已保存用户名' : '请输入目标数据库用户名'" autocomplete="username" :error="Boolean(candidateErrors.username)" :error-message="candidateErrors.username" @update:model-value="clearCandidateError('username')" />
                <q-input v-model="candidate.password" outlined type="password" :label="hasSavedUsernameForCandidate() && configured.password_set ? '密码（留空保持已保存密码）' : '密码'" :placeholder="hasSavedUsernameForCandidate() && configured.password_set ? '留空保持当前目标密码' : '请输入目标数据库密码'" autocomplete="new-password" />
                <q-input v-model.number="candidate.connect_timeout" outlined type="number" label="连接超时（秒）" :error="Boolean(candidateErrors.connect_timeout)" :error-message="candidateErrors.connect_timeout" @update:model-value="clearCandidateError('connect_timeout')" />
                <q-select v-if="candidate.type === 'postgresql'" v-model="candidate.ssl!.mode" outlined emit-value map-options label="TLS 模式" :options="[
                  { value: '', label: '驱动默认' }, { value: 'disable', label: '禁用' }, { value: 'prefer', label: '优先使用' },
                  { value: 'require', label: '必须加密' }, { value: 'verify-ca', label: '验证 CA' }, { value: 'verify-full', label: '验证 CA 与主机名' }
                ]" />
                <template v-else>
                  <q-input :model-value="String(candidate.ssl?.ca || '')" outlined label="TLS CA 证书路径（可选）" @update:model-value="candidate.ssl = { ...(candidate.ssl || {}), ca: $event }" />
                  <q-input :model-value="String(candidate.ssl?.cert || '')" outlined label="客户端证书路径（可选）" @update:model-value="candidate.ssl = { ...(candidate.ssl || {}), cert: $event }" />
                  <q-input :model-value="String(candidate.ssl?.key || '')" outlined label="客户端密钥路径（可选）" @update:model-value="candidate.ssl = { ...(candidate.ssl || {}), key: $event }" />
                  <q-toggle :model-value="Boolean(candidate.ssl?.check_hostname)" label="校验证书主机名" @update:model-value="candidate.ssl = { ...(candidate.ssl || {}), check_hostname: $event }" />
                  <div class="text-caption text-secondary">证书路径由数据库服务所在主机读取；CA、客户端证书均可按服务端 TLS 策略留空。</div>
                </template>
              </template>
            </div>
            <q-stepper-navigation><q-btn color="primary" unelevated label="检查连接与空库" icon="search_check" :loading="checking" :disable="conflictBusy" @click="runCheck" /></q-stepper-navigation>
          </q-step>
          <q-step :name="2" title="检查结果" icon="fact_check" :done="false">
            <template v-if="checkReport">
              <q-banner v-if="!checkStillValid" rounded class="db-error q-mb-sm">连接参数在检查期间发生变化，当前结果已失效，请返回后重新检查。</q-banner>
              <q-banner rounded :class="checkReport.ok ? 'db-success' : checkReport.target_preparation_required ? 'bg-warning text-dark' : 'db-error'">
                <strong>{{ checkReport.ok ? '目标检查通过' : checkReport.target_preparation_required ? '需要先准备 SQLite 空库' : '目标检查未通过' }}</strong>
                <div class="q-mt-xs">{{ checkReport.reason || (checkReport.ok ? '目标为空库且连接能力检查通过。' : '检查未通过。') }}</div>
              </q-banner>
              <div class="check-flow q-mt-md"><div><span>当前来源</span><strong>{{ databaseTypeLabel[activeType] || activeType }} · {{ active.name || active.database_file || '当前活动库' }}</strong></div><q-icon name="arrow_forward" /><div><span>候选目标</span><strong>{{ databaseTypeLabel[String(candidate.type)] }} · {{ candidate.type === 'sqlite' ? '固定 db/nastools.db' : `${candidate.host}:${candidate.port} / ${candidate.name}` }}</strong></div></div>
              <div v-if="checkReport.target_preparation_required" class="preparation-list q-mt-md"><div class="text-subtitle2">准备操作</div><div class="text-caption text-secondary">旧 SQLite 文件将先制作快照备份，随后从固定位置删除；迁入内容仅来自当前活动数据库。</div><q-chip v-for="file in checkReport.target_files || []" :key="file" icon="description" :label="file.split(/[\\/]/).pop()" /></div>
              <div v-if="checkReport.conflicts?.length" class="text-negative q-mt-md">目标库存在 {{ checkReport.conflict_count || checkReport.conflicts.length }} 个对象：{{ checkReport.conflicts.slice(0, 12).join('、') }}</div>
              <div v-if="checkReport.capabilities" class="text-caption text-secondary q-mt-md">连接探测、事务回滚、锁能力及产品版本检查均由后端完成；数据迁移仍会再次验证目标身份。</div>
              <q-banner v-if="checkReport.ok && candidateRemote" dense rounded class="bg-warning text-dark q-mt-md">
                远程目标必须是专用空数据库，并确保迁移期间其他客户端无法写入。应用锁不能限制不协作的外部客户端；检测到目标被修改时会中止迁移且不会清理外部数据。
                <q-checkbox v-model="targetExclusiveConfirmed" class="q-mt-xs" label="我已确认目标专用，且迁移期间没有其他写入方" />
              </q-banner>
            </template>
            <q-banner v-else rounded class="bg-grey-2 text-secondary">请先检查候选数据库。</q-banner>
            <q-stepper-navigation class="migration-actions">
              <q-btn flat label="返回修改" :disable="conflictBusy" @click="migrationStep = 1; checkId = ''; checkReport = null" />
              <q-btn v-if="checkReport?.target_preparation_required && candidate.type === 'sqlite'" color="primary" unelevated icon="cleaning_services" label="准备 SQLite 空库" :loading="preparingTarget" :disable="!checkStillValid || conflictBusy" @click="prepareTarget" />
              <q-btn v-else color="primary" unelevated icon="swap_horiz" label="迁移并重启" :loading="startingMigration" :disable="checkReport?.ok !== true || !checkStillValid || (candidateRemote && !targetExclusiveConfirmed) || conflictBusy" @click="migrate" />
            </q-stepper-navigation>
          </q-step>
        </q-stepper>
        <q-separator /><q-card-actions align="right"><q-btn flat :label="conflictBusy ? '收起向导' : '关闭'" :disable="startingMigration || preparingTarget || checking" @click="closeMigration" /></q-card-actions>
      </q-card>
    </q-dialog>
    </template>
  </section>
</template>

<style scoped>
.database-management { color: var(--text-primary); }
.database-management :deep(.q-btn) { min-height: 44px; }
.refresh-status { color: var(--text-secondary); font-size: 12px; }
.db-loading-skeleton { display: grid; gap: 16px; }
.db-loading-skeleton .q-skeleton { background: var(--surface); }
.db-status-card { padding: 20px 22px 14px; }
.db-section-card, .metric-card { border-color: var(--border-subtle); border-radius: 16px; background: var(--surface); box-shadow: 0 3px 14px rgb(15 23 42 / 4%); }
.status-detail, .status-footer, .metric-foot { color: var(--text-secondary); font-size: 12px; overflow-wrap: anywhere; }
.status-footer { border-top: 1px solid var(--border-subtle); margin-top: 14px; padding-top: 11px; }
.pending-target { margin: 14px 0 0 62px; color: var(--q-warning); font-size: 13px; display: flex; gap: 7px; align-items: center; }
.db-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.metric-card { padding: 16px 18px; min-width: 0; }
.metric-label { color: var(--text-secondary); font-size: 13px; }
.metric-value { margin: 9px 0 5px; font-size: 26px; line-height: 32px; font-weight: 650; overflow-wrap: anywhere; }
.metric-value-small { font-size: 18px; line-height: 28px; }
.metric-value-small span { color: var(--text-secondary); font-size: 14px; }
.db-content-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(300px, 1fr); align-items: start; gap: 16px; }
.maintenance-column { display: grid; gap: 16px; min-width: 0; }
.db-section-card { padding: 18px; min-width: 0; }
.section-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.section-heading .text-caption { margin-top: 3px; }
.table-search { margin-bottom: 12px; }
.domain-header { font-weight: 600; }
.backup-summary { min-height: 58px; padding: 10px 12px; display: flex; align-items: center; gap: 12px; border: 1px solid var(--border-subtle); border-radius: 12px; background: color-mix(in srgb, var(--page-bg) 56%, var(--surface)); }
.backup-summary-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; overflow-wrap: anywhere; }
.backup-summary-copy span { color: var(--text-secondary); font-size: 12px; }
.file-drop { min-height: 102px; padding: 12px; border: 1px dashed var(--border-subtle); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 5px; text-align: center; color: var(--text-secondary); transition: border-color .15s, background .15s; }
.file-drop.active { border-color: var(--q-primary); background: color-mix(in srgb, var(--q-primary) 7%, var(--surface)); }
.file-picker { max-width: 220px; min-height: 36px; }
.restore-summary { padding: 12px; background: color-mix(in srgb, var(--page-bg) 60%, var(--surface)); border-radius: 12px; overflow-wrap: anywhere; }
.space-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.space-stats > div { min-width: 0; padding: 10px; display: flex; flex-direction: column; gap: 5px; background: color-mix(in srgb, var(--page-bg) 55%, var(--surface)); border-radius: 10px; }
.space-stats span { color: var(--text-secondary); font-size: 11px; }
.space-stats strong { overflow-wrap: anywhere; font-size: 13px; }
.db-task-banner { background: color-mix(in srgb, var(--q-info) 12%, var(--surface)); color: var(--text-primary); border: 1px solid color-mix(in srgb, var(--q-info) 30%, var(--border-subtle)); }
.task-heading { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.task-heading > span { color: var(--text-secondary); font-size: 12px; }
.task-message { margin-top: 7px; overflow-wrap: anywhere; }
.db-error { background: color-mix(in srgb, var(--q-negative) 12%, var(--surface)); color: var(--text-primary); }
.db-success { background: color-mix(in srgb, var(--q-positive) 12%, var(--surface)); color: var(--text-primary); }
.empty-note { padding: 18px; color: var(--text-secondary); text-align: center; }
.migration-dialog { width: min(720px, calc(100vw - 32px)); max-width: none; max-height: min(90vh, 900px); display: flex; flex-direction: column; border-radius: 16px; }
.migration-stepper { overflow: auto; flex: 1; }
.migration-stepper :deep(.q-stepper__nav) { position: sticky; bottom: 0; z-index: 1; background: var(--surface); padding-bottom: calc(12px + var(--safe-bottom)); }
.migration-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.readonly-path { grid-column: 1 / -1; display: flex; align-items: flex-start; gap: 10px; padding: 14px; border: 1px solid var(--border-subtle); border-radius: 12px; color: var(--text-secondary); }
.readonly-path span { display: flex; flex-direction: column; gap: 4px; }.readonly-path small { overflow-wrap: anywhere; }
.check-flow { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.check-flow > div { min-width: 0; padding: 12px; display: flex; flex-direction: column; gap: 5px; background: color-mix(in srgb, var(--page-bg) 58%, var(--surface)); border-radius: 12px; overflow-wrap: anywhere; }
.check-flow span { color: var(--text-secondary); font-size: 12px; }.preparation-list { padding: 12px; border: 1px solid var(--border-subtle); border-radius: 12px; }
.migration-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.migration-dialog :deep(.q-btn) { min-height: 44px; }
@media (max-width: 1023px) { .db-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.db-content-grid { grid-template-columns: minmax(0, 1fr); }.maintenance-column { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599px) {
  .db-status-card { padding: 16px; }.status-footer { line-height: 1.65; }.pending-target { margin-left: 0; }
  .db-metrics { gap: 8px; }.metric-card { padding: 12px; }.metric-value { font-size: 21px; }.metric-value-small { font-size: 15px; line-height: 23px; }
  .db-section-card { padding: 14px; }.maintenance-column { grid-template-columns: minmax(0, 1fr); }.space-stats { gap: 6px; }.space-stats > div { padding: 8px; }
  .migration-dialog { width: 100%; max-width: none; max-height: 100dvh; min-height: 100dvh; border-radius: 0; }.migration-form { grid-template-columns: minmax(0, 1fr); }
  .check-flow { grid-template-columns: minmax(0, 1fr); }.check-flow > .q-icon { justify-self: center; transform: rotate(90deg); }.migration-actions { align-items: stretch; flex-direction: column; }.migration-actions :deep(.q-btn) { width: 100%; }
  .task-heading > span { flex-basis: 100%; }.file-drop { min-height: 92px; }
}
</style>
