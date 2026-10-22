<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { durationInUnit, durationUnits, formatDuration, MAX_DURATION_SECONDS, preferredDurationUnit,
  toDurationSeconds, type DurationUnit } from '@/utils/duration'

const props = withDefaults(defineProps<{
  modelValue: number; label: string; allowForever?: boolean; min?: number; max?: number; disable?: boolean
}>(), { allowForever: false, min: 1, max: MAX_DURATION_SECONDS, disable: false })
const emit = defineEmits<{ 'update:modelValue': [number]; validity: [string | null] }>()
const unit = ref<DurationUnit | 'forever'>('second')
const value = ref('')
const error = ref('')
const lastFinite = ref(3600)
let lastEmitted: number | undefined
const options = computed(() => [...durationUnits.map(({ label, value }) => ({ label, value })),
  ...(props.allowForever ? [{ label: '不过期', value: 'forever' }] : [])])
const actual = computed(() => formatDuration(props.modelValue, props.allowForever))

function valid(message: string | null) {
  error.value = message || ''
  emit('validity', message)
}
function update(seconds: number) {
  lastEmitted = seconds
  emit('update:modelValue', seconds)
  valid(null)
}
function edit(raw: string | number | null) {
  value.value = raw === null ? '' : String(raw)
  try {
    const seconds = toDurationSeconds(value.value, unit.value as DurationUnit, props.min, props.max)
    lastFinite.value = seconds
    update(seconds)
  } catch (cause) { valid((cause as Error).message) }
}
function changeUnit(next: DurationUnit | 'forever') {
  if (next === 'forever') {
    if (props.modelValue > 0) lastFinite.value = props.modelValue
    unit.value = next
    update(0)
  } else {
    const seconds = unit.value === 'forever' ? lastFinite.value : props.modelValue
    unit.value = next
    value.value = durationInUnit(seconds, next)
    update(seconds)
  }
}
watch(() => props.modelValue, seconds => {
  if (seconds === lastEmitted) return
  if (props.allowForever && seconds === 0) { unit.value = 'forever'; value.value = ''; valid(null); return }
  lastFinite.value = seconds
  unit.value = preferredDurationUnit(seconds)
  value.value = durationInUnit(seconds, unit.value)
  try { toDurationSeconds(String(seconds), 'second', props.min, props.max); valid(null) }
  catch (cause) { valid((cause as Error).message) }
}, { immediate: true })
</script>

<template>
  <div class="duration-input" :data-duration-label="label">
    <div class="duration-input__fields" :class="{ 'duration-input__fields--forever': unit === 'forever' }">
      <q-input v-if="unit !== 'forever'" :model-value="value" :label="label" outlined dense type="number"
        step="any" :disable="disable" :error="Boolean(error)" :error-message="error" hide-bottom-space
        @update:model-value="edit" />
      <q-select :model-value="unit" label="单位" :aria-label="`${label}单位`" outlined dense emit-value map-options
        :options="options" :disable="disable" @update:model-value="changeUnit" />
    </div>
    <div class="duration-input__hint">{{ unit === 'forever' ? '不过期；内存缓存仍会在重启后清空。' : `实际时长：${actual}` }}</div>
  </div>
</template>

<style scoped>
.duration-input { min-width: 0; }
.duration-input__fields { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 8px; }
.duration-input__fields--forever { grid-template-columns: 1fr; }
.duration-input__hint { color: var(--text-secondary); font-size: 12px; margin-top: 5px; }
</style>
