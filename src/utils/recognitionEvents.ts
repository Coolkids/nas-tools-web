import type { JsonValue, RecognitionEventV3, RecognitionTraceV3 } from '@/api/recognition'
import { recognitionReasonLabels } from '@/utils/recognitionReasons'

export const terminalStatuses = new Set(['MATCHED', 'PARSED', 'FAILED', 'TIMEOUT', 'REVIEW_REQUIRED', 'CANCELLED', 'SKIPPED'])
export const recognitionStatuses: Record<string, string> = { QUEUED: '排队中', RUNNING: '识别中', MATCHED: '匹配成功', PARSED: '已解析',
  FAILED: '识别失败', TIMEOUT: '识别超时', REVIEW_REQUIRED: '待确认', CANCELLED: '已取消', SKIPPED: '已跳过',
  running: '运行中', success: '成功', cached: '缓存命中', skipped: '已跳过', error: '异常', timeout: '超时', cancelled: '已取消', invalid: '响应无效', review: '待确认' }
export const nodeLabels: Record<string, string> = { request: '识别请求', preprocess: '名称预处理', identity: '作品缓存检查', identity_result: '作品确认', anitopy: 'Anitopy',
  anitopy_ml: 'Anitopy-ML', openai: 'OpenAI', parser: '解析汇总', query_plan: '查询规划', tmdb_search: 'TMDB 搜索', rank: '候选评分', episode: '季集验证与详情', fallback: '回退识别' }
export const statusLabel = (value: string) => recognitionStatuses[value] || value
export const nodeLabel = (value: string) => nodeLabels[value] || (value.startsWith('legacy/') ? `兼容步骤 · ${value.slice(7)}` : value)
export const reasonLabel = (value: unknown) => typeof value === 'string' && recognitionReasonLabels[value] ? `${recognitionReasonLabels[value]} (${value})` : String(value || '')
export const statusColor = (value: string) => ['MATCHED', 'PARSED', 'success', 'cached'].includes(value) ? 'positive'
  : ['FAILED', 'error', 'invalid'].includes(value) ? 'negative' : ['TIMEOUT', 'REVIEW_REQUIRED', 'timeout', 'review'].includes(value) ? 'warning'
    : ['QUEUED', 'RUNNING', 'running'].includes(value) ? 'primary' : 'grey-7'
export const objectValue = (value: unknown): Record<string, JsonValue> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, JsonValue> : {}
export const durationLabel = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value >= 1000 ? `${Number((value / 1000).toFixed(3))} 秒` : `${Number(value.toFixed(3))} 毫秒` : '未记录'
export function tmdbLink(type: unknown, id: unknown): string | null {
  const integer = typeof id === 'number' ? id : typeof id === 'string' && /^[1-9]\d*$/.test(id) ? Number(id) : NaN
  return ['movie', 'tv'].includes(String(type)) && Number.isSafeInteger(integer) && integer > 0 ? `https://www.themoviedb.org/${type}/${integer}` : null
}
export interface RecognitionNode {
  id: string; status: string; seq: number; events: RecognitionEventV3[]; durationMs: number | null; startedNs: number | null
  payload: Record<string, JsonValue>; snapshotOnly: boolean
}
export interface EventState { requestId: string; events: RecognitionEventV3[]; nodes: Record<string, RecognitionNode>; cursor: number; status: string; partial: boolean }
export function reduceRecognitionEvents(requestId: string, events: RecognitionEventV3[], seed?: RecognitionTraceV3['nodes'], firstSeq = 1): EventState {
  const state: EventState = { requestId, events: [], nodes: {}, cursor: firstSeq - 1, status: 'QUEUED', partial: firstSeq > 1 }
  const unique = new Map<number, RecognitionEventV3>()
  for (const event of events) if (event.request_id === requestId && Number.isSafeInteger(event.seq) && event.seq >= firstSeq) unique.set(event.seq, event)
  for (const event of [...unique.values()].sort((a, b) => a.seq - b.seq)) {
    // Later events wait for the gap to be repaired; never acknowledge a seq
    // that would make reconnect permanently skip missing events.
    if (event.seq !== state.cursor + 1) break
    state.events.push(event); state.cursor = event.seq
    const previous = state.nodes[event.node_id]
    const node: RecognitionNode = previous || { id: event.node_id, status: '', seq: 0, events: [], durationMs: null, startedNs: null, payload: {}, snapshotOnly: false }
    node.status = event.status; node.seq = event.seq; node.events.push(event); node.payload = { ...node.payload, ...event.payload }
    if (/(?:started|start)$/.test(event.event_type) && Number.isFinite(event.offset_ns)) node.startedNs = event.offset_ns
    const explicit = event.payload.duration_ms ?? event.payload.elapsed_ms ?? objectValue(event.payload.legacy_action).elapsed_ms
    if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) node.durationMs = explicit
    else if (node.startedNs !== null && /(?:finished|completed|interrupted)$/.test(event.event_type) && event.offset_ns >= node.startedNs) node.durationMs = (event.offset_ns - node.startedNs) / 1e6
    state.nodes[node.id] = node
    if (event.event_type === 'request_started') state.status = 'RUNNING'
    if (event.node_id === 'request' && terminalStatuses.has(event.status)) state.status = event.status
    if (event.event_type === 'events_truncated') state.partial = true
  }
  // A lost volatile window has current node summaries but no replayable prior
  // events or trustworthy per-node timings. Clearly mark those summaries.
  if (state.partial && seed) for (const [id, summary] of Object.entries(seed)) {
    if (!state.nodes[id]) state.nodes[id] = { id, ...summary, events: [], durationMs: null, startedNs: null, payload: {}, snapshotOnly: true }
  }
  return state
}

export interface SSEFrame { event: string; data: string; id?: string }
export function createSSEDecoder(emit: (frame: SSEFrame) => void) {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    if (buffer.length > 2 * 1024 * 1024) throw new Error('事件数据超出允许范围，请重新读取记录')
    let match: RegExpMatchArray | null
    while ((match = /\r?\n\r?\n/.exec(buffer))) {
      const block = buffer.slice(0, match.index); buffer = buffer.slice(match.index! + match[0].length)
      const frame: SSEFrame = { event: 'message', data: '' }; const data: string[] = []
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith(':')) continue
        const index = line.indexOf(':'); const name = index < 0 ? line : line.slice(0, index)
        const value = index < 0 ? '' : line.slice(index + 1).replace(/^ /, '')
        if (name === 'event') frame.event = value
        if (name === 'data') data.push(value)
        if (name === 'id' && !value.includes('\0')) frame.id = value
      }
      if (data.length) { frame.data = data.join('\n'); emit(frame) }
    }
  }
}
