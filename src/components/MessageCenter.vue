<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { refreshMessage } from '@/api/system'
import { useModalStore } from '@/stores/modal'

type MessageType = 'info' | 'error'
type MessageFieldKind = 'text' | 'url' | 'rating' | 'error'

interface MessageField {
  key: string
  label: string
  value: string
  kind: MessageFieldKind
  wide: boolean
}

interface MessageItem {
  type: MessageType
  typeLabel: string
  title: string
  summary: string
  fields: MessageField[]
  time: string
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const modal = useModalStore()

const messages = ref<MessageItem[]>([])
const lstTime = ref('')
const loading = ref(false)
const hasLoaded = ref(false)
const loadError = ref('')
const lastChecked = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

const MAX_MESSAGES = 50

const syncLabel = computed(() => {
  if (loading.value && !hasLoaded.value) return '正在同步'
  if (loadError.value) return '更新异常'
  return '自动更新'
})

function stopPolling() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

function textFromElement(element: Element | null): string {
  if (!element) return ''
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('br').forEach((lineBreak) => lineBreak.replaceWith('\n'))
  return (clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
}

const FIELD_LABELS = [
  '种子名称', '种子链接', '错误信息', '源路径', '做种数', 'Hit&Run',
  '总大小', '评分', '站点', '来自', '任务', '用户', '质量', '大小',
  '促销', '类型', '类别', '描述', '原因', '文件', '种子'
]

const FIELD_KEY_MAP: Record<string, string> = {
  '站点': 'site',
  '任务': 'task',
  '种子名称': 'seedName',
  '种子': 'seedName',
  '种子链接': 'seedLink',
  '错误信息': 'error',
  '评分': 'rating',
  '来自': 'source',
  '源路径': 'sourcePath',
  '原因': 'reason',
  '描述': 'description'
}

function createField(label: string, value: string): MessageField {
  const key = FIELD_KEY_MAP[label] || label
  const kind: MessageFieldKind = key === 'seedLink' || /^https?:\/\//i.test(value)
    ? 'url'
    : key === 'rating'
      ? 'rating'
      : key === 'error' || key === 'reason'
        ? 'error'
        : 'text'

  return {
    key,
    label: key === 'seedName' ? '种子名称' : label,
    value,
    kind,
    wide: ['seedName', 'seedLink', 'error', 'reason', 'description', 'sourcePath'].includes(key)
  }
}

function parseFields(contentElement: Element | null): { fields: MessageField[]; summary: string } {
  const content = textFromElement(contentElement)
  if (!content) return { fields: [], summary: '' }

  const labels = [...FIELD_LABELS].sort((left, right) => right.length - left.length)
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const fieldPattern = new RegExp(`(?:^|[\\n，,])\\s*(${labelPattern})\\s*[：:]\\s*`, 'g')
  const matches = Array.from(content.matchAll(fieldPattern))

  if (!matches.length) return { fields: [], summary: content }

  const fields: MessageField[] = []
  const firstMatch = matches[0]
  const prefix = content.slice(0, firstMatch.index).trim().replace(/[，,]+$/, '')
  if (prefix) fields.push(createField('详情', prefix))

  matches.forEach((match, index) => {
    const valueStart = (match.index || 0) + match[0].length
    const valueEnd = matches[index + 1]?.index ?? content.length
    const value = content.slice(valueStart, valueEnd).replace(/[，,]+$/, '').trim()
    if (value) fields.push(createField(match[1], value))
  })

  return { fields, summary: fields.length ? '' : content }
}

/**
 * The current endpoint returns the legacy HTML fragment used by the old web UI.
 * Read its known fields once and render them as regular Vue text so the new card
 * layout is independent of Bootstrap class names and does not inject message HTML.
 */
function parseMessage(raw: string): MessageItem {
  const documentFragment = new DOMParser().parseFromString(raw, 'text/html')
  const item = documentFragment.querySelector('.list-group-item') || documentFragment.body.firstElementChild
  const textColumn = item?.querySelector('.col') || item
  const textElements = textColumn ? Array.from(textColumn.querySelectorAll('.text-wrap')) : []
  const titleElement = textElements.find((element) => element.tagName === 'SPAN') || textElements[0] || null
  const mutedElements = textColumn ? Array.from(textColumn.querySelectorAll('.text-muted')) : []
  const contentElement = mutedElements.length > 1 ? mutedElements[0] : null
  const timeElement = mutedElements.length ? mutedElements[mutedElements.length - 1] : null
  const parsed = parseFields(contentElement)
  const isError = Boolean(item?.querySelector('.status-dot.bg-red')) ||
    parsed.fields.some((field) => field.kind === 'error') ||
    /失败|错误/.test(textFromElement(titleElement))

  return {
    type: isError ? 'error' : 'info',
    typeLabel: isError ? '异常' : '系统',
    title: textFromElement(titleElement) || '系统消息',
    summary: parsed.summary,
    fields: parsed.fields,
    time: textFromElement(timeElement)
  }
}

function displayUrl(url: string): string {
  if (url.length <= 58) return url
  return `${url.slice(0, 42)}…${url.slice(-12)}`
}

function fieldIcon(field: MessageField): string {
  if (field.kind === 'url') return 'link'
  if (field.kind === 'rating') return 'star'
  if (field.kind === 'error') return 'report_problem'
  if (field.key === 'site' || field.key === 'task') return 'language'
  if (field.key === 'seedName') return 'inventory_2'
  if (field.key === 'source') return 'near_me'
  return 'label'
}

async function copyUrl(url: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(url)
    modal.success('种子链接已复制')
  } catch {
    modal.info(`复制失败，请手动复制以下链接：\n${url}`)
  }
}

async function loadMessages() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''

  try {
    const res = await refreshMessage(lstTime.value)
    if (res.code !== 0) throw new Error('获取消息失败')

    lstTime.value = res.lst_time
    if (res.message?.length) {
      messages.value = [...messages.value, ...res.message.map(parseMessage)].slice(-MAX_MESSAGES)
    }
    lastChecked.value = new Date().toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '获取消息失败'
  } finally {
    loading.value = false
    hasLoaded.value = true
  }
}

function schedulePolling() {
  stopPolling()
  timer = setTimeout(async () => {
    await loadMessages()
    if (props.visible) schedulePolling()
  }, 10000)
}

async function startPolling() {
  stopPolling()
  await loadMessages()
  if (props.visible) schedulePolling()
}

function refreshNow() {
  void loadMessages()
}

function onClose() {
  stopPolling()
  emit('update:visible', false)
}

function updateVisible(value: boolean) {
  if (value) emit('update:visible', true)
  else onClose()
}

watch(() => props.visible, (val) => {
  if (val) {
    messages.value = []
    lstTime.value = ''
    loading.value = false
    hasLoaded.value = false
    loadError.value = ''
    lastChecked.value = ''
    void startPolling()
  } else {
    stopPolling()
  }
}, { immediate: true })

onUnmounted(stopPolling)
</script>

<template>
  <q-dialog
    :model-value="visible"
    :maximized="$q.screen.lt.sm"
    @update:model-value="updateVisible"
  >
    <q-card class="msg-dialog">
      <q-card-section class="dialog-header">
        <div class="dialog-heading">
          <div class="dialog-title">消息中心</div>
          <div class="dialog-subtitle">系统运行状态与任务反馈</div>
        </div>
        <q-space />
        <q-badge v-if="messages.length" class="message-count" :label="`${messages.length} 条`" />
        <q-btn flat round dense icon="close" aria-label="关闭消息中心" class="close-button" @click="onClose" />
      </q-card-section>

      <q-separator />

      <q-card-section class="message-toolbar">
        <div class="sync-status" role="status" :aria-label="syncLabel">
          <span class="sync-dot" :class="{ 'is-error': loadError, 'is-loading': loading }" aria-hidden="true" />
          <span>{{ syncLabel }}</span>
          <span v-if="lastChecked" class="sync-time">最近检查 {{ lastChecked }}</span>
        </div>
        <q-btn
          flat
          round
          dense
          icon="refresh"
          class="refresh-button"
          :loading="loading"
          aria-label="立即刷新消息"
          @click="refreshNow"
        />
      </q-card-section>

      <q-banner v-if="loadError && messages.length" dense rounded class="message-error-banner">
        <template #avatar><q-icon name="cloud_off" /></template>
        {{ loadError }}，当前显示最近消息。
        <template #action>
          <q-btn flat dense label="重试" @click="refreshNow" />
        </template>
      </q-banner>

      <q-card-section class="msg-body">
        <div v-if="loading && !messages.length" class="message-state" role="status" aria-live="polite">
          <q-spinner-dots color="primary" size="32px" />
          <span>正在读取消息…</span>
        </div>

        <div v-else-if="loadError && !messages.length" class="message-state message-state--error" role="alert">
          <q-icon name="cloud_off" size="40px" />
          <strong>暂时无法获取消息</strong>
          <span>{{ loadError }}</span>
          <q-btn outline color="primary" label="重新获取" class="state-action" @click="refreshNow" />
        </div>

        <div v-else-if="!messages.length" class="message-state">
          <div class="empty-icon"><q-icon name="inbox" size="25px" /></div>
          <strong>暂无消息</strong>
          <span>系统有新的任务进展时，会在这里显示。</span>
        </div>

        <div v-else class="message-list">
          <article v-for="(message, i) in messages" :key="`${message.time}-${i}`" class="message-item" :class="`message-item--${message.type}`">
            <div class="message-icon" aria-hidden="true">
              <q-icon :name="message.type === 'error' ? 'error_outline' : 'info'" size="21px" />
            </div>
            <div class="message-main">
              <div class="message-meta">
                <span class="message-type">{{ message.typeLabel }}</span>
                <time class="message-time">{{ message.time || '时间未知' }}</time>
              </div>
              <div class="message-title" role="heading" aria-level="3">{{ message.title }}</div>
              <div v-if="message.fields.length" class="message-fields">
                <div
                  v-for="(field, fieldIndex) in message.fields"
                  :key="`${field.key}-${fieldIndex}`"
                  class="message-field"
                  :class="{ 'message-field--wide': field.wide, 'message-field--error': field.kind === 'error' }"
                >
                  <div class="field-label">
                    <q-icon :name="fieldIcon(field)" size="16px" aria-hidden="true" />
                    <span>{{ field.label }}</span>
                  </div>
                  <div v-if="field.kind === 'url'" class="field-url">
                    <span class="field-value field-value--url" :title="field.value">{{ displayUrl(field.value) }}</span>
                    <q-tooltip class="message-url-tooltip">{{ field.value }}</q-tooltip>
                    <q-btn
                      flat
                      round
                      dense
                      icon="content_copy"
                      class="copy-url-button"
                      aria-label="复制种子链接"
                      @click.stop="copyUrl(field.value)"
                    />
                  </div>
                  <div v-else class="field-value" :class="{ 'field-value--rating': field.kind === 'rating', 'field-value--error': field.kind === 'error' }">
                    {{ field.value }}
                  </div>
                </div>
              </div>
              <div v-else-if="message.summary" class="message-summary">{{ message.summary }}</div>
            </div>
          </article>
        </div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.msg-dialog {
  display: flex;
  width: min(620px, calc(100vw - 48px));
  max-width: none;
  max-height: min(760px, calc(100dvh - 80px));
  flex-direction: column;
  border-radius: 16px;
  background: var(--surface);
  color: var(--text-primary);
}

.dialog-header {
  display: flex;
  min-height: 64px;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
}

.dialog-heading { min-width: 0; }
.dialog-title { color: var(--text-primary); font-size: 16px; font-weight: 600; line-height: 24px; }
.dialog-subtitle { margin-top: 1px; color: var(--text-secondary); font-size: 11px; line-height: 16px; }

.message-count {
  flex: 0 0 auto;
  border: 1px solid color-mix(in srgb, var(--q-primary) 20%, transparent);
  border-radius: 999px;
  background: var(--primary-soft);
  color: var(--q-primary);
  font-size: 11px;
  font-weight: 600;
}

.close-button { min-width: 44px; min-height: 44px; color: var(--text-secondary); }

.message-toolbar {
  display: flex;
  min-height: 50px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 20px;
}

.sync-status {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 20px;
}

.sync-dot {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--q-positive);
}

.sync-dot.is-loading { background: var(--q-primary); }
.sync-dot.is-error { background: var(--q-negative); }
.sync-time { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.refresh-button { min-width: 44px; min-height: 44px; color: var(--text-secondary); }

.message-error-banner {
  margin: 0 20px 4px;
  border: 1px solid color-mix(in srgb, var(--q-warning) 28%, transparent);
  background: color-mix(in srgb, var(--q-warning) 10%, var(--surface));
  color: var(--text-primary);
  font-size: 12px;
  line-height: 18px;
}

.message-error-banner :deep(.q-banner__actions) { align-items: center; }
.message-error-banner :deep(.q-btn) { min-height: 36px; color: var(--q-warning); }

.msg-body {
  min-height: 0;
  flex: 1;
  max-height: calc(min(760px, 100dvh - 80px) - 114px);
  overflow-y: auto;
  padding: 12px 20px 20px;
  scrollbar-color: var(--border-subtle) transparent;
}

.message-list { display: flex; flex-direction: column; gap: 10px; }

.message-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--q-primary);
  border-radius: 12px;
  background: var(--surface-raised);
  transition: border-color 140ms ease, background-color 140ms ease;
}

.message-item:hover { background: var(--surface-muted); }
.message-item--error { border-left-color: var(--q-negative); }
.message-icon { display: flex; width: 28px; height: 28px; align-items: center; justify-content: center; flex: 0 0 28px; border-radius: 50%; background: var(--primary-soft); color: var(--q-primary); }
.message-item--error .message-icon { background: color-mix(in srgb, var(--q-negative) 12%, var(--surface)); color: var(--q-negative); }
.message-main { min-width: 0; flex: 1; }

.message-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.message-type { color: var(--q-primary); font-size: 11px; font-weight: 600; line-height: 18px; }
.message-item--error .message-type { color: var(--q-negative); }
.message-time { margin-left: auto; color: var(--text-secondary); font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; line-height: 18px; white-space: nowrap; }
.message-title { margin: 0; color: var(--text-primary); font-size: 14px !important; font-weight: 600; line-height: 20px; overflow-wrap: anywhere; word-break: break-word; }
.message-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 16px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-subtle); }
.message-field { min-width: 0; }
.message-field--wide { grid-column: 1 / -1; }
.field-label { display: flex; align-items: center; gap: 5px; color: var(--text-secondary); font-size: 11px; line-height: 18px; }
.field-value { display: block; margin-top: 2px; color: var(--text-primary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; word-break: break-word; }
.field-value--rating { color: var(--q-warning); font-weight: 600; }
.field-value--error { color: var(--q-negative); }
.field-url { display: flex; min-width: 0; align-items: center; gap: 4px; }
.field-value--url { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.copy-url-button { width: 40px; min-width: 40px; height: 40px; min-height: 40px; flex: 0 0 40px; color: var(--q-primary); }
.message-summary { margin-top: 8px; color: var(--text-secondary); font-size: 13px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }

:global(.message-url-tooltip) { max-width: min(540px, calc(100vw - 32px)); white-space: normal; overflow-wrap: anywhere; word-break: break-all; }

.message-state {
  display: flex;
  min-height: 300px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  flex-direction: column;
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
}

.message-state strong { color: var(--text-primary); font-size: 14px; font-weight: 600; }
.message-state--error { color: var(--q-negative); }
.message-state--error span { max-width: 280px; color: var(--text-secondary); overflow-wrap: anywhere; }
.state-action { min-height: 44px; margin-top: 4px; }
.empty-icon { display: flex; width: 52px; height: 52px; align-items: center; justify-content: center; border-radius: 50%; background: var(--surface-muted); color: var(--text-secondary); }

@media (max-width: 599px) {
  .msg-dialog { width: 100%; min-height: 100dvh; max-height: 100dvh; border-radius: 0; }
  .dialog-header { min-height: 64px; padding: 10px 16px; }
  .message-toolbar { padding: 8px 16px; }
  .message-error-banner { margin-right: 16px; margin-left: 16px; }
  .msg-body { max-height: none; padding: 12px 16px calc(24px + var(--safe-bottom)); }
  .message-item { padding: 13px 12px; }
  .message-time { font-size: 10px; }
  .message-fields { grid-template-columns: 1fr; gap: 9px; }
  .message-field--wide { grid-column: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .message-item { transition: none; }
}
</style>
