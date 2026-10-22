import type { RecognitionSettingsValue, SettingsPatch, TimeoutStage } from '@/api/recognition'

export type SettingsGroup = 'engines' | 'execution' | 'matching' | 'cache' | 'records'
export interface SettingsField {
  path: string; label: string; group: SettingsGroup
  kind: 'boolean' | 'text' | 'url' | 'integer' | 'number' | 'nullable' | 'select' | 'duration'
  help?: string; advanced?: boolean; min?: number; max?: number; allowForever?: boolean
  choices?: { label: string; value: string | number }[]; unlimitedLabel?: string
  provider?: 'anitopy_ml' | 'openai'; hot?: boolean
}
const choices = (options: [string, string | number][]) => options.map(([label, value]) => ({ label, value }))
const field = (group: SettingsGroup, path: string, label: string, kind: SettingsField['kind'], options: Partial<SettingsField> = {}): SettingsField => ({ group, path, label, kind, ...options })
const timeoutNames: [TimeoutStage, string][] = [['total', '识别总时限'], ['queue', '排队'], ['preprocess', '规则预处理'],
  ['anitopy', 'Anitopy'], ['anitopy_ml', 'Anitopy-ML'], ['openai', 'OpenAI'], ['query_plan', '查询规划'],
  ['tmdb_request', 'TMDB 单请求'], ['tmdb_stage', 'TMDB 阶段'], ['rank', '候选评分'], ['episode', '本集详情'], ['fallback', '回退']]
export const settingsGroups = [
  { value: 'engines', label: '解析引擎', icon: 'hub', description: 'Anitopy 始终启用，按需加入独立的 ML 与 OpenAI 兼容服务。' },
  { value: 'execution', label: '并行与超时', icon: 'speed', description: '独立解析和查询并行执行，最终统一校验结果；有限预算取总时限与阶段时限的剩余最小值。' },
  { value: 'matching', label: 'TMDB 与匹配', icon: 'manage_search', description: '限制查询范围，综合名称证据与硬约束选择结果；偏好不会覆盖类型、季集等硬矛盾。' },
  { value: 'cache', label: '缓存策略', icon: 'storage', description: '控制媒体识别缓存的启用状态。' },
  { value: 'records', label: '记录与清理', icon: 'history', description: '记录范围与清理规则独立。切换记录类型不会删除已有历史。' }
] as const
export const settingsFields: SettingsField[] = [
  field('engines', 'recognition.providers.anitopy_ml.enabled', '启用 Anitopy-ML', 'boolean'),
  field('engines', 'recognition.providers.anitopy_ml.endpoint', 'ML 接口地址', 'url', { provider: 'anitopy_ml', help: '例如 http://127.0.0.1:8000；支持直接填写 /v1/parse。' }),
  field('engines', 'recognition.providers.anitopy_ml.model_revision', 'ML 模型版本', 'text', { provider: 'anitopy_ml', help: '版本变化会更新解析缓存签名。' }),
  field('engines', 'recognition.providers.openai.enabled', '启用 OpenAI 兼容 API', 'boolean'),
  field('engines', 'recognition.providers.openai.service_type', '兼容 API 服务类型', 'select', { provider: 'openai', choices: choices([['其他 OpenAI 兼容服务', 'compatible'], ['Ollama', 'ollama'], ['llama.cpp', 'llama_cpp'], ['DeepSeek', 'deepseek']]), help: '按服务选择自动参数；切换类型会保留当前地址、模型和密钥。' }),
  field('engines', 'recognition.providers.openai.extraction_mode', 'API 提取方案', 'select', { provider: 'openai', choices: choices([['Core · 作品核心字段', 'core'], ['Full · 核心与发布信息', 'full']]), help: 'Core 提取名称、别名、类型、年份、季、集；Full 另提取发布组、来源、分辨率、视频/音频编码与字幕。模式切换后使用独立解析缓存，Full 发布字段不参与作品匹配加权。' }),
  field('engines', 'recognition.providers.openai.base_url', 'OpenAI API 地址', 'url', { provider: 'openai', help: '填写 Chat Completions 基础地址（如 http://服务器:11434/v1）或完整接口地址。支持自定义前缀，不在 URL 中填写密钥。' }),
  field('engines', 'recognition.providers.openai.model', '模型名称', 'text', { provider: 'openai' }),
  field('engines', 'recognition.providers.openai.temperature', '温度', 'number', { min: 0, max: 2, provider: 'openai', advanced: true }),
  field('engines', 'recognition.providers.openai.max_output_tokens', '最大输出 Token', 'integer', { min: 1, provider: 'openai', advanced: true }),
  field('engines', 'recognition.providers.openai.response_format_mode', '输出格式', 'select', { provider: 'openai', advanced: true, choices: choices([['自动协商', 'auto'], ['JSON Schema', 'json_schema'], ['JSON Object', 'json_object'], ['提示词 JSON', 'prompt']]), help: '自动模式仅在服务明确拒绝格式参数时降级；提示词 JSON 不发送 response_format，所有模式仍严格校验结果。' }),
  field('engines', 'recognition.providers.openai.token_parameter', 'Token 参数', 'select', { provider: 'openai', advanced: true, choices: choices([['自动协商', 'auto'], ['max_tokens', 'max_tokens'], ['max_completion_tokens', 'max_completion_tokens']]) }),
  field('engines', 'recognition.query.prefer_english', '搜索优先使用英文名', 'boolean', { help: '有英文标题、副标题或别名时先查英文；无法确认作品时再回退其他名称。没有英文名时直接使用其他名称。' }),
  field('engines', 'recognition.profiles.parse_only.network_allowed', '仅解析时允许联网', 'boolean', { advanced: true, help: '仅解析始终不查询 TMDB。' }),
  field('engines', 'recognition.profiles.resolve.network_allowed', '媒体匹配时允许联网', 'boolean', { advanced: true }),
  field('engines', 'recognition.profiles.resolve.tmdb_allowed', '允许查询 TMDB', 'boolean', { advanced: true }),
  ...(['max_running_tasks', 'max_queued_tasks', 'max_inflight_provider_requests'] as const).map((key, i) =>
    field('execution', `recognition.execution.${key}`, ['同时识别任务数', '等待队列长度', '解析工作并发上限'][i], 'integer', { min: 1 })),
  field('execution', 'recognition.query.tmdb_concurrency', 'TMDB 并发', 'integer', { min: 1 }),
  field('execution', 'recognition.query.tmdb_qps', 'TMDB 每秒请求数', 'number', { min: Number.MIN_VALUE }),
  field('execution', 'recognition.execution.allow_partial_success_on_deadline', '截止前已完整验证的结果可成功返回', 'boolean', { advanced: true, help: '不适用于用户取消，也不会接受未通过完整校验的候选。' }),
  ...timeoutNames.map(([key, label]) => field('execution', `recognition.timeouts.${key}_ms`, `${label}（毫秒）`, 'nullable',
    { min: 1, unlimitedLabel: '不限时', help: ['anitopy_ml', 'openai'].includes(key) ? '引擎关闭时预算保留，当前不生效。' : undefined })),
  field('matching', 'recognition.query.max_queries', '最大查询数', 'nullable', { min: 1, unlimitedLabel: '不限数量', help: '不限数量仍去重并遵守并发和每秒请求数限制。' }),
  ...(['max_pages_per_query', 'candidates_per_query', 'detail_top_k', 'tmdb_retry_max'] as const).map((key, i) =>
    field('matching', `recognition.query.${key}`, ['每查询页数', '每查询候选上限', '详情 Top-K', 'TMDB 重试次数'][i], 'integer', { min: key === 'tmdb_retry_max' ? 0 : 1 })),
  field('matching', 'recognition.query.episode_details_enabled', '查询本集详情', 'boolean'),
  field('matching', 'recognition.matching.preferred_type', '优先媒体类型', 'select', { choices: choices([['电视剧', 'tv'], ['电影', 'movie'], ['无偏好', 'unknown']]) }),
  field('matching', 'recognition.matching.preferred_genre_id', '优先类别', 'select', { help: '仅提供有限加权。' }),
  field('matching', 'recognition.matching.adult_policy', '成人候选策略', 'select', { choices: choices([['排除', 'exclude'], ['最低优先级', 'lowest'], ['允许', 'include']]) }),
  ...(['min_name_similarity', 'match_threshold', 'min_score_gap'] as const).map((key, i) =>
    field('matching', `recognition.matching.${key}`, ['名称相似度阈值', '综合匹配阈值', '最小分差'][i], 'number', { min: key === 'min_score_gap' ? 0 : Number.MIN_VALUE, max: 1 })),
  ...(['title', 'type_episode', 'year', 'consensus', 'popularity'] as const).map((key, i) =>
    field('matching', `recognition.matching.weights.${key}`, ['名称权重', '类型与季集权重', '年份权重', '引擎共识权重', '热度权重'][i], 'number', { min: key === 'title' ? Number.MIN_VALUE : 0, max: 1, advanced: true, help: '五项权重总和必须为 1，名称权重大于 0。' })),
  field('cache', 'recognition.cache.enabled', '启用识别缓存', 'boolean', { help: '控制 AI 解析及四层缓存的读取、写入与刷新。' }),
  field('cache', 'recognition.cache.parse.enabled', '启用 AI 解析缓存', 'boolean'),
  field('execution', 'recognition.cache.parse.singleflight', '合并相同 AI 解析请求', 'boolean', { advanced: true }),
  field('cache', 'recognition.cache_v3.stale_grace_seconds', '过期宽限', 'duration', { min: 0 }),
  field('cache', 'recognition.cache_v3.hot_refresh_enabled', '自动刷新热缓存', 'boolean', { hot: true, help: '本周期命中超过 1 次、位于同类有效缓存前 50% 且临近到期时刷新。' }),
  field('cache', 'recognition.cache_v3.refresh_ahead_seconds', '刷新提前量', 'duration', { min: 1, hot: true, help: '提前量达到或超过有限 TTL 时，实际窗口取 TTL 的一半；不过期条目不参与。' }),
  field('cache', 'recognition.cache_v3.refresh_scan_interval_seconds', '刷新扫描间隔', 'duration', { min: 1, hot: true }),
  field('cache', 'recognition.cache_v3.refresh_concurrency', '后台刷新并发', 'integer', { min: 1, max: 32, hot: true }),
  field('records', 'recognition.records.mode', '媒体识别记录类型', 'select', { choices: choices([['记录全部', 'all'], ['只记录失败', 'failed'], ['不记录', 'none']]) }),
  field('records', 'recognition.tracing.stream_enabled', '启用实时识别进度', 'boolean'),
  field('records', 'recognition.records.cleanup.enabled', '定时清理过期识别记录', 'boolean'),
  field('records', 'recognition.records.cleanup.interval_hours', '清理执行周期（小时）', 'integer', { min: 1, max: 8760 }),
  field('records', 'recognition.records.cleanup.retention_value', '数据保留时间', 'integer', { min: 1, max: 36500 }),
  field('records', 'recognition.records.cleanup.retention_unit', '保留时间单位', 'select', { choices: choices([['天', 'day'], ['月', 'month']]) }),
  field('records', 'recognition.records.cleanup.max_records', '最多保留记录数', 'integer', { min: 1 })
]

export function getSetting(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Record<string, unknown>)[key] : undefined, value)
}
export function setSetting(value: object, path: string, setting: unknown) {
  const parts = path.split('.'); let current = value as Record<string, unknown>
  for (const part of parts.slice(0, -1)) current = (current[part] ||= {}) as Record<string, unknown>
  current[parts[parts.length - 1]] = setting
}
export function settingsPatch(before: RecognitionSettingsValue, after: RecognitionSettingsValue, fields = settingsFields): SettingsPatch {
  const patch: SettingsPatch = {}
  for (const { path } of fields) {
    if (JSON.stringify(getSetting(before, path)) !== JSON.stringify(getSetting(after, path))) setSetting(patch, path, getSetting(after, path))
  }
  return patch
}
export function mergeSettings(latest: RecognitionSettingsValue, patch: SettingsPatch): RecognitionSettingsValue {
  const merged = JSON.parse(JSON.stringify(latest)) as RecognitionSettingsValue
  function visit(value: object, prefix = '') {
    for (const [key, next] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (next && typeof next === 'object' && !Array.isArray(next)) visit(next, path)
      else setSetting(merged, path, next)
    }
  }
  visit(patch)
  return merged
}
export function validateField(field: SettingsField, value: unknown, draft: RecognitionSettingsValue): string | null {
  if (value === undefined) return null
  if (field.kind === 'select' && !field.choices?.some(item => item.value === value)) return '请选择有效选项'
  if (field.kind === 'nullable' && value === null) return null
  if (['integer', 'number', 'nullable', 'duration'].includes(field.kind)) {
    if (typeof value !== 'number' || !Number.isFinite(value) || (field.kind !== 'number' && !Number.isSafeInteger(value))) return '请输入有效数值，不能静默取整'
    const minimum = field.kind === 'duration' && field.allowForever && value === 0 ? 0 : field.min ?? 1
    const maximum = field.path.endsWith('cleanup.retention_value') && draft.recognition.records.cleanup.retention_unit === 'month' ? 1200 : field.max ?? (field.kind === 'duration' ? 36500 * 86400 : Number.MAX_SAFE_INTEGER)
    return value < minimum || value > maximum ? '数值超出允许范围' : null
  }
  if (field.kind === 'url' && (value || field.provider && draft.recognition.providers[field.provider].enabled)) {
    try {
      const url = new URL(String(value))
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error()
    } catch { return '请输入有效 HTTP(S) 地址，不在 URL 中填写凭据' }
  }
  if (field.path.endsWith('openai.model') && draft.recognition.providers.openai.enabled && (typeof value !== 'string' || !value.trim())) return '启用 OpenAI 时须填写模型名称'
  return null
}

export function fieldSection(field: SettingsField): string {
  const path = field.path
  if (field.group === 'engines') return path.endsWith('.prefer_english') ? '搜索偏好'
    : path.includes('.anitopy_ml.') ? 'Anitopy-ML' : path.includes('.openai.') ? 'OpenAI 兼容 API' : '联网范围'
  if (field.group === 'execution') return path.includes('.timeouts.') ? '阶段时限' : '并发限制'
  if (field.group === 'matching') return path.includes('.query.') ? '查询范围' : path.includes('.weights.') ? '评分权重'
    : /min_name_similarity|match_threshold|min_score_gap/.test(path) ? '匹配阈值' : '候选偏好'
  if (field.group === 'cache') return path.includes('ttl_seconds') || path.includes('stale_grace') ? '缓存有效期'
    : path.includes('.cache_v3.') ? '热缓存刷新' : '缓存开关'
  return path.includes('.cleanup.') ? '定时清理' : '记录范围'
}
