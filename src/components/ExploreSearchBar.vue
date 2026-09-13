<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q || ''))
const scrolled = ref(false)
const searchInput = ref<{ focus?: () => void } | null>(null)
let scroller: HTMLElement | null = null

function updateScrollState() { scrolled.value = Boolean(scroller && scroller.scrollTop > 180) }
function submit() {
  const value = query.value.trim()
  void router.push(value ? { path: '/search', query: { q: value } } : { path: '/search' })
}
function revealSearch() {
  scroller?.scrollTo({ top: 0, behavior: 'smooth' })
  window.setTimeout(() => searchInput.value?.focus?.(), 220)
}

onMounted(() => {
  scroller = document.querySelector<HTMLElement>('.app-main')
  scroller?.addEventListener('scroll', updateScrollState, { passive: true })
  updateScrollState()
})
onBeforeUnmount(() => scroller?.removeEventListener('scroll', updateScrollState))
</script>

<template>
  <q-form class="explore-search-bar" @submit.prevent="submit">
    <q-input ref="searchInput" v-model="query" outlined dense clearable label="搜索媒体或资源" class="search-input">
      <template #prepend><q-icon name="search" /></template>
    </q-input>
    <q-btn color="primary" unelevated icon="search" label="查询" type="submit" />
  </q-form>
  <Transition name="search-reveal">
    <q-btn v-if="scrolled" outline color="primary" icon="search" label="查询" class="search-reveal-button" @click="revealSearch" />
  </Transition>
</template>

<style scoped>
.explore-search-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 18px; }
.search-input { width: min(520px, 100%); }
.search-reveal-button { display: none; position: fixed; top: calc(var(--app-header-height) + 12px); right: 16px; z-index: 20; background: var(--surface); }
.search-reveal-enter-active, .search-reveal-leave-active { transition: opacity .16s ease, transform .16s ease; }
.search-reveal-enter-from, .search-reveal-leave-to { opacity: 0; transform: translateY(-6px); }
@media (max-width: 599px) { .explore-search-bar { gap: 8px; margin-bottom: 14px; } .explore-search-bar .search-input { flex: 1; min-width: 0; } .explore-search-bar :deep(.q-btn) { min-height: 44px; } .search-reveal-button { display: inline-flex; } }
</style>
