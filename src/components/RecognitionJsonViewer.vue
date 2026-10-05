<script setup lang="ts">
import { computed } from 'vue'
import VueJsonPretty from 'vue-json-pretty'
import 'vue-json-pretty/lib/styles.css'

defineOptions({ name: 'RecognitionJsonViewer' })

const props = defineProps<{
  value: unknown
}>()

const data = computed(() => props.value as string | number | boolean | unknown[] | Record<string, unknown> | null)
</script>

<template>
  <div class="json-viewer">
    <VueJsonPretty :data="data" :deep="1" :show-length="true" />
  </div>
</template>

<style scoped>
.json-viewer {
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  font-size: 12px;
}

.json-viewer :deep(.vjs-tree) {
  min-width: 0;
}

.json-viewer :deep(.vjs-tree-node) {
  align-items: flex-start;
  flex-wrap: wrap;
  line-height: 1.5;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.json-viewer :deep(.vjs-indent) {
  flex: 0 0 auto;
}

.json-viewer :deep(.vjs-key) {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: normal;
}

.json-viewer :deep(.vjs-tree-node > span:not(.vjs-key):not(.vjs-node-index):not(.vjs-tree-node-actions)) {
  flex: 1 1 120px;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
