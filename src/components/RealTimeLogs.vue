<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { getLogging, type LogEntry } from '@/api/system'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const logs = ref<LogEntry[]>([])
const paused = ref(false)
const activeSource = ref('')
const logBody = ref<HTMLElement | null>(null)
let timer: ReturnType<typeof setTimeout> | null = null

const LOG_SOURCES = ['All', 'System', 'Rss', 'Rmt', 'Meta', 'Sync', 'Sites', 'Brush', 'Douban', 'Spider', 'Message', 'Indexer', 'Searcher', 'Subscribe', 'Downloader', 'TorrentRemover']

function stopPolling() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

async function loadLogs() {
  try {
    const res = await getLogging(logs.value.length, activeSource.value)
    if (res.loglist?.length) {
      logs.value.push(...res.loglist)
      await nextTick()
      if (logBody.value) {
        logBody.value.scrollTop = logBody.value.scrollHeight
      }
    }
  } catch {
    // ignore
  }
}

function startPolling() {
  stopPolling()
  loadLogs()
  if (!paused.value) {
    timer = setTimeout(function tick() {
      loadLogs().finally(() => {
        if (!paused.value) {
          timer = setTimeout(tick, 2000)
        }
      })
    }, 2000)
  }
}

function togglePause() {
  paused.value = !paused.value
  if (!paused.value) {
    startPolling()
  } else {
    stopPolling()
  }
}

function selectSource(s: string) {
  activeSource.value = s === 'All' ? '' : s
  logs.value = []
  startPolling()
}

function levelType(level: string): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (level === 'INFO') return 'info'
  if (level === 'WARN') return 'warning'
  if (level === 'ERROR') return 'danger'
  return ''
}

function onClose() {
  stopPolling()
  paused.value = false
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    logs.value = []
    activeSource.value = ''
    paused.value = false
    startPolling()
  } else {
    stopPolling()
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="实时日志"
    width="900px"
    top="3vh"
    destroy-on-close
    @close="onClose"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <div class="log-toolbar">
      <el-dropdown trigger="click" @command="selectSource">
        <el-button size="small">
          {{ activeSource || 'All' }}
          <el-icon><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item v-for="s in LOG_SOURCES" :key="s" :command="s">{{ s }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button size="small" :type="paused ? 'success' : 'warning'" @click="togglePause">
        {{ paused ? '开始' : '暂停' }}
      </el-button>
    </div>
    <div ref="logBody" class="log-body">
      <table class="log-table">
        <thead>
          <tr>
            <th class="col-time">时间</th>
            <th class="col-source">来源</th>
            <th class="col-text">内容</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(log, i) in logs" :key="i">
            <td class="col-time">{{ log.time }}</td>
            <td class="col-source">
              <el-tag size="small" :type="levelType(log.level)" effect="plain">{{ log.source }}</el-tag>
            </td>
            <td class="col-text">{{ log.text }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="logs.length === 0" class="log-empty">暂无日志</div>
    </div>
  </el-dialog>
</template>

<style scoped>
.log-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.log-body {
  max-height: 60vh;
  overflow-y: auto;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  font-size: 13px;
}
.log-table {
  width: 100%;
  border-collapse: collapse;
}
.log-table th {
  position: sticky;
  top: 0;
  background: var(--el-fill-color-light);
  z-index: 1;
  padding: 8px 10px;
  text-align: left;
  font-weight: 600;
  border-bottom: 1px solid var(--el-border-color-light);
}
.log-table td {
  padding: 6px 10px;
  border-bottom: 1px solid var(--el-border-color-extra-light);
  vertical-align: top;
}
.col-time {
  width: 80px;
  white-space: nowrap;
  font-family: monospace;
}
.col-source {
  width: 90px;
}
.col-text {
  word-break: break-all;
}
.log-empty {
  text-align: center;
  color: var(--el-text-color-placeholder);
  padding: 40px 0;
}
</style>
