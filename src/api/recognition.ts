import instance, { doAction, redirectToLogin } from './request'
import axios from 'axios'

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface RecognitionProviderResult {
  attempt_id: string
  provider_id: string
  version?: string | null
  status: string
  input: Record<string, JsonValue>
  raw_result: JsonValue
  normalized_result: JsonValue
  elapsed_ms?: number | null
  error?: string | null
}

export interface RecognitionRecord {
  request_id: string
  original_name: string
  source: string
  stage: string
  created_at: string
  overall_result: Record<string, JsonValue>
  provider_results: RecognitionProviderResult[]
  tmdb_results: Array<Record<string, JsonValue>>
  actions: Array<Record<string, JsonValue>>
}

export interface RecognitionListResult {
  code: number
  msg?: string
  total: number
  page: number
  page_size: number
  records: RecognitionRecord[]
}

export interface RecognitionDetailResult {
  code: number
  msg?: string
  record?: RecognitionRecord & {
    context: Record<string, JsonValue>
    attempts: Array<Record<string, JsonValue>>
  }
}

export function getRecognitionProviders(): Promise<{
  code: number
  providers: Array<Record<string, JsonValue>>
  diagnostics: Array<Record<string, JsonValue>>
}> {
  return doAction('get_recognition_providers', {})
}

export function getRecognitionRecords(filters: {
  title: string
  source?: string
  status?: string
  provider_id?: string
  action_type?: string
  reason?: string
  created_from?: string
  created_to?: string
  page: number
  page_size: number
}): Promise<RecognitionListResult> {
  return doAction<RecognitionListResult>('get_recognition_records', filters)
}

export function getRecognitionRecordDetail(requestId: string): Promise<RecognitionDetailResult> {
  return doAction<RecognitionDetailResult>('get_recognition_record_detail', { request_id: requestId })
}

export function getRecognitionParseCacheInfo(): Promise<{
  code: number
  cache?: { entries: number; bytes: number; generation: number; max_entries: number | null; max_bytes: number | null }
  msg?: string
}> {
  return doAction('get_recognition_parse_cache_info', {})
}

export function clearRecognitionParseCache(): Promise<{
  code: number
  cleared_entries?: number
  cache?: { entries: number; bytes: number; generation: number }
  msg?: string
}> {
  return doAction('clear_recognition_parse_cache', {})
}

export async function downloadRecognitionJsonl(filters: Record<string, string>): Promise<Blob> {
  const response = await instance.get('/recognition_export.jsonl', {
    params: filters,
    responseType: 'blob'
  })
  return response.data as Blob
}

export async function downloadRecognitionXlsx(filters: Record<string, string>): Promise<Blob> {
  const response = await instance.get('/recognition_export.xlsx', {
    params: filters,
    responseType: 'blob'
  })
  return response.data as Blob
}

export type CacheBackend = 'memory' | 'memory_disk' | 'redis' | 'valkey'
export type RecordMode = 'all' | 'failed' | 'none'
export type RecognitionStatus = 'QUEUED' | 'RUNNING' | 'MATCHED' | 'PARSED' | 'FAILED' | 'TIMEOUT' | 'REVIEW_REQUIRED' | 'CANCELLED' | 'SKIPPED'
export type TimeoutStage = 'total' | 'queue' | 'preprocess' | 'anitopy' | 'anitopy_ml' | 'openai' | 'query_plan' | 'tmdb_request' | 'tmdb_stage' | 'rank' | 'episode' | 'fallback'
export type CacheLayer = 'identity' | 'search' | 'detail' | 'episode'
export type CleanupScope = 'expired' | 'all_completed'
export interface OpenAIOptions {
  extraction_mode: 'core' | 'full'
  service_type: 'compatible' | 'ollama' | 'llama_cpp' | 'deepseek'
  enabled: boolean; base_url: string; model: string; temperature: number; max_output_tokens: number
  response_format_mode: 'auto' | 'json_schema' | 'json_object' | 'prompt'
  token_parameter: 'auto' | 'max_tokens' | 'max_completion_tokens'
  api_key_set?: boolean; secret_revision?: string; credential_status?: string; credential_message?: string | null
}
export interface CleanupPolicy {
  enabled: boolean; interval_hours: number; retention_value: number; retention_unit: 'day' | 'month'; max_records: number
}
export interface RecognitionConfig {
  schema_version: 3
  execution: { mode: 'complete_parallel'; progressive_early_stop: boolean
    allow_partial_success_on_deadline: boolean; max_running_tasks: number; max_queued_tasks: number; max_inflight_provider_requests: number }
  timeouts: Record<`${TimeoutStage}_ms`, number | null>
  providers: { anitopy: { enabled: boolean }; anitopy_ml: { enabled: boolean; endpoint: string; model_revision: string }; openai: OpenAIOptions }
  query: { max_queries: number | null; max_pages_per_query: number; candidates_per_query: number; detail_top_k: number
    tmdb_concurrency: number; tmdb_qps: number; tmdb_retry_max: number; episode_details_enabled: boolean; prefer_english: boolean }
  matching: { min_name_similarity: number; match_threshold: number; min_score_gap: number; preferred_type: 'movie' | 'tv' | 'unknown'
    preferred_genre_id: number; adult_policy: 'exclude' | 'lowest' | 'include'
    weights: { title: number; type_episode: number; year: number; consensus: number; popularity: number } }
  cache: { enabled: boolean; parse: { enabled: boolean; singleflight: boolean } }
  cache_v3: { stale_grace_seconds: number; hot_refresh_enabled: boolean; refresh_ahead_seconds: number
    refresh_scan_interval_seconds: number; refresh_concurrency: number }
  records: { mode: RecordMode; cleanup: CleanupPolicy }
  tracing: { stream_enabled: boolean }
}
export interface RecognitionSettingsValue { recognition: RecognitionConfig; cache: { ttl_seconds: Record<string, number> } }
export type SettingsPatch = { recognition?: Record<string, unknown>; cache?: { ttl_seconds?: Record<string, number> } }
export interface RecognitionCapabilities {
  configured_backend: CacheBackend; actual_backend: CacheBackend; cache_enabled: boolean; hot_refresh_supported: boolean
  requested_enabled: boolean; effective_enabled: boolean; reason: string | null; storage_generation: string | number | null
  refresh_windows: Record<CacheLayer, { requested_seconds: number; effective_seconds: number | null; reason: string | null }>
}
export interface RecognitionSettingsResponse extends RecognitionSettingsValue {
  code: number; version: string; defaults: RecognitionSettingsValue; capabilities: RecognitionCapabilities
}
export interface RecognitionProbeResult {
  code: number; status: string; error: string | null; duration_ms: number | null
  capabilities: { service_type?: OpenAIOptions['service_type']; extraction_mode?: OpenAIOptions['extraction_mode']; prompt_version?: string; format?: string; token_parameter?: string; downgrades?: string[] }
  usage?: LLMUsage | null; attempts?: Record<string, JsonValue>[]
}
export interface LLMUsage {
  prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null
  prompt_cache_hit_tokens: number | null; prompt_cache_miss_tokens: number | null; reasoning_tokens: number | null
  api_calls: number | null; unknown_calls: number | null; usage_complete: boolean
}
export interface AcceptedRecognitionTask { request_id: string; job_id: string; state?: string; status?: string; [key: string]: unknown }
export interface RecognitionTraceV3 {
  request_id: string; status: RecognitionStatus; started_at: string; finished_at: string | null
  retention: RecordMode; version: number; source: string; input: Record<string, JsonValue>; outcome: Record<string, JsonValue> | null
  last_seq: number; nodes: Record<string, { status: string; seq: number }>; durability: 'persistent' | 'temporary' | 'memory'
  events?: RecognitionEventV3[]; candidates?: RecognitionCandidateV3[]
  [key: string]: unknown
}
export interface RecognitionEventV3 {
  schema_version: number; request_id: string; seq: number; node_id: string; event_type: string; status: string
  emitted_at_utc: string; offset_ns: number; durability: string; payload: Record<string, JsonValue>
}
export interface RecognitionCandidateV3 { media_type: 'movie' | 'tv'; tmdb_id: number; rank?: number; title?: string; score?: number; gap?: number | null
  scores?: Record<string, JsonValue>; available_weights?: Record<string, number>; hard_reject?: string[]; query_ids?: string[]; providers?: string[]; [key: string]: unknown }
export interface RecognitionPage<T> { code: number; items: T[]; total: number; page: number; page_size: number }
export interface RecognitionHistoryFilters {
  title?: string; status?: RecognitionStatus; type?: 'movie' | 'tv'; cache_hit?: boolean; date_from?: string; date_to?: string
  duration_min_ms?: number; duration_max_ms?: number; source?: string; provider_id?: string; action_type?: string; reason?: string; page?: number; page_size?: number
}
export interface RecognitionHistoryItem {
  llm_usage?: LLMUsage | null
  request_id: string; started_at: string; finished_at: string | null; status: RecognitionStatus; record_mode: RecordMode; source: string
  title: string | null; media_type: string | null; tmdb_id: number | null; tmdb_url: string | null; score: number | null
  duration_ms: number | null; failure_code: string | null; source_trace_id: string | null; result_title?: string | null; cache_source?: string | null; [key: string]: unknown
}
export interface RecognitionStatistics { code: number; counts: Partial<Record<RecognitionStatus, number>>; saved_count: number; record_mode: RecordMode
  llm_usage?: LLMUsage | null; llm_usage_incomplete_records?: number
  coverage: 'saved_records'; population_complete: false; metrics_scope: 'saved_records_only'; coverage_description: string
  success_rate: number | null; p95_duration_ms: number | null; can_manage: boolean }
export interface RecognitionEventsResponse {
  code: number; events: RecognitionEventV3[]; next_seq: number; last_seq: number; first_available_seq: number
  has_more: boolean; reset_required: boolean; durability: string; terminal: boolean; status: RecognitionStatus
  retention: RecordMode; nodes: Record<string, { status: string; seq: number }>
}
export interface CleanupPreview {
  code: number; scope: CleanupScope; eligible: number; protected: number; protected_active: number; protected_export: number
  confirmation_token: string; finished_before: string; expires_at: number
}
export interface RecognitionControl {
  code: number; task_id: string; state: string; kind: string; control: {
    deleted?: number; deleted_events?: number; deleted_candidates?: number; remaining?: number; skipped?: number
    protected_active?: number; protected_export?: number; error_code?: string; [key: string]: unknown
  }
  [key: string]: unknown
}
export interface RecognitionCacheEntry {
  layer: CacheLayer; cache_key: string; payload_version: number; hit_count: number; source_trace_id: string | null; source_trace_available: boolean
  freshness: 'fresh' | 'stale' | 'forever'; rank: number | null; hot: boolean; [key: string]: unknown
}
export interface RecognitionCacheJob {
  job_id: string; state: string; control: Record<string, JsonValue>; created_at: string
}
export interface RecognitionTaskControl {
  code: number; request_id: string; state: string; owner: string | null; lease_until: number
  cancel_reason: string | null; control: Record<string, JsonValue>
}
export class RecognitionAPIError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) { super(message) }
}
const MEDIA_API = '/api/v1/media'
async function mediaRequest<T>(method: 'GET' | 'POST' | 'PUT', path: string, data?: unknown,
  params?: object, signal?: AbortSignal): Promise<T> {
  try {
    const response = await instance.request<T>({ method, url: MEDIA_API + path, data, params, signal })
    return response.data
  } catch (cause) {
    if (!axios.isAxiosError(cause)) throw cause
    const status = cause.response?.status || 0
    if (status === 401) redirectToLogin()
    const body = cause.response?.data as { code?: string; message?: string; field?: string } | undefined
    throw new RecognitionAPIError(status, body?.code || 'NETWORK_ERROR', body?.message || '连接失败，请稍后重试', body?.field)
  }
}
export const getRecognitionSettings = (signal?: AbortSignal) => mediaRequest<RecognitionSettingsResponse>('GET', '/recognition-settings', undefined, undefined, signal)
export const saveRecognitionSettings = (patch: SettingsPatch, version: string) =>
  mediaRequest<RecognitionSettingsResponse>('PUT', '/recognition-settings', { patch, expected_version: version })
export const saveRecognitionCredential = (apiKey: string | null, clear: boolean, version: string) =>
  mediaRequest<RecognitionSettingsResponse>('PUT', '/recognition-settings/openai/credential', { api_key: apiKey, clear_api_key: clear, expected_version: version })
export const testRecognitionOpenAI = (options: Pick<OpenAIOptions, 'service_type' | 'extraction_mode' | 'base_url' | 'model' | 'temperature' | 'max_output_tokens' | 'response_format_mode' | 'token_parameter'>, apiKey: string | null, version: string) =>
  mediaRequest<RecognitionProbeResult>('POST', '/recognition-settings/openai/test', { options, api_key: apiKey, expected_version: version })
export const submitRecognition = (input: { title: string; secondary_title?: string; context?: Record<string, JsonValue>; idempotency_key: string }) =>
  mediaRequest<AcceptedRecognitionTask>('POST', '/recognitions', input)
export const listRecognitionHistory = (filters: RecognitionHistoryFilters = {}, signal?: AbortSignal) => mediaRequest<RecognitionPage<RecognitionHistoryItem>>('GET', '/recognitions', undefined, filters, signal)
export const getRecognitionTrace = (id: string, signal?: AbortSignal) => mediaRequest<RecognitionTraceV3 & { code: number }>('GET', `/recognitions/${encodeURIComponent(id)}`, undefined, undefined, signal)
export const getRecognitionEvents = (id: string, afterSeq = 0, limit = 100, signal?: AbortSignal) => mediaRequest<RecognitionEventsResponse>('GET', `/recognitions/${encodeURIComponent(id)}/events`, undefined, { after_seq: afterSeq, limit }, signal)
export const getRecognitionCandidates = (id: string, page = 1, signal?: AbortSignal) => mediaRequest<RecognitionPage<RecognitionCandidateV3> & { truncated?: boolean }>('GET', `/recognitions/${encodeURIComponent(id)}/candidates`, undefined, { page }, signal)
export const cancelRecognition = (id: string) => mediaRequest<AcceptedRecognitionTask>('POST', `/recognitions/${encodeURIComponent(id)}/cancel`, {})
export const retryRecognition = (id: string, idempotency_key: string, bypass_identity_cache = false) => mediaRequest<AcceptedRecognitionTask>('POST', `/recognitions/${encodeURIComponent(id)}/retry`, { idempotency_key, bypass_identity_cache })
export const confirmRecognition = (id: string, input: { media_type?: 'movie' | 'tv'; tmdb_id?: number; scope: { canonical_name: string; media_type: 'movie' | 'tv' | 'unknown'; year: number | null }; expected_override_version: number; clear?: boolean; idempotency_key: string }) =>
  mediaRequest<AcceptedRecognitionTask>('POST', `/recognitions/${encodeURIComponent(id)}/confirm`, input)
export const getRecognitionStatistics = (filters: RecognitionHistoryFilters = {}, signal?: AbortSignal) => mediaRequest<RecognitionStatistics>('GET', '/recognitions/stats', undefined, filters, signal)
export const recognitionStreamUrl = (id: string) => `${instance.defaults.baseURL || ''}${MEDIA_API}/recognitions/${encodeURIComponent(id)}/stream`
export const previewRecognitionCleanup = (scope: CleanupScope) => mediaRequest<CleanupPreview>('POST', '/recognition-records/cleanup/preview', { scope })
export const startRecognitionCleanup = (scope: CleanupScope, confirmation_token: string, idempotency_key: string) =>
  mediaRequest<{ code: number; job_id: string; state: string }>('POST', '/recognition-records/cleanup', { scope, confirmation_token, idempotency_key })
export const getRecognitionCleanupJob = (id: string, signal?: AbortSignal) => mediaRequest<RecognitionControl>('GET', `/recognition-records/cleanup/jobs/${encodeURIComponent(id)}`, undefined, undefined, signal)
export const resumeRecognitionCleanupJob = (id: string) => mediaRequest<{ code: number; job_id: string }>('POST', `/recognition-records/cleanup/jobs/${encodeURIComponent(id)}/resume`, {})
export const getRecognitionCacheStatistics = () => mediaRequest<{ code: number; layers: Record<CacheLayer, Record<string, JsonValue>>; capabilities: RecognitionCapabilities }>('GET', '/recognition-cache/stats')
export const getRecognitionCacheEntries = (params: { layer?: CacheLayer; key?: string; search?: string; page?: number; page_size?: number } = {}) => mediaRequest<RecognitionPage<RecognitionCacheEntry>>('GET', '/recognition-cache/entries', undefined, params)
export const operateRecognitionCache = (operation: 'refresh' | 'invalidate', input: { layer: CacheLayer; cache_key: string; expected_version: number; idempotency_key: string }) => mediaRequest<AcceptedRecognitionTask>('POST', `/recognition-cache/${operation}`, input)
export const listRecognitionCacheJobs = (page = 1, page_size = 50) => mediaRequest<RecognitionPage<RecognitionCacheJob> & { retention: 'short_lived_controls' }>('GET', '/recognition-cache/refresh-jobs', undefined, { page, page_size })
export const getRecognitionCacheJob = (id: string) => mediaRequest<RecognitionTaskControl>('GET', `/recognition-cache/refresh-jobs/${encodeURIComponent(id)}`)
export const retryRecognitionCacheJob = (id: string, idempotency_key: string) => mediaRequest<AcceptedRecognitionTask>('POST', `/recognition-cache/refresh-jobs/${encodeURIComponent(id)}/retry`, { idempotency_key })
