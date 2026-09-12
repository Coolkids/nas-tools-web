<template>
  <q-icon name="help_outline" class="help-tip" tabindex="0" role="img" aria-label="帮助说明">
    <q-tooltip class="help-tip-tooltip">{{ text }}</q-tooltip>
  </q-icon>
</template>

<script setup lang="ts">
defineProps<{ text?: string }>()
</script>

<style scoped>
.help-tip { margin-left: 4px; color: var(--text-secondary); cursor: help; vertical-align: middle; }
.help-tip:hover, .help-tip:focus-visible { color: var(--q-primary); outline: none; }
.help-tip-tooltip { max-width: 420px; white-space: pre-line; line-height: 1.6; }
</style>
