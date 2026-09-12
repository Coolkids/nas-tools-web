<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useQuasar } from 'quasar'
import { useRoute, useRouter } from 'vue-router'
import { logout } from '@/api/auth'
import { doAction } from '@/api'
import { useModalStore } from '@/stores/modal'
import AppSearchbar from '@/components/AppSearchbar.vue'
import MessageCenter from '@/components/MessageCenter.vue'
import RealTimeLogs from '@/components/RealTimeLogs.vue'

defineProps<{ mobile?: boolean; drawerOpen?: boolean }>()
const emit = defineEmits<{ 'toggle-drawer': [] }>()

const $q = useQuasar()
const route = useRoute()
const router = useRouter()
const modal = useModalStore()
const appVersion = ref('')
const messageCenterVisible = ref(false)
const realTimeLogsVisible = ref(false)

const pageTitle = computed(() => (route.meta?.title as string) || 'NAStool')
const isDark = computed(() => $q.dark.isActive)

onMounted(async () => {
  try {
    const res = await doAction<{ code: number; version: string }>('version')
    if (res.code === 0 && res.version) appVersion.value = res.version
  } catch {
    // 版本信息不应阻塞应用外壳
  }
  const preference = window.localStorage.getItem('nastool-theme')
  if (preference === 'dark' || preference === 'light') $q.dark.set(preference === 'dark')
})

function toggleTheme() {
  const next = !isDark.value
  $q.dark.set(next)
  window.localStorage.setItem('nastool-theme', next ? 'dark' : 'light')
}

async function handleLogout() {
  const ok = await modal.confirm('确定要退出登录吗？', '退出登录')
  if (!ok) return
  try {
    await logout()
  } catch {
    // 无论后端是否响应，都结束当前本地会话视图
  }
  router.replace('/login')
}
</script>

<template>
  <q-toolbar class="app-toolbar">
    <q-btn
      flat
      round
      dense
      class="toolbar-menu-btn"
      icon="menu"
      aria-label="打开导航"
      @click="emit('toggle-drawer')"
    />

    <q-btn flat no-caps class="app-brand" aria-label="返回概览" @click="router.push('/index')">
      <q-avatar rounded color="primary" text-color="white" icon="movie" size="32px" />
      <span class="app-brand-name">NAStool</span>
    </q-btn>

    <div class="toolbar-title">{{ pageTitle }}</div>

    <div class="app-header-search">
      <AppSearchbar />
    </div>

    <q-space />

    <q-btn flat round :icon="isDark ? 'light_mode' : 'dark_mode'" :aria-label="isDark ? '切换浅色主题' : '切换深色主题'" @click="toggleTheme" />
    <q-btn flat round icon="notifications_none" aria-label="消息中心" @click="messageCenterVisible = true" />
    <q-btn flat round class="toolbar-logs-btn" icon="terminal" aria-label="实时日志" @click="realTimeLogsVisible = true" />

    <q-btn flat no-caps class="account-trigger" aria-label="打开账号菜单">
      <q-avatar color="primary" text-color="white" size="30px" icon="person" />
      <span class="account-label">账号</span>
      <q-icon name="expand_more" size="18px" />
      <q-menu anchor="bottom right" self="top right" :offset="[0, 8]">
        <q-list style="min-width: 190px" padding>
          <q-item-label header>账号与工具</q-item-label>
          <q-item v-close-popup clickable @click="messageCenterVisible = true">
            <q-item-section avatar><q-icon name="notifications" /></q-item-section>
            <q-item-section>消息中心</q-item-section>
          </q-item>
          <q-item v-close-popup clickable @click="realTimeLogsVisible = true">
            <q-item-section avatar><q-icon name="terminal" /></q-item-section>
            <q-item-section>实时日志</q-item-section>
          </q-item>
          <q-separator spaced />
          <q-item v-close-popup clickable to="/basic">
            <q-item-section avatar><q-icon name="settings" /></q-item-section>
            <q-item-section>系统设置</q-item-section>
          </q-item>
          <q-item v-close-popup clickable to="/users">
            <q-item-section avatar><q-icon name="group" /></q-item-section>
            <q-item-section>用户管理</q-item-section>
          </q-item>
          <q-item-label v-if="appVersion" caption class="q-px-md q-pt-sm">版本 {{ appVersion }}</q-item-label>
          <q-separator spaced />
          <q-item v-close-popup clickable class="text-negative" @click="handleLogout">
            <q-item-section avatar><q-icon name="logout" /></q-item-section>
            <q-item-section>退出登录</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </q-btn>
  </q-toolbar>

  <MessageCenter v-model:visible="messageCenterVisible" />
  <RealTimeLogs v-model:visible="realTimeLogsVisible" />
</template>

<style scoped>
.app-toolbar { min-height: 64px; padding: 0 20px; gap: 4px; }
.toolbar-menu-btn { display: none; }
.app-brand { gap: 10px; color: var(--text-primary); font-weight: 700; }
.app-brand-name { font-size: 17px; letter-spacing: .2px; }
.toolbar-title { display: none; color: var(--text-secondary); font-size: 14px; margin-left: 10px; }
.app-header-search { display: flex; justify-content: center; flex: 1; min-width: 240px; }
.account-trigger { margin-left: 4px; color: var(--text-primary); }
.account-label { margin: 0 3px 0 7px; }
@media (max-width: 1023px) {
  .toolbar-menu-btn { display: inline-flex; }
  .app-brand { padding-left: 4px; }
  .app-header-search { min-width: 0; max-width: 420px; }
}
@media (max-width: 599px) {
  .app-toolbar { min-height: 56px; padding: 0 10px; }
  .app-brand-name, .account-label, .account-trigger > .q-icon { display: none; }
  .toolbar-title { display: block; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .app-header-search { display: none; }
  .toolbar-logs-btn { display: none; }
}
</style>
