<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { getDownloadDirs, getDownloadSettings, downloadTorrent, downloadSearchItem, uploadTorrentFile, type DownloadSettingOption } from '@/api/download'

type Mode = 'search' | 'manual'
type ManualSubType = 'torrent' | 'magnet'
const props = defineProps<{ modelValue: boolean; mode: Mode; torrentId?: string | number; manualType?: ManualSubType; title?: string }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void; (event: 'success'): void; (event: 'error', message: string): void }>()
const visible = computed({ get: () => props.modelValue, set: (value: boolean) => emit('update:modelValue', value) })
const downloadSettings = ref<DownloadSettingOption[]>([])
const savePaths = ref<string[]>([])
const form = reactive({ dl_setting: '' as string | number, dl_dir: '', magnets: '' })
const torrentFiles = ref<File[]>([])
const uploadedNames = ref<string[]>([])
const uploading = ref(false)
const submitting = ref(false)
const dialogTitle = computed(() => props.title || (props.mode === 'search' ? '添加搜索结果' : '添加下载'))

watch(() => props.modelValue, async (open) => { if (!open) return; form.dl_setting = ''; form.dl_dir = ''; form.magnets = ''; torrentFiles.value = []; uploadedNames.value = []; await fetchDownloadSettings(); await fetchSavePaths('') })
async function fetchDownloadSettings() { try { const response = await getDownloadSettings(); downloadSettings.value = response.code === 0 ? response.data || [] : [] } catch { downloadSettings.value = [] } }
async function fetchSavePaths(settingId: string | number) { if (!settingId) { savePaths.value = []; return }; try { const response = await getDownloadDirs(settingId); savePaths.value = response.code === 0 ? response.paths || [] : [] } catch { savePaths.value = [] } }
async function onDownloadSettingChange(value: string | number) { form.dl_dir = ''; await fetchSavePaths(value) }
async function onTorrentFilesChange(files: File[] | null) {
  torrentFiles.value = files || []
  uploadedNames.value = []
  if (!torrentFiles.value.length) return
  uploading.value = true
  try {
    for (const file of torrentFiles.value) {
      try { const response = await uploadTorrentFile(file); if (response.code === 0 && response.filepath) uploadedNames.value.push(file.name); else emit('error', response.msg || `上传 ${file.name} 失败`) }
      catch (error) { emit('error', error instanceof Error ? error.message : `上传 ${file.name} 失败`) }
    }
  } finally { uploading.value = false }
}
async function submit() {
  submitting.value = true
  try {
    if (props.mode === 'search') {
      if (props.torrentId === undefined || props.torrentId === '') { emit('error', '种子 ID 缺失'); return }
      const response = await downloadSearchItem(props.torrentId, form.dl_dir, form.dl_setting)
      if (response.retcode === 0) { visible.value = false; emit('success') } else emit('error', response.retmsg || '添加下载失败')
      return
    }
    const magnets = props.manualType === 'magnet' ? form.magnets.split('\n').map((value) => value.trim()).filter(Boolean) : []
    const files = props.manualType === 'torrent' ? uploadedNames.value.map((name) => ({ upload: { filename: name } })) : []
    if (!files.length && !magnets.length) { emit('error', '请上传种子文件或填写磁力链接'); return }
    const response = await downloadTorrent({ files, magnets, dl_dir: form.dl_dir, dl_setting: form.dl_setting })
    if (response.code === 0) { visible.value = false; emit('success') } else emit('error', response.msg || '添加下载失败')
  } finally { submitting.value = false }
}
</script>

<template>
  <q-dialog v-model="visible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
    <q-card class="download-dialog"><q-card-section class="row items-center"><div class="text-h6">{{ dialogTitle }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
      <q-card-section class="dialog-form"><q-select v-model="form.dl_setting" outlined clearable label="下载设置" :options="[{ label: '默认', value: '' }, ...downloadSettings.map((setting) => ({ label: setting.name, value: setting.id }))]" emit-value map-options :disable="submitting || uploading" @update:model-value="onDownloadSettingChange" /><q-select v-model="form.dl_dir" outlined clearable label="保存目录" :options="[{ label: '自动', value: '' }, ...savePaths.map((path) => ({ label: path, value: path }))]" emit-value map-options :disable="submitting || uploading" />
        <template v-if="mode === 'manual' && manualType === 'torrent'"><q-file v-model="torrentFiles" outlined multiple use-chips accept=".torrent" label="种子文件" :disable="submitting || uploading" @update:model-value="onTorrentFilesChange"><template #prepend><q-icon name="upload_file" /></template><template #hint>可选择多个 .torrent 文件，选择后会立即上传</template></q-file><div v-if="uploading" class="row items-center q-gutter-sm text-caption text-secondary"><q-spinner-dots color="primary" />正在上传种子文件…</div><div v-else-if="uploadedNames.length" class="text-caption text-positive">已上传 {{ uploadedNames.length }} 个种子文件</div></template>
        <template v-else-if="mode === 'manual' && manualType === 'magnet'"><q-input v-model="form.magnets" outlined type="textarea" autogrow label="磁力链接" placeholder="magnet:?xt=urn:btih:xxx，每行添加一个磁链" :disable="submitting" /></template>
        <q-banner v-else-if="mode === 'search'" rounded dense><template #avatar><q-icon name="info_outline" color="primary" /></template>选择下载设置与保存目录后点击“下载”，即可添加该种子到下载器。</q-banner>
      </q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="submitting || uploading" v-close-popup /><q-btn color="primary" unelevated icon="download" label="下载" :loading="submitting" :disable="uploading" @click="submit" /></q-card-actions>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.download-dialog { width: min(560px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.dialog-form { display: grid; gap: 16px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .download-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
