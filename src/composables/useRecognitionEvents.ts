import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue'
import { getRecognitionEvents, getRecognitionTrace, recognitionStreamUrl, RecognitionAPIError,
  type RecognitionEventV3, type RecognitionTraceV3 } from '@/api/recognition'
import { redirectToLogin } from '@/api/request'
import { createSSEDecoder, reduceRecognitionEvents, terminalStatuses, type SSEFrame } from '@/utils/recognitionEvents'

export function useRecognitionEvents(requestId: Ref<string>) {
  const trace = shallowRef<RecognitionTraceV3>()
  const events = shallowRef<RecognitionEventV3[]>([])
  const loading = ref(false), error = ref(''), errorCode = ref(''), partial = ref(false)
  const connection = ref<'loading' | 'live' | 'reconnecting' | 'complete' | 'unavailable'>('loading')
  const firstSeq = ref(1)
  const state = computed(() => reduceRecognitionEvents(requestId.value, events.value, trace.value?.nodes, firstSeq.value))
  let controller: AbortController | undefined
  let disposed = false

  function stop() { controller?.abort() }
  async function load() {
    stop()
    if (!requestId.value || disposed) return
    const id = requestId.value, active = new AbortController(); controller = active
    const valid = () => !disposed && !active.signal.aborted && requestId.value === id
    trace.value = undefined; events.value = []; firstSeq.value = 1; partial.value = false
    loading.value = true; connection.value = 'loading'; error.value = ''; errorCode.value = ''
    function append(items: RecognitionEventV3[]) {
      if (!valid()) return
      const merged = new Map(events.value.map(event => [event.seq, event]))
      for (const event of items) if (event.request_id === id) merged.set(event.seq, event)
      if (merged.size > 20000) throw new Error('事件过多，请按阶段查看原始导出')
      events.value = [...merged.values()].sort((a, b) => a.seq - b.seq)
    }
    async function snapshot() {
      const value = await getRecognitionTrace(id, active.signal)
      if (valid()) trace.value = value
    }
    async function catchUp() {
      for (let page = 0; valid() && page < 200; page++) {
        const before = state.value.cursor
        const result = await getRecognitionEvents(id, before, 200, active.signal)
        if (!valid()) return
        if (result.reset_required) {
          firstSeq.value = Math.max(1, result.first_available_seq); partial.value = true
          events.value = events.value.filter(event => event.seq >= firstSeq.value)
        }
        append(result.events)
        if (trace.value) trace.value = { ...trace.value, status: result.status, retention: result.retention,
          durability: result.durability as RecognitionTraceV3['durability'], nodes: result.nodes, last_seq: result.last_seq }
        if (!result.has_more) return
        if (state.value.cursor <= before) throw new Error('事件序列不连续，请重新读取记录')
      }
    }
    async function finish() {
      connection.value = 'complete'
      if (trace.value && terminalStatuses.has(state.value.status)) trace.value = { ...trace.value, status: state.value.status as RecognitionTraceV3['status'] }
      try { await snapshot() }
      catch (cause) {
        if (valid() && cause instanceof RecognitionAPIError && cause.status === 410) {
          errorCode.value = cause.code; error.value = cause.message + '；本页已收到的实时信息仅在当前页面保留。'
        } else throw cause
      }
    }
    async function consume(frame: SSEFrame) {
      if (!valid() || frame.event === 'heartbeat') return
      const data = JSON.parse(frame.data)
      if (frame.event === 'snapshot') {
        if (data.request_id !== id) throw new Error('事件流请求标识不一致')
        trace.value = data
      } else if (frame.event === 'reset_required') {
        firstSeq.value = Math.max(1, Number(data.first_available_seq) || 1); partial.value = true
        if (trace.value) trace.value = { ...trace.value, nodes: data.nodes, last_seq: data.last_seq, durability: data.durability }
        events.value = events.value.filter(event => event.seq >= firstSeq.value)
        await catchUp()
      } else if (frame.event === 'recognition_event') {
        append([data])
        if (data.seq > state.value.cursor) await catchUp()
      } else if (frame.event === 'unavailable') {
        throw new RecognitionAPIError(['HISTORY_EXPIRED', 'HISTORY_NOT_RETAINED'].includes(data.code) ? 410 : 503,
          data.code || 'OWNER_UNAVAILABLE', data.message || '任务所属进程暂时不可用')
      }
    }
    async function stream() {
      const response = await fetch(`${recognitionStreamUrl(id)}?after_seq=${state.value.cursor}`, {
        credentials: 'include', headers: { Accept: 'text/event-stream' }, signal: active.signal
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        if (response.status === 401) redirectToLogin()
        throw new RecognitionAPIError(response.status, body.code || 'STREAM_ERROR', body.message || '事件连接失败')
      }
      if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('服务未返回识别事件流')
      connection.value = 'live'; error.value = ''; errorCode.value = ''
      const reader = response.body.getReader(), decoder = new TextDecoder(), frames: SSEFrame[] = []
      const decode = createSSEDecoder(frame => frames.push(frame))
      try {
        while (valid()) {
          const { value, done } = await reader.read()
          if (done) break
          decode(decoder.decode(value, { stream: true }))
          while (frames.length && valid()) await consume(frames.shift()!)
          if (terminalStatuses.has(state.value.status) && state.value.cursor >= (trace.value?.last_seq || 0)) break
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    }
    function delay(ms: number) {
      return new Promise<void>(resolve => {
        const finish = () => { clearTimeout(timer); active.signal.removeEventListener('abort', finish); resolve() }
        const timer = setTimeout(finish, ms); active.signal.addEventListener('abort', finish, { once: true })
      })
    }
    try {
      await snapshot(); await catchUp()
      if (!valid()) return
      loading.value = false
      let failures = 0
      while (valid()) {
        const current = trace.value as RecognitionTraceV3 | undefined
        if (terminalStatuses.has(current?.status || '') && state.value.cursor >= (current?.last_seq || 0)) { await finish(); break }
        try {
          await stream()
          if (!valid()) break
          if (terminalStatuses.has(state.value.status)) { await finish(); break }
          await catchUp()
          if (!terminalStatuses.has((trace.value as RecognitionTraceV3 | undefined)?.status || '')) {
            connection.value = 'reconnecting'; error.value = '实时连接已断开，正在补拉缺失事件并重连。'; errorCode.value = 'RECONNECTING'
            await delay(Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)))
          }
        } catch (cause) {
          if (!valid()) break
          if (cause instanceof RecognitionAPIError && [401, 403, 404, 410].includes(cause.status)) throw cause
          if (cause instanceof RecognitionAPIError && cause.status === 409) {
            events.value = []; firstSeq.value = 1; await snapshot(); await catchUp()
          }
          connection.value = 'reconnecting'; error.value = '实时连接暂时中断，正在补拉缺失事件并重连。'; errorCode.value = 'RECONNECTING'
          await delay(Math.min(15000, 1000 * 2 ** Math.min(failures++, 4)))
          if (valid()) {
            try { await catchUp() }
            catch (repairError) {
              if (repairError instanceof RecognitionAPIError && [401, 403, 404, 410].includes(repairError.status)) throw repairError
              // Keep the last contiguous cursor while the owner/proxy recovers.
            }
          }
        }
      }
    } catch (cause) {
      if (valid()) {
        connection.value = 'unavailable'; error.value = (cause as Error).message || '读取识别流程失败'
        errorCode.value = cause instanceof RecognitionAPIError ? cause.code : 'NETWORK_ERROR'
      }
    } finally { if (valid()) loading.value = false }
  }
  watch(requestId, () => { void load() }, { immediate: true })
  onBeforeUnmount(() => { disposed = true; stop() })
  return { trace, events, state, loading, error, errorCode, connection, partial, reload: load, stop }
}
