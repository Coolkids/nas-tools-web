import instance, { doAction } from '@/api/request'

export type DatabaseType = 'sqlite' | 'postgresql' | 'mysql' | 'mariadb'

export interface DatabaseCandidate {
  type: DatabaseType
  host?: string
  port?: number
  name?: string
  username?: string
  password?: string
  connect_timeout?: number
  ssl?: Record<string, unknown>
}

export interface DatabaseJob {
  job_id: string
  kind: string
  status: string
  stage: string
  message?: string
  error?: string | null
  error_code?: string | null
  created_at?: number
  updated_at?: number
  result?: Record<string, unknown> | null
  events?: Array<{ created_at: number; stage: string; message: string; progress?: number | null }>
}

export interface DatabaseCheck {
  ok?: boolean
  target_preparation_required?: boolean
  reason?: string
  check_id?: string
  source?: Record<string, unknown>
  target?: Record<string, unknown>
  capabilities?: Record<string, unknown>
  target_files?: string[]
  conflicts?: string[]
  conflict_count?: number
}

export interface DatabaseInfo {
  active?: Record<string, unknown>
  configured?: Record<string, unknown>
  connected?: boolean
  error?: string
  schema_revision?: string | null
  expected_schema_revision?: string | null
  server_version?: string | null
  tables?: Record<string, number | null>
  logical_domains?: Record<string, Record<string, number | null>>
  table_count_mode?: 'estimated' | 'exact'
  table_count_reasons?: Record<string, string>
  exact_statistics_at?: string | null
  statistics_job?: DatabaseJob | null
  supports_space_reclaim?: boolean
  statistics_at?: string
  current_job?: DatabaseJob | null
  pending_database_job?: DatabaseJob | null
  maintenance_jobs?: Record<string, DatabaseJob | undefined>
  storage?: {
    application_data_bytes?: number | null
    application_index_bytes?: number | null
    database_size_bytes?: number | null
    measurement_reason?: string
  }
  sqlite?: {
    database_file?: string
    database_size_bytes?: number | null
    wal_size_bytes?: number | null
    shm_size_bytes?: number | null
    free_pages_bytes?: number | null
    page_size?: number | null
    page_count?: number | null
    freelist_count?: number | null
    integrity?: string
    estimated_reclaimable_bytes?: number | null
    reclaim_supported?: boolean
    reclaim_allowed?: boolean
    error?: string
  } | null
}

export function getDatabaseInfo() {
  return doAction<{ code: number; msg?: string; database?: DatabaseInfo }>('get_database_info', {})
}

export function startDatabaseStatisticsRefresh() {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'start_database_statistics_refresh', {
      idempotency_key: crypto.randomUUID?.() || Array.from(
        crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')
      ).join('')
    }
  )
}

export function checkDatabase(candidate: DatabaseCandidate) {
  return doAction<{ code: number; msg?: string; check?: DatabaseCheck; job?: DatabaseJob }>('check_database', candidate)
}

export function prepareSqliteTarget(candidate: DatabaseCandidate & { check_id: string }) {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'prepare_sqlite_migration_target', candidate
  )
}

export function startDatabaseMigration(candidate: DatabaseCandidate & {
  check_id: string
  confirm_target_exclusive?: boolean
}) {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'start_database_migration', candidate
  )
}

export function getDatabaseJob(jobId: string) {
  return doAction<{ code: number; msg?: string; job?: DatabaseJob }>('get_database_job', { job_id: jobId })
}

export function cancelDatabaseJob(jobId: string) {
  return doAction<{ code: number; msg?: string }>('cancel_database_job', { job_id: jobId })
}

export function retryDatabaseRestart(jobId: string) {
  return doAction<{ code: number; msg?: string }>('retry_database_restart', { job_id: jobId })
}

export function startDatabaseSpaceReclaim() {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'start_database_space_reclaim', {}
  )
}

export function startDatabaseBackup() {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'start_database_backup', { idempotency_key: crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('') }
  )
}

export async function uploadDatabaseBackup(file: File, onProgress: (percent: number) => void) {
  const form = new FormData()
  form.append('file', file, file.name)
  const response = await instance.post<{ code: number; msg?: string; upload_id?: string; size_bytes?: number }>(
    '/api/v1/database/backups/upload', form, {
      onUploadProgress: (event) => {
        if (event.total) onProgress(Math.round(event.loaded / event.total * 100))
      }
    }
  )
  return response.data
}

export function checkDatabaseBackup(uploadId: string) {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'check_database_backup', { upload_id: uploadId }
  )
}

export function startDatabaseRestore(checkId: string) {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: DatabaseJob }>(
    'start_database_restore', { check_id: checkId, confirm_replace: true }
  )
}

export function databaseBackupDownloadUrl(backupId: string) {
  return `${instance.defaults.baseURL || ''}/api/v1/database/backups/${encodeURIComponent(backupId)}/download`
}

export async function checkDatabaseBackupDownload(backupId: string) {
  const response = await instance.head(`/api/v1/database/backups/${encodeURIComponent(backupId)}/download`)
  const contentType = String(response.headers['content-type'] || '')
  if (!contentType.includes('application/zip')) {
    throw new Error('下载地址未返回 ZIP 备份文件，请检查管理员权限或备份是否已过期')
  }
}
