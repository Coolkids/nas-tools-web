<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { onBeforeRouteLeave } from 'vue-router'
import { getRecognitionSettings, RecognitionAPIError, saveRecognitionCredential, saveRecognitionSettings, testRecognitionOpenAI,
  type RecognitionProbeResult, type RecognitionSettingsResponse, type RecognitionSettingsValue } from '@/api/recognition'
import { getSchedulerJobs, getTmdbGenres, type SchedulerJob } from '@/api/system'
import RecognitionSettingField from './RecognitionSettingField.vue'
import RecognitionCleanupActions from './RecognitionCleanupActions.vue'
import LLMTokenUsage from './LLMTokenUsage.vue'
import { applyOpenAIServiceAddress, openAIServicePresets } from './openAIServicePresets'
import { fieldSection, getSetting, mergeSettings, setSetting, settingsFields, settingsGroups, settingsPatch, validateField,
  type SettingsField, type SettingsGroup } from './settingsFields'

const props = withDefaults(defineProps<{ cacheOnly?: boolean; cleanupOnly?: boolean }>(), { cacheOnly: false, cleanupOnly: false })
const emit = defineEmits<{ saved: [] }>()
const $q = useQuasar()
const root = ref<HTMLElement>()
const snapshot = ref<RecognitionSettingsResponse>()
const draft = ref<RecognitionSettingsValue>()
const active = ref<SettingsGroup>(props.cacheOnly ? 'cache' : props.cleanupOnly ? 'records' : 'engines')
const loading = ref(true), saving = ref(false), conflict = ref(false)
const error = ref(''), notice = ref('')
const errors = ref<Record<string, string>>({})
const expanded = ref(false)
const formRevision = ref(0)
const secretInput = ref('')
const secretBusy = ref(false), probing = ref(false)
const probeResult = ref<RecognitionProbeResult>()
const schedulerJobs = ref<SchedulerJob[]>([])
const tmdbGenres = ref<Array<{ id: number; name: string }>>([])
const tmdbGenresLoading = ref(false)
const tmdbGenresError = ref('')
const preferredGenrePath = 'recognition.matching.preferred_genre_id'
const preferredGenreChoices = computed(() => {
  const options = tmdbGenres.value.map(genre => ({ label: genre.name, value: genre.id }))
  const savedValue = getSetting(draft.value, preferredGenrePath)
  if (typeof savedValue === 'number' && !options.some(option => option.value === savedValue) && savedValue !== 0) {
    options.unshift({ label: '已保存类别（TMDB 未返回名称）', value: savedValue })
  }
  options.push({ label: '无偏好', value: 0 })
  return options
})
const fields = computed(() => settingsFields.filter(field => props.cacheOnly ? field.group === 'cache'
  : props.cleanupOnly ? field.path.startsWith('recognition.records.cleanup.') : true).map(field => field.path === preferredGenrePath
    ? { ...field, choices: preferredGenreChoices.value,
      help: tmdbGenresLoading.value ? '正在从 TMDB 加载类别…仅提供有限加权。' : tmdbGenresError.value
        ? `无法从 TMDB 获取类别：${tmdbGenresError.value}。仅提供有限加权。` : field.help }
    : field))
const visibleFields = computed(() => fields.value.filter(field => field.group === active.value))
function sections(items: SettingsField[]) {
  const grouped = new Map<string, SettingsField[]>()
  for (const item of items) { const label = fieldSection(item); grouped.set(label, [...(grouped.get(label) || []), item]) }
  return [...grouped].map(([label, fields]) => ({ label, fields }))
}
const basicSections = computed(() => sections(visibleFields.value.filter(field => !field.advanced)))
const advancedSections = computed(() => sections(visibleFields.value.filter(field => field.advanced)))
const dirtyPatch = computed(() => snapshot.value && draft.value ? settingsPatch(snapshot.value, draft.value, fields.value) : {})
const dirty = computed(() => Object.keys(dirtyPatch.value).length > 0 || secretInput.value.length > 0 || Object.keys(errors.value).length > 0)
const busy = computed(() => saving.value || secretBusy.value || probing.value)
const group = computed(() => settingsGroups.find(item => item.value === active.value)!)
const servicePreset = computed(() => openAIServicePresets[draft.value?.recognition.providers.openai.service_type || 'compatible'])
const backendNames = { memory: '内存', memory_disk: '内存 + 磁盘', redis: 'Redis', valkey: 'Valkey' }
const capabilityReason = computed(() => {
  const reason = snapshot.value?.capabilities.reason
  return reason === 'backend_unsupported' ? '内存后端不支持自动热刷新；缓存与手动刷新仍可用。'
    : reason === 'cache_disabled' ? '识别缓存总开关已关闭，缓存读取、写入和刷新均停止。'
    : reason === 'disabled_by_user' ? '自动热刷新已关闭。'
    : reason === 'backend_change_pending' ? '缓存后端变更等待重启。'
    : reason === 'storage_maintenance' ? '存储正在维护，自动刷新暂时停止。'
    : reason === 'service_shutdown' ? '刷新服务正在关闭。' : '当前后端支持自动热刷新。'
})
const cleanupNext = computed(() => {
  const job = schedulerJobs.value.find(item => item.namespace === 'main' && item.id === 'recognition_record_cleanup')
  return job?.next_run_time ? new Date(job.next_run_time).toLocaleString() : '未调度；可前往服务页查看状态'
})
const recordExplanation = computed(() => draft.value?.recognition.records.mode === 'all'
  ? '保存全部请求及节点、候选，可回放已保存的历史。'
  : draft.value?.recognition.records.mode === 'none'
    ? '不保存识别历史或暂存文件；活跃任务可实时查看，结束回收后没有历史详情。'
    : '默认只保存失败、超时、待确认和异常中断；成功、跳过及用户主动取消不保存。统计仅描述实际保存范围。')
const request = new AbortController()
let disposed = false

function apply(response: RecognitionSettingsResponse, preserve = false) {
  const patch = preserve ? dirtyPatch.value : {}
  snapshot.value = response
  draft.value = mergeSettings(response, patch)
  errors.value = {}; error.value = ''; conflict.value = false
  formRevision.value++
  probeResult.value = undefined
}
async function loadTmdbGenres() {
  tmdbGenresLoading.value = true
  tmdbGenresError.value = ''
  try {
    const response = await getTmdbGenres()
    if (response.code !== 0 || !Array.isArray(response.genres)) throw new Error(response.msg || 'TMDB 类型列表无效')
    const byId = new Map<number, string>()
    for (const genre of response.genres) {
      if (Number.isSafeInteger(genre.id) && genre.id > 0 && genre.name?.trim()) byId.set(genre.id, genre.name.trim())
    }
    if (!byId.size) throw new Error('TMDB 未返回类型列表')
    tmdbGenres.value = [...byId].map(([id, name]) => ({ id, name }))
  } catch (cause) {
    if (!disposed) tmdbGenresError.value = (cause as Error).message || 'TMDB 类型列表加载失败'
  } finally {
    if (!disposed) tmdbGenresLoading.value = false
  }
}
async function load(preserve = false) {
  loading.value = true
  try {
    const response = await getRecognitionSettings(request.signal)
    if (!disposed) { apply(response, preserve); notice.value = preserve ? '已重新读取，并保留本页修改。请核对后再次保存。' : '' }
  } catch (cause) { if (!disposed) fail(cause) }
  finally { if (!disposed) loading.value = false }
}
function disabled(field: SettingsField) {
  return busy.value || (field.path === preferredGenrePath && tmdbGenresLoading.value)
    || Boolean(field.hot && !snapshot.value?.capabilities.hot_refresh_supported)
}
function change(field: SettingsField, value: unknown) {
  if (!draft.value) return
  setSetting(draft.value, field.path, value)
  if (field.path.startsWith('recognition.providers.openai.')) probeResult.value = undefined
  const message = validateField(field, value, draft.value)
  if (message) errors.value[field.path] = message
  else delete errors.value[field.path]
  notice.value = ''
}
function durationValidity(field: SettingsField, message: string | null) {
  if (message) errors.value[field.path] = message
  else delete errors.value[field.path]
}
async function focusField(path: string) {
  const field = fields.value.find(item => item.path === path)
  if (field) { active.value = field.group; if (field.advanced) expanded.value = true }
  await nextTick()
  const element = [...(root.value?.querySelectorAll<HTMLElement>('[data-field]') || [])].find(item => item.dataset.field === path)
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  element?.querySelector<HTMLInputElement>('input')?.focus()
}
function fail(cause: unknown) {
  error.value = cause instanceof RecognitionAPIError && cause.status === 403 && cause.code === 'ADMINISTRATOR_REQUIRED' ? '需要管理员权限才能查看或修改识别设置。'
    : (cause as Error).message || '操作失败，请稍后重试'
  if (cause instanceof RecognitionAPIError) {
    if (cause.status === 409) { conflict.value = true; error.value = '配置已在其他页面更新，当前草稿已保留。请重新读取并合并，再核对保存。' }
    if (cause.field) { errors.value[cause.field] = cause.message; void focusField(cause.field) }
  }
}
function validate(): boolean {
  if (!draft.value) return false
  for (const field of fields.value) {
    const message = validateField(field, getSetting(draft.value, field.path), draft.value)
    if (message) errors.value[field.path] = message
  }
  if (!props.cacheOnly && !props.cleanupOnly) {
    const sum = Object.values(draft.value.recognition.matching.weights).reduce((total, value) => total + Number(value), 0)
    const path = 'recognition.matching.weights.title'
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 1e-9) errors.value[path] = '五项权重总和必须为 1'
    else if (errors.value[path] === '五项权重总和必须为 1') delete errors.value[path]
  }
  const invalid = Object.keys(errors.value)[0]
  if (invalid) { void focusField(invalid); error.value = '请修正标出的字段后再保存。'; return false }
  return true
}
async function save() {
  if (busy.value || !snapshot.value || !draft.value || !validate()) return
  saving.value = true; error.value = ''; notice.value = ''
  let settingsCommitted = false
  try {
    if (Object.keys(dirtyPatch.value).length) { apply(await saveRecognitionSettings(dirtyPatch.value, snapshot.value.version)); settingsCommitted = true }
    if (secretInput.value.trim()) {
      const response = await saveRecognitionCredential(secretInput.value, false, snapshot.value.version)
      secretInput.value = ''; apply(response)
    }
    notice.value = '设置已保存'; emit('saved')
  } catch (cause) { fail(cause); if (settingsCommitted && secretInput.value.trim()) error.value = '识别设置已保存；密钥尚未保存。' + error.value }
  finally { saving.value = false }
}
async function credential(clear = false) {
  if (!snapshot.value || busy.value) return
  secretBusy.value = true; error.value = ''
  try {
    const response = await saveRecognitionCredential(clear ? null : secretInput.value, clear, snapshot.value.version)
    apply(response, true); secretInput.value = ''; notice.value = clear ? 'API 密钥已清除' : 'API 密钥已保存'
  } catch (cause) { fail(cause) }
  finally { secretBusy.value = false }
}
function clearCredential() {
  $q.dialog({ title: '清除 OpenAI API 密钥？', message: '后续请求将不再携带此密钥，模型及地址配置保留。', cancel: true, persistent: true })
    .onOk(() => { void credential(true) })
}
async function probe() {
  if (!snapshot.value || !draft.value || busy.value) return
  const { service_type, extraction_mode, base_url, model, temperature, max_output_tokens, response_format_mode, token_parameter } = draft.value.recognition.providers.openai
  probing.value = true; error.value = ''; probeResult.value = undefined
  try { probeResult.value = await testRecognitionOpenAI({ service_type, extraction_mode, base_url, model, temperature, max_output_tokens, response_format_mode, token_parameter }, secretInput.value || null, snapshot.value.version) }
  catch (cause) { fail(cause) }
  finally { probing.value = false }
}
function useServiceAddress() {
  if (!draft.value) return
  const options = applyOpenAIServiceAddress(draft.value.recognition.providers.openai)
  for (const key of ['base_url', 'model'] as const) {
    const field = fields.value.find(item => item.path === `recognition.providers.openai.${key}`)!
    change(field, options[key])
  }
}
function confirmLeave(): Promise<boolean> {
  if (busy.value) return Promise.resolve(false)
  if (!dirty.value) return Promise.resolve(true)
  return new Promise(resolve => $q.dialog({ title: '离开前放弃修改？', message: '当前识别设置与未保存密钥尚未保存。', cancel: true, persistent: true })
    .onOk(() => resolve(true)).onCancel(() => resolve(false)).onDismiss(() => resolve(false)))
}
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = '' } }
onBeforeRouteLeave(confirmLeave)
onMounted(() => {
  void load(); if (!props.cacheOnly && !props.cleanupOnly) void loadTmdbGenres(); window.addEventListener('beforeunload', beforeUnload)
  if (!props.cacheOnly) void getSchedulerJobs().then(value => { schedulerJobs.value = value.jobs || [] }).catch(() => {})
})
onBeforeUnmount(() => { disposed = true; request.abort(); secretInput.value = ''; window.removeEventListener('beforeunload', beforeUnload) })
defineExpose({ confirmLeave, load })
</script>

<template>
  <section ref="root" class="recognition-settings" :aria-label="cacheOnly ? '识别缓存策略' : 'AI 推理与媒体识别'">
    <div class="recognition-heading">
      <div><h2>{{ cacheOnly ? '识别缓存策略' : cleanupOnly ? '定时清理识别记录' : 'AI 推理与媒体识别' }}</h2><p>独立引擎 · 完整并行 · 统一匹配</p></div>
      <q-btn v-if="!cacheOnly && !cleanupOnly" flat color="primary" icon="fact_check" label="媒体识别记录" to="/recognition" />
    </div>
    <q-banner v-if="error" class="settings-error" role="alert">{{ error }}
      <template #action><q-btn v-if="conflict" flat label="重新读取并合并" :disable="busy" @click="load(true)" /><q-btn v-else-if="!snapshot" flat label="重新加载" @click="load()" /></template>
    </q-banner>
    <q-banner v-if="notice" dense class="settings-notice" role="status">{{ notice }}</q-banner>
    <q-linear-progress v-if="loading" indeterminate class="q-my-md" />
    <template v-if="draft && snapshot">
      <q-tabs v-if="!cacheOnly && !cleanupOnly" v-model="active" class="recognition-tabs" align="left" active-color="primary" indicator-color="primary" no-caps scrollable>
        <q-tab v-for="item in settingsGroups" :key="item.value" :name="item.value" :label="item.label" :icon="item.icon" />
      </q-tabs>
      <div class="recognition-section">
        <div class="section-heading"><h3>{{ group.label }}</h3><p>{{ group.description }}</p></div>
        <div v-if="active === 'engines'" class="baseline-engine"><q-icon name="check_circle" color="positive" size="24px" /><div><strong>Anitopy</strong><span>本地解析，无需网络</span></div><q-badge outline color="positive">始终启用</q-badge></div>
        <q-banner v-if="active === 'execution'" dense class="policy-banner">完整并行执行，不采用渐进早停。各阶段耗时可能重叠，总耗时不能通过相加得出。</q-banner>
        <div v-if="active === 'cache'" class="backend-status">
          <div><span>配置后端</span><strong>{{ backendNames[snapshot.capabilities.configured_backend] }}</strong></div>
          <div><span>实际后端</span><strong>{{ backendNames[snapshot.capabilities.actual_backend] }}</strong></div>
          <div><span>当前自动热刷新</span><strong>{{ snapshot.capabilities.effective_enabled ? '已开启' : '未开启' }}</strong></div>
          <q-btn flat dense color="primary" label="管理缓存方式" to="/basic?tab=cache" />
          <p :class="{ 'text-warning': snapshot.capabilities.configured_backend !== snapshot.capabilities.actual_backend }">{{ capabilityReason }}<span v-if="snapshot.capabilities.actual_backend === 'memory'"> 自动刷新设置保留，切回支持的后端后按原期望生效。</span></p>
        </div>
        <p v-if="active === 'records' && !cleanupOnly" class="policy-banner">{{ recordExplanation }}</p>
        <section v-for="section in basicSections" :key="section.label" class="settings-subsection" :aria-label="section.label">
          <h4>{{ section.label }}</h4>
          <div class="recognition-grid">
            <RecognitionSettingField v-for="item in section.fields" :key="`${formRevision}:${item.path}`" :field="item" :model-value="getSetting(draft, item.path)" :error="errors[item.path]" :disable="disabled(item)" @update:model-value="change(item, $event)" @validity="durationValidity(item, $event)" />
          </div>
        </section>
        <div v-if="active === 'engines'" class="policy-banner" data-testid="openai-service-help">
          <strong>{{ servicePreset.label }}</strong><p>{{ servicePreset.help }}</p>
          <q-btn v-if="servicePreset.base_url" flat dense color="primary" label="填入推荐地址" :disable="busy" @click="useServiceAddress" />
        </div>
        <q-expansion-item v-if="advancedSections.length" v-model="expanded" label="高级设置" icon="tune" class="advanced-settings">
          <section v-for="section in advancedSections" :key="section.label" class="settings-subsection" :aria-label="section.label"><h4>{{ section.label }}</h4><div class="recognition-grid"><RecognitionSettingField v-for="item in section.fields" :key="`${formRevision}:${item.path}`" :field="item" :model-value="getSetting(draft, item.path)" :error="errors[item.path]" :disable="disabled(item)" @update:model-value="change(item, $event)" /></div></section>
        </q-expansion-item>
        <div v-if="active === 'engines'" class="credential-card">
          <div class="credential-heading"><strong>兼容 API 密钥</strong><q-badge :color="snapshot.recognition.providers.openai.api_key_set ? 'positive' : 'grey-7'">{{ snapshot.recognition.providers.openai.api_key_set ? '已配置' : '未配置' }}</q-badge></div>
          <p>密钥不回显，留空保持原值。关闭引擎后仍保留密钥与配置。</p>
          <q-banner v-if="snapshot.recognition.providers.openai.credential_message" dense class="text-warning">{{ snapshot.recognition.providers.openai.credential_message }}</q-banner>
          <q-input v-model="secretInput" outlined dense type="password" autocomplete="new-password" label="新的 API 密钥（留空保持）" :disable="busy" />
          <div class="row q-gutter-sm q-mt-sm"><q-btn outline color="primary" label="保存密钥" :disable="!secretInput.trim() || busy" :loading="secretBusy" @click="credential(false)" /><q-btn flat color="negative" label="清除密钥" :disable="!snapshot.recognition.providers.openai.api_key_set || busy" @click="clearCredential" /><q-btn outline color="primary" label="测试 OpenAI 连接" :loading="probing" :disable="busy" @click="probe" /></div>
          <p>测试使用当前地址、模型和新输入密钥（留空使用已保存密钥），最长等待 15 秒；不会保存草稿或生成识别历史。</p>
          <q-banner v-if="probeResult" dense :class="probeResult.status === 'success' ? 'settings-notice' : 'settings-error'" role="status">
            {{ probeResult.status === 'success' ? '连接测试成功' : '连接测试失败' }}<span v-if="probeResult.error">：{{ probeResult.error }}</span>
            <div v-if="probeResult.capabilities.service_type">服务：{{ openAIServicePresets[probeResult.capabilities.service_type]?.label }}</div>
            <div v-if="probeResult.capabilities.extraction_mode">提取方案：{{ probeResult.capabilities.extraction_mode }}</div>
            <div v-if="probeResult.capabilities.format">输出格式：{{ probeResult.capabilities.format }} · Token 参数：{{ probeResult.capabilities.token_parameter }}</div>
            <div v-if="probeResult.capabilities.downgrades?.length">兼容协商：{{ probeResult.capabilities.downgrades.join('、') }}</div>
            <LLMTokenUsage :usage="probeResult.usage" />
          </q-banner>
        </div>
        <div v-if="active === 'records'" class="cleanup-policy"><p>下次定时执行：{{ cleanupNext }}。定时任务始终只清理过期或超量历史。</p>
          <RecognitionCleanupActions /><q-btn flat dense color="primary" label="前往定时任务" to="/service" /></div>
      </div>
      <div class="recognition-savebar"><span>{{ dirty ? '有未保存变更' : '设置已同步' }}</span><div class="row q-gutter-sm"><q-btn flat label="重置变更" :disable="!dirty || busy" @click="apply(snapshot); secretInput = ''; notice = ''" /><q-btn color="primary" unelevated label="保存设置" :loading="saving" :disable="!dirty || busy || loading" @click="save" /></div></div>
    </template>
  </section>
</template>

<style scoped>
.recognition-settings { min-width: 0; color: var(--text-primary); }
.recognition-heading { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; padding-bottom: 20px; }
h2 { margin: 0; font-size: 22px; line-height: 1.4; font-weight: 700; }
.recognition-heading p, .section-heading p { margin: 6px 0 0; color: var(--text-secondary); line-height: 1.6; }
.recognition-tabs { background: var(--surface-muted); border-radius: 12px; margin-bottom: 24px; }
.recognition-tabs :deep(.q-tab) { min-width: 130px; padding: 14px 20px; }
.recognition-section { border: 1px solid var(--border-subtle); border-radius: 14px; padding: 24px; background: var(--surface); }
.section-heading { margin-bottom: 24px; }
h3 { margin: 0; font-size: 18px; font-weight: 650; }
.settings-subsection + .settings-subsection { margin-top: 24px; }
.settings-subsection h4 { margin: 0 0 12px; font-size: 14px; font-weight: 600; color: var(--text-secondary); }
.recognition-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 190px), 1fr)); gap: 16px; align-items: start; }
.recognition-grid :deep(.recognition-field--wide) { grid-column: span 2; }
.settings-subsection[aria-label="缓存有效期"] .recognition-grid { grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); }
.baseline-engine { display: flex; gap: 12px; align-items: center; padding: 16px; border: 1px solid var(--border-subtle); border-radius: 10px; margin-bottom: 24px; }
.baseline-engine > div:not(.q-badge) { flex: 1; }.baseline-engine span { display: block; color: var(--text-secondary); font-size: 12px; margin-top: 3px; }
.advanced-settings, .credential-card, .cleanup-policy { margin-top: 28px; border-top: 1px solid var(--border-subtle); padding-top: 16px; }
.advanced-settings .settings-subsection { padding: 16px 0; }.credential-heading { display: flex; gap: 12px; align-items: center; }
.credential-card p, .cleanup-policy p { color: var(--text-secondary); font-size: 13px; line-height: 1.7; }
.backend-status { background: var(--surface-muted); padding: 18px; border-radius: 10px; display: flex; flex-wrap: wrap; gap: 20px 28px; margin-bottom: 24px; }
.backend-status span { display: block; font-size: 12px; color: var(--text-secondary); }.backend-status p { flex-basis: 100%; margin: 0; font-size: 13px; line-height: 1.6; }
.policy-banner { background: var(--surface-muted); border-radius: 8px; margin: 0 0 24px; padding: 14px; font-size: 13px; line-height: 1.7; }
.settings-error, .settings-notice { margin-bottom: 16px; border-radius: 8px; }.settings-error { background: color-mix(in srgb, var(--q-negative) 10%, var(--surface)); color: var(--q-negative); }.settings-notice { background: var(--primary-soft); color: var(--text-primary); }
.recognition-savebar { position: sticky; bottom: 16px; display: flex; justify-content: space-between; align-items: center; gap: 16px; background: var(--surface-raised); padding: 16px 20px; margin-top: 24px; border: 1px solid var(--border-subtle); border-radius: 12px; box-shadow: 0 4px 18px #1720330b; z-index: 5; }
.recognition-savebar > span { color: var(--text-secondary); font-size: 13px; }
@media (min-width: 1200px) { .recognition-section > .settings-subsection[aria-label="OpenAI 兼容 API"] .recognition-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 767px) { .recognition-grid, .settings-subsection[aria-label="缓存有效期"] .recognition-grid { grid-template-columns: minmax(0, 1fr); gap: 16px; }.recognition-grid :deep(.recognition-field--wide) { grid-column: auto; }.recognition-section { padding: 18px 14px; }.recognition-tabs :deep(.q-tab) { min-width: 110px; padding-inline: 12px; }.recognition-savebar { bottom: calc(68px + var(--safe-bottom)); padding: 12px; flex-wrap: wrap; }.recognition-savebar > .row { margin-left: auto; }.advanced-settings .recognition-grid { padding-inline: 0; } }
</style>
