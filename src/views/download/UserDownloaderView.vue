<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import { doAction, postJson } from '@/api'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'

interface UserDownloader {
  id: number
  name: string
  type: string
  host: string
  port: number | string
  username: string
  password: string
  save_dir: string
}

const modal = useModalStore()
const list = ref<UserDownloader[]>([])
const loading = ref(false)
const loadError = ref('')
const saving = ref(false)
const testing = ref(false)
const dialogVisible = ref(false)
const form = reactive({ id: '' as string | number, name: '', type: 'qbittorrent', host: '', port: '' as number | string, username: '', password: '', save_dir: '' })
const downloaderTypes = [
  { value: 'qbittorrent', label: 'Qbittorrent' },
  { value: 'transmission', label: 'Transmission' }
]
const columns: QTableColumn<UserDownloader>[] = [
  { name: 'name', label: '名称', field: 'name', align: 'left', sortable: true },
  { name: 'type', label: '类型', field: 'type', align: 'left' },
  { name: 'address', label: '地址', field: (row) => `${row.host}:${row.port}`, align: 'left' },
  { name: 'save_dir', label: '保存目录', field: 'save_dir', align: 'left' },
  { name: 'actions', label: '操作', field: 'id', align: 'right' }
]

onMounted(load)

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const response = await postJson<{ code: number; msg?: string; data?: { downloaders: UserDownloader[] } }>('/api/v1/brushtask/downloader/list')
    if (response.code === 0) list.value = response.data?.downloaders || []
    else loadError.value = response.msg || '获取下载器列表失败'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '获取下载器列表失败'
  } finally {
    loading.value = false
  }
}

function typeLabel(value: string) { return downloaderTypes.find((item) => item.value === value)?.label || value }
function resetForm() { Object.assign(form, { id: '', name: '', type: 'qbittorrent', host: '', port: '', username: '', password: '', save_dir: '' }) }
function openAdd() { resetForm(); dialogVisible.value = true }
function openEdit(row: UserDownloader) { Object.assign(form, row); dialogVisible.value = true }

async function submit(test = false) {
  if (!form.name.trim()) { modal.warning('名称不能为空'); return }
  if (!form.host.trim()) { modal.warning('IP 地址或域名不能为空'); return }
  if (!form.port || isNaN(Number(form.port))) { modal.warning('端口不正确'); return }
  if (!form.save_dir.trim()) { modal.warning('保存目录不能为空'); return }
  if (test) testing.value = true
  else saving.value = true
  try {
    const response = await doAction<{ code: number; msg?: string }>('add_downloader', { test: test ? 1 : 0, id: form.id, name: form.name.trim(), type: form.type, host: form.host.trim(), port: form.port, username: form.username, password: form.password, save_dir: form.save_dir.trim() })
    if (response.code === 0) {
      if (test) modal.success('测试成功')
      else { dialogVisible.value = false; modal.success('保存成功'); await load() }
    } else modal.error(response.msg || (test ? '测试失败' : '保存失败'))
  } catch (error) {
    modal.error(error instanceof Error ? error.message : (test ? '测试失败' : '保存失败'))
  } finally {
    testing.value = false
    saving.value = false
  }
}

async function remove(row: UserDownloader) {
  const ok = await modal.confirm(`确认删除下载器「${row.name}」？`, '删除下载器')
  if (!ok) return
  try {
    const response = await doAction<{ code: number; msg?: string }>('delete_downloader', { id: row.id })
    if (response.code === 0) { modal.success('删除成功'); await load() }
    else modal.error(response.msg || '删除失败')
  } catch (error) { modal.error(error instanceof Error ? error.message : '删除失败') }
}
</script>

<template>
  <div class="page-shell user-downloader">
    <PageHeader title="自定义下载器" description="管理刷流任务使用的下载器">
      <template #actions><q-btn color="primary" unelevated icon="add" label="新增下载器" @click="openAdd" /><q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" /></template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="primary" label="重试" @click="load" /></template></q-banner>

    <q-card flat bordered class="downloader-card">
      <q-table v-if="!$q.screen.lt.sm" flat :rows="list" :columns="columns" row-key="id" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有自定义下载器">
        <template #body-cell-type="slotProps"><q-td :props="slotProps"><q-badge outline color="primary" :label="typeLabel(slotProps.row.type)" /></q-td></template>
        <template #body-cell-address="slotProps"><q-td :props="slotProps"><span class="mono">{{ slotProps.row.host }}:{{ slotProps.row.port }}</span></q-td></template>
        <template #body-cell-save_dir="slotProps"><q-td :props="slotProps"><span class="ellipsis block save-dir">{{ slotProps.row.save_dir }}</span></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="编辑" @click="openEdit(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="remove(slotProps.row)" /></div></q-td></template>
      </q-table>
      <div v-else class="mobile-downloader-list">
        <q-card v-for="row in list" :key="row.id" flat bordered class="downloader-item"><q-card-section><div class="row items-center"><div class="text-subtitle1 text-weight-medium ellipsis">{{ row.name }}</div><q-space /><q-badge outline color="primary" :label="typeLabel(row.type)" /></div><div class="text-body2 mono q-mt-sm">{{ row.host }}:{{ row.port }}</div><div class="text-caption text-secondary q-mt-xs ellipsis">{{ row.save_dir }}</div></q-card-section><q-separator /><q-card-actions align="right"><q-btn flat color="primary" icon="edit" label="编辑" @click="openEdit(row)" /><q-btn flat color="negative" icon="delete" label="删除" @click="remove(row)" /></q-card-actions></q-card>
        <q-item v-if="!loading && !list.length"><q-item-section class="text-center text-secondary q-py-xl">没有自定义下载器</q-item-section></q-item>
      </div>
    </q-card>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="editor-dialog">
        <q-card-section class="row items-center"><div class="text-h6">{{ form.id ? '编辑下载器' : '新增下载器' }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section class="editor-form">
          <q-input v-model="form.name" outlined label="名称" placeholder="别名" :disable="saving || testing" />
          <q-select v-model="form.type" outlined label="类型" :options="downloaderTypes" emit-value map-options :disable="saving || testing" />
          <div class="form-grid"><q-input v-model="form.host" outlined label="IP / 域名" placeholder="ip/http/https" :disable="saving || testing" /><q-input v-model="form.port" outlined type="number" label="端口" placeholder="端口" :disable="saving || testing" /></div>
          <div class="form-grid"><q-input v-model="form.username" outlined label="用户名" :disable="saving || testing" /><q-input v-model="form.password" outlined type="password" label="密码" :disable="saving || testing" /></div>
          <q-input v-model="form.save_dir" outlined label="保存目录" placeholder="下载器使用路径" :disable="saving || testing" />
        </q-card-section><q-separator />
        <q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="saving || testing" v-close-popup /><q-btn outline label="测试连接" :loading="testing" :disable="saving" @click="submit(true)" /><q-btn color="primary" unelevated label="保存" :loading="saving" :disable="testing" @click="submit(false)" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.user-downloader { max-width: 1440px; margin: 0 auto; }
.downloader-card { overflow: hidden; }
.save-dir { max-width: 360px; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.mobile-downloader-list { display: grid; gap: 10px; padding: 12px; }
.downloader-item { border-radius: 12px; }
.editor-dialog { width: min(640px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.editor-form { display: grid; gap: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .user-downloader { padding-bottom: 8px; } .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .form-grid { grid-template-columns: 1fr; gap: 16px; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
