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
  <el-dialog
    :model-value="visible"
    title="消息中心"
    width="600px"
    :close-on-click-modal="false"
    destroy-on-close
    @close="onClose"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <div class="msg-body">
      <div v-if="messages.length === 0" class="msg-empty">
        <div class="msg-empty-icon">📬</div>
        <div class="msg-empty-text">暂无消息</div>
      </div>
      <div v-for="(msg, i) in messages" :key="i" class="msg-item" v-html="msg"></div>
    </div>
  </el-dialog>
</template>

<style scoped>
.msg-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px 0;
  max-height: 60vh;
  overflow-y: auto;
}
.msg-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--el-text-color-placeholder);
}
.msg-empty-icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.5;
}
.msg-empty-text {
  font-size: 14px;
}
.msg-item {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  border-left: 3px solid var(--el-color-primary-light-3);
  font-size: 13px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
  word-break: break-word;
  transition: background 0.15s;
}
.msg-item:hover {
  background: var(--el-fill-color);
}
.msg-item:first-child {
  margin-top: 4px;
}

.msg-item :deep(.time) {
  display: block;
  font-size: 11px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}
.msg-item :deep(.text) {
  display: block;
}
</style>
