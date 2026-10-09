import { doAction } from '@/api/request'

export interface SystemCache {
  name: string
  label: string
  entries: number
  memory_bytes?: number | null
  persistent: boolean
  backend?: string
  max_entries?: number
  bytes?: number
  max_bytes?: number
  ttl_seconds?: number
}

export interface CacheBackendStatus {
  configured_backend: string
  backend: string
  fallback: boolean
  reason: string
}

export function getSystemCacheInfo() {
  return doAction<{ code: number; msg?: string; caches: SystemCache[]; backend?: CacheBackendStatus }>('get_system_cache_info', {})
}

export function clearSystemCache(name: string) {
  return doAction<{ code: number; msg?: string; cleared_entries: number }>('clear_system_cache', { name })
}
