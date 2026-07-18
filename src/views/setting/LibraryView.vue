<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Delete, Plus, Folder } from '@element-plus/icons-vue'
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
}

const { config, loading, load } = useConfigForm()
const modal = useModalStore()

const dialogVisible = ref(false)
const currentSection = ref<LibSection | null>(null)
const newPath = ref('')
const submitting = ref(false)
const treeLoading = ref(false)
const treeKey = ref(0)

function getPaths(section: LibSection): string[] {
  const media = config.value.media as Record<string, unknown> | undefined
  const arr = media?.[`${section.key}_path`]
  return Array.isArray(arr) ? (arr as string[]) : []
}

function openDialog(section: LibSection) {
  currentSection.value = section
  newPath.value = ''
  treeKey.value++
  dialogVisible.value = true
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
      }))
    }
  } catch {
    // ignore
  }
  return []
}

async function treeLazyLoad(node: any, resolve: (data: TreeNode[]) => void) {
  if (node.level === 0) {
    const roots = await loadTreeChildren('/')
    resolve(roots)
  } else {
    const children = await loadTreeChildren(node.data.path)
    resolve(children)
  }
}

function handleTreeClick(data: TreeNode) {
  newPath.value = data.path
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
  <div v-loading="loading" class="library-view">
    <PageHeader title="媒体库" description="配置电影、电视剧、动漫、未识别媒体的库目录" />
    <div class="lib-list">
      <el-card v-for="s in SECTIONS" :key="s.key" shadow="never">
        <template #header>
          <div class="card-header">
            <span>
              <strong>{{ s.title }}</strong>
              <HelpTip v-if="s.key === 'unknown'" text="Emby/Jellyfin/Plex媒体库对应文件的路径，下载文件转移、目录同步未配置目的目录时，媒体文件将重命名转移到该目录" />
            </span>
            <el-button type="primary" :icon="Plus" size="small" @click="openDialog(s)">
              添加目录
            </el-button>
          </div>
        </template>
        <el-table :data="getPaths(s)" :show-header="false" empty-text="未配置">
          <el-table-column label="目录">
            <template #default="{ row }">
              <span>{{ row }}</span>
            </template>
          </el-table-column>
          <el-table-column width="80" align="right">
            <template #default="{ row }">
              <el-button
                type="danger"
                :icon="Delete"
                link
                @click="handleDelete(s, row)"
              />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </div>

    <el-dialog v-model="dialogVisible" :title="`新增目录 - ${currentSection?.title}`" width="600px" destroy-on-close>
      <el-form label-width="80px">
        <el-form-item label="路径">
          <el-input v-model="newPath" placeholder="请输入目录路径，或从下方树形结构选择" />
        </el-form-item>
      </el-form>
      <div v-loading="treeLoading" class="tree-container">
        <el-tree
          :key="treeKey"
          :lazy="true"
          :load="treeLazyLoad"
          node-key="id"
          :expand-on-click-node="true"
          @node-click="handleTreeClick"
          :highlight-current="true"
          empty-text="空目录"
        >
          <template #default="{ data }">
            <span class="tree-node">
              <el-icon><Folder /></el-icon>
              <span>{{ data.label }}</span>
            </span>
          </template>
        </el-tree>
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleAdd">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.lib-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.tree-container {
  max-height: 300px;
  overflow-y: auto;
  margin-top: 12px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
}
</style>
