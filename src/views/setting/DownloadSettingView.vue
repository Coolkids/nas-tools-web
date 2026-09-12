<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import { doAction } from '@/api'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'

interface DownloadSetting { id: number; name: string; category: string; tags: string; content_layout: number; is_paused: number; upload_limit: number; download_limit: number; ratio_limit: number; seeding_time_limit: number; downloader: string }
const modal = useModalStore()
const list = ref<DownloadSetting[]>([])
const loading = ref(false)
const loadError = ref('')
const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({ sid: '' as string | number, name: '', category: '', tags: '', content_layout: 0, is_paused: 0, upload_limit: 0, download_limit: 0, ratio_limit: 0, seeding_time_limit: 0, downloader: '' })
const contentLayouts = [{ value: 0, label: '全局' }, { value: 1, label: '原始' }, { value: 2, label: '创建子文件夹' }, { value: 3, label: '不建子文件夹' }]
const downloaderTypes = [{ value: '', label: '默认' }, { value: 'Qbittorrent', label: 'Qbittorrent' }, { value: 'Transmission', label: 'Transmission' }]
const columns: QTableColumn<DownloadSetting>[] = [
  { name: 'name', label: '名称', field: 'name', align: 'left', sortable: true },
  { name: 'downloader', label: '下载器', field: 'downloader', align: 'left' },
  { name: 'category', label: '分类', field: 'category', align: 'left' },
  { name: 'tags', label: '标签', field: 'tags', align: 'left' },
  { name: 'layout', label: '布局', field: 'content_layout', align: 'left' },
  { name: 'action', label: '动作', field: 'is_paused', align: 'left' },
  { name: 'limits', label: '限速/比率', field: 'upload_limit', align: 'left' },
  { name: 'actions', label: '操作', field: 'id', align: 'right' }
]

onMounted(load)
async function load() { if (loading.value) return; loading.value = true; loadError.value = ''; try { const response = await doAction<{ code: number; msg?: string; data: DownloadSetting[] }>('get_download_setting', {}); if (response.code === 0) list.value = response.data || []; else loadError.value = response.msg || '获取下载设置失败' } catch (error) { loadError.value = error instanceof Error ? error.message : '获取下载设置失败' } finally { loading.value = false } }
function layoutLabel(value: number) { return contentLayouts.find((item) => item.value === value)?.label || '全局' }
function downloaderLabel(value: string) { return downloaderTypes.find((item) => item.value === value)?.label || value || '默认' }
function tagsOf(row: DownloadSetting) { return (row.tags || '').split(';').map((tag) => tag.trim()).filter(Boolean) }
function limitsOf(row: DownloadSetting) { const speed = row.upload_limit || row.download_limit ? `上传 ${row.upload_limit || 0} / 下载 ${row.download_limit || 0} KB/s` : ''; const seed = row.ratio_limit || row.seeding_time_limit ? `比率 ${row.ratio_limit || 0} / 做种 ${row.seeding_time_limit || 0} 分钟` : ''; return [speed, seed].filter(Boolean).join('；') || '无限制' }
function resetForm() { Object.assign(form, { sid: '', name: '', category: '', tags: '', content_layout: 0, is_paused: 0, upload_limit: 0, download_limit: 0, ratio_limit: 0, seeding_time_limit: 0, downloader: '' }) }
function openAdd() { resetForm(); dialogVisible.value = true }
function openEdit(row: DownloadSetting) { Object.assign(form, { sid: row.id, name: row.name, category: row.category || '', tags: row.tags || '', content_layout: Number(row.content_layout ?? 0), is_paused: Number(row.is_paused ?? 0), upload_limit: Number(row.upload_limit ?? 0), download_limit: Number(row.download_limit ?? 0), ratio_limit: Number(row.ratio_limit ?? 0), seeding_time_limit: Number(row.seeding_time_limit ?? 0), downloader: row.downloader || '' }); dialogVisible.value = true }
async function submit() {
  if (!form.name.trim()) { modal.warning('名称不能为空'); return }
  saving.value = true
  try { const response = await doAction<{ code: number; msg?: string }>('update_download_setting', { sid: form.sid, name: form.name.trim(), category: form.category, tags: form.tags, content_layout: form.content_layout, is_paused: form.is_paused, upload_limit: form.upload_limit, download_limit: form.download_limit, ratio_limit: form.ratio_limit, seeding_time_limit: form.seeding_time_limit, downloader: form.downloader }); if (response.code === 0) { dialogVisible.value = false; modal.success('保存成功'); await load() } else modal.error(response.msg || '保存失败') }
  catch (error) { modal.error(error instanceof Error ? error.message : '保存失败') }
  finally { saving.value = false }
}
async function remove(row: DownloadSetting) { if (row.id <= 0) return; if (!await modal.confirm(`确认删除下载设置「${row.name}」？`, '删除下载设置')) return; try { const response = await doAction<{ code: number; msg?: string }>('delete_download_setting', { sid: row.id }); if (response.code === 0) { modal.success('删除成功'); await load() } else modal.error(response.msg || '删除失败') } catch (error) { modal.error(error instanceof Error ? error.message : '删除失败') } }
</script>

<template>
  <div class="page-shell download-setting">
    <PageHeader title="下载设置" description="管理下载任务的默认参数"><template #actions><q-btn color="primary" unelevated icon="add" label="新增下载设置" @click="openAdd" /><q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" /></template></PageHeader>
    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense><template #avatar><q-icon name="error_outline" color="negative" /></template>{{ loadError }}<template #action><q-btn flat color="primary" label="重试" @click="load" /></template></q-banner>
    <q-card flat bordered class="setting-card">
      <q-table v-if="!$q.screen.lt.sm" flat :rows="list" :columns="columns" row-key="id" :loading="loading" hide-pagination :rows-per-page-options="[0]" no-data-label="没有下载设置">
        <template #body-cell-name="slotProps"><q-td :props="slotProps"><span class="text-weight-medium">{{ slotProps.row.name }}</span><q-badge v-if="slotProps.row.id === -1" class="q-ml-sm" color="grey-6" label="预设" /></q-td></template>
        <template #body-cell-downloader="slotProps"><q-td :props="slotProps"><q-badge outline color="primary" :label="downloaderLabel(slotProps.row.downloader)" /></q-td></template>
        <template #body-cell-tags="slotProps"><q-td :props="slotProps"><q-chip v-for="tag in tagsOf(slotProps.row)" :key="tag" dense square color="grey-3" text-color="grey-8" :label="tag" /><span v-if="!tagsOf(slotProps.row).length" class="text-secondary">—</span></q-td></template>
        <template #body-cell-layout="slotProps"><q-td :props="slotProps">{{ layoutLabel(Number(slotProps.row.content_layout)) }}</q-td></template>
        <template #body-cell-action="slotProps"><q-td :props="slotProps"><q-badge :color="Number(slotProps.row.is_paused) ? 'warning' : 'positive'" :label="Number(slotProps.row.is_paused) ? '添加后暂停' : '添加后开始'" /></q-td></template>
        <template #body-cell-limits="slotProps"><q-td :props="slotProps"><span class="text-caption text-secondary">{{ limitsOf(slotProps.row) }}</span></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="编辑" :disable="slotProps.row.id <= 0" @click="openEdit(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" :disable="slotProps.row.id <= 0" @click="remove(slotProps.row)" /></div></q-td></template>
      </q-table>
      <div v-else class="mobile-setting-list"><q-card v-for="row in list" :key="row.id" flat bordered class="setting-item"><q-card-section><div class="row items-center"><div class="text-subtitle1 text-weight-medium ellipsis">{{ row.name }}</div><q-space /><q-badge outline color="primary" :label="downloaderLabel(row.downloader)" /></div><div class="row items-center q-gutter-xs q-mt-sm"><q-badge :color="Number(row.is_paused) ? 'warning' : 'positive'" :label="Number(row.is_paused) ? '添加后暂停' : '添加后开始'" /><span class="text-caption text-secondary">{{ layoutLabel(Number(row.content_layout)) }}</span></div><div class="text-caption text-secondary q-mt-sm">{{ limitsOf(row) }}</div><div class="row q-gutter-xs q-mt-xs"><q-chip v-for="tag in tagsOf(row)" :key="tag" dense square color="grey-3" text-color="grey-8" :label="tag" /></div></q-card-section><q-separator /><q-card-actions align="right"><q-btn flat color="primary" icon="edit" label="编辑" :disable="row.id <= 0" @click="openEdit(row)" /><q-btn flat color="negative" icon="delete" label="删除" :disable="row.id <= 0" @click="remove(row)" /></q-card-actions></q-card><q-item v-if="!loading && !list.length"><q-item-section class="text-center text-secondary q-py-xl">没有下载设置</q-item-section></q-item></div>
    </q-card>
    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm"><q-card class="editor-dialog"><q-card-section class="row items-center"><div class="text-h6">{{ form.sid ? '编辑下载设置' : '新增下载设置' }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator /><q-card-section class="editor-form"><div class="form-grid"><q-input v-model="form.name" outlined label="名称" placeholder="别名" :disable="saving" /><q-select v-model="form.downloader" outlined label="下载器" :options="downloaderTypes" emit-value map-options :disable="saving" /></div><div class="form-grid"><q-input v-model="form.category" outlined label="分类" placeholder="仅 Qbittorrent" :disable="saving" hint="仅适用于 Qbittorrent" /><q-input v-model="form.tags" outlined label="标签" placeholder="多个用 ; 分隔" :disable="saving" hint="可添加 NASTOOL 标签" /></div><div class="form-grid"><q-input v-model.number="form.upload_limit" outlined type="number" label="上传限速" placeholder="KB/s，0 为不限" :disable="saving" /><q-input v-model.number="form.download_limit" outlined type="number" label="下载限速" placeholder="KB/s，0 为不限" :disable="saving" /></div><div class="form-grid"><q-select v-model="form.content_layout" outlined label="布局" :options="contentLayouts" emit-value map-options :disable="saving" /><q-select v-model="form.is_paused" outlined label="动作" :options="[{ value: 0, label: '添加后开始' }, { value: 1, label: '添加后暂停' }]" emit-value map-options :disable="saving" /></div><div class="form-grid"><q-input v-model.number="form.ratio_limit" outlined type="number" label="分享率限制" placeholder="0 为无限制" :disable="saving" /><q-input v-model.number="form.seeding_time_limit" outlined type="number" label="做种时间限制" placeholder="分钟，0 为无限制" :disable="saving" /></div></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="saving" v-close-popup /><q-btn color="primary" unelevated label="保存" :loading="saving" @click="submit" /></q-card-actions></q-card></q-dialog>
  </div>
</template>

<style scoped>
.download-setting { max-width: 1440px; margin: 0 auto; }
.setting-card { overflow: hidden; }
.mobile-setting-list { display: grid; gap: 10px; padding: 12px; }
.setting-item { border-radius: 12px; }
.editor-dialog { width: min(640px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.editor-form { display: grid; gap: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .download-setting { padding-bottom: 8px; } .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .form-grid { grid-template-columns: 1fr; gap: 16px; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
