import instance, { doAction } from './request'

export interface AiRecognitionRecord {
  id: number
  title: string
  status: 'unmatched' | 'inconsistent' | string
  add_time: string
  anitopy_result: Record<string, unknown>
  ai_result: Record<string, unknown>
  anitopy_tmdb: Record<string, unknown>
  ai_tmdb: Record<string, unknown>
}

export interface AiRecognitionListResult {
  code: number
  msg?: string
  total: number
  page: number
  page_size: number
  records: AiRecognitionRecord[]
}

export function getAiRecognitionRecords(title: string, page: number, pageSize: number): Promise<AiRecognitionListResult> {
  return doAction<AiRecognitionListResult>('get_ai_recognition_records', { title, page, page_size: pageSize })
}

export async function downloadAiRecognitionRecords(title: string): Promise<Blob> {
  const response = await instance.get('/ai_recognition_export.xlsx', {
    params: { title },
    responseType: 'blob'
  })
  return response.data as Blob
}
