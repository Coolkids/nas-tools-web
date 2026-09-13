import { ref, onMounted, onBeforeUnmount, watch, type Ref, type ComputedRef } from 'vue'
import { getRecommend, proxyDoubanImage, type RecommendItem } from '@/api/discovery'
import { useModalStore } from '@/stores/modal'
import { getPageScrollClientHeight, getPageScrollHeight, getPageScrollTarget, getPageScrollTop, type PageScrollTarget } from '@/utils/pageScroll'

export const DISCOVERY_INITIAL_PAGES = 5
export const DISCOVERY_MAX_PAGE = 20

export interface TypeConfig {
  type: string
  subtype?: string
  title: string
  subtitle?: string
  week?: string
  tmdbid?: string
  personid?: string
  keyword?: string
  source?: string
}

export interface FilterField {
  name: string
  options: Array<{ label: string; value: string }>
}

export function useDiscovery(
  typeCfg: Ref<TypeConfig> | ComputedRef<TypeConfig>,
  watchDeps?: any[]
) {
  const modal = useModalStore()
  const items = ref<RecommendItem[]>([])
  const page = ref(1)
  const loading = ref(false)
  const noMore = ref(false)
  const loadError = ref('')
  const initializing = ref(false)
  const filterParams = ref<Record<string, string>>({})
  let scrollTarget: PageScrollTarget | null = null
  let generation = 0
  let activeLoad: Promise<void> | null = null

  async function loadPage() {
    if (loading.value || noMore.value) return
    if (page.value > DISCOVERY_MAX_PAGE) {
      noMore.value = true
      return
    }
    const requestGeneration = generation
    const requestedPage = page.value
    loading.value = true
    const request = (async () => {
      try {
        const cfg = typeCfg.value
        const params: Record<string, unknown> = { type: cfg.type, page: requestedPage }
        if (cfg.subtype) params.subtype = cfg.subtype
        if (cfg.week) params.week = cfg.week
        if (cfg.tmdbid) params.tmdbid = cfg.tmdbid
        if (cfg.personid) params.personid = cfg.personid
        if (cfg.keyword) params.keyword = cfg.keyword
        if (cfg.source) params.source = cfg.source
        const fp = filterParams.value
        if (Object.keys(fp).length) params.params = fp
        const res = await getRecommend(params as any)
        if (requestGeneration !== generation) return
        if (res.code === 0) {
          loadError.value = ''
          const list = res.Items || []
          if (list.length === 0) noMore.value = true
          else {
            items.value.push(...list)
            page.value = requestedPage + 1
            if (requestedPage >= DISCOVERY_MAX_PAGE) noMore.value = true
          }
        } else {
          loadError.value = res.msg || '加载失败'
          modal.error(loadError.value)
        }
      } catch (e) {
        if (requestGeneration !== generation) return
        loadError.value = e instanceof Error ? e.message : '加载失败'
        modal.error(loadError.value)
      }
    })()
    activeLoad = request
    try {
      await request
    } finally {
      if (activeLoad === request) activeLoad = null
      loading.value = false
    }
  }

  async function reset() {
    const resetGeneration = ++generation
    if (activeLoad) await activeLoad
    if (resetGeneration !== generation) return
    items.value = []
    page.value = 1
    noMore.value = false
    loadError.value = ''
    initializing.value = true
    while (
      resetGeneration === generation &&
      !noMore.value &&
      page.value <= DISCOVERY_INITIAL_PAGES
    ) {
      await loadPage()
    }
    if (resetGeneration === generation) initializing.value = false
  }

  function setFilter(key: string, value: string) {
    filterParams.value = { ...filterParams.value, [key]: value }
    reset()
  }

  function currentFilterLabel(fieldId: string, field: FilterField): string {
    const v = filterParams.value[fieldId]
    if (v === undefined || v === null) return field.name
    const opt = field.options.find((o) => o.value === v)
    return opt ? opt.label : v
  }

  function onFavChange(idx: number, fav: string) {
    if (items.value[idx]) items.value[idx].fav = fav
  }

  function onScroll() {
    if (initializing.value || loading.value || noMore.value || loadError.value) return
    const target = scrollTarget || getPageScrollTarget()
    const scrollTop = getPageScrollTop(target)
    const scrollHeight = getPageScrollHeight(target)
    const clientHeight = getPageScrollClientHeight(target)
    if (scrollHeight - clientHeight - scrollTop < 300) loadPage()
  }

  function init() {
    void reset()
    scrollTarget = getPageScrollTarget()
    scrollTarget.addEventListener('scroll', onScroll, { passive: true })
  }

  function destroy() {
    generation += 1
    scrollTarget?.removeEventListener('scroll', onScroll)
    scrollTarget = null
  }

  if (watchDeps) {
    watch(watchDeps, () => reset())
  }

  return {
    items, page, loading, noMore, initializing, filterParams,
    loadError,
    loadPage, reset, setFilter, currentFilterLabel, onFavChange,
    onScroll, init, destroy, proxyDoubanImage
  }
}
