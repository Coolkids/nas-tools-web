<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { refreshMessage } from '@/api/system'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

const messages = ref<string[]>([])
const lstTime = ref('')
let timer: ReturnType<typeof setTimeout> | null = null

function stopPolling() {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
}

async function loadMessages() {
  try {
    const res = await refreshMessage(lstTime.value)
    if (res.code === 0) {
      lstTime.value = res.lst_time
      if (res.message?.length) {
        messages.value.push(...res.message)
      }
    }
  } catch {
    // ignore
  }
}

function startPolling() {
  stopPolling()
  loadMessages()
  timer = setTimeout(function tick() {
    loadMessages().finally(() => {
      timer = setTimeout(tick, 10000)
    })
  }, 10000)
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
    startPolling()
  } else {
    stopPolling()
  }
})

onUnmounted(stopPolling)
</script>

<template>
  <q-dialog :model-value="visible" :maximized="$q.screen.lt.sm" persistent @update:model-value="updateVisible">
    <q-card class="msg-dialog">
      <q-card-section class="row items-center no-wrap dialog-header">
        <div class="text-h6 text-weight-medium">消息中心</div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="关闭" @click="onClose" />
      </q-card-section>
      <q-separator />
      <q-card-section class="msg-body">
        <div v-if="messages.length === 0" class="msg-empty">
          <q-icon name="mark_email_unread" size="48px" color="grey-5" />
          <div class="msg-empty-text">暂无消息</div>
        </div>
        <div v-for="(msg, i) in messages" :key="i" class="msg-item" v-html="msg" />
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.msg-dialog { width: min(600px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }
.dialog-header { min-height: 60px; padding: 14px 20px; }
.msg-body { display: flex; flex-direction: column; gap: 8px; max-height: 60vh; overflow-y: auto; padding: 16px 20px 20px; }
.msg-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; color: var(--text-secondary); }
.msg-empty-text { margin-top: 12px; font-size: 14px; }
.msg-item { padding: 10px 12px; border: 1px solid var(--border-subtle); border-left: 3px solid var(--q-primary); border-radius: 8px; background: var(--surface-raised); color: var(--text-primary); font-size: 13px; line-height: 1.6; word-break: break-word; transition: background .15s; }
.msg-item:hover { background: var(--surface-muted); }
.msg-item :deep(.time) { display: block; margin-bottom: 4px; color: var(--text-secondary); font-size: 11px; }
.msg-item :deep(.text) { display: block; }
@media (max-width: 599px) { .msg-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .dialog-header { min-height: 56px; padding: 12px 16px; } .msg-body { max-height: none; padding: 16px; } }
</style>
