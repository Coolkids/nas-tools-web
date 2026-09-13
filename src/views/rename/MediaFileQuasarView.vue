<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { doAction } from '@/api'
import PageHeader from '@/components/PageHeader.vue'
import NameTestResult from '@/components/NameTestResult.vue'
import { useModalStore } from '@/stores/modal'
import { nameTest, refreshProcess, type NameTestData } from '@/api/system'
import { getConfig } from '@/api/config'

interface FileItem {
  path: string
  name: string
  ext: string
  size: string
  type?: string
}

interface SubPathResult {
  code: number
  msg?: string
  count?: number
  data?: FileItem[]
}

interface TreeData {
  id: string
  label: string
  isLeaf: boolean
  path: string
  lazy?: boolean
}

interface DownloadDirItem {
  type: string
  category: string
  save_path: string
  container_path: string
  label: string
}

const modal = useModalStore()
const route = useRoute()
const loading = ref(false)
const currentDir = ref('/')
const pathInput = ref('/')
const files = ref<FileItem[]>([])
const treeNodes = ref<TreeData[]>([])
const selectedTreePath = ref('')

function getParentDir(p: string): string {
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.slice(0, idx)
}

const defaultTransferMode = ref('copy')

onMounted(async () => {
  const queryPath = route.query.path as string
  if (queryPath) {
    load(queryPath)
    return
  }
  try {
    const res = await getConfig()
    if (res.code === 0) {
      const config = res.config as Record<string, unknown>
      const mode = (config?.pt as Record<string, unknown>)?.['rmt_mode'] as string | undefined
      if (mode) defaultTransferMode.value = mode
      const dirs = config?.downloaddir as DownloadDirItem[] | undefined
      if (dirs && dirs.length > 0 && dirs[0].save_path) {
        load(getParentDir(dirs[0].save_path))
        return
      }
    }
  } catch {
    // 忽略配置读取错误，使用根目录
  }
  load(currentDir.value)
})

async function loadTreeChildren(parentPath: string): Promise<TreeData[]> {
  try {
    const res = await doAction<SubPathResult>('get_sub_path', { dir: parentPath, filter: 'ONLYDIR' })
    if (res.code === 0 && res.data) {
      return Promise.all(
        res.data.map(async (d) => {
          let isLeaf = false
          try {
            const sub = await doAction<SubPathResult>('get_sub_path', { dir: d.path, filter: 'ONLYDIR' })
            isLeaf = !(sub.code === 0 && sub.data && sub.data.length > 0)
          } catch {
            isLeaf = true
          }
          return {
            id: d.path,
            label: d.name,
            path: d.path,
            isLeaf,
            lazy: !isLeaf
          }
        })
      )
    }
  } catch {
    // ignore
  }
  return []
}

async function treeLazyLoad(details: { node: TreeData; done: (data: TreeData[]) => void; fail: () => void }) {
  try {
    details.done(await loadTreeChildren(details.node.path))
  } catch {
    details.fail()
  }
}

function handleTreeSelect(path: string | null) {
  if (path) load(path, true)
}

async function load(dir?: string, fromTree = false) {
  const target = dir || currentDir.value
  loading.value = true
  try {
    const res = await doAction<SubPathResult>('get_sub_path', { dir: target, filter: 'ONLYDIR|MEDIAFILE|SUBFILE' })
    if (res.code === 0) {
      files.value = res.data || []
      currentDir.value = target
      pathInput.value = target
      if (!fromTree) selectedTreePath.value = ''
      treeNodes.value = await loadTreeChildren(target)
    } else {
      modal.error(res.msg || '获取文件列表失败')
    }
  } catch (e) {
    modal.error(e instanceof Error ? e.message : '获取文件列表失败')
  } finally {
    loading.value = false
  }
}

const breadcrumbs = computed(() => {
  const parts = currentDir.value.split('/').filter(Boolean)
  const crumbs = [{ name: '根目录', path: '/' }]
  let acc = ''
  for (const p of parts) {
    acc += '/' + p
    crumbs.push({ name: p, path: acc })
  }
  return crumbs
})

function goPath(path: string) {
  load(path)
}

function parentDir() {
  load(getParentDir(currentDir.value))
}

function goInput() {
  load(pathInput.value)
}

async function copyPath() {
  try {
    await navigator.clipboard.writeText(pathInput.value)
    modal.success('路径已复制')
  } catch {
    modal.info(`路径复制失败，请手动复制：\n${pathInput.value}`)
  }
}

function isDir(f: FileItem): boolean {
  return !f.ext || f.type === 'dir'
}

const fileItems = computed(() => files.value.filter((f) => !isDir(f)))

function clickItem(f: FileItem) {
  if (isDir(f)) load(f.path)
}

const fileDetailsVisible = ref(false)
const selectedFile = ref<FileItem | null>(null)

function openFileDetails(file: FileItem) {
  selectedFile.value = file
  fileDetailsVisible.value = true
}

function detailNameTest() {
  if (!selectedFile.value) return
  fileDetailsVisible.value = false
  doNameTest(selectedFile.value)
}

function detailTransfer() {
  if (!selectedFile.value) return
  fileDetailsVisible.value = false
  openTransfer(selectedFile.value)
}

function detailRename() {
  if (!selectedFile.value) return
  fileDetailsVisible.value = false
  openRename(selectedFile.value)
}

const renameVisible = ref(false)
const renameTarget = ref('')
const renameNewName = ref('')

function openRename(f: FileItem) {
  renameTarget.value = f.path
  renameNewName.value = f.name
  renameVisible.value = true
}

async function doRename() {
  if (!renameNewName.value) return modal.warning('请填写新文件名')
  renameVisible.value = false
  const res = await doAction<{ code: number; msg?: string }>('rename_file', {
    path: renameTarget.value,
    name: renameNewName.value
  })
  if (res.code === 0) {
    modal.success('重命名成功')
    load()
  } else {
    modal.error(res.msg || '重命名失败')
  }
}

async function deleteFile(f: FileItem) {
  const ok = await modal.confirm('是否确认删除文件 ' + f.name + '？注意：没有其它媒体文件的目录也将被删除。', '删除文件')
  if (!ok) return
  const res = await doAction<{ code: number; msg?: string }>('delete_files', { files: [f.path] })
  if (res.code === 0) {
    modal.success('删除成功')
    load()
  } else {
    modal.error(res.msg || '删除失败')
  }
}

async function downloadSubtitle(f: FileItem) {
  modal.showLoading('下载字幕中...')
  try {
    const res = await doAction<{ code: number; msg?: string }>('download_subtitle', { path: f.path, name: f.name })
    if (res.code === 0) {
      modal.success(res.msg || '下载字幕成功')
      load()
    } else {
      modal.error(res.msg || '下载字幕失败')
    }
  } finally {
    modal.hideLoading()
  }
}

const nameTestLoading = ref<Record<string, boolean>>({})
const nameTestResults = reactive<Record<string, NameTestData | { name: string }>>({})
const nameTestRequests = reactive<Record<string, number>>({})

async function doNameTest(f: FileItem) {
  const key = f.path
  nameTestLoading.value[key] = true
  const requestId = (nameTestRequests[key] || 0) + 1
  nameTestRequests[key] = requestId
  try {
    const res = await nameTest(f.name)
    if (requestId !== nameTestRequests[key]) return
    nameTestResults[key] = res.code === 0 && res.data ? res.data : { name: '无法识别' }
  } catch {
    if (requestId !== nameTestRequests[key]) return
    nameTestResults[key] = { name: '识别失败' }
  } finally {
    nameTestLoading.value[key] = false
  }
}

const nameResultVisible = ref(false)
const selectedNameResult = ref<FileItem | null>(null)
const selectedNameTestResult = computed(() => selectedNameResult.value ? nameTestResults[selectedNameResult.value.path] : null)

function openNameResult(file: FileItem) {
  if (!nameTestResults[file.path] || !('title' in nameTestResults[file.path])) return
  selectedNameResult.value = file
  nameResultVisible.value = true
}

function retestSelectedNameResult() {
  if (!selectedNameResult.value) return
  nameResultVisible.value = false
  doNameTest(selectedNameResult.value)
}

const transferVisible = ref(false)
const transferPath = ref('')
const transferOutPath = ref('')
const transferSyncmod = ref('copy')
const transferType = ref('MOV')
const transferTmdb = ref('')
const transferSeason = ref('')
const transferMinFilesize = ref('')
const transferEpFormat = ref('')
const transferEpDetails = ref('')
const transferEpOffset = ref('')
const transferLoading = ref(false)
const transferModes = [
  { label: '硬链接', value: 'link' },
  { label: '软链接', value: 'softlink' },
  { label: '复制', value: 'copy' },
  { label: '移动', value: 'move' },
  { label: 'Rclone复制', value: 'rclonecopy' },
  { label: 'Rclone移动', value: 'rclone' },
  { label: 'Minio复制', value: 'miniocopy' },
  { label: 'Minio移动', value: 'minio' }
]
const transferTypeOptions = [
  { label: '电影', value: 'MOV' },
  { label: '电视剧', value: 'TV' },
  { label: '动漫', value: 'ANIME' }
]
const seasonOptions = Array.from({ length: 51 }, (_, i) => ({ label: '第' + i + '季', value: String(i) }))

const progressVisible = ref(false)
const progressValue = ref(0)
const progressText = ref('请稍候...')
const progressTitle = ref('')
let progressTimer: ReturnType<typeof setTimeout> | null = null
let pollStopped = false

function startProgressPolling(type: string) {
  stopProgressPolling()
  pollStopped = false
  async function poll() {
    if (pollStopped) return
    try {
      const res = await refreshProcess(type)
      if (res.code === 0 && Number.isFinite(res.value)) {
        const value = Math.min(100, Math.max(0, res.value))
        progressValue.value = Number(value.toFixed(2))
        progressText.value = res.text
      }
    } catch {
      // 忽略轮询错误
    }
    if (!pollStopped) progressTimer = setTimeout(poll, 200)
  }
  poll()
}

function stopProgressPolling() {
  pollStopped = true
  if (progressTimer) {
    clearTimeout(progressTimer)
    progressTimer = null
  }
}

onBeforeUnmount(stopProgressPolling)

function resetTransfer(path: string) {
  transferPath.value = path
  transferOutPath.value = ''
  transferSyncmod.value = defaultTransferMode.value
  transferType.value = 'MOV'
  transferTmdb.value = ''
  transferSeason.value = ''
  transferMinFilesize.value = ''
  transferEpFormat.value = ''
  transferEpDetails.value = ''
  transferEpOffset.value = ''
  transferVisible.value = true
}

function openTransfer(f: FileItem) {
  resetTransfer(f.path)
}

function openTransferAll() {
  resetTransfer(currentDir.value)
}

async function doTransfer() {
  if (!transferPath.value) return modal.warning('输入路径不能为空')
  if (transferMinFilesize.value && isNaN(Number(transferMinFilesize.value))) return modal.warning('最小文件大小必须为数字')
  if (transferEpDetails.value && !/^\d{1,5}([,-]\d{1,5})?$/.test(transferEpDetails.value)) return modal.warning('起始集/终止集格式错误')
  if (transferEpOffset.value && !/^-?\d{1,5}$/.test(transferEpOffset.value)) return modal.warning('集数偏移格式错误')
  if ((transferEpDetails.value || transferEpOffset.value) && !transferEpFormat.value) return modal.warning('集数定位必须填写{ep}格式')
  const params: Record<string, string> = {
    inpath: transferPath.value,
    syncmod: transferSyncmod.value,
    type: transferType.value
  }
  if (transferOutPath.value) params.outpath = transferOutPath.value
  if (transferTmdb.value) params.tmdb = transferTmdb.value
  if (transferSeason.value) params.season = transferSeason.value
  if (transferMinFilesize.value) params.min_filesize = transferMinFilesize.value
  if (transferEpFormat.value) params.episode_format = transferEpFormat.value
  if (transferEpDetails.value) params.episode_details = transferEpDetails.value
  if (transferEpOffset.value) params.episode_offset = transferEpOffset.value
  transferVisible.value = false
  progressTitle.value = '手动转移 ' + transferPath.value
  progressValue.value = 0
  progressText.value = '请稍候...'
  progressVisible.value = true
  startProgressPolling('filetransfer')
  try {
    const res = await doAction<{ retcode: number; retmsg: string }>('rename_udf', params)
    stopProgressPolling()
    if (res.retcode === 0) {
      progressValue.value = 100
      progressText.value = '转移成功！'
      setTimeout(() => {
        progressVisible.value = false
        modal.success('转移成功')
        load()
      }, 1000)
    } else {
      progressText.value = res.retmsg || '转移失败'
      setTimeout(() => {
        progressVisible.value = false
        modal.error(res.retmsg || '转移失败')
      }, 1000)
    }
  } catch (e) {
    stopProgressPolling()
    progressVisible.value = false
    modal.error(e instanceof Error ? e.message : '转移失败')
  }
}

interface HardlinkFile {
  file: string
  filename: string
  filepath: string
}

const hardlinkVisible = ref(false)
const hardlinkLoading = ref(false)
const hardlinkDir = ref('')
const hardlinkResults = ref<Record<string, HardlinkFile[]>>({})
const hardlinkSearchDirVisible = ref(false)
const hardlinkPendingFiles = ref<string[]>([])

function openHardlink(f: FileItem) {
  hardlinkPendingFiles.value = [f.path]
  hardlinkDir.value = currentDir.value === '/' ? '/' + f.path.split('/')[1] : currentDir.value
  hardlinkSearchDirVisible.value = true
}

function openHardlinkAll() {
  const filePaths = files.value.filter((f) => !isDir(f)).map((f) => f.path)
  if (filePaths.length === 0) return modal.warning('当前目录下没有文件')
  hardlinkPendingFiles.value = filePaths
  hardlinkDir.value = currentDir.value === '/' ? '/' : currentDir.value
  hardlinkSearchDirVisible.value = true
}

async function doHardlinkSearch() {
  if (!hardlinkDir.value) return modal.warning('请填写查找目录')
  hardlinkSearchDirVisible.value = false
  hardlinkLoading.value = true
  hardlinkVisible.value = true
  try {
    const res = await doAction<{ code: number; data: Record<string, HardlinkFile[]> }>('find_hardlinks', {
      files: hardlinkPendingFiles.value,
      dir: hardlinkDir.value
    })
    if (res.code === 0 && res.data && Object.keys(res.data).length > 0) {
      hardlinkResults.value = res.data
      hardlinkSelected.value = new Set()
    } else {
      hardlinkResults.value = {}
      modal.success('查询成功，但未找到硬链接文件')
      hardlinkVisible.value = false
    }
  } catch {
    modal.error('查询硬链接失败')
    hardlinkVisible.value = false
  } finally {
    hardlinkLoading.value = false
  }
}

interface TmdbSearchItem {
  tmdb_id: string
  title: string
  year: string
  image: string
  overview: string
  link: string
}

const tmdbSearchVisible = ref(false)
const tmdbSearchKeyword = ref('')
const tmdbSearchResults = ref<TmdbSearchItem[]>([])
const tmdbSearchSelected = ref('')

function searchTmdb() {
  tmdbSearchKeyword.value = ''
  tmdbSearchResults.value = []
  tmdbSearchSelected.value = ''
  transferVisible.value = false
  tmdbSearchVisible.value = true
}

async function doTmdbSearch() {
  if (!tmdbSearchKeyword.value) return modal.warning('请输入名称')
  try {
    const res = await doAction<{ code: number; result: TmdbSearchItem[] }>('search_media_infos', {
      keyword: tmdbSearchKeyword.value,
      searchtype: 'tmdb'
    })
    tmdbSearchResults.value = res.code === 0 ? res.result || [] : []
  } catch {
    tmdbSearchResults.value = []
  }
}

function confirmTmdbSearch() {
  if (tmdbSearchSelected.value) transferTmdb.value = tmdbSearchSelected.value
  tmdbSearchVisible.value = false
  transferVisible.value = true
}

function cancelTmdbSearch() {
  tmdbSearchVisible.value = false
  transferVisible.value = true
}

function onTmdbPosterError(e: Event) {
  (e.target as HTMLImageElement).src = '/no-image.png'
}

const hardlinkSelected = ref<Set<string>>(new Set())

function toggleHardlinkSelect(file: string) {
  const next = new Set(hardlinkSelected.value)
  if (next.has(file)) next.delete(file)
  else next.add(file)
  hardlinkSelected.value = next
}

const allHardlinkFiles = computed(() => Object.values(hardlinkResults.value).flat().map((h) => h.file))
const allHardlinkSelected = computed(() => allHardlinkFiles.value.length > 0 && allHardlinkFiles.value.every((f) => hardlinkSelected.value.has(f)))

function selectAllHardlinks() {
  hardlinkSelected.value = new Set(allHardlinkFiles.value)
}

function unselectAllHardlinks() {
  hardlinkSelected.value = new Set()
}

function invertHardlinkSelect() {
  const next = new Set<string>()
  for (const file of allHardlinkFiles.value) {
    if (!hardlinkSelected.value.has(file)) next.add(file)
  }
  hardlinkSelected.value = next
}

async function deleteSelectedHardlinks() {
  const selected = Array.from(hardlinkSelected.value)
  if (selected.length === 0) return modal.warning('没有硬链接文件被选中')
  const ok = await modal.confirm('即将删除所有选中的硬链接文件，如文件所在目录已没有其它媒体文件则目录也将被删除，是否确认？', '删除硬链接')
  if (!ok) return
  const res = await doAction<{ code: number; msg?: string }>('delete_files', { files: selected })
  if (res.code === 0) {
    modal.success('删除成功')
    hardlinkVisible.value = false
  } else {
    modal.error(res.msg || '删除失败')
  }
}
</script>

<template>
  <div class="mediafile page-shell">
    <PageHeader title="文件管理" description="浏览媒体目录、识别、转移、重命名、删除、字幕与硬链接查询">
      <template #actions>
        <q-btn v-if="!$q.screen.lt.sm" outline color="primary" icon="arrow_upward" label="上级目录" @click="parentDir" />
        <q-btn v-if="!$q.screen.lt.sm" outline color="primary" icon="upload" label="转移当前目录" @click="openTransferAll" />
        <q-btn v-if="!$q.screen.lt.sm" outline color="primary" icon="link" label="查询当前目录硬链接" @click="openHardlinkAll" />
        <q-btn-dropdown v-else outline color="primary" icon="more_horiz" label="更多" auto-close>
          <q-list separator>
            <q-item clickable @click="parentDir"><q-item-section avatar><q-icon name="arrow_upward" /></q-item-section><q-item-section>上级目录</q-item-section></q-item>
            <q-item clickable @click="openTransferAll"><q-item-section avatar><q-icon name="upload" /></q-item-section><q-item-section>转移当前目录</q-item-section></q-item>
            <q-item clickable @click="openHardlinkAll"><q-item-section avatar><q-icon name="link" /></q-item-section><q-item-section>查询当前目录硬链接</q-item-section></q-item>
          </q-list>
        </q-btn-dropdown>
        <q-btn unelevated color="primary" icon="refresh" label="刷新" @click="load()" />
      </template>
    </PageHeader>

    <q-card flat bordered class="path-card">
      <q-input v-model="pathInput" outlined dense label="当前目录路径" placeholder="输入路径后按 Enter 前往" @keyup.enter="goInput">
        <template #prepend><q-icon name="folder_open" /></template>
        <template #append><q-btn flat dense round icon="content_copy" aria-label="复制完整路径" @click="copyPath"><q-tooltip>复制完整路径</q-tooltip></q-btn><q-btn flat dense round icon="arrow_forward" aria-label="前往" @click="goInput"><q-tooltip>前往目录</q-tooltip></q-btn></template>
      </q-input>
      <q-breadcrumbs class="crumbs" active-color="primary">
        <q-breadcrumbs-el
          v-for="(crumb, idx) in breadcrumbs"
          :key="crumb.path"
          :label="crumb.name"
          :icon="idx === 0 ? 'home' : 'folder'"
          class="crumb-link"
          @click="goPath(crumb.path)"
        />
      </q-breadcrumbs>
    </q-card>

    <div class="split-layout">
      <q-card flat bordered class="dir-panel">
        <q-card-section class="list-header">
          <div class="section-title"><q-icon name="folder" color="warning" />目录</div>
          <q-btn flat dense color="primary" icon="arrow_upward" label="上级" @click="parentDir" />
        </q-card-section>
        <q-separator />
        <q-card-section class="tree-body">
          <q-tree
            v-model:selected="selectedTreePath"
            :nodes="treeNodes"
            node-key="id"
            label-key="label"
            no-connectors
            selected-color="primary"
            no-nodes-label="空目录"
            @update:selected="handleTreeSelect"
            @lazy-load="treeLazyLoad"
          >
            <template #default-header="prop">
              <div class="tree-node"><q-icon name="folder" color="warning" /><span>{{ prop.node.label }}</span></div>
            </template>
          </q-tree>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="file-panel">
        <q-card-section class="list-header file-header">
          <div class="section-title"><q-icon name="description" color="primary" />文件 <span class="muted">{{ fileItems.length }} 个</span></div>
        </q-card-section>
        <q-separator />
        <q-inner-loading :showing="loading"><q-spinner color="primary" size="42px" /></q-inner-loading>
        <q-card-section v-if="fileItems.length === 0" class="empty-state">
          <q-icon name="folder_open" size="48px" color="grey-5" />
          <div>没有文件</div>
        </q-card-section>
        <div v-for="row in fileItems" :key="row.path" class="file-card">
          <div class="file-top">
            <div class="file-info">
              <q-icon name="description" color="grey-7" size="22px" />
              <button class="file-name file-name-button" type="button" :title="row.path" @click="openFileDetails(row)">{{ row.name }}<q-tooltip>查看文件详情：{{ row.path }}</q-tooltip></button>
              <q-badge v-if="row.size" color="grey-3" text-color="grey-8">{{ row.size }}</q-badge>
            </div>
            <div class="file-ops">
              <q-btn flat dense color="primary" icon="handyman" label="识别" :loading="nameTestLoading[row.path]" :disable="nameTestLoading[row.path]" @click="doNameTest(row)" />
              <q-btn flat dense color="primary" icon="upload" label="转移" @click="openTransfer(row)" />
              <q-btn flat dense color="primary" icon="subtitles" label="字幕" @click="downloadSubtitle(row)" />
              <q-btn flat dense color="primary" icon="link" label="硬链接" @click="openHardlink(row)" />
              <q-btn flat dense color="primary" icon="edit" label="重命名" @click="openRename(row)" />
              <q-btn flat dense color="negative" icon="delete" label="删除" @click="deleteFile(row)" />
            </div>
          </div>
          <div v-if="nameTestLoading[row.path]" class="recognition-loading"><q-spinner-dots color="primary" size="20px" /><span>{{ nameTestResults[row.path] ? '上次结果 · 正在重新识别' : '正在识别…' }}</span></div>
          <NameTestResult v-else-if="nameTestResults[row.path]" :result="nameTestResults[row.path]" :input="row.name" :source="row.path" compact @open-details="openNameResult(row)" />
        </div>
      </q-card>
    </div>

    <q-dialog v-model="nameResultVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="name-result-dialog result-dialog-card">
        <q-card-section class="dialog-title"><div class="text-h6">名称识别结果</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section>
        <q-separator />
        <q-card-section class="name-result-dialog-body">
          <NameTestResult v-if="selectedNameResult && selectedNameTestResult" :result="selectedNameTestResult" :input="selectedNameResult.name" :source="selectedNameResult.path" />
        </q-card-section>
        <q-separator />
        <q-card-actions align="right"><q-btn flat label="关闭" v-close-popup /><q-btn color="primary" unelevated icon="refresh" label="重新识别" @click="retestSelectedNameResult" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="fileDetailsVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="file-detail-dialog">
        <q-card-section class="dialog-title"><div class="text-h6">文件详情</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section>
        <q-separator />
        <q-card-section v-if="selectedFile" class="file-detail-body">
          <div class="detail-heading"><q-icon name="description" color="primary" size="28px" /><div class="detail-name" :title="selectedFile.name">{{ selectedFile.name }}</div></div>
          <div class="detail-grid"><div><span class="field-label">完整路径</span><span class="detail-value" :title="selectedFile.path">{{ selectedFile.path }}</span></div><div><span class="field-label">大小</span><span class="detail-value">{{ selectedFile.size || '未返回' }}</span></div><div><span class="field-label">类型</span><span class="detail-value">{{ selectedFile.ext || selectedFile.type || '未返回' }}</span></div></div>
          <NameTestResult v-if="selectedNameResult?.path === selectedFile.path && selectedNameTestResult" :result="selectedNameTestResult" :input="selectedFile.name" :source="selectedFile.path" compact @open-details="openNameResult(selectedFile)" />
          <div v-else class="detail-recognition-hint"><q-icon name="info_outline" /><span>可在此查看文件信息，或直接开始名称识别。</span></div>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right"><q-btn flat label="关闭" v-close-popup /><q-btn flat color="primary" icon="handyman" label="识别" @click="detailNameTest" /><q-btn flat color="primary" icon="edit" label="重命名" @click="detailRename" /><q-btn color="primary" unelevated icon="upload" label="转移" @click="detailTransfer" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="transferVisible" persistent>
      <q-card class="dialog-card wide-dialog">
        <q-card-section class="dialog-title"><div class="text-h6">自定义识别转移</div><q-btn v-close-popup flat round dense icon="close" /></q-card-section>
        <q-separator />
        <q-form @submit.prevent="doTransfer">
          <q-card-section class="dialog-body">
            <q-input v-model="transferPath" outlined dense label="输入路径" required class="q-mb-md" />
            <q-input v-model="transferOutPath" outlined dense label="输出路径" placeholder="留空则转移至媒体库" class="q-mb-md" />
            <q-select v-model="transferSyncmod" outlined dense label="转移方式" :options="transferModes" emit-value map-options class="q-mb-md" />
            <q-option-group v-model="transferType" :options="transferTypeOptions" type="radio" inline class="q-mb-md" />
            <q-input v-model="transferTmdb" outlined dense label="TMDB ID" placeholder="留空自动识别" class="q-mb-md">
              <template #append><q-btn flat dense color="primary" label="查询" @click="searchTmdb" /></template>
            </q-input>
            <div class="form-row">
              <q-select v-model="transferSeason" outlined dense label="季" :options="seasonOptions" emit-value map-options :disable="transferType === 'MOV'" />
              <q-input v-model="transferMinFilesize" outlined dense label="最小文件大小" placeholder="留空使用默认值" />
            </div>
            <q-banner dense rounded class="bg-blue-1 text-primary q-mt-md">
              集数定位用于从文件名提取集数：定位格式必须包含 {ep}（如 S{season}E{ep} 或 第{ep}集）；起始/终止集填写 1 或 1,2；偏移支持 -10、EP+1、2*EP-1 等。仅剧集/动漫需要，未填写时按自动识别。
            </q-banner>
            <div class="form-row q-mt-md">
              <q-input v-model="transferEpFormat" outlined dense label="集数定位格式" placeholder="如 S{season}E{ep}" />
              <q-input v-model="transferEpDetails" outlined dense label="起始/终止集" placeholder="如 1 或 1,2" />
              <q-input v-model="transferEpOffset" outlined dense label="集数偏移" placeholder="如 -10 或 EP+1" />
            </div>
          </q-card-section>
          <q-separator />
          <q-card-actions align="right"><q-btn flat label="取消" v-close-popup /><q-btn color="primary" label="转移" type="submit" :loading="transferLoading" /></q-card-actions>
        </q-form>
      </q-card>
    </q-dialog>

    <q-dialog v-model="progressVisible" persistent>
      <q-card class="progress-card">
        <q-card-section class="text-center">
          <div class="text-subtitle1 text-weight-medium q-mb-md">{{ progressTitle }}</div>
          <q-linear-progress rounded size="24px" :value="progressValue / 100" color="primary" />
          <div class="text-caption text-grey-7 q-mt-sm">{{ progressText }}</div>
        </q-card-section>
      </q-card>
    </q-dialog>

    <q-dialog v-model="tmdbSearchVisible" persistent>
      <q-card class="dialog-card tmdb-dialog">
        <q-card-section class="dialog-title"><div class="text-h6">查询 TMDB ID</div><q-btn flat round dense icon="close" @click="cancelTmdbSearch" /></q-card-section>
        <q-separator />
        <q-card-section>
          <div class="search-row"><q-input v-model="tmdbSearchKeyword" outlined dense class="col" placeholder="输入名称查询" @keyup.enter="doTmdbSearch" /><q-btn color="primary" icon="search" label="搜索" @click="doTmdbSearch" /></div>
          <q-list v-if="tmdbSearchResults.length" bordered separator class="tmdb-list q-mt-md">
            <q-item v-for="item in tmdbSearchResults" :key="item.tmdb_id" clickable :active="tmdbSearchSelected === item.tmdb_id" active-class="bg-blue-1" @click="tmdbSearchSelected = item.tmdb_id">
              <q-item-section side><q-radio v-model="tmdbSearchSelected" :val="item.tmdb_id" /></q-item-section>
              <q-item-section avatar><q-img :src="item.image || '/no-image.png'" ratio="0.72" width="50px" @error="onTmdbPosterError" /></q-item-section>
              <q-item-section><q-item-label class="text-weight-medium">{{ item.title }} ({{ item.year }})</q-item-label><q-item-label caption lines="3">{{ item.overview || '暂无简介' }}</q-item-label></q-item-section>
            </q-item>
          </q-list>
          <div v-else-if="tmdbSearchKeyword" class="empty-state compact"><q-icon name="search_off" size="40px" color="grey-5" /><div>未找到相关信息</div></div>
        </q-card-section>
        <q-separator />
        <q-card-actions align="right"><q-btn flat label="取消" @click="cancelTmdbSearch" /><q-btn color="primary" label="确定" :disable="!tmdbSearchSelected" @click="confirmTmdbSearch" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="hardlinkSearchDirVisible">
      <q-card class="dialog-card small-dialog">
        <q-card-section class="dialog-title"><div class="text-h6">硬链接查询</div><q-btn v-close-popup flat round dense icon="close" /></q-card-section>
        <q-card-section><q-input v-model="hardlinkDir" outlined autofocus label="查找目录" placeholder="选择路径" @keyup.enter="doHardlinkSearch" /></q-card-section>
        <q-card-actions align="right"><q-btn flat label="取消" v-close-popup /><q-btn color="primary" label="确定" @click="doHardlinkSearch" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="hardlinkVisible" persistent>
      <q-card class="dialog-card hardlink-dialog">
        <q-card-section class="dialog-title"><div class="text-h6">硬链接文件</div><q-btn v-close-popup flat round dense icon="close" /></q-card-section>
        <q-separator />
        <q-card-section class="hardlink-body">
          <q-inner-loading :showing="hardlinkLoading"><q-spinner color="primary" size="40px" /></q-inner-loading>
          <div v-if="!hardlinkLoading && !allHardlinkFiles.length" class="empty-state compact">暂无数据</div>
          <div v-for="(links, file) in hardlinkResults" :key="file" class="hl-group">
            <div class="hl-file-title">{{ file }}</div>
            <q-list separator>
              <q-item v-for="h in links" :key="h.file" dense>
                <q-item-section side><q-checkbox :model-value="hardlinkSelected.has(h.file)" @update:model-value="toggleHardlinkSelect(h.file)" /></q-item-section>
                <q-item-section><q-item-label><q-icon name="link" class="q-mr-xs" />{{ h.filename }}</q-item-label><q-item-label caption>{{ h.filepath }}</q-item-label></q-item-section>
              </q-item>
            </q-list>
          </div>
        </q-card-section>
        <q-separator />
        <q-card-actions class="hardlink-actions">
          <div class="row items-center q-gutter-sm"><q-btn flat dense color="primary" :label="allHardlinkSelected ? '全不选' : '全选'" @click="allHardlinkSelected ? unselectAllHardlinks() : selectAllHardlinks()" /><q-btn flat dense color="primary" label="反选" @click="invertHardlinkSelect" /><span class="text-caption text-grey-7">已选 {{ hardlinkSelected.size }} / {{ allHardlinkFiles.length }} 项</span></div>
          <q-btn color="negative" label="批量删除" icon="delete" :disable="hardlinkSelected.size === 0" @click="deleteSelectedHardlinks" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="renameVisible">
      <q-card class="dialog-card small-dialog">
        <q-card-section class="dialog-title"><div class="text-h6">文件重命名</div><q-btn v-close-popup flat round dense icon="close" /></q-card-section>
        <q-card-section><q-input v-model="renameNewName" outlined autofocus label="新文件名" @keyup.enter="doRename" /></q-card-section>
        <q-card-actions align="right"><q-btn flat label="取消" v-close-popup /><q-btn color="primary" label="确定" @click="doRename" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.mediafile { width: 100%; max-width: 1600px; min-width: 0; margin: 0 auto; height: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: auto; }
.path-card { margin-bottom: 12px; padding: 14px; }
.crumbs { margin-top: 12px; }
.crumb-link { cursor: pointer; }
.split-layout { display: flex; gap: 12px; flex: 1; min-height: 0; align-items: stretch; }
.dir-panel { width: 260px; flex-shrink: 0; min-height: 320px; display: flex; flex-direction: column; }
.file-panel { flex: 1; min-width: 0; min-height: 320px; position: relative; }
.tree-body { flex: 1; overflow: auto; }
.list-header, .file-top, .file-info, .file-actions, .dialog-title, .hardlink-actions, .search-row, .form-row { display: flex; align-items: center; }
.list-header, .dialog-title { justify-content: space-between; gap: 8px; }
.section-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }
.muted { color: var(--text-secondary); font-size: 13px; font-weight: normal; margin-left: 4px; }
.tree-node { display: flex; align-items: center; gap: 6px; min-width: 0; }
.tree-node span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-header { min-height: 48px; }
.file-card { padding: 14px 16px; border-bottom: 1px solid var(--border-light); }
.file-card:last-child { border-bottom: 0; }
.file-top { align-items: flex-start; justify-content: space-between; gap: 12px; }
.file-info { gap: 8px; min-width: 0; flex: 1; }
.file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-name-button { border: 0; padding: 0; background: transparent; color: var(--text-primary); text-align: left; font: inherit; cursor: pointer; }
.file-name-button:hover { color: var(--q-primary); }
.file-ops { display: flex; flex-wrap: wrap; gap: 2px; flex-shrink: 0; justify-content: flex-end; }
.recognition-loading { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding-left: 30px; color: var(--text-secondary); font-size: 12px; }
.empty-state { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--text-secondary); }
.empty-state.compact { min-height: 120px; }
.dialog-card { width: min(92vw, 560px); max-width: 100%; }
.wide-dialog { width: min(92vw, 680px); }
.small-dialog { width: min(92vw, 480px); }
.progress-card { width: min(92vw, 420px); }
.tmdb-dialog { width: min(92vw, 600px); }
.hardlink-dialog { width: min(92vw, 760px); }
.name-result-dialog { width: min(900px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.file-detail-dialog { width: min(720px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.dialog-title { padding: 16px 20px; }
.dialog-body { max-height: 70vh; overflow-y: auto; }
.name-result-dialog-body { max-height: 75vh; overflow-y: auto; }
.file-detail-body { max-height: 75vh; overflow-y: auto; }
.detail-heading { display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.detail-name { min-width: 0; overflow-wrap: anywhere; color: var(--text-primary); font-size: 18px; font-weight: 650; line-height: 1.4; }
.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
.detail-grid > div { display: grid; gap: 4px; min-width: 0; padding: 10px; border-radius: 8px; background: var(--surface-muted); }
.detail-grid > div:first-child { grid-column: 1 / -1; }
.detail-value { overflow-wrap: anywhere; color: var(--text-primary); font-size: 13px; }
.field-label { color: var(--text-secondary); font-size: 12px; }
.detail-recognition-hint { display: flex; align-items: center; gap: 6px; margin-top: 16px; color: var(--text-secondary); font-size: 13px; }
.form-row { gap: 12px; align-items: flex-start; }
.form-row > * { flex: 1; min-width: 0; }
.search-row { gap: 8px; }
.tmdb-list { max-height: 410px; overflow-y: auto; }
.hardlink-body { max-height: 60vh; overflow-y: auto; position: relative; }
.hl-group { margin-bottom: 16px; }
.hl-file-title { padding: 7px 10px; border-radius: 5px; background: var(--surface-muted); font-weight: 600; }
.hardlink-actions { justify-content: space-between; gap: 12px; flex-wrap: wrap; }
@media (max-width: 900px) {
  .split-layout { flex-direction: column; }
  .dir-panel { width: 100%; min-height: 180px; max-height: 260px; }
  .file-panel { min-height: 260px; }
  .file-top { flex-direction: column; }
  .file-ops { width: 100%; justify-content: flex-start; }
}
@media (max-width: 599px) {
  .file-actions { display: none; }
  .file-card { padding: 12px 4px; }
  .file-ops { gap: 4px; }
  .file-ops :deep(.q-btn) { min-height: 38px; }
  .file-ops :deep(.q-btn__content) { flex-direction: column; gap: 2px; font-size: 11px; }
  .recognition-loading { padding-left: 0; }
  .form-row { flex-direction: column; gap: 8px; }
  .form-row > * { width: 100%; }
  .hardlink-actions { align-items: flex-start; }
}
@media (max-width: 599px) {
  .name-result-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }
  .name-result-dialog-body { max-height: none; flex: 1; overflow-y: auto; padding: 12px; }
  .file-detail-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }
  .file-detail-body { max-height: none; flex: 1; overflow-y: auto; }
  .detail-grid { grid-template-columns: 1fr; }
}
</style>
