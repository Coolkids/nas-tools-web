<script setup lang="ts">
import { ref, watch, onUnmounted, nextTick } from 'vue'
import { getLogging, type LogEntry } from '@/api/system'
import { useModalStore } from '@/stores/modal'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const logs = ref<LogEntry[]>([])
const paused = ref(false)
const activeSource = ref('')
const followTail = ref(true)
const newLogCount = ref(0)
const loadedCount = ref(0)
const loading = ref(false)
const logBody = ref<HTMLElement | null>(null)
const modal = useModalStore()
let timer: ReturnType<typeof setTimeout> | null = null
const MAX_LOGS = 1000

const LOG_SOURCES = ['All', 'System', 'Rss', 'Rmt', 'Meta', 'Sync', 'Sites', 'Brush', 'Douban', 'Spider', 'Message', 'Indexer', 'Searcher', 'Subscribe', 'Downloader', 'TorrentRemover']

function stopPolling() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

async function loadLogs() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await getLogging(loadedCount.value, activeSource.value)
    if (res.loglist?.length) {
      loadedCount.value += res.loglist.length
      logs.value = [...logs.value, ...res.loglist].slice(-MAX_LOGS)
      await nextTick()
      if (logBody.value && followTail.value) {
        logBody.value.scrollTop = logBody.value.scrollHeight
      } else if (!followTail.value) {
        newLogCount.value += res.loglist.length
      }
    }
  } catch {
    // ignore
  } finally {
    loading.value = false
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
  loadedCount.value = 0
  newLogCount.value = 0
  followTail.value = true
  startPolling()
}

function onLogScroll(event: Event) {
  const target = event.currentTarget as HTMLElement
  const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 24
  followTail.value = atBottom
  if (atBottom) newLogCount.value = 0
}

function jumpToBottom() {
  followTail.value = true
  newLogCount.value = 0
  if (logBody.value) logBody.value.scrollTop = logBody.value.scrollHeight
}

async function copyLogs() {
  const text = logs.value.map((log) => `[${log.time}] [${log.source}] ${log.text}`).join('\n')
  if (!text) return modal.info('暂无可复制的日志')
  try {
    await navigator.clipboard.writeText(text)
    modal.success('日志已复制')
  } catch {
    modal.info(`复制失败，请手动复制以下内容：\n${text.slice(0, 2000)}${text.length > 2000 ? '\n…' : ''}`)
  }
}

function levelType(level: string): 'positive' | 'warning' | 'negative' | 'info' {
  if (level === 'INFO') return 'info'
  if (level === 'WARN') return 'warning'
  if (level === 'ERROR') return 'negative'
  return 'positive'
}

function onClose() {
  stopPolling()
  paused.value = false
  emit('update:visible', false)
}

function updateVisible(value: boolean) {
  if (value) emit('update:visible', true)
  else onClose()
}

watch(() => props.visible, (val) => {
  if (val) {
    logs.value = []
    activeSource.value = ''
    loadedCount.value = 0
    newLogCount.value = 0
    followTail.value = true
    paused.value = false
    startPolling()
  } else {
    stopPolling()
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <q-dialog :model-value="visible" :maximized="$q.screen.lt.sm" persistent @update:model-value="updateVisible">
    <q-card class="log-dialog">
      <q-card-section class="row items-center no-wrap dialog-header">
        <div class="text-h6 text-weight-medium">实时日志 <span class="log-count">最近 {{ logs.length }} 条</span></div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="关闭" @click="onClose" />
      </q-card-section>
      <q-separator />
      <q-card-section class="log-content">
        <div class="log-toolbar">
          <q-select :model-value="activeSource || 'All'" outlined dense label="来源" :options="LOG_SOURCES" class="source-select" @update:model-value="selectSource" />
          <q-btn unelevated :color="paused ? 'positive' : 'warning'" :icon="paused ? 'play_arrow' : 'pause'" :label="paused ? '开始' : '暂停'" @click="togglePause" />
          <q-btn outline icon="content_copy" label="复制" :disable="!logs.length" @click="copyLogs" />
        </div>
        <div v-if="newLogCount && !followTail" class="new-log-banner">
          <q-btn flat color="primary" icon="south" :label="`有 ${newLogCount} 条新日志，回到底部`" @click="jumpToBottom" />
        </div>
        <div ref="logBody" class="log-body" @scroll="onLogScroll">
          <table v-if="logs.length" class="log-table">
            <thead><tr><th class="col-time">时间</th><th class="col-source">来源</th><th class="col-text">内容</th></tr></thead>
            <tbody><tr v-for="(log, i) in logs" :key="i"><td class="col-time">{{ log.time }}</td><td class="col-source"><q-badge outline :color="levelType(log.level)">{{ log.source }}</q-badge></td><td class="col-text">{{ log.text }}</td></tr></tbody>
          </table>
          <div v-else class="log-empty"><q-spinner-dots v-if="loading" color="primary" size="28px" /><q-icon v-else name="receipt_long" size="42px" color="grey-5" /><span>{{ loading ? '正在读取日志…' : '暂无日志' }}</span></div>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.log-dialog { width: min(900px, calc(100vw - 32px)); max-width: none; max-height: 88vh; border-radius: 16px; background: var(--surface); color: var(--text-primary); }
.dialog-header { min-height: 60px; padding: 14px 20px; }
.log-count { margin-left: 8px; color: var(--text-secondary); font-size: 12px; font-weight: 400; }
.log-content { padding: 16px 20px 20px; }
.log-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 12px; }
.source-select { width: 180px; }
.new-log-banner { margin: -4px 0 8px; text-align: center; }
.log-body { max-height: 64vh; overflow: auto; border: 1px solid var(--border-subtle); border-radius: 10px; font: 13px/1.55 Consolas, Monaco, monospace; }
.log-table { width: 100%; border-collapse: collapse; }
.log-table th { position: sticky; top: 0; z-index: 1; padding: 9px 10px; background: var(--surface-muted); color: var(--text-primary); text-align: left; font-weight: 600; }
.log-table td { padding: 7px 10px; border-top: 1px solid var(--border-subtle); vertical-align: top; }
.col-time { width: 100px; white-space: nowrap; font-family: monospace; color: var(--text-secondary); }
.col-source { width: 110px; }
.col-text { word-break: break-all; }
.log-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 240px; color: var(--text-secondary); }
@media (max-width: 599px) { .log-dialog { width: 100%; max-height: none; min-height: 100dvh; border-radius: 0; } .dialog-header { min-height: 56px; padding: 12px 16px; } .log-content { padding: 16px; } .log-body { max-height: none; } .source-select { flex: 1; width: auto; } .log-toolbar :deep(.q-btn) { min-height: 42px; } .col-time { width: 80px; } .col-source { width: 76px; } .log-toolbar :deep(.q-btn:last-child) { margin-left: auto; } }
</style>
