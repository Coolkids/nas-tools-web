<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { getPageScrollTarget, getPageScrollTop, scrollPageToTop, type PageScrollTarget } from '@/utils/pageScroll'

const visible = ref(false)
let scroller: PageScrollTarget | null = null

function updateVisibility() { visible.value = Boolean(scroller && getPageScrollTop(scroller) > 360) }
function scrollToTop() { if (scroller) scrollPageToTop(scroller, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth') }

onMounted(() => {
  scroller = getPageScrollTarget()
  scroller.addEventListener('scroll', updateVisibility, { passive: true })
  updateVisibility()
})
onBeforeUnmount(() => scroller?.removeEventListener('scroll', updateVisibility))
</script>

<template>
  <Transition name="scroll-action">
    <q-btn v-if="visible" round unelevated color="primary" icon="vertical_align_top" class="scroll-to-top" aria-label="回到顶部" @click="scrollToTop">
      <q-tooltip>回到顶部</q-tooltip>
    </q-btn>
  </Transition>
</template>

<style scoped>
.scroll-to-top { position: fixed; right: 24px; bottom: calc(24px + var(--safe-bottom)); z-index: 20; width: 48px; height: 48px; box-shadow: 0 6px 16px rgba(23, 32, 51, .18); }
.scroll-action-enter-active, .scroll-action-leave-active { transition: opacity .16s ease, transform .16s ease; }
.scroll-action-enter-from, .scroll-action-leave-to { opacity: 0; transform: translateY(8px); }
@media (max-width: 599px) { .scroll-to-top { right: 16px; bottom: calc(76px + var(--safe-bottom)); } }
</style>
