import { ref, onMounted, onBeforeUnmount, watch, type Ref, type ComputedRef } from 'vue'
import { getRecommend, proxyDoubanImage, type RecommendItem } from '@/api/discovery'
import { useModalStore } from '@/stores/modal'

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
  const initializing = ref(false)
  const filterParams = ref<Record<string, string>>({})

  async function loadPage() {
    if (loading.value || noMore.value) return
    loading.value = true
    try {
      const cfg = typeCfg.value
      const params: Record<string, unknown> = { type: cfg.type, page: page.value }
      if (cfg.subtype) params.subtype = cfg.subtype
      if (cfg.week) params.week = cfg.week
      if (cfg.tmdbid) params.tmdbid = cfg.tmdbid
      if (cfg.personid) params.personid = cfg.personid
      if (cfg.keyword) params.keyword = cfg.keyword
      if (cfg.source) params.source = cfg.source
      const fp = filterParams.value
      if (Object.keys(fp).length) params.params = fp
      const res = await getRecommend(params as any)
      if (res.code === 0) {
        const list = res.Items || []
        if (list.length === 0) {
          noMore.value = true
        } else {
          items.value.push(...list)
          page.value += 1
        }
      } else {
        modal.error(res.msg || '加载失败')
        noMore.value = true
      }
    } catch (e) {
      modal.error(e instanceof Error ? e.message : '加载失败')
      noMore.value = true
    } finally {
      loading.value = false
    }
  }

  async function reset() {
    items.value = []
    page.value = 1
    noMore.value = false
    initializing.value = true
    for (let i = 0; i < 3; i++) {
      if (noMore.value) break
      await loadPage()
    }
    initializing.value = false
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
    if (loading.value || noMore.value) return
    const el = document.querySelector('.app-main')
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    if (scrollHeight - clientHeight - scrollTop < 300) loadPage()
  }

  function init() {
    reset()
    const el = document.querySelector('.app-main')
    if (el) el.addEventListener('scroll', onScroll, { passive: true })
  }

  function destroy() {
    const el = document.querySelector('.app-main')
    if (el) el.removeEventListener('scroll', onScroll)
  }

  if (watchDeps) {
    watch(watchDeps, () => reset())
  }

  return {
    items, page, loading, noMore, initializing, filterParams,
    loadPage, reset, setFilter, currentFilterLabel, onFavChange,
    onScroll, init, destroy, proxyDoubanImage
  }
}
