<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'
import { testConnection, getSystemConfig, setSystemConfig } from '@/api/config'

interface FieldDef {
  id: string
  required?: boolean
  title: string
  tooltip?: string
  type: 'text' | 'password' | 'switch'
  placeholder?: string
}
interface DownloaderDef {
  type: string
  name: string
  img: string
  testCommand: string
  config: Record<string, FieldDef>
}

const DOWNLOADERS: DownloaderDef[] = [
  {
    type: 'qbittorrent', name: 'Qbittorrent', img: 'qbittorrent.png', testCommand: 'app.downloader.client.qbittorrent|Qbittorrent',
    config: {
      qbhost: { id: 'qbittorrent.qbhost', required: true, title: 'IP地址', type: 'text', placeholder: '127.0.0.1' },
      qbport: { id: 'qbittorrent.qbport', required: true, title: '端口', type: 'text', placeholder: '8080' },
      qbusername: { id: 'qbittorrent.qbusername', required: true, title: '用户名', type: 'text', placeholder: 'admin' },
      qbpassword: { id: 'qbittorrent.qbpassword', required: false, title: '密码', type: 'password', placeholder: 'adminadmin' },
      force_upload: { id: 'qbittorrent.force_upload', required: false, title: '自动强制作种', type: 'switch' },
      auto_management: { id: 'qbittorrent.auto_management', required: false, title: '自动管理模式', type: 'switch' }
    }
  },
  {
    type: 'transmission', name: 'Transmission', img: 'transmission.png', testCommand: 'app.downloader.client.transmission|Transmission',
    config: {
      trhost: { id: 'transmission.trhost', required: true, title: 'IP地址', type: 'text', placeholder: '127.0.0.1' },
      trport: { id: 'transmission.trport', required: true, title: '端口', type: 'text', placeholder: '9091' },
      trusername: { id: 'transmission.trusername', required: true, title: '用户名', type: 'text', placeholder: 'admin' },
      trpassword: { id: 'transmission.trpassword', required: false, title: '密码', type: 'password' }
    }
  },
  {
    type: 'client115', name: '115网盘', img: '115.jpg', testCommand: 'app.downloader.client.client115|Client115',
    config: {
      cookie: { id: 'client115.cookie', required: true, title: 'Cookie', type: 'text', placeholder: 'USERSESSIONID=xxx;...' }
    }
  },
  {
    type: 'aria2', name: 'Aria2', img: 'aria2.png', testCommand: 'app.downloader.client.aria2|Aria2',
    config: {
      host: { id: 'aria2.host', required: true, title: 'IP地址', type: 'text', placeholder: '127.0.0.1' },
      port: { id: 'aria2.port', required: true, title: '端口', type: 'text', placeholder: '6800' },
      secret: { id: 'aria2.secret', required: true, title: '令牌', type: 'text' }
    }
  },
  {
    type: 'pikpak', name: 'PikPak', img: 'pikpak.png', testCommand: 'app.downloader.client.pikpak|PikPak',
    config: {
      username: { id: 'pikpak.username', required: true, title: '用户名', type: 'text' },
      password: { id: 'pikpak.password', required: true, title: '密码', type: 'password' },
      proxy: { id: 'pikpak.proxy', required: false, title: '代理', type: 'text', placeholder: '127.0.0.1:7890' }
    }
  }
]

const DIR_TYPES = [
  { value: '', label: '全部' },
  { value: '电影', label: '电影' },
  { value: '电视剧', label: '电视剧' },
  { value: '动漫', label: '动漫' }
]

const { config, loading, load, save } = useConfigForm()
const modal = useModalStore()

const dialogVisible = ref(false)
const current = ref<DownloaderDef | null>(null)
const formValues = reactive<Record<string, unknown>>({})
const saving = ref(false)
const testing = ref(false)

const dirVisible = ref(false)
const dirList = ref<Array<{ type: string; category: string; save_path: string; container_path: string; label: string }>>([])

const speedVisible = ref(false)
const speedLoading = ref(false)
const speedSaving = ref(false)
const speedForm = reactive({
  qb_upload: '',
  qb_download: '',
  tr_upload: '',
  tr_download: '',
  ipv4: '',
  ipv6: '',
  bandwidth: '',
  residual_ratio: '',
  allocation: ''
})

onMounted(load)

function getCfg(path: string): unknown {
  const parts = path.split('.')
  let cur: unknown = config.value
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function activeType(): string {
  const pt = config.value.pt as Record<string, unknown> | undefined
  return (pt?.pt_client as string) || ''
}

function syncConfig() {
  dirList.value = (getCfg('downloaddir') as typeof dirList.value) || []
}

async function loadData() {
  await load()
  syncConfig()
}

function openDownloader(d: DownloaderDef) {
  current.value = d
  for (const [key, f] of Object.entries(d.config)) {
    const v = getCfg(f.id)
    if (f.type === 'switch') formValues[key] = !!v
    else formValues[key] = v ?? ''
  }
  dialogVisible.value = true
}

function buildItems(): Record<string, unknown> {
  if (!current.value) return {}
  const items: Record<string, unknown> = { 'pt.pt_client': current.value.type }
  for (const [key, f] of Object.entries(current.value.config)) {
    items[f.id] = formValues[key]
  }
  return items
}

function setTextValue(key: string, value: string | number | FileList | null | undefined) {
  formValues[key] = value ?? ''
}

async function handleSave() {
  saving.value = true
  try {
    const ok = await save(buildItems())
    if (ok) dialogVisible.value = false
  } finally {
    saving.value = false
  }
}

async function handleTest() {
  testing.value = true
  try {
    const applied = await save(buildItems(), true)
    if (!applied) return
    const res = await testConnection(current.value!.testCommand)
    if (res.code === 0) modal.success('测试成功')
    else modal.error(res.msg || '测试失败')
  } finally {
    testing.value = false
  }
}

function openDir() {
  syncConfig()
  dirVisible.value = true
}

function addDir() {
  dirList.value.push({ type: '', category: '', save_path: '', container_path: '', label: '' })
}

function removeDir(idx: number) {
  dirList.value.splice(idx, 1)
}

async function saveDir() {
  const ok = await save({ downloaddir: dirList.value })
  if (ok) dirVisible.value = false
}

async function openSpeed() {
  speedVisible.value = true
  speedLoading.value = true
  try {
    const res = await getSystemConfig('SpeedLimit')
    if (res.code === 0 && res.value) {
      Object.keys(speedForm).forEach((k) => {
        speedForm[k as keyof typeof speedForm] = (res.value[k] as string) || ''
      })
    }
  } finally {
    speedLoading.value = false
  }
}

async function saveSpeed() {
  speedSaving.value = true
  try {
    const res = await setSystemConfig('SpeedLimit', { ...speedForm })
    if (res.code === 0) {
      modal.success('保存成功')
      speedVisible.value = false
    } else {
      modal.error(res.msg || '保存失败')
    }
  } finally {
    speedSaving.value = false
  }
}
</script>

<template>
  <div class="downloader-view">
    <PageHeader title="下载器" description="配置主下载器及连接参数"><template #actions><q-btn outline icon="folder" label="下载目录" @click="openDir" /><q-btn outline icon="speed" label="播放限速" @click="openSpeed" /></template></PageHeader>
    <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
    <div class="downloader-grid">
      <q-card v-for="d in DOWNLOADERS" :key="d.type" flat bordered class="downloader-card" :class="{ active: activeType() === d.type }" tabindex="0" @click="openDownloader(d)" @keydown.enter="openDownloader(d)"><q-card-section class="dl-body"><div class="dl-icon"><img :src="`/static/img/${d.img}`" :alt="d.name" /></div><div class="dl-name">{{ d.name }}</div><q-badge v-if="activeType() === d.type" color="positive" label="默认使用" /><span v-else class="dl-hint">点击配置</span></q-card-section></q-card>
    </div>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent><q-card class="config-dialog"><q-card-section class="row items-center no-wrap"><div class="text-h6">{{ current?.name || '下载器配置' }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="dialogVisible = false" /></q-card-section><q-separator /><q-form @submit.prevent="handleSave"><q-card-section class="config-grid"><template v-for="[key, field] in Object.entries(current?.config || {})" :key="field.id"><q-toggle v-if="field.type === 'switch'" v-model="formValues[key]" color="primary" :label="field.title" class="switch-field" /><q-input v-else :model-value="String(formValues[key] ?? '')" outlined dense :label="`${field.title}${field.required ? ' *' : ''}`" :type="field.type === 'password' ? 'password' : 'text'" :placeholder="field.placeholder" @update:model-value="(value) => setTextValue(key, value)"><template #append><HelpTip v-if="field.tooltip" :text="field.tooltip" /></template></q-input></template></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat icon="wifi" label="测试" :loading="testing" @click="handleTest" /><q-btn flat label="取消" :disable="saving || testing" @click="dialogVisible = false" /><q-btn color="primary" unelevated label="确定" :loading="saving" type="submit" /></q-card-actions></q-form></q-card></q-dialog>

    <q-dialog v-model="dirVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent><q-card class="dir-dialog"><q-card-section class="row items-center no-wrap"><div class="text-h6">下载目录配置</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="dirVisible = false" /></q-card-section><q-separator /><q-card-section><q-banner rounded dense class="info-banner"><template #avatar><HelpTip text="根据类型及二级分类按优先级匹配目录，直到找到符合条件及空间要求的目录。二级分类来自基础设置中的策略配置。" /></template>下载目录会根据类型和二级分类自动匹配。</q-banner><div class="dir-list q-mt-md"><div v-for="(d, idx) in dirList" :key="idx" class="dir-row"><q-select v-model="d.type" outlined dense emit-value map-options :options="DIR_TYPES" label="类型" class="dir-type" /><q-input v-model="d.category" outlined dense label="二级分类" class="dir-category" /><q-input v-model="d.save_path" outlined dense label="下载保存目录" class="dir-path" /><q-input v-model="d.container_path" outlined dense label="访问目录" class="dir-path" /><q-input v-model="d.label" outlined dense label="分类标签" class="dir-label" /><q-btn flat round dense color="negative" icon="delete_outline" aria-label="删除目录" @click="removeDir(idx)" /></div><q-btn outline color="primary" icon="add" label="增加目录" @click="addDir" /></div></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" @click="dirVisible = false" /><q-btn color="primary" unelevated label="确定" @click="saveDir" /></q-card-actions></q-card></q-dialog>

    <q-dialog v-model="speedVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent><q-card class="speed-dialog"><q-card-section class="row items-center no-wrap"><div class="text-h6">播放限速设置</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="speedVisible = false" /></q-card-section><q-separator /><q-card-section class="speed-body"><q-inner-loading :showing="speedLoading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading><div class="speed-grid"><q-input v-model="speedForm.qb_upload" outlined dense label="Qbittorrent 上传" placeholder="Kb/s"><template #append><HelpTip text="不限速源地址外播放媒体时的上传限速，0 或留空不启用。" /></template></q-input><q-input v-model="speedForm.qb_download" outlined dense label="Qbittorrent 下载" placeholder="Kb/s"><template #append><HelpTip text="不限速源地址外播放媒体时的下载限速，0 或留空不启用。" /></template></q-input><q-input v-model="speedForm.tr_upload" outlined dense label="Transmission 上传" placeholder="Kb/s" /><q-input v-model="speedForm.tr_download" outlined dense label="Transmission 下载" placeholder="Kb/s" /><q-input v-model="speedForm.ipv4" outlined dense label="不限速源 IPv4" placeholder="IPv4 CIDR" /><q-input v-model="speedForm.ipv6" outlined dense label="不限速源 IPv6" placeholder="IPv6 CIDR" /></div><q-separator class="q-my-lg" /><div class="text-subtitle2 text-weight-medium q-mb-md">自动限速设置</div><div class="speed-grid"><q-input v-model="speedForm.bandwidth" outlined dense label="上行带宽" placeholder="Mbps" /><q-input v-model="speedForm.residual_ratio" outlined dense label="剩余比例" placeholder="0.5" /><q-input v-model="speedForm.allocation" outlined dense label="分配比例" placeholder="1:1" /></div></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" @click="speedVisible = false" /><q-btn color="primary" unelevated label="确定" :loading="speedSaving" @click="saveSpeed" /></q-card-actions></q-card></q-dialog>
  </div>
</template>

<style scoped>
.downloader-view { position: relative; }.downloader-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }.downloader-card { cursor: pointer; border-radius: 16px; background: var(--surface); color: var(--text-primary); transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }.downloader-card:hover, .downloader-card:focus-visible { transform: translateY(-2px); border-color: var(--q-primary); outline: none; box-shadow: 0 6px 20px rgba(27, 42, 75, .12); }.downloader-card.active { border: 2px solid var(--q-primary); }.dl-body { display: flex; flex-direction: column; align-items: center; gap: 9px; padding: 22px 12px; }.dl-icon { display: flex; align-items: center; justify-content: center; width: 64px; height: 64px; overflow: hidden; border-radius: 16px; background: var(--surface-muted); }.dl-icon img { width: 100%; height: 100%; object-fit: contain; }.dl-name { font-size: 16px; font-weight: 600; }.dl-hint { color: var(--text-secondary); font-size: 12px; }.config-dialog, .dir-dialog, .speed-dialog { width: min(700px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }.dir-dialog { width: min(980px, calc(100vw - 32px)); }.speed-dialog { width: min(780px, calc(100vw - 32px)); }.config-grid, .speed-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }.switch-field { min-height: 40px; }.dir-list { display: flex; flex-direction: column; gap: 10px; }.dir-row { display: grid; grid-template-columns: 120px 130px minmax(180px, 1fr) minmax(180px, 1fr) 130px 34px; gap: 8px; align-items: center; }.info-banner { border: 1px solid color-mix(in srgb, var(--q-primary), transparent 70%); background: var(--primary-soft); color: var(--text-primary); }.speed-body { position: relative; }.dialog-actions { gap: 8px; padding: 12px 24px 16px; }@media (max-width: 599px) { .config-dialog, .dir-dialog, .speed-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }.config-grid, .speed-grid { grid-template-columns: 1fr; }.dir-row { grid-template-columns: 1fr 1fr; }.dir-row .dir-path { grid-column: 1 / -1; }.dir-row .dir-label { grid-column: 1 / -1; }.dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); }.dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
