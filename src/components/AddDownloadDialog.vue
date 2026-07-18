<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { UploadFilled, Link } from '@element-plus/icons-vue'
import type { UploadFile, UploadUserFile, UploadInstance } from 'element-plus'
import {
  getDownloadDirs,
  getDownloadSettings,
  downloadTorrent,
  downloadSearchItem,
  uploadTorrentFile,
  type DownloadSettingOption
} from '@/api/download'

type Mode = 'search' | 'manual'
type ManualSubType = 'torrent' | 'magnet'

const props = defineProps<{
  modelValue: boolean
  mode: Mode
  /** search 模式下使用的种子 id */
  torrentId?: string | number
  /** manual 模式下的子类型 */
  manualType?: ManualSubType
  /** 顶部提示标题（如：添加下载 【站点】种子名称） */
  title?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void
  (e: 'success'): void
  (e: 'error', msg: string): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const downloadSettings = ref<DownloadSettingOption[]>([])
const savePaths = ref<string[]>([])
const form = reactive({
  dl_setting: '' as string | number,
  dl_dir: '',
  magnets: ''
})
const fileList = ref<UploadUserFile[]>([])
const uploadingNames: string[] = []
const uploadRefs = ref<UploadInstance | null>(null)
const submitting = ref(false)

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return
    form.dl_setting = ''
    form.dl_dir = ''
    form.magnets = ''
    fileList.value = []
    uploadingNames.length = 0
    uploadRefs.value?.clearFiles?.()
    await fetchDownloadSettings()
    await fetchSavePaths('')
  }
)

async function fetchDownloadSettings() {
  try {
    const res = await getDownloadSettings()
    if (res.code === 0) downloadSettings.value = res.data || []
  } catch {
    downloadSettings.value = []
  }
}

async function fetchSavePaths(sid: string | number) {
  if (!sid) {
    savePaths.value = []
    return
  }
  try {
    const res = await getDownloadDirs(sid)
    if (res.code === 0) savePaths.value = res.paths || []
  } catch {
    savePaths.value = []
  }
}

async function onDownloadSettingChange(val: string | number) {
  form.dl_dir = ''
  await fetchSavePaths(val)
}

async function uploadTorrentHandler(options: {
  file: File
  onSuccess: (res: unknown) => void
  onError: (err: unknown) => void
}) {
  try {
    const res = await uploadTorrentFile(options.file)
    if (res.code === 0 && res.filepath) {
      uploadingNames.push(options.file.name)
      options.onSuccess({ code: 0 })
    } else {
      options.onError(new Error(res.msg || '上传失败'))
    }
  } catch (e) {
    options.onError(e instanceof Error ? e : new Error('上传失败'))
  }
}

function onRemoveFile(file: UploadFile) {
  const idx = fileList.value.findIndex((f) => f.uid === file.uid)
  if (idx >= 0) {
    uploadingNames.splice(idx, 1)
    fileList.value.splice(idx, 1)
  }
}

async function submit() {
  submitting.value = true
  try {
    if (props.mode === 'search') {
      if (props.torrentId === undefined || props.torrentId === '') {
        emit('error', '种子 ID 缺失')
        return
      }
      const res = await downloadSearchItem(props.torrentId, form.dl_dir, form.dl_setting)
      if (res.retcode === 0) {
        visible.value = false
        emit('success')
      } else {
        emit('error', res.retmsg || '添加下载失败')
      }
    } else {
      const subType = props.manualType || 'torrent'
      const magnets = subType === 'magnet' ? form.magnets.split('\n').map((m) => m.trim()).filter(Boolean) : []
      const files = subType === 'torrent' ? uploadingNames.map((name) => ({ upload: { filename: name } })) : []
      if (files.length === 0 && magnets.length === 0) {
        emit('error', '请上传种子文件或填写磁力链接')
        return
      }
      const res = await downloadTorrent({
        files,
        magnets,
        dl_dir: form.dl_dir,
        dl_setting: form.dl_setting
      })
      if (res.code === 0) {
        visible.value = false
        emit('success')
      } else {
        emit('error', res.msg || '添加下载失败')
      }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title || '添加下载'"
    width="540px"
    :close-on-click-modal="false"
    append-to-body
  >
    <el-form label-width="90px" label-position="right">
      <el-form-item label="下载设置">
        <el-select
          v-model="form.dl_setting"
          placeholder="默认"
          clearable
          style="width: 100%"
          @change="onDownloadSettingChange"
        >
          <el-option label="默认" value="" />
          <el-option
            v-for="d in downloadSettings"
            :key="d.id"
            :label="d.name"
            :value="d.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="保存目录">
        <el-select v-model="form.dl_dir" placeholder="自动" clearable style="width: 100%">
          <el-option label="自动" value="" />
          <el-option v-for="p in savePaths" :key="p" :label="p" :value="p" />
        </el-select>
      </el-form-item>

      <template v-if="mode === 'manual' && manualType === 'torrent'">
        <el-form-item label="种子文件">
          <el-upload
            ref="uploadRefs"
            v-model:file-list="fileList"
            :auto-upload="true"
            :http-request="uploadTorrentHandler"
            accept=".torrent"
            :on-remove="onRemoveFile"
            multiple
            drag
          >
            <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
            <div class="el-upload__text">点击或拖动 .torrent 文件到此处上传</div>
          </el-upload>
        </el-form-item>
      </template>
      <template v-else-if="mode === 'manual' && manualType === 'magnet'">
        <el-form-item label="磁力链接">
          <el-input
            v-model="form.magnets"
            type="textarea"
            :rows="8"
            placeholder="magnet:?xt=urn:btih:xxx，换行添加多个磁链"
          />
        </el-form-item>
      </template>
      <template v-else-if="mode === 'search'">
        <el-alert type="info" :closable="false" show-icon>
          <template #title>选择下载设置与保存目录后点击「下载」即可添加该种子到下载器</template>
        </el-alert>
      </template>
    </el-form>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="submit">下载</el-button>
    </template>
  </el-dialog>
</template>