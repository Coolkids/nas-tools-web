import { doAction } from '@/api/request'

export interface SystemCache {
  name: string
  label: string
  entries: number
  memory_bytes?: number
  persistent: boolean
  max_entries?: number
  bytes?: number
  max_bytes?: number
  ttl_seconds?: number
}

export function getSystemCacheInfo() {
  return doAction<{ code: number; msg?: string; caches: SystemCache[] }>('get_system_cache_info', {})
}

export function clearSystemCache(name: string) {
  return doAction<{ code: number; msg?: string; cleared_entries: number }>('clear_system_cache', { name })
}
