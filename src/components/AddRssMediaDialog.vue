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
    form.season = d.season || ''
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
    width="820px"
    :close-on-click-modal="false"
    destroy-on-close
    append-to-body
    top="4vh"
  >
    <el-form :model="form" label-width="120px" label-position="right">
      <el-row :gutter="16">
        <el-col :span="9">
          <el-form-item label="标题" required>
            <el-input v-model="form.name" placeholder="标题" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item label="年份">
            <el-input v-model="form.year" placeholder="年份" />
          </el-form-item>
        </el-col>
        <el-col :span="9">
          <el-form-item label="自定义搜索词">
            <el-input v-model="form.keyword" placeholder="留空使用TMDB数据" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row v-if="type === 'TV'" :gutter="16">
        <el-col :span="8">
          <el-form-item label="季" required>
            <el-select v-model="form.season" placeholder="请选择" style="width: 100%">
              <el-option label="请选择" value="" />
              <el-option v-for="s in SEASON_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item>
            <template #label>总集数<HelpTip text="可留空应用TMDB剧集信息" /></template>
            <el-input v-model="form.total_ep" placeholder="总集数" />
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="开始订阅集数">
            <el-input v-model="form.current_ep" placeholder="开始订阅集数" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="6">
          <el-form-item>
            <template #label>模糊匹配<HelpTip text="开启后不检查TMDB是否有媒体信息，只要种子名称、标题、年份任一匹配关键字即会下载，此时标题可以配置正则表达式实现模糊匹配" /></template>
            <el-switch v-model="form.fuzzy_match" />
          </el-form-item>
        </el-col>
        <el-col :span="6">
          <el-form-item>
            <template #label>洗版<HelpTip text="开启洗版后不会检查本地是否已存在，满足订阅条件即会下载；除非匹配了对应的过滤规则中最高优先级的那条规则否则不会删除订阅（未明确过滤规则时使用默认规则），同一优先级的资源只下载一次；多个资源下载后如命名一致，则只会保留文件体积较大的，如需都保留则需要在文件重命名规则中增加相关要素以做区分" /></template>
            <el-switch v-model="form.over_edition" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="16">
        <el-col :span="8">
          <el-form-item label="质量">
            <el-select v-model="form.filter_restype" style="width: 100%" clearable>
              <el-option label="全部" value="" />
              <el-option v-for="r in RESTYPE_OPTIONS" :key="r" :label="r" :value="r" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="分辨率">
            <el-select v-model="form.filter_pix" style="width: 100%" clearable>
              <el-option label="全部" value="" />
              <el-option v-for="p in PIX_OPTIONS" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="8">
          <el-form-item label="制作组/字幕组">
            <el-input v-model="form.filter_team" placeholder="支持正则表达式" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="12">
          <el-form-item>
            <template #label>过滤规则<HelpTip text="质量、分辨率与过滤规则为“与”的关系，过滤规则不选择时将使用站点的过滤规则，站点也未设置过滤规则时将使用默认过滤规则" /></template>
            <el-select v-model="form.filter_rule" style="width: 100%" clearable>
              <el-option label="全部" value="" />
              <el-option v-for="r in ruleGroups" :key="r.id" :label="r.name" :value="r.id" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="下载设置">
            <el-select v-model="form.download_setting" style="width: 100%" clearable @change="onDownloadSettingChange">
              <el-option label="站点设置" value="" />
              <el-option v-for="d in downloadSettings" :key="d.id" :label="d.name" :value="d.id" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-row :gutter="16">
        <el-col :span="24">
          <el-form-item label="保存路径">
            <el-select v-model="form.save_path" style="width: 100%" clearable>
              <el-option label="自动" value="" />
              <el-option v-for="p in savePaths" :key="p" :label="p" :value="p" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>

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

      <el-form-item v-if="!form.fuzzy_match" label-position="top">
        <template #label>
          <span style="display:flex;justify-content:space-between;width:100%;">
            搜索站点
            <span style="white-space:nowrap;margin-left: 10px">
              <el-button link size="small" @click="toggleAllSearchSites">{{ searchToggleLabel }}</el-button>
              <el-button link size="small" @click="invertSearchSites" style="margin-left:8px">反选</el-button>
            </span>
          </span>
        </template>
        <el-checkbox-group v-model="searchSitesSelected" style="width: 100%">
          <el-checkbox-button v-for="s in searchSites" :key="s.name" :value="s.name" class="rounded-checkbox">{{ s.name }}</el-checkbox-button>
        </el-checkbox-group>
        <el-empty v-if="searchSites.length === 0" description="暂无搜索站点" :image-size="40" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button v-if="!props.rssid" @click="submit(true)">添加并继续</el-button>
      <el-button type="primary" :loading="submitting" @click="submit(false)">{{ props.rssid ? '确定' : '添加' }}</el-button>
    </template>
  </el-dialog>
</template>

<style>
.rounded-checkbox {
  border-radius: 6px !important;
  margin: 2px !important;
}
.rounded-checkbox .el-checkbox-button__inner {
  border-radius: 6px !important;
  border: 1px solid var(--el-border-color) !important;
}
.rounded-checkbox.is-checked .el-checkbox-button__inner {
  border-color: var(--el-color-primary) !important;
  background-color: var(--el-color-primary) !important;
  color: #fff !important;
}
.el-checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>