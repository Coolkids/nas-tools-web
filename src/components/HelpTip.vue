<template>
  <q-icon
    name="help_outline"
    class="help-tip"
    tabindex="0"
    role="button"
    aria-label="查看帮助说明"
    aria-haspopup="dialog"
    :aria-expanded="mobileVisible"
    @click.stop="openHelp"
    @keydown.enter.prevent="openHelp"
    @keydown.space.prevent="openHelp"
  >
    <q-tooltip v-if="!$q.screen.lt.sm" class="help-tip-tooltip">{{ text }}</q-tooltip>
  </q-icon>

  <q-dialog v-model="mobileVisible" position="bottom">
    <q-card class="help-tip-dialog">
      <q-card-section class="row items-center no-wrap">
        <div class="text-subtitle1 text-weight-medium">设置说明</div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="关闭说明" @click="mobileVisible = false" />
      </q-card-section>
      <q-separator />
      <q-card-section class="help-tip-content">{{ text }}</q-card-section>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useQuasar } from 'quasar'

defineProps<{ text?: string }>()

const $q = useQuasar()
const mobileVisible = ref(false)

function openHelp() {
  if ($q.screen.lt.sm) mobileVisible.value = true
}
</script>

<style scoped>
.help-tip { margin-left: 4px; color: var(--text-secondary); cursor: help; vertical-align: middle; }
.help-tip:hover, .help-tip:focus-visible { color: var(--q-primary); outline: none; }
.help-tip-tooltip { max-width: 420px; white-space: pre-line; line-height: 1.6; }
.help-tip-dialog { width: min(calc(100vw - 24px), 480px); margin: 0 12px 12px; border-radius: 16px; }
.help-tip-content { color: var(--text-secondary); white-space: pre-line; line-height: 1.7; }

@media (min-width: 600px) {
  .help-tip-dialog { display: none; }
}
</style>
