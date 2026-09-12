<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TvSeason } from '@/api/discovery'

const props = defineProps<{ modelValue: boolean; seasons: TvSeason[]; title: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void; (event: 'confirm', seasons: number[]): void }>()
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) })
const selected = ref<number[]>([])
const options = computed(() => props.seasons.map((season) => ({ label: season.text, value: season.num })))
function onOpen() { selected.value = props.seasons.length ? [props.seasons[0].num] : [] }
function onConfirm() { if (!selected.value.length) return; emit('confirm', selected.value); visible.value = false }
</script>

<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" @before-show="onOpen">
    <q-card class="season-dialog"><q-card-section class="row items-center"><div class="text-h6">选择订阅季</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
      <q-card-section><div class="text-body2 text-secondary">为「{{ title }}」选择要订阅的季：</div><q-option-group v-model="selected" type="checkbox" :options="options" color="primary" class="season-options" /><div v-if="!selected.length" class="text-caption text-negative q-mt-sm">请至少选择一季</div></q-card-section><q-separator />
      <q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" v-close-popup /><q-btn color="primary" unelevated :disable="!selected.length" :label="`订阅 (${selected.length})`" @click="onConfirm" /></q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.season-dialog { width: min(420px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.season-options { display: grid; gap: 8px; margin-top: 16px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .season-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
