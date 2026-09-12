<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import type { QTableColumn } from 'quasar'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import {
  getRssParserList,
  getRssParserDetail,
  updateRssParser,
  deleteRssParser,
  type RssParser,
  type RssParserPayload
} from '@/api/rss'

const modal = useModalStore()
const loading = ref(false)
const loadError = ref('')
const list = ref<RssParser[]>([])
const dialogVisible = ref(false)
const dialogTitle = ref('新增解析器')
const submitting = ref(false)

const form = reactive({ id: '' as string | number, name: '', type: 'XML', format: '', params: '' })
const typeOptions = [
  { label: 'XML', value: 'XML' },
  { label: 'JSON', value: 'JSON' }
]
const columns: QTableColumn<RssParser>[] = [
  { name: 'name', label: '名称', field: 'name', align: 'left', sortable: true },
  { name: 'type', label: '类型', field: 'type', align: 'left' },
  { name: 'params', label: '附加参数', field: 'params', align: 'left' },
  { name: 'actions', label: '操作', field: 'id', align: 'right' }
]
const countLabel = computed(() => `共 ${list.value.length} 条记录`)

onMounted(load)

async function load() {
  if (loading.value) return
  loading.value = true
  loadError.value = ''
  try {
    const res = await getRssParserList()
    if (res.code === 0) list.value = res.detail || []
    else loadError.value = res.msg || '获取解析器列表失败'
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '获取解析器列表失败'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.id = ''
  form.name = ''
  form.type = 'XML'
  form.format = ''
  form.params = ''
}

function openAdd() {
  resetForm()
  dialogTitle.value = '新增解析器'
  dialogVisible.value = true
}

async function openEdit(row: RssParser) {
  try {
    const res = await getRssParserDetail(row.id)
    if (res.code === 0 && res.detail) {
      form.id = res.detail.id
      form.name = res.detail.name
      form.type = res.detail.type || 'XML'
      form.format = res.detail.format || ''
      form.params = res.detail.params || ''
      dialogTitle.value = '编辑解析器'
      dialogVisible.value = true
    } else modal.error('获取解析器详情失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '获取解析器详情失败')
  }
}

async function submit() {
  if (!form.name.trim()) {
    modal.error('请输入名称')
    return
  }
  submitting.value = true
  try {
    const payload: RssParserPayload = { name: form.name.trim(), type: form.type, format: form.format, params: form.params }
    if (form.id) payload.id = form.id
    const res = await updateRssParser(payload)
    if (res.code === 0) {
      modal.success(form.id ? '保存成功' : '新增成功')
      dialogVisible.value = false
      await load()
    } else modal.error(res.msg || '保存失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '保存失败')
  } finally {
    submitting.value = false
  }
}

async function onDelete(row: RssParser) {
  const ok = await modal.confirm(`确认删除解析器「${row.name}」？`, '删除解析器')
  if (!ok) return
  try {
    const res = await deleteRssParser(row.id)
    if (res.code === 0) {
      modal.success('删除成功')
      await load()
    } else modal.error(res.msg || '删除失败')
  } catch (error) {
    modal.error(error instanceof Error ? error.message : '删除失败')
  }
}
</script>

<template>
  <div class="page-shell rss-parser">
    <PageHeader title="RSS 解析器" description="管理自定义 RSS 订阅的解析规则">
      <template #actions>
        <q-btn color="primary" unelevated icon="add" label="新增解析器" @click="openAdd" />
        <q-btn outline icon="refresh" label="刷新" :loading="loading" @click="load" />
      </template>
    </PageHeader>

    <q-banner v-if="loadError" class="q-mb-md" rounded inline-actions dense>
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ loadError }}
      <template #action><q-btn flat color="primary" label="重试" @click="load" /></template>
    </q-banner>

    <q-card flat bordered class="parser-card">
      <q-card-section class="row items-center q-py-sm"><div class="text-caption text-secondary">{{ countLabel }}</div><q-space /><q-spinner-dots v-if="loading" color="primary" size="20px" /></q-card-section>
      <q-separator />

      <q-table
        v-if="!$q.screen.lt.sm"
        flat
        :rows="list"
        :columns="columns"
        row-key="id"
        :loading="loading"
        hide-pagination
        :rows-per-page-options="[0]"
        no-data-label="没有解析器"
      >
        <template #body-cell-type="slotProps"><q-td :props="slotProps"><q-badge outline color="primary" :label="slotProps.row.type || 'XML'" /></q-td></template>
        <template #body-cell-params="slotProps"><q-td :props="slotProps"><span class="ellipsis block parser-params">{{ slotProps.row.params || '—' }}</span></q-td></template>
        <template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="编辑" @click="openEdit(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="onDelete(slotProps.row)" /></div></q-td></template>
      </q-table>

      <div v-else class="mobile-parser-list">
        <q-card v-for="row in list" :key="row.id" flat bordered class="parser-item">
          <q-card-section>
            <div class="row items-center"><div class="text-subtitle1 text-weight-medium ellipsis">{{ row.name }}</div><q-space /><q-badge outline color="primary" :label="row.type || 'XML'" /></div>
            <div class="text-caption text-secondary q-mt-sm">附加参数</div>
            <div class="parser-params q-mt-xs">{{ row.params || '未配置' }}</div>
          </q-card-section>
          <q-separator />
          <q-card-actions align="right"><q-btn flat color="primary" icon="edit" label="编辑" @click="openEdit(row)" /><q-btn flat color="negative" icon="delete" label="删除" @click="onDelete(row)" /></q-card-actions>
        </q-card>
        <q-item v-if="!loading && !list.length"><q-item-section class="text-center text-secondary q-py-xl">没有解析器</q-item-section></q-item>
      </div>
    </q-card>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="editor-dialog">
        <q-card-section class="row items-center"><div class="text-h6">{{ dialogTitle }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section>
        <q-separator />
        <q-card-section class="editor-form">
          <q-input v-model="form.name" outlined label="名称" placeholder="自定义名称" :disable="submitting" autofocus />
          <q-select v-model="form.type" outlined label="类型" :options="typeOptions" emit-value map-options :disable="submitting" />
          <q-input v-model="form.format" outlined type="textarea" autogrow label="解析格式" placeholder="JSON 解析配置：list / title / enclosure / description / size / type / year" :disable="submitting" />
          <q-input v-model="form.params" outlined label="附加参数" placeholder="附加到 RSS 链接中的参数" :disable="submitting" />
        </q-card-section>
        <q-separator />
        <q-card-actions align="right" class="editor-actions"><q-btn flat label="取消" :disable="submitting" v-close-popup /><q-btn color="primary" unelevated :loading="submitting" :label="form.id ? '保存' : '新增'" @click="submit" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.rss-parser { max-width: 1440px; margin: 0 auto; }
.parser-card { overflow: hidden; }
.parser-params { max-width: 520px; color: var(--text-secondary); font-size: 13px; white-space: pre-wrap; word-break: break-all; }
.mobile-parser-list { display: grid; gap: 10px; padding: 12px; }
.parser-item { border-radius: 12px; }
.editor-dialog { width: min(720px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.editor-form { display: grid; gap: 16px; }
.editor-actions { gap: 8px; }
@media (max-width: 599px) {
  .rss-parser { padding-bottom: 8px; }
  .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }
  .editor-form { flex: 1; align-content: start; padding-bottom: 24px; }
  .editor-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); }
  .editor-actions :deep(.q-btn) { min-height: 44px; }
}
</style>
