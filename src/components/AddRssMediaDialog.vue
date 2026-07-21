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
const submitting = ref(false)

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
  try {
    const [rssRes, idxRes, dsRes, ruleRes] = await Promise.all([
      getRssSites(),
      getIndexers(),
      getDownloadSettings(),
      (await import('@/api/request')).doAction<{ code: number; ruleGroups?: Array<{ id: number | string; name: string }> }>('get_filterrules', {})
    ])
    if (rssRes.code === 0) rssSites.value = rssRes.sites || []
    if (idxRes.code === 0) searchSites.value = idxRes.indexers || []
    if (dsRes.code === 0) downloadSettings.value = dsRes.data || []
    if (ruleRes.code === 0) ruleGroups.value = ruleRes.ruleGroups || []
  } catch {
    /* ignore */
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
  <el-dialog
    v-model="visible"
    :title="props.rssid ? '编辑订阅' : '新增订阅'"
    width="min(94vw, clamp(880px, 46vw, 1024px))"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    top="4vh"
    class="rss-media-dialog"
  >
    <el-form :model="form" label-width="120px" label-position="right">
      <div class="form-section">
        <div class="section-head">
          <span class="section-title">基本信息</span>
          <span class="section-line"></span>
        </div>
        <div class="form-grid row-basic">
          <el-form-item label="标题" required>
            <el-input v-model="form.name" placeholder="标题" />
          </el-form-item>
          <el-form-item label="年份">
            <el-input v-model="form.year" placeholder="年份" />
          </el-form-item>
          <el-form-item label="自定义搜索词" class="f-keyword">
            <el-input v-model="form.keyword" placeholder="留空使用TMDB数据" />
          </el-form-item>
        </div>
        <div v-if="type === 'TV'" class="form-grid row-tv">
          <el-form-item label="季" required>
            <el-select v-model="form.season" placeholder="请选择" style="width: 100%">
              <el-option label="请选择" value="" />
              <el-option v-for="s in SEASON_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <template #label>总集数<HelpTip text="可留空应用TMDB剧集信息" /></template>
            <el-input v-model="form.total_ep" placeholder="总集数" />
          </el-form-item>
          <el-form-item label="开始订阅集数" class="f-current">
            <el-input v-model="form.current_ep" placeholder="开始订阅集数" />
          </el-form-item>
        </div>
      </div>

      <div class="form-section">
        <div class="section-head">
          <span class="section-title">订阅选项</span>
          <span class="section-line"></span>
        </div>
        <div class="option-cards">
          <div
            class="option-card"
            :class="{ 'is-active': form.fuzzy_match }"
            @click="form.fuzzy_match = !form.fuzzy_match"
          >
            <span class="option-card__label">模糊匹配<HelpTip text="开启后不检查TMDB是否有媒体信息，只要种子名称、标题、年份任一匹配关键字即会下载，此时标题可以配置正则表达式实现模糊匹配" /></span>
            <el-switch v-model="form.fuzzy_match" @click.stop />
          </div>
          <div
            class="option-card"
            :class="{ 'is-active': form.over_edition }"
            @click="form.over_edition = !form.over_edition"
          >
            <span class="option-card__label">洗版<HelpTip text="开启洗版后不会检查本地是否已存在，满足订阅条件即会下载；除非匹配了对应的过滤规则中最高优先级的那条规则否则不会删除订阅（未明确过滤规则时使用默认规则），同一优先级的资源只下载一次；多个资源下载后如命名一致，则只会保留文件体积较大的，如需都保留则需要在文件重命名规则中增加相关要素以做区分" /></span>
            <el-switch v-model="form.over_edition" @click.stop />
          </div>
        </div>
      </div>

      <div class="form-section">
        <div class="section-head">
          <span class="section-title">过滤与下载</span>
          <span class="section-line"></span>
        </div>
        <div class="form-grid row-filter">
          <el-form-item label="质量">
            <el-select v-model="form.filter_restype" style="width: 100%" clearable>
              <el-option label="全部" value="" />
              <el-option v-for="r in RESTYPE_OPTIONS" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
          <el-form-item label="分辨率">
            <el-select v-model="form.filter_pix" style="width: 100%" clearable>
              <el-option label="全部" value="" />
              <el-option v-for="p in PIX_OPTIONS" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
          <el-form-item label="制作组/字幕组" class="f-team">
            <el-input v-model="form.filter_team" placeholder="支持正则表达式" />
          </el-form-item>
        </div>
        <div class="form-grid row-dl">
          <el-form-item>
            <template #label>过滤规则<HelpTip text="质量、分辨率与过滤规则为“与”的关系，过滤规则不选择时将使用站点的过滤规则，站点也未设置过滤规则时将使用默认过滤规则" /></template>
            <el-select v-model="form.filter_rule" style="width: 100%" clearable>
              <el-option label="全部" value="" />
              <el-option v-for="r in ruleGroups" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="下载设置">
            <el-select v-model="form.download_setting" style="width: 100%" clearable @change="onDownloadSettingChange">
              <el-option label="站点设置" value="" />
              <el-option v-for="d in downloadSettings" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
        </div>
        <div class="form-grid row-full">
          <el-form-item label="保存路径">
            <el-select v-model="form.save_path" style="width: 100%" clearable>
              <el-option label="自动" value="" />
              <el-option v-for="p in savePaths" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
        </div>
      </div>

      <el-form-item v-if="false">
        <template #label>
          <span style="display:flex;justify-content:space-between;width:100%;">
            订阅站点
            <el-button link size="small" @click="toggleAllRssSites">全选</el-button>
          </span>
        </template>
        <el-checkbox-group v-model="rssSitesSelected" style="width: 100%">
          <el-checkbox v-for="s in rssSites" :key="s.name" :value="s.name">{{ s.name }}</el-checkbox>
        </el-checkbox-group>
        <el-empty v-if="rssSites.length === 0" description="暂无订阅站点" :image-size="40" />
      </el-form-item>

      <div v-if="!form.fuzzy_match" class="form-section">
        <div class="section-head">
          <span class="section-title">搜索站点</span>
          <span class="section-line"></span>
          <span class="section-actions">
            <el-button link type="primary" size="small" @click="toggleAllSearchSites">{{ searchToggleLabel }}</el-button>
            <el-button link type="primary" size="small" @click="invertSearchSites">反选</el-button>
          </span>
        </div>
        <div class="sites-box">
          <el-checkbox-group v-model="searchSitesSelected" style="width: 100%">
            <el-checkbox-button v-for="s in searchSites" :key="s.name" :value="s.name" class="rounded-checkbox">{{ s.name }}</el-checkbox-button>
          </el-checkbox-group>
          <el-empty v-if="searchSites.length === 0" description="暂无搜索站点" :image-size="40" />
        </div>
      </div>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button v-if="!props.rssid" @click="submit(true)">添加并继续</el-button>
      <el-button type="primary" :loading="submitting" @click="submit(false)">{{ props.rssid ? '确定' : '添加' }}</el-button>
    </template>
  </el-dialog>
</template>

<style>
/* 全局复用：其他页面也依赖此布局（勿移除） */
.el-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

/* ===== 弹窗整体 ===== */
.rss-media-dialog {
  border-radius: 10px;
  overflow: hidden;
}
.rss-media-dialog .el-dialog__header {
  padding: 16px 24px;
  margin-right: 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.rss-media-dialog .el-dialog__title {
  font-size: 16px;
  font-weight: 600;
}
.rss-media-dialog .el-dialog__body {
  padding: 20px 24px 12px;
  max-height: calc(92vh - 120px);
  overflow-y: auto;
}
.rss-media-dialog .el-dialog__footer {
  padding: 12px 24px 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

/* ===== 分区标题 ===== */
.rss-media-dialog .section-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 14px;
}
.rss-media-dialog .section-title {
  position: relative;
  padding-left: 9px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  white-space: nowrap;
}
.rss-media-dialog .section-title::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 12px;
  border-radius: 2px;
  background: var(--el-color-primary);
}
.rss-media-dialog .section-line {
  flex: 1;
  height: 1px;
  background: var(--el-border-color-lighter);
}
.rss-media-dialog .section-actions {
  display: inline-flex;
  gap: 4px;
  white-space: nowrap;
}

/* ===== 表单栅格 ===== */
.rss-media-dialog .form-grid {
  display: grid;
  column-gap: 16px;
}
.rss-media-dialog .row-basic {
  grid-template-columns: 9fr 6fr 9fr;
}
.rss-media-dialog .row-tv,
.rss-media-dialog .row-filter {
  grid-template-columns: repeat(3, 1fr);
}
.rss-media-dialog .row-dl {
  grid-template-columns: repeat(2, 1fr);
}
.rss-media-dialog .row-full {
  grid-template-columns: 1fr;
}

/* ===== 开关选项卡片 ===== */
.rss-media-dialog .option-cards {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 18px;
}
.rss-media-dialog .option-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
}
.rss-media-dialog .option-card:hover {
  border-color: var(--el-color-primary-light-5);
}
.rss-media-dialog .option-card.is-active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.rss-media-dialog .option-card__label {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

/* ===== 站点选择 ===== */
.rss-media-dialog .sites-box {
  max-height: 172px;
  overflow-y: auto;
  padding: 10px 12px;
  margin-bottom: 6px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  background: var(--el-fill-color-blank);
}
.rss-media-dialog .sites-box::-webkit-scrollbar {
  width: 6px;
}
.rss-media-dialog .sites-box::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background: var(--el-border-color);
}
.rss-media-dialog .sites-box::-webkit-scrollbar-track {
  background: transparent;
}
.rss-media-dialog .sites-box .el-checkbox-group {
  gap: 6px;
}
.rss-media-dialog .rounded-checkbox {
  border-radius: 6px !important;
  margin: 0 !important;
}
.rss-media-dialog .rounded-checkbox .el-checkbox-button__inner {
  border-radius: 6px !important;
  border: 1px solid var(--el-border-color) !important;
}
.rss-media-dialog .rounded-checkbox.is-checked .el-checkbox-button__inner {
  border-color: var(--el-color-primary) !important;
  background-color: var(--el-color-primary) !important;
  color: #fff !important;
}

/* ===== 分辨率适配：窗口变窄时（弹窗宽度 = 94vw） ===== */
@media (max-width: 936px) {
  .rss-media-dialog .el-dialog__body {
    padding: 16px 18px 8px;
  }
  .rss-media-dialog .row-basic {
    grid-template-columns: 7fr 5fr;
  }
  .rss-media-dialog .row-basic .f-keyword {
    grid-column: 1 / -1;
  }
  .rss-media-dialog .row-tv,
  .rss-media-dialog .row-filter {
    grid-template-columns: repeat(2, 1fr);
  }
  .rss-media-dialog .row-tv .f-current,
  .rss-media-dialog .row-filter .f-team {
    grid-column: 1 / -1;
  }
}
@media (max-width: 680px) {
  .rss-media-dialog .form-grid,
  .rss-media-dialog .option-cards {
    grid-template-columns: 1fr !important;
  }
  .rss-media-dialog .form-grid > * {
    grid-column: 1 / -1 !important;
  }
  .rss-media-dialog .el-form-item__label {
    width: 96px !important;
  }
}

/* ===== 高度适配：矮屏（如 1366x768）压缩间距 ===== */
@media (max-height: 820px) {
  .rss-media-dialog .el-dialog__body {
    padding-top: 14px;
  }
  .rss-media-dialog .section-head {
    margin-bottom: 10px;
  }
  .rss-media-dialog .el-form-item {
    margin-bottom: 14px;
  }
  .rss-media-dialog .option-cards {
    margin-bottom: 14px;
  }
  .rss-media-dialog .sites-box {
    max-height: 128px;
  }
}
</style>