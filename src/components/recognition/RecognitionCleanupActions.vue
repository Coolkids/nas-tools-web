<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { getRecognitionCleanupJob, previewRecognitionCleanup, startRecognitionCleanup, resumeRecognitionCleanupJob,
  type CleanupPreview, type CleanupScope, type RecognitionControl } from '@/api/recognition'
const props = defineProps<{ compact?: boolean }>()
const emit = defineEmits<{ completed: [] }>()
const preview = ref<CleanupPreview | null>(null)
const dialog = ref(false)
const busy = ref(false)
const running = ref(false)
const jobId = ref('')
const job = ref<RecognitionControl | null>(null)
const error = ref('')
const title = computed(() => preview.value?.scope === 'all_completed' ? '清理所有识别记录？' : '清理过期识别记录？')
let timer: ReturnType<typeof setTimeout> | undefined
const abort = new AbortController()
let unmounted = false
async function open(scope: CleanupScope) {
  if (busy.value || running.value) return
  busy.value = true; error.value = ''
  try { preview.value = await previewRecognitionCleanup(scope); dialog.value = true }
  catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
}
async function poll() {
  try {
    const result = await getRecognitionCleanupJob(jobId.value, abort.signal)
    if (unmounted) return
    job.value = result; error.value = ''
    if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(result.state)) {
      running.value = false
      if (result.state === 'SUCCEEDED') emit('completed')
      else error.value = '清理未完成，已处理的批次保持生效；请检查任务后重试。'
    } else timer = setTimeout(poll, 1000)
  } catch (cause) {
    if (!unmounted) { running.value = false; error.value = (cause as Error).message }
  }
}
async function confirm() {
  if (!preview.value || busy.value) return
  busy.value = true; error.value = ''
  try {
    const accepted = await startRecognitionCleanup(preview.value.scope, preview.value.confirmation_token, crypto.randomUUID())
    jobId.value = accepted.job_id; job.value = null; running.value = true; dialog.value = false
    await poll()
  } catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
}
async function resume() {
  if (!jobId.value || busy.value || running.value) return
  busy.value = true; error.value = ''
  try { await resumeRecognitionCleanupJob(jobId.value); running.value = true; await poll() }
  catch (cause) { error.value = (cause as Error).message }
  finally { busy.value = false }
}
onBeforeUnmount(() => { unmounted = true; abort.abort(); clearTimeout(timer) })
</script>
<template>
  <section class="cleanup-actions" :class="{ 'cleanup-actions--compact': props.compact }" aria-label="手动清理识别记录">
    <div class="row q-gutter-sm" :class="{ 'justify-end': props.compact }">
      <q-btn outline color="primary" :dense="props.compact" :label="props.compact ? '清理过期' : '立即清理过期记录'" :loading="busy || running" :disable="busy || running" @click="open('expired')" />
      <q-btn outline color="negative" :dense="props.compact" :label="props.compact ? '清理全部' : '清理所有记录'" :disable="busy || running" @click="open('all_completed')" />
    </div>
    <p v-if="!props.compact" class="text-caption text-secondary">手动操作按已保存的规则执行，无需先保存草稿。不记录或关闭定时清理时仍可手动清理。</p>
    <q-banner v-if="running" dense class="bg-blue-1 text-primary" role="status">清理正在后台运行…</q-banner>
    <q-banner v-if="job && ['SUCCEEDED', 'FAILED'].includes(job.state)" dense class="cleanup-result" role="status">
      已删除 {{ job.control.deleted || 0 }} 条记录、{{ job.control.deleted_events || 0 }} 条事件、{{ job.control.deleted_candidates || 0 }} 条候选；剩余 {{ job.control.remaining || 0 }} 条。
      <div>运行或活跃保护 {{ job.control.protected_active || 0 }} 条，导出保护 {{ job.control.protected_export || 0 }} 条。确认之后完成的新记录也会保留。</div>
    </q-banner>
    <q-btn v-if="job?.state === 'FAILED'" outline color="primary" label="继续未完成的清理" :disable="busy || running" @click="resume" />
    <q-banner v-if="error" dense class="text-negative" role="alert">{{ error }}<q-btn v-if="jobId" flat label="重新查询任务" @click="poll" /></q-banner>
    <q-dialog v-model="dialog" persistent>
      <q-card class="cleanup-confirm">
        <q-card-section><h3>{{ title }}</h3>
          <p v-if="preview?.scope === 'all_completed'">将删除当前全部已完成的识别记录、执行事件和候选明细，不受保留期限或筛选限制。</p>
          <p v-else>将按已保存的保留期限和条数上限，清理过期及超量的已完成历史。</p>
          <p>运行中的任务及受保护记录会跳过。不会删除缓存、人工纠正或密钥。</p>
          <p>预计可清理 <strong>{{ preview?.eligible }}</strong> 条，受保护或不在范围内 <strong>{{ preview?.protected }}</strong> 条。</p>
          <div v-if="error" class="text-negative" role="alert">{{ error }}</div>
        </q-card-section>
        <q-card-actions align="right"><q-btn flat label="取消" :disable="busy" @click="dialog = false" />
          <q-btn :color="preview?.scope === 'all_completed' ? 'negative' : 'primary'" :label="preview?.scope === 'all_completed' ? '清理所有记录' : '确认清理过期记录'" :loading="busy" @click="confirm" /></q-card-actions>
      </q-card>
    </q-dialog>
  </section>
</template>
<style scoped>
.cleanup-confirm { width: 520px; max-width: calc(100vw - 32px); }
h3 { font-size: 18px; font-weight: 650; margin: 0 0 16px; }
.cleanup-result { background: var(--primary-soft); color: var(--text-primary); }
.cleanup-actions--compact { width: 100%; }
.cleanup-actions--compact .row { flex-wrap: nowrap; }
.cleanup-actions--compact :deep(.q-btn) { padding-inline: 6px; font-size: 12px; }
</style>
