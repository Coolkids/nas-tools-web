<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Plus, Delete, Share, Star, Download, Upload, RefreshLeft, Edit, ArrowDown, ArrowRight } from '@element-plus/icons-vue'
import { doAction } from '@/api'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'

interface FilterRule {
  id: number
  group: number
  name: string
  pri: number
  include: string | string[]
  exclude: string | string[]
  size: string
  free: string
  free_text: string
}
interface RuleGroup {
  id: number
  name: string
  default?: string
  rules: FilterRule[]
}
interface InitRuleGroup {
  id: number
  name: string
  rules: Array<{ name: string; include: string | string[]; exclude: string | string[] }>
  sql?: string[]
}

const modal = useModalStore()
const groups = ref<RuleGroup[]>([])
const initGroups = ref<InitRuleGroup[]>([])
const loading = ref(false)
const expandedGroups = ref<Set<number>>(new Set())

function toggleGroup(id: number) {
  const s = new Set(expandedGroups.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  expandedGroups.value = s
}

const FREE_OPTIONS = [
  { value: '', label: '全部' },
  { value: '1.0 1.0', label: '普通' },
  { value: '1.0 0.0', label: '免费' },
  { value: '2.0 0.0', label: '2X免费' }
]
const PRI_OPTIONS = Array.from({ length: 20 }, (_, i) => i + 1)

const ruleDialog = ref(false)
const ruleSaving = ref(false)
const ruleForm = reactive({
  rule_id: '' as string | number,
  group_id: '' as string | number,
  group_name: '',
  rule_name: '',
  rule_pri: 1,
  rule_include: '',
  rule_exclude: '',
  rule_sizelimit: '',
  rule_free: ''
})

const groupDialog = ref(false)
const groupSaving = ref(false)
const groupForm = reactive({ name: '', default: false })

const shareVisible = ref(false)
const shareContent = ref('')

const importVisible = ref(false)
const importSaving = ref(false)
const importContent = ref('')

const restoreVisible = ref(false)
const restoreSaving = ref(false)
const restoreSelected = ref<number[]>([])

onMounted(load)

async function load() {
  loading.value = true
  try {
    const res = await doAction<{ code: number; ruleGroups: RuleGroup[]; initRules: InitRuleGroup[] }>('get_filterrules', {})
    if (res.code === 0) {
      groups.value = res.ruleGroups || []
      initGroups.value = res.initRules || []
      expandedGroups.value = new Set((res.ruleGroups || []).map((g: RuleGroup) => g.id))
    }
  } finally {
    loading.value = false
  }
}

function applyTemplate(rule: InitRuleGroup['rules'][0]) {
  ruleForm.rule_name = rule.name
  const inc = Array.isArray(rule.include) ? rule.include : (rule.include ? [rule.include] : [])
  const exc = Array.isArray(rule.exclude) ? rule.exclude : (rule.exclude ? [rule.exclude] : [])
  ruleForm.rule_include = inc.join('\n')
  ruleForm.rule_exclude = exc.join('\n')
}

function openAddRule(group: RuleGroup) {
  ruleForm.rule_id = ''
  ruleForm.group_id = group.id
  ruleForm.group_name = group.name
  ruleForm.rule_name = ''
  ruleForm.rule_pri = 1
  ruleForm.rule_include = ''
  ruleForm.rule_exclude = ''
  ruleForm.rule_sizelimit = ''
  ruleForm.rule_free = ''
  ruleDialog.value = true
}

async function openEditRule(group: RuleGroup, rule: FilterRule) {
  ruleForm.group_id = group.id
  ruleForm.group_name = group.name
  ruleForm.rule_id = ''
  const res = await doAction<{ code: number; info: FilterRule }>('filterrule_detail', {
    ruleid: rule.id,
    groupid: group.id
  })
  if (res.code === 0 && res.info) {
    const info = res.info
    ruleForm.rule_id = info.id
    ruleForm.rule_name = info.name
    ruleForm.rule_pri = info.pri || 1
    const inc = Array.isArray(info.include) ? info.include : (info.include ? [info.include] : [])
    const exc = Array.isArray(info.exclude) ? info.exclude : (info.exclude ? [info.exclude] : [])
    ruleForm.rule_include = inc.join('\n')
    ruleForm.rule_exclude = exc.join('\n')
    ruleForm.rule_sizelimit = info.size || ''
    ruleForm.rule_free = info.free || ''
    ruleDialog.value = true
  }
}

async function submitRule() {
  if (!ruleForm.rule_name) {
    modal.warning('规则名称不能为空')
    return
  }
  if (ruleForm.rule_sizelimit && !/^[0-9,]*$/.test(ruleForm.rule_sizelimit)) {
    modal.warning('大小限制只能包含数字和逗号')
    return
  }
  ruleSaving.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('add_filterrule', {
      rule_id: ruleForm.rule_id,
      group_id: ruleForm.group_id,
      rule_name: ruleForm.rule_name,
      rule_pri: ruleForm.rule_pri,
      rule_include: ruleForm.rule_include,
      rule_exclude: ruleForm.rule_exclude,
      rule_sizelimit: ruleForm.rule_sizelimit,
      rule_free: ruleForm.rule_free
    })
    if (res.code === 0) {
      ruleDialog.value = false
      modal.success('保存成功')
      load()
    } else {
      modal.error(res.msg || '保存失败')
    }
  } finally {
    ruleSaving.value = false
  }
}

async function deleteRule(rule: FilterRule) {
  const ok = await modal.confirm(`确认删除规则「${rule.name}」？`)
  if (!ok) return
  const res = await doAction<{ code: number }>('del_filterrule', { id: rule.id })
  if (res.code === 0) {
    modal.success('删除成功')
    ruleDialog.value = false
    load()
  }
}

function openAddGroup() {
  groupForm.name = ''
  groupForm.default = false
  groupDialog.value = true
}

async function submitGroup() {
  if (!groupForm.name) {
    modal.warning('规则组名称不能为空')
    return
  }
  groupSaving.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('add_filtergroup', {
      name: groupForm.name,
      default: groupForm.default ? 'Y' : 'N'
    })
    if (res.code === 0) {
      groupDialog.value = false
      modal.success('新增成功')
      load()
    } else {
      modal.error(res.msg || '新增失败')
    }
  } finally {
    groupSaving.value = false
  }
}

async function deleteGroup(group: RuleGroup) {
  const ok = await modal.confirm(`删除规则组后，该组下所有规则将同时被删除，是否确认删除「${group.name}」？`)
  if (!ok) return
  const res = await doAction<{ code: number }>('del_filtergroup', { id: group.id })
  if (res.code === 0) {
    modal.success('删除成功')
    load()
  }
}

async function setDefault(group: { id: number }) {
  const res = await doAction<{ code: number }>('set_default_filtergroup', { id: group.id })
  if (res.code === 0) load()
}

async function shareGroup(group: RuleGroup) {
  const res = await doAction<{ code: number; string?: string; msg?: string }>('share_filtergroup', { id: group.id })
  if (res.code === 0) {
    shareContent.value = res.string || ''
    shareVisible.value = true
  } else {
    modal.error(`无法生成分享：${res.msg || ''}`)
  }
}

function openImport() {
  importContent.value = ''
  importVisible.value = true
}

async function submitImport() {
  if (!importContent.value) {
    modal.warning('请粘贴规则内容')
    return
  }
  importSaving.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('import_filtergroup', { content: importContent.value })
    if (res.code === 0) {
      importVisible.value = false
      modal.success('导入成功')
      load()
    } else {
      modal.error(`规则导入失败：${res.msg || ''}`)
    }
  } finally {
    importSaving.value = false
  }
}

function openRestore() {
  restoreSelected.value = []
  restoreVisible.value = true
}

function splitArr(v: string | string[] | undefined): string[] {
  if (!v) return []
  const arr = Array.isArray(v) ? v : [v]
  const result: string[] = []
  for (const item of arr) {
    for (const line of item.split('\n')) {
      const trimmed = line.trim()
      if (trimmed) result.push(trimmed)
    }
  }
  return result
}

async function submitRestore() {
  if (restoreSelected.value.length === 0) {
    modal.warning('请选择要恢复的规则组')
    return
  }
  restoreSaving.value = true
  try {
    const res = await doAction<{ code: number }>('restore_filtergroup', {
      groupids: restoreSelected.value,
      init_rulegroups: initGroups.value
    })
    if (res.code === 0) {
      restoreVisible.value = false
      modal.success('恢复成功')
      load()
    }
  } finally {
    restoreSaving.value = false
  }
}
</script>

<template>
  <div class="filterrule-view" v-loading="loading">
    <PageHeader title="过滤规则" description="管理订阅与搜索的过滤规则组">
      <template #actions>
        <el-button :icon="RefreshLeft" @click="openRestore">恢复</el-button>
        <el-button :icon="Upload" type="success" @click="openImport">导入</el-button>
        <el-button type="primary" :icon="Plus" @click="openAddGroup">新增</el-button>
      </template>
    </PageHeader>

    <div v-if="groups.length === 0 && !loading" class="empty-tip">
      <el-empty description="没有配置任何规则，请点击“新增”按钮" />
    </div>

    <div v-if="initGroups.length" class="section-header">
      <span class="section-title">内置规则</span>
      <el-tag size="small" type="info" effect="plain">不可编辑</el-tag>
    </div>
    <div class="group-list">
      <el-card v-for="g in initGroups" :key="g.id" shadow="never" class="group-card">
        <template #header>
          <div class="group-header">
            <div class="group-title" @click="toggleGroup(g.id)">
              <el-icon class="collapse-icon"><component :is="expandedGroups.has(g.id) ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
              <strong>{{ g.name }}</strong>
              <el-tag size="small" type="info">内置</el-tag>
            </div>
            <div class="group-actions" @click.stop>
              <el-button :icon="Star" link @click="setDefault(g)">设默认</el-button>
            </div>
          </div>
        </template>
        <el-collapse-transition>
          <div v-show="expandedGroups.has(g.id)">
            <div v-if="g.rules && g.rules.length" class="rule-list">
              <div v-for="(r, i) in g.rules" :key="i" class="rule-item rule-item-readonly">
                <div class="rule-name">{{ r.name }}</div>
                <div class="rule-tags">
                  <el-tag v-for="(inc, i) in splitArr(r.include)" :key="'i' + i" size="small" type="success" class="rule-tag">包含 {{ inc }}</el-tag>
                  <el-tag v-for="(exc, i) in splitArr(r.exclude)" :key="'e' + i" size="small" type="danger" class="rule-tag">排除 {{ exc }}</el-tag>
                </div>
              </div>
            </div>
            <el-empty v-else description="无规则" :image-size="60" />
          </div>
        </el-collapse-transition>
      </el-card>
    </div>

    <div v-if="groups.length" class="section-header">
      <span class="section-title">自定义规则</span>
    </div>
    <div class="group-list">
      <el-card v-for="g in groups" :key="g.id" shadow="never" class="group-card">
        <template #header>
          <div class="group-header">
            <div class="group-title" @click="toggleGroup(g.id)">
              <el-icon class="collapse-icon"><component :is="expandedGroups.has(g.id) ? 'ArrowDown' : 'ArrowRight'" /></el-icon>
              <el-icon v-if="g.default === 'Y'" class="default-icon"><Star /></el-icon>
              <strong>{{ g.name }}</strong>
              <el-tag v-if="g.default === 'Y'" size="small" type="success">默认</el-tag>
            </div>
            <div class="group-actions" @click.stop>
              <el-button :icon="Share" link @click="shareGroup(g)">分享</el-button>
              <el-button :icon="Star" link @click="setDefault(g)">设默认</el-button>
              <el-button :icon="Plus" link type="primary" @click="openAddRule(g)">增加规则</el-button>
              <el-button :icon="Delete" link type="danger" @click="deleteGroup(g)">删除组</el-button>
            </div>
          </div>
        </template>
        <el-collapse-transition>
          <div v-show="expandedGroups.has(g.id)">
            <div v-if="g.rules && g.rules.length" class="rule-list">
              <div
                v-for="r in g.rules"
                :key="r.id"
                class="rule-item"
                @click="openEditRule(g, r)"
              >
                <div class="rule-name">{{ r.name }}</div>
                <div class="rule-tags">
                  <el-tag v-if="r.pri && r.pri !== 1" size="small" type="" class="rule-tag">优先级 {{ r.pri }}</el-tag>
                  <el-tag v-if="r.free_text" size="small" type="info" class="rule-tag">促销 {{ r.free_text }}</el-tag>
                  <el-tag v-for="(inc, i) in splitArr(r.include)" :key="'i' + i" size="small" type="success" class="rule-tag">包含 {{ inc }}</el-tag>
                  <el-tag v-for="(exc, i) in splitArr(r.exclude)" :key="'e' + i" size="small" type="danger" class="rule-tag">排除 {{ exc }}</el-tag>
                  <el-tag v-if="r.size" size="small" type="warning" class="rule-tag">大小 {{ r.size }} GB</el-tag>
                </div>
              </div>
            </div>
            <el-empty v-else description="没有规则，请点击“增加规则”" :image-size="60" />
          </div>
        </el-collapse-transition>
      </el-card>
    </div>

    <el-dialog
      v-model="ruleDialog"
      :title="ruleForm.rule_id ? '编辑规则：' + ruleForm.group_name : '新增规则：' + ruleForm.group_name"
      width="720px"
      :close-on-click-modal="false"
    >
      <el-form label-width="120px">
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="规则名称" required>
              <el-input v-model="ruleForm.rule_name" placeholder="自定义规则名称" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <template #label>优先级<HelpTip text="同一个规则组内，规则优先级的数值越小优先级越高" /></template>
              <el-select v-model="ruleForm.rule_pri">
                <el-option v-for="n in PRI_OPTIONS" :key="n" :value="n" :label="n" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item>
              <template #label>包含规则<HelpTip text="只有种子标题或副标题中包括这些关键字或匹配正式表达式才会命中；对大小写不敏感，配置为空为不启用该规则；可以配置多行，多行之间是【与】的关系，即多行条件都包含时才会命中，单行内可以用'|'来表示【或】，即包括其一即命中" /></template>
              <el-input v-model="ruleForm.rule_include" type="textarea" :rows="4" placeholder="必须包含的关键字或正则表达式" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <template #label>排除规则<HelpTip text="种子标题或副标题中如果有这些关键字或匹配正式表达式则会被跳过；对大小写不敏感，不能带引号，配置为空为不启用该规则；可以配置多行，多行之间是【与】的关系，即多行条件都不包含时才会跳过，单行内可以用'|'来表示【或】，即包括其一即跳过" /></template>
              <el-input v-model="ruleForm.rule_exclude" type="textarea" :rows="4" placeholder="不能包含的关键字或正则表达式" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item>
              <template #label>大小限制(GB)<HelpTip text="只有满足大小限制的种子文件才会被命中，单位是GB，如果是剧集则是指的单集大小（多集时按集数折算）；不配置则不启用该条件；如只配置1个数字表示小于等于该大小的才会被命中；如配置2个数字(使用英文逗号分隔)表示在中间大小的才会被命中" /></template>
              <el-input v-model="ruleForm.rule_sizelimit" placeholder="如 1-10" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item>
              <template #label>促销<HelpTip text="只有满足促销条件的种子才会被命中，免费包括2X免费" /></template>
              <el-select v-model="ruleForm.rule_free">
                <el-option v-for="f in FREE_OPTIONS" :key="f.value" :value="f.value" :label="f.label" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <div v-if="initGroups.length" class="template-section">
        <div class="template-title">规则模板</div>
        <div v-for="g in initGroups" :key="g.id" class="template-group">
          <details>
            <summary class="template-summary">模板-{{ g.name }}</summary>
            <div class="template-rules">
              <el-button
                v-for="(r, i) in g.rules"
                :key="i"
                size="small"
                plain
                class="template-btn"
                @click="applyTemplate(r)"
              >{{ r.name }}</el-button>
            </div>
          </details>
        </div>
      </div>
      <template #footer>
        <el-button v-if="ruleForm.rule_id" :icon="Delete" type="danger" @click="deleteRule({ id: ruleForm.rule_id as number, name: ruleForm.rule_name } as FilterRule)">删除</el-button>
        <el-button @click="ruleDialog = false">取消</el-button>
        <el-button type="primary" :loading="ruleSaving" @click="submitRule">{{ ruleForm.rule_id ? '修改' : '新增' }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="groupDialog" title="新增规则组" width="480px" :close-on-click-modal="false">
      <el-form label-width="120px">
        <el-form-item label="规则组名称" required>
          <el-input v-model="groupForm.name" placeholder="别名" />
        </el-form-item>
        <el-form-item>
          <template #label>默认<HelpTip text="将该规则组设为默认规则，在远程搜索、订阅等未指定规则组的场景下默认使用" /></template>
          <el-switch v-model="groupForm.default" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="groupDialog = false">取消</el-button>
        <el-button type="primary" :loading="groupSaving" @click="submitGroup">新增</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="shareVisible" title="规则分享" width="700px">
      <pre class="share-content">{{ shareContent }}</pre>
      <template #footer>
        <el-button type="primary" @click="shareVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="规则导入" width="700px" :close-on-click-modal="false">
      <el-input v-model="importContent" type="textarea" :rows="10" placeholder="在此处粘贴分享的规则内容" />
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importSaving" @click="submitImport">导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="restoreVisible" title="恢复初始规则" width="480px" :close-on-click-modal="false">
      <el-checkbox-group v-model="restoreSelected" class="restore-group">
        <el-checkbox v-for="g in initGroups" :key="g.id" :value="g.id">{{ g.name }}</el-checkbox>
      </el-checkbox-group>
      <template #footer>
        <el-button @click="restoreVisible = false">取消</el-button>
        <el-button type="primary" :loading="restoreSaving" @click="submitRestore">恢复</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.filterrule-view {
  padding: 16px;
}
.empty-tip {
  margin-top: 40px;
}
.group-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 16px;
}
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.rule-item-readonly {
  cursor: default !important;
}
.rule-item-readonly:hover {
  border-color: var(--el-border-color-lighter) !important;
}
.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}
.collapse-icon {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  transition: transform 0.2s;
}
.default-icon {
  color: var(--el-color-warning);
}
.group-actions {
  display: flex;
  gap: 4px;
}
.rule-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rule-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.rule-item:hover {
  border-color: var(--el-color-primary);
}
.rule-name {
  font-weight: 600;
  margin-bottom: 6px;
}
.rule-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.rule-tag {
  margin-right: 0;
}
.share-content {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 400px;
  overflow-y: auto;
  font-family: Consolas, Monaco, monospace;
  font-size: 12px;
}
.restore-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.template-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-light);
}
.template-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}
.template-group {
  margin-bottom: 6px;
}
.template-summary {
  font-size: 13px;
  cursor: pointer;
  color: var(--el-color-primary);
  padding: 4px 0;
}
.template-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  padding-left: 12px;
}
.template-btn {
  font-size: 12px;
}
</style>
