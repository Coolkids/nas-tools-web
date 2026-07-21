<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'

type SubType = 'opensubtitles' | 'chinesesubfinder'

interface ServerOption {
  type: SubType
  name: string
  image: string
}

const SERVERS: ServerOption[] = [
  { type: 'opensubtitles', name: 'OpenSubtitles', image: '/static/img/opensubtitles.png' },
  { type: 'chinesesubfinder', name: 'ChineseSubFinder', image: '/static/img/chinesesubfinder.png' }
]

const { config, loading, load, save } = useConfigForm()
const modal = useModalStore()

const dialogVisible = ref(false)
const currentType = ref<SubType | null>(null)
const form = reactive({
  enable: false,
  host: '',
  api_key: '',
  local_path: '',
  remote_path: ''
})

const activeServer = computed(() => {
  const sub = config.value.subtitle as Record<string, unknown> | undefined
  return sub?.server as string | undefined
})

function openDialog(type: SubType) {
  currentType.value = type
  const sub = config.value.subtitle as Record<string, Record<string, unknown>> | undefined
  if (type === 'opensubtitles') {
    form.enable = Boolean(sub?.opensubtitles?.enable)
  } else {
    const csf = sub?.chinesesubfinder || {}
    form.host = (csf.host as string) || ''
    form.api_key = (csf.api_key as string) || ''
    form.local_path = (csf.local_path as string) || ''
    form.remote_path = (csf.remote_path as string) || ''
  }
  dialogVisible.value = true
}

async function handleSave() {
  if (!currentType.value) return
  const items: Record<string, unknown> = { 'subtitle.server': currentType.value }
  if (currentType.value === 'opensubtitles') {
    items['subtitle.opensubtitles.enable'] = form.enable
  } else {
    items['subtitle.chinesesubfinder.host'] = form.host
    items['subtitle.chinesesubfinder.api_key'] = form.api_key
    items['subtitle.chinesesubfinder.local_path'] = form.local_path
    items['subtitle.chinesesubfinder.remote_path'] = form.remote_path
  }
  const ok = await save(items)
  if (ok) dialogVisible.value = false
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="subtitle-view">
    <PageHeader title="字幕" description="选择并配置字幕下载服务" />
    <div class="server-grid">
      <el-card
        v-for="s in SERVERS"
        :key="s.type"
        shadow="hover"
        class="server-card"
        :class="{ active: activeServer === s.type }"
        @click="openDialog(s.type)"
      >
        <div class="server-body">
          <div class="server-cover">
            <div class="server-avatar" :style="{ backgroundImage: `url(${s.image})` }" />
          </div>
          <div class="server-name">{{ s.name }}</div>
          <div class="server-status">
            <el-tag v-if="activeServer === s.type" type="success" size="small" effect="dark">
              正在使用
            </el-tag>
            <span v-else class="server-hint">点击配置</span>
          </div>
        </div>
      </el-card>
    </div>

    <el-dialog v-model="dialogVisible" :title="currentType === 'opensubtitles' ? 'OpenSubtitles' : 'ChineseSubFinder'" width="560px">
      <el-form v-if="currentType === 'opensubtitles'" label-width="140px">
        <el-form-item>
          <template #label>开启字幕下载<HelpTip text="需要确保网络能正常连通www.opensubtitles.org" /></template>
          <el-switch v-model="form.enable" />
          <span class="form-tip">开启 opensubtitles.org 字幕下载</span>
        </el-form-item>
      </el-form>
      <el-form v-else label-width="110px">
        <el-form-item>
          <template #label>服务器地址<HelpTip text="配置IP地址和端口，如为https则需要增加https://前缀" /></template>
          <el-input v-model="form.host" placeholder="http://127.0.0.1:19035" />
        </el-form-item>
        <el-form-item>
          <template #label>Api Key<HelpTip text="在ChineseSubFinder->配置中心->实验室->API Key处生成" /></template>
          <el-input v-model="form.api_key" />
        </el-form-item>
        <el-form-item>
          <template #label>本地路径<HelpTip text="NASTool本地媒体库的路径，如为Docker安装则为映射路径，如NASTool与ChineseSubFinder的媒体目录路径一致则不用配置" /></template>
          <el-input v-model="form.local_path" placeholder="本地映射路径" />
        </el-form-item>
        <el-form-item>
          <template #label>远程路径<HelpTip text="ChineseSubFinder的媒体目录映射路径，会用此路径替换掉本地路径后传递给ChineseSubFinder下载字幕，如NASTOOL与ChineseSubFinder的媒体目录路径一致则不用配置" /></template>
          <el-input v-model="form.remote_path" placeholder="远程映射路径" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>

.server-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.server-card {
  cursor: pointer;
  transition: transform 0.15s ease;
  overflow: hidden;
}
.server-card:hover {
  transform: translateY(-2px);
}
.server-card.active {
  border-color: var(--el-color-primary);
  border-width: 2px;
}
.server-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0;
}
.server-cover {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 0;
  background: var(--el-fill-color-light);
}
.server-avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-size: cover;
  background-position: center;
  background-color: var(--el-bg-color);
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.server-name {
  font-size: 16px;
  font-weight: 600;
  padding: 0 16px;
}
.server-status {
  padding-bottom: 16px;
}
.server-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.form-tip {
  margin-left: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
