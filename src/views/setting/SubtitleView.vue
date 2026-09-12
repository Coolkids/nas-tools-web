<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useConfigForm } from '@/composables/useConfigForm'

type SubType = 'opensubtitles' | 'chinesesubfinder'
interface ServerOption { type: SubType; name: string; image: string; description: string }
const servers: ServerOption[] = [
  { type: 'opensubtitles', name: 'OpenSubtitles', image: '/static/img/opensubtitles.png', description: '在线字幕服务' },
  { type: 'chinesesubfinder', name: 'ChineseSubFinder', image: '/static/img/chinesesubfinder.png', description: '本地字幕服务' }
]

const { config, loading, saving, load, save } = useConfigForm()
const dialogVisible = ref(false)
const currentType = ref<SubType | null>(null)
const form = reactive({ enable: false, host: '', api_key: '', local_path: '', remote_path: '' })
const activeServer = computed(() => (config.value.subtitle as Record<string, unknown> | undefined)?.server as string | undefined)
const dialogTitle = computed(() => currentType.value === 'opensubtitles' ? 'OpenSubtitles' : 'ChineseSubFinder')

function openDialog(type: SubType) {
  currentType.value = type
  const subtitle = config.value.subtitle as Record<string, Record<string, unknown>> | undefined
  if (type === 'opensubtitles') form.enable = Boolean(subtitle?.opensubtitles?.enable)
  else {
    const chineseSubFinder = subtitle?.chinesesubfinder || {}
    form.host = String(chineseSubFinder.host || '')
    form.api_key = String(chineseSubFinder.api_key || '')
    form.local_path = String(chineseSubFinder.local_path || '')
    form.remote_path = String(chineseSubFinder.remote_path || '')
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!currentType.value) return
  const items: Record<string, unknown> = { 'subtitle.server': currentType.value }
  if (currentType.value === 'opensubtitles') items['subtitle.opensubtitles.enable'] = form.enable
  else {
    items['subtitle.chinesesubfinder.host'] = form.host.trim()
    items['subtitle.chinesesubfinder.api_key'] = form.api_key.trim()
    items['subtitle.chinesesubfinder.local_path'] = form.local_path.trim()
    items['subtitle.chinesesubfinder.remote_path'] = form.remote_path.trim()
  }
  if (await save(items)) dialogVisible.value = false
}

onMounted(load)
</script>

<template>
  <div class="page-shell subtitle-view">
    <PageHeader title="字幕" description="选择并配置字幕下载服务" />
    <q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
    <div class="server-grid">
      <q-card v-for="server in servers" :key="server.type" flat bordered class="server-card" :class="{ active: activeServer === server.type }" tabindex="0" role="button" @click="openDialog(server.type)" @keyup.enter="openDialog(server.type)">
        <q-card-section class="server-body"><div class="server-cover"><q-img :src="server.image" fit="contain" class="server-avatar"><template #error><q-icon name="subtitles" size="42px" color="primary" /></template></q-img></div><div class="server-name">{{ server.name }}</div><div class="server-description">{{ server.description }}</div><q-badge v-if="activeServer === server.type" color="positive" label="正在使用" /><span v-else class="server-hint">点击配置</span></q-card-section>
      </q-card>
    </div>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm">
      <q-card class="editor-dialog"><q-card-section class="row items-center"><div class="text-h6">{{ dialogTitle }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" v-close-popup /></q-card-section><q-separator />
        <q-card-section class="editor-form">
          <template v-if="currentType === 'opensubtitles'"><q-toggle v-model="form.enable" label="开启字幕下载" /><div class="field-help">需要确保网络可以正常连通 www.opensubtitles.org。</div></template>
          <template v-else><q-input v-model="form.host" outlined label="服务器地址" placeholder="http://127.0.0.1:19035" hint="配置 IP 地址和端口，HTTPS 地址请保留协议前缀" /><q-input v-model="form.api_key" outlined label="API Key" type="password" hint="在 ChineseSubFinder 的配置中心生成" /><q-input v-model="form.local_path" outlined label="本地路径" placeholder="本地映射路径" hint="NASTool 本地媒体库路径，Docker 部署时填写映射路径" /><q-input v-model="form.remote_path" outlined label="远程路径" placeholder="远程映射路径" hint="ChineseSubFinder 使用的媒体目录映射路径" /></template>
        </q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="saving" v-close-popup /><q-btn color="primary" unelevated label="保存" :loading="saving" @click="handleSave" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.subtitle-view { position: relative; max-width: 1440px; margin: 0 auto; }
.server-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 16px; }
.server-card { overflow: hidden; cursor: pointer; border-radius: 12px; transition: transform .18s ease, border-color .18s ease; }
.server-card:hover, .server-card:focus-visible { transform: translateY(-2px); border-color: var(--q-primary); outline: none; }
.server-card.active { border: 2px solid var(--q-primary); }
.server-body { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 0 0 18px; }
.server-cover { display: grid; width: 100%; height: 130px; place-items: center; background: var(--surface-muted); }
.server-avatar { width: 72px; height: 72px; border-radius: 50%; }
.server-name { color: var(--text-primary); font-size: 16px; font-weight: 650; }
.server-description, .server-hint { color: var(--text-secondary); font-size: 12px; }
.editor-dialog { width: min(560px, calc(100vw - 32px)); max-width: none; border-radius: 16px; }
.editor-form { display: grid; gap: 16px; }
.field-help { margin-top: -8px; color: var(--text-secondary); font-size: 12px; }
.dialog-actions { gap: 8px; }
@media (max-width: 599px) { .subtitle-view { padding-bottom: 8px; } .editor-dialog { width: 100%; min-height: 100dvh; border-radius: 0; } .dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); background: var(--surface); } .dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
