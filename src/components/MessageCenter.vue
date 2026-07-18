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
  <el-drawer
    :model-value="visible"
    title="消息中心"
    size="400px"
    @close="onClose"
    @update:model-value="(v: boolean) => emit('update:visible', v)"
  >
    <div v-if="messages.length === 0" class="msg-empty">暂无消息</div>
    <div v-for="(msg, i) in messages" :key="i" class="msg-item" v-html="msg"></div>
  </el-drawer>
</template>

<style scoped>
.msg-empty {
  text-align: center;
  color: var(--el-text-color-placeholder);
  padding: 40px 0;
}
.msg-item {
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-light);
}
.msg-item:last-child {
  border-bottom: none;
}
</style>
