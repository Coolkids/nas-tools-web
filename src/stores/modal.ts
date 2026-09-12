import { defineStore } from 'pinia'
import { Dialog, Notify } from 'quasar'

interface ModalState {
  loading: boolean
  loadingText: string
  progressVisible: boolean
  progressValue: number
  progressText: string
}

/** 全局业务反馈状态。展示层使用 Quasar，调用方继续使用稳定的 Promise API。 */
export const useModalStore = defineStore('modal', {
  state: (): ModalState => ({
    loading: false,
    loadingText: '',
    progressVisible: false,
    progressValue: 0,
    progressText: ''
  }),
  actions: {
    showLoading(text = '处理中...') {
      this.loading = true
      this.loadingText = text
    },
    hideLoading() {
      this.loading = false
      this.loadingText = ''
    },
    showProgress(text = '') {
      this.progressVisible = true
      this.progressValue = 0
      this.progressText = text
    },
    setProgress(value: number, text?: string) {
      this.progressValue = Math.max(0, Math.min(100, value))
      if (text !== undefined) this.progressText = text
    },
    hideProgress() {
      this.progressVisible = false
      this.progressValue = 0
      this.progressText = ''
    },
    success(message: string) {
      Notify.create({ type: 'positive', message, position: 'top-right', timeout: 2800 })
    },
    error(message: string) {
      Notify.create({ type: 'negative', message, position: 'top-right', timeout: 5200 })
    },
    warning(message: string) {
      Notify.create({ type: 'warning', message, position: 'top-right', timeout: 4200 })
    },
    info(message: string) {
      Notify.create({ type: 'info', message, position: 'top-right', timeout: 3200 })
    },
    confirm(message: string, title = '确认操作'): Promise<boolean> {
      return new Promise((resolve) => {
        let settled = false
        const finish = (value: boolean) => {
          if (settled) return
          settled = true
          resolve(value)
        }
        Dialog.create({
          title,
          message,
          ok: { label: '确定', color: 'primary', unelevated: true },
          cancel: { label: '取消', flat: true },
          focus: 'cancel'
        }).onOk(() => finish(true)).onCancel(() => finish(false)).onDismiss(() => finish(false))
      })
    },
    alert(message: string, title = '提示'): Promise<void> {
      return new Promise((resolve) => {
        Dialog.create({ title, message, ok: { label: '知道了', color: 'primary', unelevated: true } })
          .onDismiss(() => resolve())
      })
    }
  }
})
