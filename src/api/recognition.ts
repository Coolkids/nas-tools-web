import instance, { doAction } from './request'

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
