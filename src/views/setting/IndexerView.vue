<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'
import { testConnection } from '@/api/config'

type IndexerType = 'builtin' | 'jackett' | 'prowlarr'
interface IndexerItem { id: string; name: string }
interface ExternalField { key: string; label: string; placeholder?: string; inputType?: 'text' | 'password'; required?: boolean }
interface ExternalServer { type: 'jackett' | 'prowlarr'; name: string; img: string; description: string; testCommand: string; fields: ExternalField[] }
const externalServers: ExternalServer[] = [
  { type: 'jackett', name: 'Jackett', img: 'jackett.png', description: '统一聚合私有站点', testCommand: 'app.indexer.client.jackett|Jackett', fields: [{ key: 'host', label: 'Jackett 地址', placeholder: 'http://127.0.0.1:9117', required: true }, { key: 'api_key', label: 'API Key', inputType: 'password', required: true }, { key: 'password', label: '密码', inputType: 'password' }] },
  { type: 'prowlarr', name: 'Prowlarr', img: 'prowlarr.png', description: '站点索引服务', testCommand: 'app.indexer.client.prowlarr|Prowlarr', fields: [{ key: 'host', label: 'Prowlarr 地址', placeholder: 'http://127.0.0.1:9696', required: true }, { key: 'api_key', label: 'API Key', inputType: 'password', required: true }] }
]
const builtinImage = 'indexer.jpg'
const { config, loading, saving, load, save } = useConfigForm()
const modal = useModalStore()
const dialogVisible = ref(false)
const currentType = ref<IndexerType | null>(null)
const currentExternal = ref<ExternalServer | null>(null)
const indexers = ref<IndexerItem[]>([])
const indexersLoading = ref(false)
const selectedSites = ref<string[]>([])
const externalForm = reactive<Record<string, string>>({})
const testing = ref(false)
const loadError = ref('')
const activeIndexer = computed(() => ((config.value.pt as Record<string, unknown> | undefined)?.search_indexer as string) || '')
const isAllSelected = computed(() => indexers.value.length > 0 && selectedSites.value.length === indexers.value.length)
const dialogTitle = computed(() => currentType.value === 'builtin' ? '内建索引器' : currentExternal.value?.name || '')

function savedSites() { const sites = (config.value.pt as Record<string, unknown> | undefined)?.indexer_sites; return Array.isArray(sites) ? sites.map(String) : [] }
function toggleAll(value: boolean) { selectedSites.value = value ? indexers.value.map((item) => item.id) : [] }
async function openBuiltin() {
  currentType.value = 'builtin'; currentExternal.value = null; selectedSites.value = [...savedSites()]
  if (!indexers.value.length) {
    indexersLoading.value = true
    try { const response = await doAction<{ code: number; msg?: string; indexers?: IndexerItem[] }>('get_indexers', {}); if (response.code === 0) indexers.value = response.indexers || []; else modal.error(response.msg || '获取索引器列表失败') }
    catch (error) { modal.error(error instanceof Error ? error.message : '获取索引器列表失败') }
    finally { indexersLoading.value = false }
  }
  dialogVisible.value = true
}
function openExternal(server: ExternalServer) { currentType.value = server.type; currentExternal.value = server; const value = config.value[server.type] as Record<string, unknown> | undefined; server.fields.forEach((field) => { externalForm[field.key] = String(value?.[field.key] || '') }); dialogVisible.value = true }
function externalItems() { const items: Record<string, unknown> = { 'pt.search_indexer': currentExternal.value!.type }; currentExternal.value!.fields.forEach((field) => { items[`${currentExternal.value!.type}.${field.key}`] = externalForm[field.key] ?? '' }); return items }
function validateExternal() { const field = currentExternal.value?.fields.find((item) => item.required && !String(externalForm[item.key] || '').trim()); if (field) { modal.warning(`请输入${field.label}`); return false } return true }
async function handleSave() {
  const ok = currentType.value === 'builtin' ? await save({ 'pt.search_indexer': 'builtin', 'pt.indexer_sites': selectedSites.value }) : currentExternal.value && validateExternal() ? await save(externalItems()) : false
  if (ok) { dialogVisible.value = false; await load() }
}
async function handleTest() {
  if (!currentExternal.value || !validateExternal()) return
  testing.value = true
  try { if (!await save(externalItems(), true)) return; const response = await testConnection(currentExternal.value.testCommand); response.code === 0 ? modal.success('测试成功') : modal.error(response.msg || '测试失败') }
  catch (error) { modal.error(error instanceof Error ? error.message : '测试失败') }
  finally { testing.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page-shell indexer-view">
    <PageHeader title="索引器" description="选择并配置资源索引器" />
    <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
    <div class="server-grid">
      <q-card flat bordered class="server-card" :class="{ active: activeIndexer === 'builtin' }" tabindex="0" role="button" @click="openBuiltin" @keyup.enter="openBuiltin"><q-card-section class="server-body"><div class="server-icon"><q-img :src="`/static/img/${builtinImage}`" fit="contain"><template #error><q-icon name="hub" color="primary" size="34px" /></template></q-img></div><div class="server-name">内建索引器</div><div class="server-description">直接连接已配置的站点</div><q-badge v-if="activeIndexer === 'builtin'" color="positive" label="正在使用" /><span v-else class="server-hint">点击配置</span></q-card-section></q-card>
      <q-card v-for="server in externalServers" :key="server.type" flat bordered class="server-card" :class="{ active: activeIndexer === server.type }" tabindex="0" role="button" @click="openExternal(server)" @keyup.enter="openExternal(server)"><q-card-section class="server-body"><div class="server-icon"><q-img :src="`/static/img/${server.img}`" fit="contain"><template #error><q-icon name="hub" color="primary" size="34px" /></template></q-img></div><div class="server-name">{{ server.name }}</div><div class="server-description">{{ server.description }}</div><q-badge v-if="activeIndexer === server.type" color="positive" label="正在使用" /><span v-else class="server-hint">点击配置</span></q-card-section></q-card>
    </div>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="editor-dialog"><q-card-section class="row items-center"><div class="text-h6">{{ dialogTitle }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section v-if="currentType === 'builtin'" class="builtin-section"><q-inner-loading :showing="indexersLoading"><q-spinner-dots color="primary" size="36px" /></q-inner-loading><div class="row items-center"><div><div class="text-subtitle2">索引站点</div><div class="text-caption text-secondary q-mt-xs">选择由内建索引器使用的私有站点，站点需要先完成地址和 Cookie 配置。</div></div><q-space /><q-checkbox :model-value="isAllSelected" label="全选" @update:model-value="toggleAll" /></div><q-separator class="q-my-md" /><div v-if="indexers.length" class="site-grid"><q-checkbox v-for="item in indexers" :key="item.id" v-model="selectedSites" :val="item.id" :label="item.name" /></div><q-item v-else-if="!indexersLoading"><q-item-section class="text-center text-secondary q-py-xl">暂无可用索引站点</q-item-section></q-item></q-card-section>
        <q-card-section v-else-if="currentExternal" class="editor-form"><q-input v-for="field in currentExternal.fields" :key="field.key" v-model="externalForm[field.key]" outlined :type="field.inputType || 'text'" :label="field.label" :placeholder="field.placeholder" :disable="saving || testing" :rules="field.required ? [(value: string) => !!value || `请输入${field.label}`] : undefined" lazy-rules /></q-card-section><q-separator />
        <q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="saving || testing" v-close-popup /><q-btn v-if="currentExternal" outline icon="lan" label="测试" :loading="testing" :disable="saving" @click="handleTest" /><q-btn color="primary" unelevated label="保存" :loading="saving" :disable="testing || indexersLoading" @click="handleSave" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.indexer-view { position: relative; max-width: 1600px; margin: 0 auto; }
.server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.server-card { overflow: hidden; cursor: pointer; border-radius: 12px; transition: transform .18s ease, border-color .18s ease; }
.server-card:hover, .server-card:focus-visible { transform: translateY(-2px); border-color: var(--q-primary); outline: none; }
.server-card.active { border: 2px solid var(--q-primary); }
.server-body { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 16px 24px; }
.server-icon { display: grid; width: 76px; height: 76px; place-items: center; border-radius: 50%; background: var(--surface-muted); }
.server-icon :deep(.q-img) { width: 100%; height: 100%; padding: 12px; }
.server-name { color: var(--text-primary); font-size: 16px; font-weight: 650; }
.server-description, .server-hint { color: var(--text-secondary); font-size: 12px; }
.editor-dialog { width: min(640px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.builtin-section, .editor-form { position: relative; display: grid; gap: 16px; }
.site-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; max-height: 360px; overflow-y: auto; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .site-grid { grid-template-columns: 1fr; max-height: none; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
