<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Filter } from '@element-plus/icons-vue'
import { doAction } from '@/api'
import { useModalStore } from '@/stores/modal'

const router = useRouter()
const modal = useModalStore()
const keyword = ref('')

function onSearch() {
  const q = keyword.value.trim()
  if (!q) return
  router.push({ path: '/search', query: { q } })
}

// ---- 高级搜索 ----

const showAdvanced = ref(false)
const advancedForm = reactive({
  type: '',
  name: '',
  year: '',
  season: '',
  restype: '',
  pix: '',
  sp_state: '* *',
  rule: ''
})

interface RuleOption {
  id: number
  name: string
}

const filterRules = ref<RuleOption[]>([])

async function loadFilterRules() {
  try {
    const res: any = await doAction('get_filterrules', {})
    if (res.code === 0) {
      filterRules.value = (res.ruleGroups || []).map((g: any) => ({ id: g.id, name: g.name }))
    }
  } catch {
    // ignore
  }
}

function openAdvanced() {
  advancedForm.type = ''
  advancedForm.name = keyword.value || ''
  advancedForm.year = ''
  advancedForm.season = ''
  advancedForm.restype = ''
  advancedForm.pix = ''
  advancedForm.sp_state = '* *'
  advancedForm.rule = ''
  loadFilterRules()
  showAdvanced.value = true
}

function doAdvancedSearch() {
  const name = advancedForm.name.trim()
  if (!name) {
    modal.warning('请输入电影/电视剧名称')
    return
  }
  let kw = name
  if (advancedForm.type) kw = advancedForm.type + ' ' + name
  if (advancedForm.year) kw = kw + ' ' + advancedForm.year
  if (advancedForm.season) kw = kw + ' ' + advancedForm.season
  const filters: Record<string, string> = {}
  if (advancedForm.restype) filters.restype = advancedForm.restype
  if (advancedForm.pix) filters.pix = advancedForm.pix
  if (advancedForm.sp_state && advancedForm.sp_state !== '* *') filters.sp_state = advancedForm.sp_state
  if (advancedForm.rule) filters.rule = advancedForm.rule
  showAdvanced.value = false
  router.push({ path: '/search', query: { q: kw, filters: JSON.stringify(filters), unident: 'true' } })
}

const restypeDict: Record<string, string> = {
  BLURAY: 'BluRay',
  REMUX: 'REMUX',
  DOLBY: 'Dolby',
  WEB: 'WEB-DL',
  HDTV: 'HDTV',
  UHD: 'UHD',
  HDR: 'HDR',
  '3D': '3D'
}

const pixDict: Record<string, string> = {
  '8k': '8K',
  '4k': '4K',
  '1080p': '1080p',
  '720p': '720p'
}

const spStates = [
  { value: '* *', label: '全部' },
  { value: '1.0 1.0', label: '普通' },
  { value: '1.0 0.0', label: '免费' },
  { value: '2.0 1.0', label: '2X' },
  { value: '2.0 0.0', label: '2X免费' },
  { value: '1.0 0.5', label: '50%' },
  { value: '2.0 0.5', label: '2X 50%' },
  { value: '1.0 0.7', label: '70%' },
  { value: '1.0 0.3', label: '30%' }
]

const seasonOptions = computed(() => {
  const options: { value: string; label: string }[] = [{ value: '', label: '全部' }]
  for (let i = 1; i <= 20; i++) {
    options.push({ value: `S${i.toString().padStart(2, '0')}`, label: `第${i}季` })
  }
  return options
})
</script>

<template>
  <div class="searchbar-wrap">
    <el-input
      v-model="keyword"
      class="app-searchbar"
      placeholder="搜索资源..."
      clearable
      @keyup.enter="onSearch"
    >
      <template #prefix>
        <el-icon><Search /></el-icon>
      </template>
      <template #suffix>
        <el-icon class="filter-btn" @click="openAdvanced"><Filter /></el-icon>
      </template>
      <template #append>
        <el-button @click="onSearch">搜索</el-button>
      </template>
    </el-input>

    <el-dialog v-model="showAdvanced" title="高级搜索" width="750px" destroy-on-close top="10vh">
      <el-form label-width="60px">
        <el-row :gutter="16">
          <el-col :span="6">
            <el-form-item label="类型">
              <el-select v-model="advancedForm.type" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option label="电影" value="电影" />
                <el-option label="电视剧" value="电视剧" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="18">
            <el-form-item label="名称">
              <el-input v-model="advancedForm.name" placeholder="电影/电视剧名称" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="年份">
              <el-input v-model="advancedForm.year" placeholder="20xx" />
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="季">
              <el-select v-model="advancedForm.season" style="width: 100%">
                <el-option v-for="opt in seasonOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="8">
            <el-form-item label="质量">
              <el-select v-model="advancedForm.restype" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option v-for="(label, key) in restypeDict" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="分辨率">
              <el-select v-model="advancedForm.pix" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option v-for="(label, key) in pixDict" :key="key" :label="label" :value="key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="促销">
              <el-select v-model="advancedForm.sp_state" style="width: 100%">
                <el-option v-for="s in spStates" :key="s.value" :label="s.label" :value="s.value" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="24">
            <el-form-item label="规则">
              <el-select v-model="advancedForm.rule" style="width: 100%">
                <el-option label="全部" value="" />
                <el-option v-for="r in filterRules" :key="r.id" :label="r.name" :value="r.id" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="showAdvanced = false">取消</el-button>
        <el-button type="primary" @click="doAdvancedSearch">开始搜索</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.searchbar-wrap {
  display: flex;
  justify-content: center;
}
.app-searchbar {
  max-width: 520px;
  width: 100%;
}
.filter-btn {
  cursor: pointer;
  font-size: 16px;
  color: var(--el-text-color-secondary);
  transition: color 0.2s;
}
.filter-btn:hover {
  color: var(--el-color-primary);
}
</style>
