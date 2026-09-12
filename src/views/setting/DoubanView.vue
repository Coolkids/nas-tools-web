<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'

interface DoubanHistoryItem {
  ID: number
  NAME: string
  YEAR: string
  TYPE: string
  RATING: string
  IMAGE: string
  STATE: string
  ADD_TIME: string
}

const { config, loading, load, save } = useConfigForm()
const modal = useModalStore()

const form = reactive({
  users: '',
  days: '',
  interval: '',
  types: '',
  cookie: '',
  auto_search: false,
  auto_rss: false
})

const historyVisible = ref(false)
const historyLoading = ref(false)
const history = ref<DoubanHistoryItem[]>([])

function initForm() {
  const d = config.value.douban as Record<string, unknown> | undefined
  if (!d) return
  const users = d.users
  form.users = Array.isArray(users) ? (users as string[]).join(',') : ((users as string) || '')
  form.days = (d.days as string) || ''
  form.interval = (d.interval as string) || ''
  form.types = (d.types as string) || ''
  form.cookie = (d.cookie as string) || ''
  form.auto_search = Boolean(d.auto_search)
  form.auto_rss = Boolean(d.auto_rss)
}

async function reload() {
  await load()
  initForm()
}

async function handleSave() {
  const ok = await save({
    'douban.users': form.users,
    'douban.days': form.days,
    'douban.interval': form.interval,
    'douban.types': form.types,
    'douban.cookie': form.cookie,
    'douban.auto_search': form.auto_search,
    'douban.auto_rss': form.auto_rss
  })
  if (ok) await load()
}

async function openHistory() {
  historyVisible.value = true
  historyLoading.value = true
  try {
    const res = await doAction<{ code: number; result?: DoubanHistoryItem[] }>('get_douban_history', {})
    if (res.code === 0 && Array.isArray(res.result)) {
      history.value = res.result
    }
  } catch {
    modal.error('获取历史记录失败')
  } finally {
    historyLoading.value = false
  }
}

async function deleteHistory(id: number) {
  const ok = await modal.confirm('确定删除该历史记录？')
  if (!ok) return
  try {
    const res = await doAction<{ code: number }>('delete_douban_history', { id })
    if (res.code === 0) {
      history.value = history.value.filter((h) => h.ID !== id)
      modal.success('删除成功')
    } else {
      modal.error('删除失败')
    }
  } catch {
    modal.error('删除失败')
  }
}

function stateTag(state: string): { type: 'positive' | 'primary' | 'warning'; text: string } {
  if (state === 'DOWNLOADED') return { type: 'positive', text: '已下载' }
  if (state === 'RSS') return { type: 'primary', text: '已订阅' }
  if (state === 'NEW') return { type: 'primary', text: '新增' }
  return { type: 'warning', text: '处理中' }
}

onMounted(reload)
</script>

<template>
  <div class="douban-view">
    <PageHeader title="豆瓣" description="配置豆瓣同步，自动跟踪标记的想看 / 在看 / 看过" />
    <q-card flat bordered class="settings-card">
      <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
      <q-card-section>
        <q-form class="settings-form" @submit.prevent="handleSave">
          <div class="form-grid">
            <q-input v-model="form.users" outlined dense label="豆瓣用户 ID" placeholder="用户1,用户2,用户3"><template #append><HelpTip text="如有多个豆瓣用户 ID，使用英文逗号分隔。" /></template></q-input>
            <q-input v-model="form.days" outlined dense label="同步周期（天）" placeholder="30" inputmode="numeric"><template #append><HelpTip text="同步多少天内标记的豆瓣数据。" /></template></q-input>
            <q-input v-model="form.interval" outlined dense label="同步间隔（小时）" placeholder="留空关闭豆瓣同步" inputmode="numeric"><template #append><HelpTip text="每隔多长时间同步一次豆瓣标记数据。" /></template></q-input>
            <q-input v-model="form.types" outlined dense label="同步数据类型" placeholder="do,wish,collect"><template #append><HelpTip text="do 在看、wish 想看、collect 看过，使用英文逗号分隔。" /></template></q-input>
          </div>
          <q-input v-model="form.cookie" outlined dense label="豆瓣 Cookie" type="password" class="q-mt-md"><template #append><HelpTip text="部分电影需要配置 Cookie 才能同步到数据。" /></template></q-input>
          <div class="toggle-grid q-mt-md">
            <div class="toggle-item"><div><div class="toggle-label">自动搜索下载 <HelpTip text="豆瓣同步的数据会自动进行站点聚合检索下载。" /></div><div class="toggle-help">同步后自动检索可下载资源</div></div><q-toggle v-model="form.auto_search" color="primary" /></div>
            <div class="toggle-item"><div><div class="toggle-label">自动添加订阅 <HelpTip text="未进行搜索下载或搜索下载不完整的内容将加入 RSS 订阅。" /></div><div class="toggle-help">缺少资源时自动持续追踪</div></div><q-toggle v-model="form.auto_rss" color="primary" /></div>
          </div>
          <div class="card-footer"><q-btn outline icon="history" label="历史记录" @click="openHistory" /><q-btn color="primary" unelevated icon="save" label="保存" type="submit" /></div>
        </q-form>
      </q-card-section>
    </q-card>

    <q-dialog v-model="historyVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="history-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">豆瓣历史记录</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section>
        <q-separator />
        <q-card-section class="history-body">
          <q-inner-loading :showing="historyLoading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
          <div v-if="history.length" class="history-list">
            <div v-for="row in history" :key="row.ID" class="history-row">
              <q-img v-if="row.IMAGE" :src="row.IMAGE" class="history-img" fit="cover" /><div v-else class="history-img history-img-empty"><q-icon name="movie" /></div>
              <div class="history-main"><div class="history-title">{{ row.NAME }}<span v-if="row.YEAR">（{{ row.YEAR }}）</span></div><div class="text-muted">{{ row.TYPE }}<span v-if="row.RATING"> · 评分 {{ row.RATING }}</span></div><div class="text-muted">{{ row.ADD_TIME }}</div></div>
              <div class="history-meta"><q-badge :color="stateTag(row.STATE).type" :label="stateTag(row.STATE).text" /><q-btn flat round dense color="negative" icon="delete_outline" aria-label="删除" @click="deleteHistory(row.ID)" /></div>
            </div>
          </div>
          <div v-else-if="!historyLoading" class="empty-state"><q-icon name="history" size="44px" color="grey-5" /><span>没有数据</span></div>
        </q-card-section>
        <q-separator /><q-card-actions align="right"><q-btn color="primary" label="确定" v-close-popup /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.settings-card { border-radius: 16px; background: var(--surface); color: var(--text-primary); }
.settings-form { display: flex; flex-direction: column; }
.form-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px 16px; }
.toggle-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.toggle-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--border-subtle); border-radius: 12px; background: var(--surface-raised); }
.toggle-label { display: flex; align-items: center; gap: 2px; font-size: 14px; font-weight: 600; }
.toggle-help, .text-muted { margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
.card-footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 20px; }
.history-dialog { width: min(760px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }
.history-body { position: relative; max-height: 64vh; overflow-y: auto; }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-row { display: flex; align-items: center; gap: 12px; padding: 8px; border: 1px solid var(--border-subtle); border-radius: 10px; }
.history-img { flex: 0 0 48px; width: 48px; height: 64px; border-radius: 5px; overflow: hidden; }
.history-img-empty { display: flex; align-items: center; justify-content: center; background: var(--surface-muted); color: var(--text-secondary); font-size: 24px; }
.history-main { min-width: 0; flex: 1; }.history-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600; }.history-meta { display: flex; align-items: center; gap: 8px; }
.empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; min-height: 180px; justify-content: center; color: var(--text-secondary); }
@media (max-width: 900px) { .form-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 599px) { .form-grid, .toggle-grid { grid-template-columns: 1fr; } .history-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .history-body { max-height: none; } .history-row { align-items: flex-start; } .history-meta { margin-left: auto; flex-direction: column; } .card-footer :deep(.q-btn) { min-height: 44px; } }
</style>
