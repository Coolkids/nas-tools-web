<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { testConnection } from '@/api/config'

type ServerKeyType = 'emby' | 'jellyfin' | 'plex'
interface ServerField { key: string; label: string; placeholder?: string; inputType?: 'text' | 'password'; required?: boolean }
interface ServerType { type: ServerKeyType; name: string; img: string; testCommand: string; fields: ServerField[]; description: string }
const servers: ServerType[] = [
  { type: 'emby', name: 'Emby', img: 'emby.png', testCommand: 'app.mediaserver.client.emby|Emby', description: '媒体库与播放状态同步', fields: [{ key: 'host', label: '服务器地址', placeholder: 'http://127.0.0.1:8096', required: true }, { key: 'api_key', label: 'API Key', inputType: 'password', required: true }] },
  { type: 'jellyfin', name: 'Jellyfin', img: 'jellyfin.jpg', testCommand: 'app.mediaserver.client.jellyfin|Jellyfin', description: '开源媒体服务器', fields: [{ key: 'host', label: '服务器地址', placeholder: 'http://127.0.0.1:8096', required: true }, { key: 'api_key', label: 'API Key', inputType: 'password', required: true }] },
  { type: 'plex', name: 'Plex', img: 'plex.png', testCommand: 'app.mediaserver.client.plex|Plex', description: '多设备媒体管理', fields: [{ key: 'host', label: '服务器地址', placeholder: 'http://127.0.0.1:32400', required: true }, { key: 'token', label: 'X-Plex-Token', inputType: 'password' }, { key: 'servername', label: '服务器名称' }, { key: 'username', label: '用户名' }, { key: 'password', label: '密码', inputType: 'password' }] }
]
const { config, loading, saving, load, save } = useConfigForm()
const modal = useModalStore()
const dialogVisible = ref(false)
const currentServer = ref<ServerType | null>(null)
const form = reactive<Record<string, string>>({})
const testing = ref(false)
const activeType = computed(() => (config.value.media as Record<string, unknown> | undefined)?.media_server as string | undefined)

function serverConfig(type: string) { return config.value[type] as Record<string, unknown> | undefined }
function openDialog(server: ServerType) { currentServer.value = server; const configValue = serverConfig(server.type) || {}; server.fields.forEach((field) => { form[field.key] = String(configValue[field.key] || '') }); dialogVisible.value = true }
function buildItems() { const items: Record<string, unknown> = { 'media.media_server': currentServer.value!.type }; currentServer.value!.fields.forEach((field) => { items[`${currentServer.value!.type}.${field.key}`] = form[field.key] ?? '' }); return items }
function validateForm() { const field = currentServer.value?.fields.find((item) => item.required && !String(form[item.key] || '').trim()); if (field) { modal.warning(`请输入${field.label}`); return false } return true }
async function handleSave() { if (!validateForm()) return; if (await save(buildItems())) dialogVisible.value = false }
async function handleTest() { if (!validateForm() || !currentServer.value) return; testing.value = true; try { if (!await save(buildItems(), true)) return; const response = await testConnection(currentServer.value.testCommand); response.code === 0 ? modal.success('测试成功') : modal.error(response.msg || '测试失败') } catch (error) { modal.error(error instanceof Error ? error.message : '测试失败') } finally { testing.value = false } }
onMounted(load)
</script>

<template>
  <div class="page-shell media-server-view">
    <PageHeader title="媒体服务器" description="选择并配置媒体服务器，用于媒体库展示与状态同步" />
    <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
    <div class="server-grid">
      <q-card v-for="server in servers" :key="server.type" flat bordered class="server-card" :class="{ active: activeType === server.type }" tabindex="0" role="button" @click="openDialog(server)" @keyup.enter="openDialog(server)">
        <q-card-section class="server-body"><div class="server-icon"><q-img :src="`/static/img/${server.img}`" fit="contain"><template #error><q-icon name="dns" color="primary" size="34px" /></template></q-img></div><div class="server-name">{{ server.name }}</div><div class="server-description">{{ server.description }}</div><q-badge v-if="activeType === server.type" color="positive" label="正在使用" /><span v-else class="server-hint">点击配置</span></q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="editor-dialog"><q-card-section class="row items-center"><div class="text-h6">{{ currentServer?.name }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section v-if="currentServer" class="editor-form"><q-input v-for="field in currentServer.fields" :key="field.key" v-model="form[field.key]" outlined :type="field.inputType || 'text'" :label="field.label" :placeholder="field.placeholder" :disable="saving || testing" :rules="field.required ? [(value: string) => !!value || `请输入${field.label}`] : undefined" lazy-rules /></q-card-section><q-separator />
        <q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="saving || testing" v-close-popup /><q-btn outline icon="lan" label="测试" :loading="testing" :disable="saving" @click="handleTest" /><q-btn color="primary" unelevated label="保存" :loading="saving" :disable="testing" @click="handleSave" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.media-server-view { position: relative; max-width: 1440px; margin: 0 auto; }
.server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.server-card { overflow: hidden; cursor: pointer; border-radius: 12px; transition: transform .18s ease, border-color .18s ease; }
.server-card:hover, .server-card:focus-visible { transform: translateY(-2px); border-color: var(--q-primary); outline: none; }
.server-card.active { border: 2px solid var(--q-primary); }
.server-body { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 20px 16px 24px; }
.server-icon { display: grid; width: 76px; height: 76px; place-items: center; border-radius: 50%; background: var(--surface-muted); }
.server-icon :deep(.q-img) { width: 100%; height: 100%; padding: 12px; }
.server-name { color: var(--text-primary); font-size: 16px; font-weight: 650; }
.server-description, .server-hint { color: var(--text-secondary); font-size: 12px; }
.editor-dialog { width: min(560px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.editor-form { display: grid; gap: 16px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .media-server-view { padding-bottom: 8px; } .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
