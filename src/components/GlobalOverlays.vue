<script setup lang="ts">
import { useModalStore } from '@/stores/modal'

const modal = useModalStore()
</script>

<template>
  <q-inner-loading :showing="modal.loading" class="global-loading" label="处理中...">
    <q-spinner-orbit color="primary" size="42px" />
    <div class="global-loading-text">{{ modal.loadingText }}</div>
  </q-inner-loading>

  <q-dialog v-model="modal.progressVisible" persistent>
    <q-card class="progress-card">
      <q-card-section class="text-h6">处理中</q-card-section>
      <q-card-section>
        <q-linear-progress rounded size="12px" :value="modal.progressValue / 100" color="primary" />
        <div v-if="modal.progressText" class="progress-text">{{ modal.progressText }}</div>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.global-loading { z-index: 3000; background: color-mix(in srgb, var(--page-bg) 72%, transparent); }
.global-loading-text { margin-top: 12px; color: var(--text-primary); font-size: 14px; }
.progress-card { width: min(420px, calc(100vw - 32px)); border-radius: 16px; }
.progress-text { margin-top: 12px; color: var(--text-secondary); font-size: 13px; }
</style>
