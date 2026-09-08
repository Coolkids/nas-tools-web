import { ref } from 'vue'

interface ActiveRequest {
  loaded: number
  total?: number
}

const activeRequests = new Map<number, ActiveRequest>()
let nextRequestId = 1

export const requestProgressActive = ref(false)
export const requestProgressDeterminate = ref(false)
export const requestProgressPercentage = ref(0)

function recalculate(): void {
  requestProgressActive.value = activeRequests.size > 0

  if (activeRequests.size === 0) {
    requestProgressDeterminate.value = false
    requestProgressPercentage.value = 0
    return
  }

  const requests = [...activeRequests.values()]
  const hasUnknownTotal = requests.some((request) => !request.total || request.total <= 0)

  // 只在所有并发请求都提供总大小时显示百分比，避免把部分请求的进度
  // 冒充成整个页面的真实进度。
  requestProgressDeterminate.value = !hasUnknownTotal
  if (hasUnknownTotal) return

  const loaded = requests.reduce((sum, request) => sum + request.loaded, 0)
  const total = requests.reduce((sum, request) => sum + (request.total || 0), 0)
  requestProgressPercentage.value = total > 0 ? Math.min(100, (loaded / total) * 100) : 0
}

export function startRequestProgress(): number {
  const requestId = nextRequestId++
  activeRequests.set(requestId, { loaded: 0 })
  recalculate()
  return requestId
}

export function updateRequestProgress(requestId: number, loaded: number, total?: number): void {
  const request = activeRequests.get(requestId)
  if (!request) return

  request.loaded = Math.max(request.loaded, loaded)
  if (total && total > 0) request.total = total
  recalculate()
}

export function finishRequestProgress(requestId: number): void {
  activeRequests.delete(requestId)
  recalculate()
}
