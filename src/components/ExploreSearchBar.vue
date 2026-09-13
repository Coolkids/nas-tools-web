<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getPageScrollTarget, getPageScrollTop, type PageScrollTarget } from '@/utils/pageScroll'

const route = useRoute()
const router = useRouter()
const query = ref(String(route.query.q || ''))
const scrolled = ref(false)
const conditionsExpanded = ref(false)
let scroller: PageScrollTarget | null = null

function updateScrollState() { scrolled.value = Boolean(scroller && getPageScrollTop(scroller) > 180) }
function submit() {
  const value = query.value.trim()
  void router.push(value ? { path: '/search', query: { q: value } } : { path: '/search' })
}
function revealConditions() { conditionsExpanded.value = true }
function closeConditions() { conditionsExpanded.value = false }

watch(() => route.query.q, (value) => {
  query.value = String(value || '')
})

watch(scrolled, (value) => {
  if (!value) closeConditions()
})

onMounted(() => {
  scroller = getPageScrollTarget()
  scroller.addEventListener('scroll', updateScrollState, { passive: true })
  updateScrollState()
})
onBeforeUnmount(() => scroller?.removeEventListener('scroll', updateScrollState))
</script>

<template>
  <q-form class="explore-search-bar" @submit.prevent="submit">
    <q-input v-model="query" outlined dense clearable label="搜索媒体或资源" class="search-input">
      <template #prepend><q-icon name="search" /></template>
    </q-input>
    <q-btn color="primary" unelevated icon="search" label="查询" type="submit" />
    <div v-if="$slots.filters" class="explore-filters"><slot name="filters" /></div>
  </q-form>
  <Transition name="search-reveal">
    <q-btn v-if="scrolled && !conditionsExpanded && $slots.filters" round unelevated color="primary" icon="search" class="search-reveal-button" aria-label="展开筛选条件" @click="revealConditions">
      <q-tooltip>展开筛选条件</q-tooltip>
    </q-btn>
  </Transition>
  <Transition name="search-panel">
    <q-card v-if="conditionsExpanded && $slots.filters" flat bordered class="search-condition-panel">
      <q-card-section class="search-condition-heading">
        <span>筛选条件</span>
        <q-btn flat round dense icon="close" aria-label="关闭筛选条件" @click="closeConditions" />
      </q-card-section>
      <div class="search-condition-filters"><slot name="filters" /></div>
    </q-card>
  </Transition>
</template>

<style scoped>
.explore-search-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.search-input { width: min(520px, 100%); }
.explore-filters, .search-condition-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.search-reveal-button { position: fixed; top: calc(var(--app-header-height) + 12px); right: 24px; z-index: 20; box-shadow: 0 4px 12px rgba(23, 32, 51, .18); }
.search-condition-panel { position: fixed; top: calc(var(--app-header-height) + 12px); right: 24px; z-index: 30; width: min(620px, calc(100vw - 48px)); background: var(--surface); border-color: var(--border-subtle); box-shadow: 0 12px 32px rgba(23, 32, 51, .2); }
.search-condition-heading { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; color: var(--text-primary); font-size: 15px; font-weight: 600; }
.search-condition-filters { padding: 0 16px 16px; }
.search-reveal-enter-active, .search-reveal-leave-active { transition: opacity .16s ease, transform .16s ease; }
.search-reveal-enter-from, .search-reveal-leave-to { opacity: 0; transform: translateY(-6px); }
.search-panel-enter-active, .search-panel-leave-active { transition: opacity .16s ease, transform .16s ease; }
.search-panel-enter-from, .search-panel-leave-to { opacity: 0; transform: translateY(-8px); }
@media (max-width: 599px) { .explore-search-bar { gap: 8px; margin-bottom: 14px; } .explore-search-bar .search-input { flex: 1; min-width: 0; } .explore-search-bar :deep(.q-btn) { min-height: 44px; } .search-reveal-button { top: calc(var(--app-header-height) + 8px); right: 16px; } .search-condition-panel { top: calc(var(--app-header-height) + 8px); right: 16px; width: calc(100vw - 32px); } .search-condition-filters { padding: 0 12px 12px; } }
</style>
