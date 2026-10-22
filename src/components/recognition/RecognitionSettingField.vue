<script setup lang="ts">
import { computed, ref } from 'vue'
import DurationInput from '@/components/settings/DurationInput.vue'
import type { SettingsField } from './settingsFields'
const props = defineProps<{ field: SettingsField; modelValue: unknown; error?: string; disable?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [unknown]; validity: [string | null] }>()
const lastFinite = ref(1000)
const numeric = computed(() => ['integer', 'number', 'nullable'].includes(props.field.kind))
function input(value: string | number | null) {
  if (numeric.value && value !== null && value !== '') {
    const number = Number(value)
    if (Number.isFinite(number)) { lastFinite.value = number; emit('update:modelValue', number); return }
  }
  emit('update:modelValue', value === null ? '' : value)
}
function unlimited(value: boolean) {
  if (value && typeof props.modelValue === 'number') lastFinite.value = props.modelValue
  emit('update:modelValue', value ? null : lastFinite.value)
}
</script>
<template>
  <div class="recognition-field" :class="{ 'recognition-field--wide': field.kind === 'url' }" :data-field="field.path">
    <q-toggle v-if="field.kind === 'boolean'" :model-value="Boolean(modelValue)" :label="field.label" :disable="disable"
      color="primary" @update:model-value="emit('update:modelValue', $event)" />
    <q-select v-else-if="field.kind === 'select'" :model-value="modelValue" :options="field.choices" :label="field.label" outlined dense
      emit-value map-options :disable="disable" :error="Boolean(error)" :error-message="error" hide-bottom-space @update:model-value="emit('update:modelValue', $event)" />
    <DurationInput v-else-if="field.kind === 'duration'" :model-value="Number(modelValue)" :label="field.label" :min="field.min" :allow-forever="field.allowForever"
      :disable="disable" @update:model-value="emit('update:modelValue', $event)" @validity="emit('validity', $event)" />
    <template v-else>
      <q-input :model-value="modelValue === null ? '' : String(modelValue ?? '')" :label="field.label" outlined dense
        :type="numeric ? 'number' : 'text'" :step="field.kind === 'number' ? 'any' : 1" :min="field.min" :max="field.max"
        :disable="disable || field.kind === 'nullable' && modelValue === null" :error="Boolean(error)" :error-message="error" hide-bottom-space @update:model-value="input" />
      <q-checkbox v-if="field.kind === 'nullable'" :model-value="modelValue === null" :label="field.unlimitedLabel || '不限时'" :disable="disable" dense class="q-mt-sm" @update:model-value="unlimited" />
    </template>
    <div v-if="field.help" class="field-help">{{ field.help }}</div>
    <div v-if="field.kind === 'boolean' && error" class="text-negative" role="alert">{{ error }}</div>
  </div>
</template>
<style scoped>
.recognition-field { min-width: 0; }
.field-help { color: var(--text-secondary); font-size: 12px; line-height: 1.6; margin-top: 6px; }
</style>
