<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { type QTableColumn } from 'quasar'
import { clearSystemCache, getSystemCacheInfo, type CacheBackendStatus, type SystemCache } from '@/api/cache'
import { useModalStore } from '@/stores/modal'

const modal = useModalStore()
const caches = ref<SystemCache[]>([])
const loading = ref(false)
const clearing = ref('')
const error = ref('')
const backend = ref<CacheBackendStatus | null>(null)
const backendLabels: Record<string, string> = { memory: '内存', memory_disk: '内存＋磁盘', redis: 'Redis', valkey: 'Valkey' }
const total = computed(() => caches.value.reduce((count, cache) => count + cache.entries, 0))
const missingMemoryStats = computed(() => caches.value.some((cache) => !hasMemoryStats(cache)))
const totalMemory = computed(() => missingMemoryStats.value || !caches.value.length
  ? null
  : caches.value.reduce((bytes, cache) => bytes + cache.memory_bytes!, 0))
const columns: QTableColumn<SystemCache>[] = [
  { name: 'label', label: '缓存类型', field: 'label', align: 'left' },
  { name: 'entries', label: '有效条数 / 上限', field: 'entries', align: 'right' },
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

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    const result = await getSystemCacheInfo()
    if (result.code !== 0) throw new Error(result.msg || '加载缓存信息失败')
    caches.value = result.caches
    backend.value = result.backend || null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '加载缓存信息失败'
  } finally {
    loading.value = false
  }
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
      <q-btn flat color="primary" icon="refresh" label="刷新统计" :loading="loading" :disable="Boolean(clearing)" @click="refresh" />
      <q-btn outline color="negative" label="清理全部缓存" :loading="clearing === 'all'" :disable="loading || Boolean(clearing)" @click="clear('all', '全部缓存')" />
    </div>
    <div v-if="backend" class="text-caption text-secondary q-mb-sm">当前缓存后端：{{ backendLabels[backend.backend] || backend.backend }}</div>
    <q-banner v-if="backend?.fallback" class="bg-warning text-white q-mb-md" rounded>{{ backend.reason }}。<template v-if="['redis', 'valkey'].includes(backend.configured_backend)">当前使用内存缓存，连接恢复后会自动切回。</template></q-banner>
    <div class="text-caption text-secondary q-mb-md">磁盘模式重启后恢复未过期缓存；内存模式重启后清空。Redis / Valkey 的持久化由服务端配置决定。认证令牌和配置加载缓存始终保存在本机内存中。</div>
    <div class="text-caption text-secondary q-mb-md">内存模式统计本机缓存，Redis / Valkey 模式统计服务端缓存占用；AI 数据量用于容量限制。</div>
    <q-banner v-if="error" class="bg-negative text-white q-mb-md" rounded>{{ error }}</q-banner>
    <q-banner v-if="missingMemoryStats" class="bg-warning text-white q-mb-md" rounded>{{ backend ? '部分缓存未提供内存统计；远程模式请检查服务端 MEMORY USAGE 权限。' : '当前接口未提供完整的内存统计，请重启后端后刷新。' }}</q-banner>
    <q-table flat bordered :rows="caches" :columns="columns" row-key="name" :loading="loading" :pagination="{ rowsPerPage: 0 }" hide-pagination no-data-label="暂无缓存信息" wrap-cells>
      <template #body-cell-entries="props">
        <q-td :props="props">{{ props.row.entries }} / {{ props.row.max_entries || '—' }}</q-td>
      </template>
      <template #body-cell-memory_bytes="props">
        <q-td :props="props">
          <div>{{ formatBytes(props.row.memory_bytes) }}</div>
          <div v-if="props.row.bytes !== undefined" class="text-caption text-secondary">数据量 {{ formatBytes(props.row.bytes) }}<template v-if="props.row.max_bytes"> / 上限 {{ formatBytes(props.row.max_bytes) }}</template></div>
        </q-td>
      </template>
      <template #body-cell-persistent="props">
        <q-td :props="props"><q-badge :color="props.row.backend && props.row.backend !== 'memory' ? 'positive' : 'grey'">{{ backendLabels[props.row.backend] || (props.row.persistent ? '持久保存' : '内存') }}</q-badge></q-td>
      </template>
      <template #body-cell-actions="props">
        <q-td :props="props"><q-btn flat dense color="negative" label="清理" :loading="clearing === props.row.name" :disable="loading || Boolean(clearing)" @click="clear(props.row.name, props.row.label)" /></q-td>
      </template>
    </q-table>
  </section>
</template>
