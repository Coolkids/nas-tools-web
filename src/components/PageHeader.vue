<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <header class="page-header">
    <div class="header-copy">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-desc">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="header-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
.header-copy { min-width: 0; }
.page-title { margin: 0; color: var(--text-primary); font-size: 28px; line-height: 36px; font-weight: 600; }
.page-desc { margin: 4px 0 0; color: var(--text-secondary); font-size: 14px; line-height: 22px; }
.header-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-left: auto; }
@media (max-width: 599px) {
  .page-header { gap: 12px; margin-bottom: 20px; }
  .page-title { font-size: 24px; line-height: 32px; }
  .header-actions { width: 100%; justify-content: flex-start; }
  .header-actions :deep(.q-btn) { min-height: 44px; }
}
</style>
