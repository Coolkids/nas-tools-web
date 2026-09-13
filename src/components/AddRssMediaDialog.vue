<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import HelpTip from '@/components/HelpTip.vue'
import { addRssMedia, getRssSites, getIndexers, getRssDetail, type AddRssMediaParams, type RssSiteItem, type IndexerItem } from '@/api/rss'
import { getDownloadDirs, getDownloadSettings, type DownloadSettingOption } from '@/api/download'

const props = defineProps<{
  modelValue: boolean
  type: 'MOV' | 'TV'
  rssid?: string | number
  initialName?: string
  initialYear?: string
  initialKeyword?: string
  initialSeason?: string
  initialTotalEp?: string
  initialCurrentEp?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
  (e: 'error', msg: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const searchToggleLabel = computed(() =>
  searchSitesSelected.value.length === searchSites.value.length ? '全不选' : '全选'
)

const RESTYPE_OPTIONS = ['BLURAY', 'REMUX', 'DOLBY', 'WEB', 'HDTV', 'UHD', 'HDR', '3D']
const PIX_OPTIONS = ['8k', '4k', '1080p', '720p']
const SEASON_OPTIONS = Array.from({ length: 50 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0')
  return { value: `${n}`, label: `第${i + 1}季` }
})

const form = reactive({
  name: '',
  year: '',
  keyword: '',
  season: '',
  fuzzy_match: false,
  over_edition: false,
  total_ep: '',
  current_ep: '',
  filter_restype: '',
  filter_pix: '',
  filter_team: '',
  filter_rule: '' as string | number,
  download_setting: '' as string | number,
  save_path: ''
})

const rssSites = ref<RssSiteItem[]>([])
const searchSites = ref<IndexerItem[]>([])
const rssSitesSelected = ref<string[]>([])
const searchSitesSelected = ref<string[]>([])
const downloadSettings = ref<DownloadSettingOption[]>([])
const savePaths = ref<string[]>([])
const ruleGroups = ref<Array<{ id: number | string; name: string }>>([])
const optionsLoading = ref(false)
const submitting = ref(false)

const restypeOptions = [{ label: '全部', value: '' }, ...RESTYPE_OPTIONS.map((value) => ({ label: value, value }))]
const pixOptions = [{ label: '全部', value: '' }, ...PIX_OPTIONS.map((value) => ({ label: value, value }))]
const seasonOptions = SEASON_OPTIONS
const ruleOptions = computed(() => [
  { label: '站点/默认规则', value: '' },
  ...ruleGroups.value.map((rule) => ({ label: rule.name, value: rule.id }))
])
const downloadSettingOptions = computed(() => [
  { label: '站点设置', value: '' },
  ...downloadSettings.value.map((setting) => ({ label: setting.name, value: setting.id }))
])
const savePathOptions = computed(() => [
  { label: '自动', value: '' },
  ...savePaths.value.map((path) => ({ label: path, value: path }))
])

const storageKey = computed(() => (props.type === 'MOV' ? 'RssSettingMOV' : 'RssSettingTV'))

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    resetForm()
    await loadOptions()
    if (props.rssid) {
      await loadEditDetail()
    } else {
      await loadSaved()
      if (props.initialName) form.name = props.initialName
      if (props.initialKeyword) form.keyword = props.initialKeyword
      if (props.initialYear) form.year = props.initialYear
      if (props.initialSeason) form.season = props.initialSeason
      if (props.initialTotalEp) form.total_ep = props.initialTotalEp
      if (props.initialCurrentEp) form.current_ep = props.initialCurrentEp
    }
  }
)

async function loadEditDetail() {
  if (!props.rssid) return
  try {
    const res = await getRssDetail(props.rssid, props.type)
    if (res.code !== 0 || !res.detail) return
    const d = res.detail
    form.name = d.name || ''
    form.year = d.year || ''
    form.keyword = d.keyword || ''
    form.season = (d.season || '').replace(/^S/, '')
    form.fuzzy_match = !!d.fuzzy_match
    form.over_edition = !!d.over_edition
    form.total_ep = String(d.total_ep ?? '')
    form.current_ep = String(d.current_ep ?? '')
    form.filter_restype = d.filter_restype || ''
    form.filter_pix = d.filter_pix || ''
    form.filter_team = d.filter_team || ''
    form.filter_rule = d.filter_rule || ''
    form.download_setting = d.download_setting ?? ''
    if (form.download_setting) await fetchSavePaths(form.download_setting)
    form.save_path = d.save_path || ''
    rssSitesSelected.value = d.rss_sites?.length ? d.rss_sites : rssSites.value.map((s) => s.name)
    searchSitesSelected.value = d.search_sites?.length ? d.search_sites : searchSites.value.map((s) => s.name)
  } catch {
    /* ignore */
  }
}

function resetForm() {
  form.name = ''
  form.year = ''
  form.keyword = ''
  form.season = ''
  form.fuzzy_match = false
  form.over_edition = false
  form.total_ep = ''
  form.current_ep = ''
  form.filter_restype = ''
  form.filter_pix = ''
  form.filter_team = ''
  form.filter_rule = ''
  form.download_setting = ''
  form.save_path = ''
  rssSitesSelected.value = []
  searchSitesSelected.value = []
  savePaths.value = []
}

async function loadOptions() {
  optionsLoading.value = true
  try {
    const [rssRes, idxRes, dsRes, ruleRes] = await Promise.all([
      getRssSites(),
      getIndexers(),
      getDownloadSettings(),
      (await import('@/api/request')).doAction<{
        code: number
        ruleGroups?: Array<{ id: number | string; name: string }>
        initRules?: Array<{ id: number | string; name: string }>
      }>('get_filterrules', {})
    ])
    if (rssRes.code === 0) rssSites.value = rssRes.sites || []
    if (idxRes.code === 0) searchSites.value = idxRes.indexers || []
    if (dsRes.code === 0) downloadSettings.value = dsRes.data || []
    if (ruleRes.code === 0) {
      // 内置规则位于 initRules，编辑已有订阅时也需要将它们作为选项加载，
      // 否则 Quasar 会回退为显示规则 ID。
      ruleGroups.value = [...(ruleRes.initRules || []), ...(ruleRes.ruleGroups || [])]
    }
  } catch {
    /* ignore */
  } finally {
    optionsLoading.value = false
  }
}

async function loadSaved() {
  try {
    const raw = localStorage.getItem(storageKey.value)
    if (!raw) return
    const saved = JSON.parse(raw) as Partial<typeof form> & { rss_sites?: string[]; search_sites?: string[] }
    form.filter_restype = saved.filter_restype ?? ''
    form.filter_pix = saved.filter_pix ?? ''
    form.filter_team = saved.filter_team ?? ''
    form.filter_rule = saved.filter_rule ?? ''
    form.download_setting = saved.download_setting ?? ''
    if (form.download_setting) await fetchSavePaths(form.download_setting)
    form.save_path = saved.save_path ?? ''
    rssSitesSelected.value = saved.rss_sites?.length ? saved.rss_sites : rssSites.value.map((s) => s.name)
    searchSitesSelected.value = saved.search_sites?.length ? saved.search_sites : searchSites.value.map((s) => s.name)
  } catch {
    /* ignore */
  }
}

async function fetchSavePaths(sid: string | number) {
  if (!sid) {
    savePaths.value = []
    return
  }
  try {
    const res = await getDownloadDirs(sid)
    if (res.code === 0) savePaths.value = res.paths || []
  } catch {
    savePaths.value = []
  }
}

async function onDownloadSettingChange(val: string | number) {
  form.save_path = ''
  await fetchSavePaths(val)
}

function toggleAllRssSites() {
  rssSitesSelected.value = rssSites.value.map((s) => s.name)
}

function toggleAllSearchSites() {
  if (searchSitesSelected.value.length === searchSites.value.length) {
    searchSitesSelected.value = []
  } else {
    searchSitesSelected.value = searchSites.value.map((s) => s.name)
  }
}

function invertSearchSites() {
  const all = searchSites.value.map((s) => s.name)
  searchSitesSelected.value = all.filter((name) => !searchSitesSelected.value.includes(name))
}

function toggleSearchSite(name: string) {
  searchSitesSelected.value = searchSitesSelected.value.includes(name)
    ? searchSitesSelected.value.filter((selected) => selected !== name)
    : [...searchSitesSelected.value, name]
}

async function submit(keepOpen = false) {
  if (!form.name) {
    emit('error', '请输入标题')
    return
  }
  if (form.year && isNaN(Number(form.year))) {
    emit('error', '年份需为数字')
    return
  }
  if (!form.fuzzy_match && !form.season && props.type === 'TV') {
    emit('error', '请选择季')
    return
  }
  if (form.total_ep && isNaN(Number(form.total_ep))) {
    emit('error', '总集数需为数字')
    return
  }
  if (form.current_ep && isNaN(Number(form.current_ep))) {
    emit('error', '开始订阅集数需为数字')
    return
  }

  const allRss = rssSitesSelected.value.length === rssSites.value.length
  const allSearch = searchSitesSelected.value.length === searchSites.value.length

  const rss_sites = allRss ? [] : rssSitesSelected.value
  const search_sites = form.fuzzy_match ? [] : allSearch ? [] : searchSitesSelected.value

  // 保存本次订阅设置
  localStorage.setItem(
    storageKey.value,
    JSON.stringify({
      filter_restype: form.filter_restype,
      filter_pix: form.filter_pix,
      filter_team: form.filter_team,
      filter_rule: form.filter_rule,
      save_path: form.save_path,
      download_setting: form.download_setting,
      rss_sites: allRss ? [] : rssSitesSelected.value,
      search_sites: allSearch ? [] : searchSitesSelected.value
    })
  )

  const params: AddRssMediaParams = {
    type: props.type,
    name: form.name,
    year: form.year,
    keyword: form.keyword,
    season: form.season,
    fuzzy_match: form.fuzzy_match,
    over_edition: form.over_edition,
    rss_sites,
    search_sites,
    filter_restype: form.filter_restype,
    filter_pix: form.filter_pix,
    filter_team: form.filter_team,
    filter_rule: form.filter_rule,
    save_path: form.save_path,
    download_setting: form.download_setting
  }
  if (props.rssid) params.rssid = props.rssid
  if (props.type === 'TV') {
    params.total_ep = form.total_ep
    params.current_ep = form.current_ep
  }

  submitting.value = true
  try {
    const res = await addRssMedia(params)
    if (res.code === 0) {
      emit('success')
      if (keepOpen) {
        resetForm()
      } else {
        visible.value = false
      }
    } else {
      emit('error', res.msg || '添加订阅失败')
    }
  } catch (e) {
    emit('error', e instanceof Error ? e.message : '添加订阅失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent>
    <q-card class="rss-media-dialog">
      <q-card-section class="dialog-header row items-center no-wrap">
        <div class="text-h6 text-weight-medium">{{ props.rssid ? '编辑订阅' : '新增订阅' }}</div>
        <q-space />
        <q-btn flat round dense icon="close" aria-label="关闭" :disable="submitting" @click="visible = false" />
      </q-card-section>
      <q-separator />

      <q-form class="rss-form" @submit.prevent="submit(false)">
        <q-card-section class="dialog-body">
          <q-inner-loading :showing="optionsLoading">
            <q-spinner-dots color="primary" size="40px" />
          </q-inner-loading>

          <section class="form-section">
            <div class="section-head"><span class="section-title">基本信息</span><span class="section-line" /></div>
            <div class="form-grid row-basic">
              <q-input v-model="form.name" outlined dense label="标题 *" placeholder="标题" :disable="submitting" />
              <q-input v-model="form.year" outlined dense label="年份" placeholder="年份" inputmode="numeric" :disable="submitting" />
              <q-input v-model="form.keyword" outlined dense label="自定义搜索词" placeholder="留空使用 TMDB 数据" :disable="submitting" />
            </div>
            <div v-if="type === 'TV'" class="form-grid row-tv q-mt-md">
              <q-select v-model="form.season" outlined dense emit-value map-options clearable label="季 *" :options="seasonOptions" :disable="submitting" />
              <q-input v-model="form.total_ep" outlined dense label="总集数" placeholder="可留空，使用 TMDB 信息"><template #append><HelpTip text="可留空应用 TMDB 剧集信息" /></template></q-input>
              <q-input v-model="form.current_ep" outlined dense label="开始订阅集数" placeholder="从第几集开始" inputmode="numeric" :disable="submitting" />
            </div>
          </section>

          <section class="form-section">
            <div class="section-head"><span class="section-title">订阅选项</span><span class="section-line" /></div>
            <div class="option-cards">
              <div class="option-card" :class="{ 'is-active': form.fuzzy_match }" role="button" tabindex="0" @click="form.fuzzy_match = !form.fuzzy_match" @keydown.enter.prevent="form.fuzzy_match = !form.fuzzy_match">
                <div class="option-copy"><div class="option-label">模糊匹配 <HelpTip text="开启后不检查 TMDB 是否有媒体信息，只要种子名称、标题、年份任一匹配关键字即会下载；标题可以配置正则表达式实现模糊匹配。" /></div><div class="option-help">适合标题不完整或需要正则匹配的订阅</div></div>
                <q-toggle v-model="form.fuzzy_match" color="primary" @click.stop />
              </div>
              <div class="option-card" :class="{ 'is-active': form.over_edition }" role="button" tabindex="0" @click="form.over_edition = !form.over_edition" @keydown.enter.prevent="form.over_edition = !form.over_edition">
                <div class="option-copy"><div class="option-label">洗版 <HelpTip text="开启洗版后不会检查本地是否已存在，满足订阅条件即会下载；同一优先级的资源只下载一次，文件重命名规则可用于区分同名资源。" /></div><div class="option-help">持续获取更高质量版本并替换旧资源</div></div>
                <q-toggle v-model="form.over_edition" color="primary" @click.stop />
              </div>
            </div>
          </section>

          <section class="form-section">
            <div class="section-head"><span class="section-title">过滤与下载</span><span class="section-line" /></div>
            <div class="form-grid row-filter">
              <q-select v-model="form.filter_restype" outlined dense emit-value map-options clearable label="质量" :options="restypeOptions" :disable="submitting" />
              <q-select v-model="form.filter_pix" outlined dense emit-value map-options clearable label="分辨率" :options="pixOptions" :disable="submitting" />
              <q-input v-model="form.filter_team" outlined dense label="制作组 / 字幕组" placeholder="支持正则表达式" :disable="submitting" />
            </div>
            <div class="form-grid row-dl q-mt-md">
              <q-select v-model="form.filter_rule" outlined dense emit-value map-options clearable label="过滤规则" :options="ruleOptions" :disable="submitting"><template #append><HelpTip text="质量、分辨率与过滤规则为“与”的关系；未选择时使用站点规则，站点未设置时使用默认规则。" /></template></q-select>
              <q-select v-model="form.download_setting" outlined dense emit-value map-options clearable label="下载设置" :options="downloadSettingOptions" :disable="submitting" @update:model-value="onDownloadSettingChange" />
            </div>
            <q-select v-model="form.save_path" outlined dense emit-value map-options clearable label="保存路径" :options="savePathOptions" class="q-mt-md" :disable="submitting || !form.download_setting" />
          </section>

          <section v-if="!form.fuzzy_match" class="form-section">
            <div class="section-head"><span class="section-title">搜索站点</span><span class="section-line" /><div class="section-actions"><q-btn flat dense color="primary" size="sm" :label="searchToggleLabel" @click="toggleAllSearchSites" /><q-btn flat dense color="primary" size="sm" label="反选" @click="invertSearchSites" /></div></div>
            <div class="sites-box">
              <div v-if="searchSites.length" class="site-list">
                <q-btn
                  v-for="site in searchSites"
                  :key="site.name"
                  flat
                  no-caps
                  class="site-button"
                  :class="{ 'is-selected': searchSitesSelected.includes(site.name) }"
                  :label="site.name"
                  :aria-pressed="searchSitesSelected.includes(site.name)"
                  @click="toggleSearchSite(site.name)"
                />
              </div>
              <q-banner v-else rounded dense class="bg-grey-2 text-grey-7"><template #avatar><q-icon name="info_outline" /></template>暂无可用搜索站点</q-banner>
            </div>
          </section>
          <q-banner v-else rounded dense class="fuzzy-banner"><template #avatar><q-icon name="tune" color="primary" /></template>已启用模糊匹配，将跳过搜索站点选择并按标题、年份和种子名称匹配。</q-banner>
        </q-card-section>

        <q-separator />
        <q-card-actions class="dialog-actions" align="right">
          <q-btn flat label="取消" :disable="submitting" @click="visible = false" />
          <q-btn v-if="!props.rssid" flat color="primary" label="添加并继续" :loading="submitting" @click="submit(true)" />
          <q-btn color="primary" unelevated :label="props.rssid ? '确定' : '添加订阅'" :loading="submitting" type="submit" />
        </q-card-actions>
      </q-form>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.rss-media-dialog { display: flex; width: min(800px, calc(100vw - 32px)); height: min(90vh, 840px); max-width: none; flex-direction: column; border-radius: 16px; overflow: hidden; background: var(--surface); color: var(--text-primary); }
.dialog-header { min-height: 64px; padding: 16px 24px; }
.dialog-body { position: relative; min-height: 0; flex: 1; overflow-y: auto; padding: 20px 24px 8px; }
.rss-form { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; }
.form-section { margin-bottom: 22px; }
.section-head { display: flex; align-items: center; gap: 12px; margin: 4px 0 14px; }
.section-title { position: relative; padding-left: 10px; font-size: 13px; font-weight: 700; white-space: nowrap; }
.section-title::before { content: ''; position: absolute; left: 0; top: 50%; width: 3px; height: 14px; border-radius: 2px; transform: translateY(-50%); background: var(--q-primary); }
.section-line { flex: 1; height: 1px; background: var(--border-subtle); }
.section-actions { display: inline-flex; gap: 2px; white-space: nowrap; }
.form-grid { display: grid; gap: 14px 16px; }
.row-basic { grid-template-columns: 1.15fr .7fr 1.15fr; }
.row-tv, .row-filter { grid-template-columns: repeat(3, 1fr); }
.row-dl { grid-template-columns: repeat(2, 1fr); }
.option-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.option-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 72px; padding: 12px 16px; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--surface-raised); cursor: pointer; transition: border-color .2s ease, background-color .2s ease, box-shadow .2s ease; }
.option-card:hover, .option-card:focus-visible { border-color: var(--q-primary); outline: none; }
.option-card.is-active { border-color: var(--q-primary); background: var(--primary-soft); box-shadow: 0 2px 8px rgba(49, 91, 214, .12); }
.option-copy { min-width: 0; }
.option-label { display: flex; align-items: center; gap: 2px; font-size: 14px; font-weight: 600; }
.option-help { margin-top: 4px; color: var(--text-secondary); font-size: 12px; line-height: 1.45; }
.sites-box { max-height: 180px; overflow-y: auto; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--surface-raised); }
.site-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.site-button { width: 100%; min-height: 40px; padding: 6px 10px; border: 1px solid var(--border-subtle); border-radius: 8px; background: var(--surface); color: var(--text-primary); transition: border-color .2s ease, background-color .2s ease, color .2s ease; }
.site-button:hover, .site-button:focus-visible { border-color: var(--q-primary); outline: none; }
.site-button.is-selected { border-color: var(--q-primary); background: var(--primary-soft); color: var(--q-primary); }
.site-button :deep(.q-btn__content) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fuzzy-banner { border: 1px solid color-mix(in srgb, var(--q-primary), transparent 70%); background: var(--primary-soft); color: var(--text-primary); }
.dialog-actions { gap: 8px; padding: 14px 24px 18px; background: var(--surface); }
@media (max-width: 936px) { .rss-media-dialog { width: min(94vw, 760px); } .row-basic { grid-template-columns: repeat(2, minmax(0, 1fr)); } .row-basic > :last-child { grid-column: 1 / -1; } .row-tv, .row-filter { grid-template-columns: repeat(2, minmax(0, 1fr)); } .row-tv > :last-child, .row-filter > :last-child { grid-column: 1 / -1; } }
@media (max-width: 599px) { .rss-media-dialog { width: 100%; height: 100dvh; min-height: 100dvh; border-radius: 0; } .dialog-header { min-height: 56px; padding: 12px 16px; } .dialog-body { max-height: none; padding: 16px; } .form-grid, .option-cards, .row-basic, .row-tv, .row-filter, .row-dl { grid-template-columns: 1fr !important; } .form-grid > * { grid-column: 1 / -1 !important; } .section-head { gap: 8px; } .section-actions { margin-left: auto; } .sites-box { max-height: 240px; } .site-list { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; } .site-button { min-height: 44px; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
@media (max-height: 820px) and (min-width: 600px) { .dialog-body { max-height: 68vh; padding-top: 14px; } .form-section { margin-bottom: 16px; } .sites-box { max-height: 132px; } }
</style>
