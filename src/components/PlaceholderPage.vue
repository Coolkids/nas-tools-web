<script setup lang="ts">
defineProps<{ title?: string }>()
</script>

<template>
  <div class="page-placeholder">
    <q-card flat bordered class="placeholder-card">
      <q-card-section class="column items-center text-center q-pa-xl">
        <q-icon name="construction" size="52px" color="grey-5" />
        <div class="text-subtitle1 q-mt-md">{{ title ? `页面建设中：${title}` : '页面建设中' }}</div>
        <div class="text-caption text-grey-6 q-mt-xs">该功能将在后续迁移阶段开放</div>
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.placeholder-card { max-width: 680px; margin: 0 auto; border-radius: 16px; background: var(--surface); color: var(--text-primary); }
</style>
