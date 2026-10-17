import { doAction } from '@/api/request'

export interface SystemCache {
  name: string
  label: string
  description?: string
  members?: string[]
  entries: number
  memory_bytes?: number | null
  persistent: boolean
  backend?: string
  max_entries?: number | null
  bytes?: number | null
  max_bytes?: number | null
  store_bytes?: number | null
  ttl_seconds?: number
  stats_at?: number | null
  stats_estimated?: boolean
}

export interface CacheBackendStatus {
  configured_backend: string
  backend: string
  active_backend?: string
  pending_backend?: string | null
  restart_required?: boolean
  generation?: number
  config_generation?: string | null
  store_path?: string | null
  memory_scope?: 'local' | 'remote'
  connection?: {
    host?: string
    port?: number
    db?: number
    auth_mode?: 'none' | 'password'
    username_set?: boolean
    password_set?: boolean
    connect_timeout?: number
    retry_interval?: number
  }
  maintenance?: boolean
  fallback: boolean
  reason: string
  current_task?: CacheStorageJob | null
  recent_task?: CacheStorageJob | null
}

export interface CacheStorageCandidate {
  backend: string
  host?: string
  port?: number
  db?: number
  auth_mode?: 'none' | 'password'
  username?: string
  password?: string
  connect_timeout?: number
  retry_interval?: number
}

export interface CacheStorageJob {
  job_id: string
  kind: string
  status: string
  stage: string
  created_at?: number
  updated_at: number
  progress?: number | null
  message?: string | null
  error?: string | null
  error_code?: string | null
  result?: Record<string, unknown> | null
  events?: Array<{ created_at: number; stage: string; message: string; progress?: number | null }>
}

export interface CacheStorageCheckResult {
  code: number
  msg?: string
  check_id?: string
  unchanged?: boolean
  same_store?: boolean
  source?: CacheBackendStatus
  target?: Record<string, unknown>
  summary?: Array<{ namespace: string; entries: number }>
  excluded?: Array<{ name: string; reason: string }>
}

export function getSystemCacheInfo() {
  return doAction<{ code: number; msg?: string; caches: SystemCache[]; backend?: CacheBackendStatus }>('get_system_cache_info', {})
}

export function clearSystemCache(name: string) {
  return doAction<{ code: number; msg?: string; cleared_entries: number }>('clear_system_cache', { name })
}

export type CacheTtlUnit = 'minute' | 'hour' | 'day' | 'forever'

export function updateSystemCacheTtl(name: string, value: number | null, unit: CacheTtlUnit) {
  return doAction<{ code: number; msg?: string; ttl_seconds?: number }>('update_system_cache_ttl', { name, value, unit })
}

export function checkCacheStorage(candidate: CacheStorageCandidate) {
  return doAction<CacheStorageCheckResult>('check_cache_storage', candidate)
}

export function startCacheMigration(candidate: CacheStorageCandidate & { check_id: string }) {
  return doAction<{ code: number; msg?: string; job_id?: string; job?: CacheStorageJob }>(
    'start_cache_migration', candidate
  )
}

export function getCacheJob(jobId: string) {
  return doAction<{ code: number; msg?: string; job?: CacheStorageJob }>('get_cache_job', { job_id: jobId })
}

export function cancelCacheJob(jobId: string) {
  return doAction<{ code: number; msg?: string }>('cancel_cache_job', { job_id: jobId })
}

export function retryCacheRestart(jobId: string) {
  return doAction<{ code: number; msg?: string }>('retry_cache_restart', { job_id: jobId })
}

export function recoverCacheMigration(jobId: string) {
  return doAction<{ code: number; msg?: string }>('recover_cache_migration', { job_id: jobId })
}
