<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import PageHeader from '@/components/PageHeader.vue'
import MediaCard from '@/components/MediaCard.vue'
import ExploreSearchBar from '@/components/ExploreSearchBar.vue'
import ScrollToTop from '@/components/ScrollToTop.vue'
import { useDiscovery, type FilterField, type TypeConfig } from '@/composables/useDiscovery'

const props = withDefaults(defineProps<{
  typeConfig: TypeConfig
  filters?: Record<string, FilterField>
  showTabs?: boolean
}>(), { filters: () => ({}), showTabs: true })

const route = useRoute()
const router = useRouter()
const $q = useQuasar()
const isPhone = computed(() => $q.screen.lt.sm)
const tabs = [
  { label: '推荐', name: 'recommend' },
  { label: '豆瓣电影', name: 'douban_movie' },
  { label: '豆瓣剧集', name: 'douban_tv' },
  { label: 'TMDB电影', name: 'tmdb_movie' },
  { label: 'TMDB剧集', name: 'tmdb_tv' }
]
const activeTab = computed(() => String(route.name || ''))
const filterEntries = computed(() => Object.entries(props.filters || {}))
const cfgRef = computed(() => props.typeConfig)
const { items, loading, noMore, loadError, initializing, filterParams, setFilter, currentFilterLabel, loadPage, onFavChange, proxyDoubanImage, reset, init, destroy } = useDiscovery(cfgRef)

function switchTab(name: string) {
  if (name !== activeTab.value) void router.push({ name })
}

async function onPullRefresh(done: () => void) {
  try {
    await reset()
  } finally {
    done()
  }
}

onMounted(init)
onBeforeUnmount(destroy)
</script>

<template>
  <q-pull-to-refresh :disable="!isPhone" @refresh="onPullRefresh">
    <div class="catalog-page">
      <ExploreSearchBar>
        <template #filters>
          <q-btn-dropdown v-for="[key, field] in filterEntries" :key="key" outline :label="currentFilterLabel(key, field)" icon-right="expand_more">
            <q-list>
              <q-item v-for="option in field.options" :key="option.value" v-close-popup clickable :active="filterParams[key] === option.value" active-class="filter-option--active" @click="setFilter(key, option.value)">
                <q-item-section>{{ option.label }}</q-item-section>
                <q-item-section v-if="filterParams[key] === option.value" side><q-icon name="check" color="primary" /></q-item-section>
              </q-item>
            </q-list>
          </q-btn-dropdown>
        </template>
      </ExploreSearchBar>
      <PageHeader :title="typeConfig.title" :description="typeConfig.subtitle || '按分类浏览媒体内容'">
        <template #actions>
          <q-tabs v-if="showTabs" :model-value="activeTab" dense no-caps inline-label active-color="primary" indicator-color="primary" class="catalog-tabs" @update:model-value="switchTab">
            <q-route-tab v-for="tab in tabs" :key="tab.name" :name="tab.name" :to="{ name: tab.name }" :label="tab.label" />
          </q-tabs>
        </template>
      </PageHeader>

      <div v-if="initializing && !items.length" class="loading-state"><q-spinner-orbit color="primary" size="42px" /><span>正在加载媒体…</span></div>
      <div v-else-if="!loading && !items.length && loadError" class="empty-state"><q-icon name="error_outline" size="48px" color="negative" /><span>{{ loadError }}</span><q-btn outline color="primary" label="重试" @click="loadPage" /></div>
      <div v-else-if="!loading && !items.length" class="empty-state"><q-icon name="movie_filter" size="48px" color="grey-5" /><span>暂无可展示的媒体</span></div>
      <div v-else class="media-grid">
        <MediaCard v-for="(item, index) in items" :key="`${item.id}-${index}`" :tmdb-id="item.id" :title="item.title" :image="proxyDoubanImage(item.image)" :fav="item.fav" :vote="item.vote" :year="item.year" :overview="item.overview" :date="item.date" :media-type="item.type" :res-type="item.media_type" show-sub="1" :site="item.site" :weekday="item.weekday" @fav-change="onFavChange(index, $event)" />
      </div>

      <div v-if="loadError && items.length" class="load-tip load-error"><q-icon name="error_outline" size="18px" color="negative" /><span>{{ loadError }}</span><q-btn flat dense color="primary" label="重试" @click="loadPage" /></div>
      <div v-else-if="loading && items.length" class="load-tip"><q-spinner-dots color="primary" size="24px" /><span>加载更多…</span></div>
      <div v-else-if="noMore && items.length" class="load-tip"><q-icon name="done" size="18px" /><span>已经到底了</span></div>
      <ScrollToTop />
    </div>
  </q-pull-to-refresh>
</template>

<style scoped>
.catalog-page { max-width: 1600px; margin: 0 auto; }
.catalog-tabs { max-width: min(720px, 100%); }
.catalog-tabs :deep(.q-tab) { min-height: 42px; padding-inline: 12px; }
.media-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; }
.loading-state, .empty-state, .load-tip { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: var(--text-secondary); font-size: 13px; }
.loading-state { min-height: 360px; }
.empty-state { min-height: 280px; }
.load-tip { flex-direction: row; padding: 28px 0 8px; }
:deep(.filter-option--active) { color: var(--q-primary); background: var(--primary-soft); }
@media (max-width: 1023px) { .media-grid { grid-template-columns: repeat(auto-fill, minmax(144px, 1fr)); gap: 12px; } }
@media (max-width: 599px) { .catalog-tabs { width: 100%; overflow: auto; } .catalog-tabs :deep(.q-tabs__content) { justify-content: flex-start; } .catalog-tabs :deep(.q-tab) { padding-inline: 8px; font-size: 12px; } .media-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; } }
</style>
