<script setup lang="ts">
import {
  requestProgressActive,
  requestProgressDeterminate,
  requestProgressPercentage
} from '@/services/requestProgress'
</script>

<template>
  <div
    class="request-progress"
    :class="{ 'is-active': requestProgressActive }"
    role="progressbar"
    aria-label="页面加载中"
    :aria-valuemin="requestProgressDeterminate ? 0 : undefined"
    :aria-valuemax="requestProgressDeterminate ? 100 : undefined"
    :aria-valuenow="requestProgressDeterminate ? requestProgressPercentage : undefined"
  >
    <div
      class="request-progress__bar"
      :class="{ 'is-indeterminate': !requestProgressDeterminate }"
      :style="requestProgressDeterminate ? { width: `${requestProgressPercentage}%` } : undefined"
    />
  </div>
</template>
