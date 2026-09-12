<script setup lang="ts">
import { onMounted, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { updateDirectory } from '@/api/config'
import { doAction } from '@/api'

type LibKey = 'movie' | 'tv' | 'anime' | 'unknown'

interface LibSection {
  key: LibKey
  title: string
  configKey: string
}

const SECTIONS: LibSection[] = [
  { key: 'movie', title: '电影', configKey: 'media.movie_path' },
  { key: 'tv', title: '电视剧', configKey: 'media.tv_path' },
  { key: 'anime', title: '动漫', configKey: 'media.anime_path' },
  { key: 'unknown', title: '未识别', configKey: 'media.unknown_path' }
]

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

interface TreeNode {
  id: string
  label: string
  path: string
  isLeaf: boolean
  lazy?: boolean
}

const { config, loading, load } = useConfigForm()
const modal = useModalStore()

const dialogVisible = ref(false)
const currentSection = ref<LibSection | null>(null)
const newPath = ref('')
const submitting = ref(false)
const treeLoading = ref(false)
const treeKey = ref(0)
const treeNodes = ref<TreeNode[]>([])
const selectedTreePath = ref('')

function getPaths(section: LibSection): string[] {
  const media = config.value.media as Record<string, unknown> | undefined
  const arr = media?.[`${section.key}_path`]
  return Array.isArray(arr) ? (arr as string[]) : []
}

function openDialog(section: LibSection) {
  currentSection.value = section
  newPath.value = ''
  selectedTreePath.value = ''
  treeNodes.value = []
  treeKey.value++
  dialogVisible.value = true
  loadTreeRoot()
}

async function loadTreeRoot() {
  treeLoading.value = true
  treeNodes.value = await loadTreeChildren('/')
  treeLoading.value = false
}

async function loadTreeChildren(parentPath: string): Promise<TreeNode[]> {
  try {
    const res = await doAction<SubPathResult>('get_sub_path', { dir: parentPath, filter: 'ONLYDIR' })
    if (res.code === 0 && res.data) {
      return res.data.map((d) => ({
        id: d.path,
        label: d.name,
        path: d.path,
        isLeaf: false,
        lazy: true,
      }))
    }
  } catch {
    // ignore
  }
  return []
}

async function treeLazyLoad({ node, done, fail }: { node: TreeNode; done: (data: TreeNode[]) => void; fail: () => void }) {
  try {
    done(await loadTreeChildren(node.path))
  } catch {
    fail()
  }
}

function handleTreeSelect(path: string | null) {
  if (!path) return
  selectedTreePath.value = path
  newPath.value = path
}

async function handleAdd() {
  if (!newPath.value || !currentSection.value) return
  submitting.value = true
  try {
    const res = await updateDirectory('add', currentSection.value.configKey, newPath.value)
    if (res.code === 0) {
      modal.success('添加成功')
      dialogVisible.value = false
      await load()
    } else {
      modal.error('添加失败')
    }
  } catch {
    modal.error('添加失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(section: LibSection, path: string) {
  const ok = await modal.confirm(`确定删除目录 "${path}" ？`)
  if (!ok) return
  try {
    const res = await updateDirectory('sub', section.configKey, path)
    if (res.code === 0) {
      modal.success('删除成功')
      await load()
    } else {
      modal.error('删除失败')
    }
  } catch {
    modal.error('删除失败')
  }
}

onMounted(load)
</script>

<template>
  <div class="library-view">
    <PageHeader title="媒体库" description="配置电影、电视剧、动漫、未识别媒体的库目录" />
    <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
    <div class="lib-list">
      <q-card v-for="section in SECTIONS" :key="section.key" flat bordered class="library-card">
        <q-card-section class="row items-center no-wrap card-header"><div class="text-subtitle1 text-weight-medium">{{ section.title }} <HelpTip v-if="section.key === 'unknown'" text="Emby / Jellyfin / Plex 媒体库对应文件的路径。未配置目的目录时，媒体文件会重命名转移到该目录。" /></div><q-space /><q-btn color="primary" unelevated dense icon="add" label="添加目录" @click="openDialog(section)" /></q-card-section>
        <q-separator />
        <q-card-section class="path-list">
          <div v-for="path in getPaths(section)" :key="path" class="path-item"><q-icon name="folder" color="primary" size="20px" /><span class="path-text">{{ path }}</span><q-btn flat round dense color="negative" icon="delete_outline" aria-label="删除目录" @click="handleDelete(section, path)" /></div>
          <div v-if="!getPaths(section).length" class="empty-path"><q-icon name="folder_off" size="30px" color="grey-5" />未配置目录</div>
        </q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent>
      <q-card class="library-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">新增目录 · {{ currentSection?.title }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="dialogVisible = false" /></q-card-section>
        <q-separator />
        <q-card-section class="dialog-body"><q-input v-model="newPath" outlined dense label="路径" placeholder="输入目录路径，或从下方树形结构选择" /><div class="tree-container"><q-inner-loading :showing="treeLoading"><q-spinner-dots color="primary" /></q-inner-loading><q-tree v-if="treeNodes.length" :key="treeKey" v-model:selected="selectedTreePath" :nodes="treeNodes" node-key="id" label-key="label" no-connectors accordion no-transition lazy @lazy-load="treeLazyLoad" @update:selected="handleTreeSelect"><template #default-header="prop"><div class="row items-center no-wrap q-gutter-xs"><q-icon name="folder" color="primary" /><span class="ellipsis">{{ prop.node.label }}</span></div></template></q-tree><div v-else-if="!treeLoading" class="empty-tree"><q-icon name="folder_off" size="34px" color="grey-5" />空目录</div></div></q-card-section>
        <q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="submitting" @click="dialogVisible = false" /><q-btn color="primary" unelevated label="确定" :loading="submitting" @click="handleAdd" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.library-view { position: relative; }.lib-list { display: flex; flex-direction: column; gap: 16px; }.library-card { border-radius: 16px; background: var(--surface); color: var(--text-primary); }.card-header { min-height: 56px; padding: 12px 16px; }.path-list { display: flex; flex-direction: column; gap: 4px; padding: 8px 16px 14px; }.path-item { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 4px 0; }.path-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.empty-path, .empty-tree { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px 0; color: var(--text-secondary); font-size: 13px; }.library-dialog { width: min(600px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }.dialog-body { padding: 20px 24px; }.tree-container { position: relative; max-height: 320px; min-height: 120px; overflow: auto; margin-top: 14px; padding: 8px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-raised); }.dialog-actions { gap: 8px; padding: 12px 24px 16px; }@media (max-width: 599px) { .library-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }.dialog-body { padding: 16px; }.tree-container { max-height: none; flex: 1; }.dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); }.dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
