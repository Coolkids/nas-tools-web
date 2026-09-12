<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { doAction } from '@/api'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'

interface SyncPath {
  id: number
  from: string
  to: string
  unknown: string
  syncmod: string
  syncmod_name: string
  rename: number
  enabled: number
}

const modal = useModalStore()
const list = ref<SyncPath[]>([])
const loading = ref(false)

const SYNC_MODES = [
  { value: 'link', label: '硬链接' },
  { value: 'softlink', label: '软链接' },
  { value: 'copy', label: '复制' },
  { value: 'move', label: '移动' },
  { value: 'rclonecopy', label: 'Rclone复制' },
  { value: 'rclone', label: 'Rclone移动' },
  { value: 'miniocopy', label: 'Minio复制' },
  { value: 'minio', label: 'Minio移动' }
]

const dialogVisible = ref(false)
const saving = ref(false)
const form = reactive({
  sid: '' as string | number,
  from: '',
  to: '',
  unknown: '',
  syncmod: 'link',
  rename: true,
  enabled: true
})

const tableColumns = [
  { name: 'from', label: '源目录', field: 'from', align: 'left' as const },
  { name: 'to', label: '目的目录', field: 'to', align: 'left' as const },
  { name: 'syncmod', label: '同步方式', field: 'syncmod_name', align: 'left' as const },
  { name: 'rename', label: '识别重命名', field: 'rename', align: 'center' as const },
  { name: 'enabled', label: '状态', field: 'enabled', align: 'center' as const },
  { name: 'actions', label: '操作', field: 'actions', align: 'right' as const }
]

onMounted(load)

async function load() {
  loading.value = true
  try {
    const res = await doAction<{ code: number; result: SyncPath[] }>('get_directorysync', {})
    if (res.code === 0) {
      list.value = res.result || []
    }
  } finally {
    loading.value = false
  }
}

function modeLabel(value: string) {
  return SYNC_MODES.find((m) => m.value === value)?.label || value
}

function openAdd() {
  form.sid = ''
  form.from = ''
  form.to = ''
  form.unknown = ''
  form.syncmod = 'link'
  form.rename = true
  form.enabled = true
  dialogVisible.value = true
}

async function openEdit(row: SyncPath) {
  const res = await doAction<{ code: number; msg?: string; data: SyncPath }>('get_sync_path', { sid: row.id })
  if (res.code === 0) {
    const d = res.data
    form.sid = d.id
    form.from = d.from
    form.to = d.to
    form.unknown = d.unknown
    form.syncmod = d.syncmod
    form.rename = d.rename === 1
    form.enabled = d.enabled === 1
    dialogVisible.value = true
  } else {
    modal.error(res.msg || '查询失败')
  }
}

async function submit() {
  if (!form.from) {
    modal.warning('源目录不能为空')
    return
  }
  if (!form.rename && !form.to) {
    modal.warning('未启用识别重命名时，目的目录不能为空')
    return
  }
  saving.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('add_or_edit_sync_path', {
      sid: form.sid,
      from: form.from,
      to: form.to,
      unknown: form.unknown,
      syncmod: form.syncmod,
      rename: form.rename,
      enabled: form.enabled
    })
    if (res.code === 0) {
      dialogVisible.value = false
      modal.success('保存成功')
      load()
    } else {
      modal.error(res.msg || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

async function remove(row: SyncPath) {
  const ok = await modal.confirm(`确认删除源目录「${row.from}」的同步配置？`)
  if (!ok) return
  const res = await doAction<{ code: number }>('delete_sync_path', { sid: row.id })
  if (res.code === 0) {
    modal.success('删除成功')
    load()
  }
}

async function toggle(row: SyncPath, flag: 'rename' | 'enable', checked: boolean) {
  const res = await doAction<{ code: number }>('check_sync_path', { flag, sid: row.id, checked })
  if (res.code === 0) {
    if (flag === 'rename') row.rename = checked ? 1 : 0
    else row.enabled = checked ? 1 : 0
  } else {
    modal.error('更新失败')
    load()
  }
}
</script>

<template>
  <div class="directory-sync">
    <PageHeader title="目录同步" description="配置源目录到目的目录的自动同步策略">
      <template #actions><q-btn color="primary" unelevated icon="add" label="新增同步目录" @click="openAdd" /></template>
    </PageHeader>

    <q-card flat bordered class="sync-card">
      <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
      <q-table v-if="!$q.screen.lt.sm" flat :rows="list" :columns="tableColumns" row-key="id" hide-pagination :rows-per-page-options="[0]" no-data-label="没有同步目录">
        <template #body-cell-to="slotProps"><q-td :props="slotProps"><span>{{ slotProps.row.to || '-' }}</span><div v-if="slotProps.row.unknown && slotProps.row.rename" class="unknown-tip">未识别：{{ slotProps.row.unknown }}</div></q-td></template>
        <template #body-cell-syncmod="slotProps"><q-td :props="slotProps"><q-badge outline color="primary" :label="slotProps.row.syncmod_name || modeLabel(slotProps.row.syncmod)" /></q-td></template>
        <template #body-cell-rename="slotProps"><q-td :props="slotProps"><q-toggle :model-value="slotProps.row.rename === 1" color="primary" @update:model-value="(value) => toggle(slotProps.row, 'rename', value)" /></q-td></template>
        <template #body-cell-enabled="slotProps"><q-td :props="slotProps"><q-toggle :model-value="slotProps.row.enabled === 1" color="positive" @update:model-value="(value) => toggle(slotProps.row, 'enable', value)" /></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="编辑" @click="openEdit(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="remove(slotProps.row)" /></div></q-td></template>
      </q-table>
      <div v-else class="sync-mobile-list">
        <q-card v-for="row in list" :key="row.id" flat bordered class="sync-item">
          <q-card-section><div class="row items-start no-wrap"><div class="col min-width-0"><div class="path-title ellipsis">{{ row.from }}</div><div class="path-destination">目的：{{ row.to || '自动分类到媒体库' }}</div><div v-if="row.unknown && row.rename" class="unknown-tip">未识别：{{ row.unknown }}</div></div><q-badge outline color="primary" :label="row.syncmod_name || modeLabel(row.syncmod)" /></div><div class="row items-center q-gutter-md q-mt-sm"><q-toggle :model-value="row.rename === 1" color="primary" label="识别重命名" @update:model-value="(value) => toggle(row, 'rename', value)" /><q-toggle :model-value="row.enabled === 1" color="positive" label="已启用" @update:model-value="(value) => toggle(row, 'enable', value)" /></div></q-card-section>
          <q-card-actions align="right"><q-btn flat color="primary" icon="edit" label="编辑" @click="openEdit(row)" /><q-btn flat color="negative" icon="delete" label="删除" @click="remove(row)" /></q-card-actions>
        </q-card>
        <div v-if="!loading && !list.length" class="empty-state"><q-icon name="sync_disabled" size="44px" color="grey-5" />没有同步目录</div>
      </div>
    </q-card>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent>
      <q-card class="sync-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">{{ form.sid ? '编辑同步目录' : '新增同步目录' }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="dialogVisible = false" /></q-card-section>
        <q-separator />
        <q-form @submit.prevent="submit"><q-card-section class="dialog-body">
          <q-banner rounded dense class="info-banner"><template #avatar><q-icon name="info_outline" color="primary" /></template>源目录必须配置；目的目录留空时会根据媒体库自动分类。移动模式会影响做种，请谨慎使用。</q-banner>
          <div class="path-grid q-mt-md"><q-input v-model="form.from" outlined dense label="源目录 *" placeholder="需要同步的目录" /><q-input v-model="form.to" outlined dense label="目的目录" placeholder="识别后存放目录" /><q-input v-model="form.unknown" outlined dense label="未识别目录" placeholder="无法识别时存放" /></div>
          <q-select v-model="form.syncmod" outlined dense emit-value map-options label="同步方式" :options="SYNC_MODES" class="q-mt-md"><template #append><HelpTip text="硬链接要求源目录和目的目录在同一分区；移动模式会影响做种。Rclone 和 Minio 需要预先完成容器内配置。" /></template></q-select>
          <div class="toggle-grid q-mt-md"><q-toggle v-model="form.rename" color="primary" label="识别并重命名" /><q-toggle v-model="form.enabled" color="positive" label="开启同步" /></div>
        </q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="saving" @click="dialogVisible = false" /><q-btn color="primary" unelevated label="确定" :loading="saving" type="submit" /></q-card-actions></q-form>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.sync-card { border-radius: 16px; background: var(--surface); color: var(--text-primary); }
.unknown-tip, .path-destination { margin-top: 4px; color: var(--text-secondary); font-size: 12px; }
.sync-mobile-list { display: flex; flex-direction: column; gap: 12px; padding: 12px; }.sync-item { border-radius: 12px; background: var(--surface-raised); }.path-title { font-size: 14px; font-weight: 600; }.empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 56px 0; color: var(--text-secondary); }
.sync-dialog { width: min(720px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }.dialog-body { padding: 20px 24px; }.info-banner { border: 1px solid color-mix(in srgb, var(--q-primary), transparent 70%); background: var(--primary-soft); color: var(--text-primary); }.path-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }.toggle-grid { display: flex; gap: 24px; }.dialog-actions { gap: 8px; padding: 12px 24px 16px; }
@media (max-width: 599px) { .sync-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }.dialog-body { padding: 16px; }.path-grid { grid-template-columns: 1fr; }.dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); }.dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
