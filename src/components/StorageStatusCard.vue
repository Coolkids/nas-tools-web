<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title: string
  subtitle?: string
  status: 'ok' | 'warning' | 'error' | 'unknown'
  statusLabel: string
  icon?: string
}>(), { icon: 'storage' })

const badgeColor = computed(() => ({
  ok: 'positive', warning: 'warning', error: 'negative', unknown: 'grey'
}[props.status]))
</script>

<template>
  <q-card flat bordered class="storage-status-card">
    <div class="storage-status-main">
      <div class="storage-status-icon" :class="`is-${status}`">
        <q-icon :name="icon" size="24px" />
      </div>
      <div class="storage-status-copy">
        <strong>{{ title }}</strong>
        <span v-if="subtitle">{{ subtitle }}</span>
      </div>
      <q-badge :color="badgeColor" :label="statusLabel" />
    </div>
    <slot name="details" />
    <slot name="notice" />
  </q-card>
</template>

<style scoped>
.storage-status-card { border-color: var(--border-subtle); border-radius: 16px; background: var(--surface); box-shadow: 0 3px 14px rgb(15 23 42 / 4%); }
.storage-status-main { display: flex; align-items: center; gap: 14px; }
.storage-status-icon { width: 46px; height: 46px; flex: 0 0 46px; display: grid; place-items: center; border-radius: 14px; color: var(--q-positive); background: color-mix(in srgb, var(--q-positive) 12%, var(--surface)); }
.storage-status-icon.is-warning { color: var(--q-warning); background: color-mix(in srgb, var(--q-warning) 14%, var(--surface)); }
.storage-status-icon.is-error { color: var(--q-negative); background: color-mix(in srgb, var(--q-negative) 12%, var(--surface)); }
.storage-status-icon.is-unknown { color: var(--text-secondary); background: color-mix(in srgb, var(--text-secondary) 10%, var(--surface)); }
.storage-status-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 3px; overflow-wrap: anywhere; }
.storage-status-copy span { color: var(--text-secondary); font-size: 12px; }
</style>
