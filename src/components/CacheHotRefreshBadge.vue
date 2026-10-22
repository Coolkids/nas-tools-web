<script setup lang="ts">
import { computed } from 'vue'
import type { CacheHotRefreshStatus } from '@/api/cache'

const props = defineProps<{ status?: CacheHotRefreshStatus }>()
const hint = computed(() => {
  if (props.status?.enabled) return '自动热刷新已开启，符合热度条件且临近到期的缓存将自动刷新。'
  const reasons: Record<string, string> = {
    cache_disabled: '识别缓存总开关已关闭。',
    disabled_by_user: '自动热刷新开关已关闭。',
    never_expires: '当前缓存设为永不过期，不参与自动热刷新。',
    storage_maintenance: '存储正在维护，自动热刷新已暂停。',
    backend_change_pending: '缓存后端变更等待重启，自动热刷新已暂停。',
    service_shutdown: '刷新服务正在关闭，自动热刷新已停止。'
  }
  return reasons[props.status?.reason || ''] || '自动热刷新当前未开启。'
})
</script>

<template>
  <q-badge v-if="status?.supported" :color="status.enabled ? 'positive' : 'grey-7'"
    :label="`支持热刷新 · ${status.enabled ? '已开启' : '未开启'}`" :aria-label="hint">
    <q-tooltip>{{ hint }}</q-tooltip>
  </q-badge>
</template>
