<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'

const router = useRouter()
const modal = useModalStore()
const keyword = ref('')
const showAdvanced = ref(false)
const filterRules = ref<Array<{ id: number; name: string }>>([])

const advancedForm = reactive({
  type: '', name: '', year: '', season: '', restype: '', pix: '', sp_state: '* *', rule: ''
})

const restypeOptions = [
  { label: '全部', value: '' }, { label: 'BluRay', value: 'BLURAY' }, { label: 'REMUX', value: 'REMUX' },
  { label: 'Dolby', value: 'DOLBY' }, { label: 'WEB-DL', value: 'WEB' }, { label: 'HDTV', value: 'HDTV' },
  { label: 'UHD', value: 'UHD' }, { label: 'HDR', value: 'HDR' }, { label: '3D', value: '3D' }
]
const pixOptions = [
  { label: '全部', value: '' }, { label: '8K', value: '8k' }, { label: '4K', value: '4k' },
  { label: '1080p', value: '1080p' }, { label: '720p', value: '720p' }
]
const spStates = [
  { value: '* *', label: '全部' }, { value: '1.0 1.0', label: '普通' }, { value: '1.0 0.0', label: '免费' },
  { value: '2.0 1.0', label: '2X' }, { value: '2.0 0.0', label: '2X免费' }, { value: '1.0 0.5', label: '50%' },
  { value: '2.0 0.5', label: '2X 50%' }, { value: '1.0 0.7', label: '70%' }, { value: '1.0 0.3', label: '30%' }
]
const seasonOptions = computed(() => [
  { label: '全部', value: '' },
  ...Array.from({ length: 20 }, (_, index) => ({ label: `第${index + 1}季`, value: `S${String(index + 1).padStart(2, '0')}` }))
])

function onSearch() {
  const q = keyword.value.trim()
  if (!q) return
  router.push({ path: '/search', query: { q } })
}

async function openAdvanced() {
  advancedForm.type = ''
  advancedForm.name = keyword.value
  advancedForm.year = ''
  advancedForm.season = ''
  advancedForm.restype = ''
  advancedForm.pix = ''
  advancedForm.sp_state = '* *'
  advancedForm.rule = ''
  try {
    const res: any = await doAction('get_filterrules', {})
    if (res.code === 0) filterRules.value = (res.ruleGroups || []).map((g: any) => ({ id: g.id, name: g.name }))
  } catch {
    filterRules.value = []
  }
  showAdvanced.value = true
}

function doAdvancedSearch() {
  const name = advancedForm.name.trim()
  if (!name) {
    modal.warning('请输入电影/电视剧名称')
    return
  }
  let q = name
  if (advancedForm.type) q = `${advancedForm.type} ${q}`
  if (advancedForm.year) q = `${q} ${advancedForm.year}`
  if (advancedForm.season) q = `${q} ${advancedForm.season}`
  const filters: Record<string, string> = {}
  if (advancedForm.restype) filters.restype = advancedForm.restype
  if (advancedForm.pix) filters.pix = advancedForm.pix
  if (advancedForm.sp_state !== '* *') filters.sp_state = advancedForm.sp_state
  if (advancedForm.rule) filters.rule = advancedForm.rule
  showAdvanced.value = false
  router.push({ path: '/search', query: { q, filters: JSON.stringify(filters), unident: 'true' } })
}
</script>

<template>
  <div class="searchbar-wrap">
    <q-input
      v-model="keyword"
      outlined
      dense
      clearable
      class="app-searchbar"
      placeholder="搜索资源..."
      aria-label="搜索资源"
      @keyup.enter="onSearch"
    >
      <template #prepend><q-icon name="search" /></template>
      <template #append>
        <q-btn flat round dense icon="tune" aria-label="高级搜索" @click="openAdvanced" />
      </template>
      <template #after><q-btn color="primary" unelevated label="搜索" @click="onSearch" /></template>
    </q-input>

    <q-dialog v-model="showAdvanced" position="standard">
      <q-card class="advanced-search-card">
        <q-card-section class="row items-center q-pb-sm">
          <div class="text-h6">高级搜索</div>
          <q-space />
          <q-btn v-close-popup flat round dense icon="close" aria-label="关闭高级搜索" />
        </q-card-section>
        <q-form @submit.prevent="doAdvancedSearch">
          <q-card-section class="advanced-search-form">
            <div class="form-grid form-grid--name">
              <q-select v-model="advancedForm.type" outlined emit-value map-options label="类型" :options="[{ label: '全部', value: '' }, { label: '电影', value: '电影' }, { label: '电视剧', value: '电视剧' }]" />
              <q-input v-model="advancedForm.name" outlined label="名称" placeholder="电影/电视剧名称" />
            </div>
            <div class="form-grid form-grid--three">
              <q-input v-model="advancedForm.year" outlined label="年份" placeholder="20xx" />
              <q-select v-model="advancedForm.season" outlined emit-value map-options label="季" :options="seasonOptions" />
              <q-select v-model="advancedForm.sp_state" outlined emit-value map-options label="促销" :options="spStates" />
            </div>
            <div class="form-grid form-grid--three">
              <q-select v-model="advancedForm.restype" outlined emit-value map-options label="质量" :options="restypeOptions" />
              <q-select v-model="advancedForm.pix" outlined emit-value map-options label="分辨率" :options="pixOptions" />
              <q-select v-model="advancedForm.rule" outlined emit-value map-options label="规则" :options="[{ label: '全部', value: '' }, ...filterRules.map((r) => ({ label: r.name, value: r.id }))]" />
            </div>
          </q-card-section>
          <q-card-actions align="right" class="q-px-md q-pb-md">
            <q-btn flat label="取消" v-close-popup />
            <q-btn color="primary" unelevated label="开始搜索" type="submit" />
          </q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.searchbar-wrap { display: flex; justify-content: center; width: 100%; }
.app-searchbar { width: min(560px, 100%); }
.app-searchbar :deep(.q-field__control) { border-radius: 10px; }
.advanced-search-card { width: min(760px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.advanced-search-form { display: grid; gap: 16px; }
.form-grid { display: grid; gap: 16px; }
.form-grid--name { grid-template-columns: minmax(130px, 1fr) minmax(260px, 3fr); }
.form-grid--three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 599px) {
  .advanced-search-card { width: 100%; min-height: 100dvh; border-radius: 0; }
  .form-grid--name, .form-grid--three { grid-template-columns: 1fr; }
  .advanced-search-form { overflow-y: auto; }
}
</style>
