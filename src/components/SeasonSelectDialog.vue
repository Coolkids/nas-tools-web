<script setup lang="ts">
import { computed, ref } from 'vue'
import type { TvSeason } from '@/api/discovery'

const props = defineProps<{
  modelValue: boolean
  seasons: TvSeason[]
  title: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'confirm', seasons: number[]): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const selected = ref<number[]>([])

function onOpen() {
  if (props.seasons.length > 0) {
    selected.value = [props.seasons[0].num]
  }
}

function onConfirm() {
  if (selected.value.length === 0) return
  emit('confirm', selected.value)
  visible.value = false
}
</script>

<template>
  <el-dialog
    v-model="visible"
    title="选择订阅季"
    width="400px"
    :close-on-click-modal="false"
    append-to-body
    @open="onOpen"
  >
    <p style="margin-bottom: 12px; color: var(--el-text-color-secondary);">
      为「{{ title }}」选择要订阅的季：
    </p>
    <el-checkbox-group v-model="selected">
      <div v-for="s in seasons" :key="s.num" style="margin: 6px 0;">
        <el-checkbox :value="s.num" :label="s.text" />
      </div>
    </el-checkbox-group>
    <p v-if="selected.length === 0" style="color: var(--el-color-danger); font-size: 12px; margin-top: 4px;">
      请至少选择一季
    </p>

    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :disabled="selected.length === 0" @click="onConfirm">
        订阅 ({{ selected.length }})
      </el-button>
    </template>
  </el-dialog>
</template>
