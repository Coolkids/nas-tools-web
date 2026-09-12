<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { login } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const showPassword = ref(false)
const form = ref({ username: '', password: '', remember: true })
const errorMsg = ref('')
const wallpaper = ref('')
const bgLoaded = ref(false)

const wallpaperStyle = computed(() => wallpaper.value
  ? { backgroundImage: `url(data:image/jpg;base64,${wallpaper.value})` }
  : {})

onMounted(async () => {
  form.value.username = ''
  form.value.password = ''
  try {
    const response = await fetch('/wallpaper')
    const data = await response.json()
    if (data.code === 0 && data.wallpaper) {
      const source = `data:image/jpg;base64,${data.wallpaper}`
      const image = new Image()
      image.onload = () => {
        wallpaper.value = data.wallpaper
        bgLoaded.value = true
      }
      image.src = source
    }
  } catch {
    // 壁纸不可用时使用渐变背景
  }
})

async function handleLogin() {
  errorMsg.value = ''
  if (!form.value.username || !form.value.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    const response = await login(form.value.username, form.value.password, form.value.remember)
    if (response.success) {
      const requested = (route.query.redirect as string) || '/index'
      const redirect = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/index'
      await router.replace(redirect)
    } else {
      errorMsg.value = response.message || '登录失败'
    }
  } catch {
    errorMsg.value = '网络错误，请确认后端服务已启动'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="bg-base" aria-hidden="true" />
    <div class="bg-wallpaper" :class="{ 'is-loaded': bgLoaded }" :style="wallpaperStyle" aria-hidden="true" />
    <div class="bg-overlay" aria-hidden="true" />

    <main class="login-card">
      <div class="card-brand">
        <q-avatar rounded color="primary" text-color="white" icon="movie" size="56px" />
        <h1>NAStool</h1>
        <p>影视资源一站式管理</p>
      </div>

      <q-form class="card-form" @submit.prevent="handleLogin">
        <q-input
          v-model="form.username"
          outlined
          dark
          label="用户名"
          autocomplete="username"
          enterkeyhint="next"
          lazy-rules
          :rules="[(value) => !!value || '请输入用户名']"
        >
          <template #prepend><q-icon name="person" /></template>
        </q-input>
        <q-input
          v-model="form.password"
          outlined
          dark
          :type="showPassword ? 'text' : 'password'"
          label="密码"
          autocomplete="current-password"
          enterkeyhint="go"
          lazy-rules
          :rules="[(value) => !!value || '请输入密码']"
        >
          <template #prepend><q-icon name="lock" /></template>
          <template #append>
            <q-btn
              flat
              round
              dense
              :icon="showPassword ? 'visibility_off' : 'visibility'"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            />
          </template>
        </q-input>
        <q-checkbox v-model="form.remember" dark label="记住我" class="remember" />
        <q-banner v-if="errorMsg" rounded class="form-alert" inline-actions>
          <template #avatar><q-icon name="error_outline" color="negative" /></template>
          {{ errorMsg }}
        </q-banner>
        <q-btn class="submit-btn" color="primary" unelevated label="登录" type="submit" :loading="loading" />
      </q-form>
    </main>
  </div>
</template>

<style scoped>
.login-page { position: relative; display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left)); box-sizing: border-box; overflow: hidden auto; }
.bg-base, .bg-wallpaper, .bg-overlay { position: fixed; inset: 0; pointer-events: none; }
.bg-base { background: linear-gradient(135deg, #18213b 0%, #1b3153 52%, #102848 100%); }
.bg-wallpaper { background-size: cover; background-position: center; background-repeat: no-repeat; opacity: 0; transition: opacity .8s ease; }
.bg-wallpaper.is-loaded { opacity: 1; animation: bg-zoom 24s ease-in-out infinite alternate; }
.bg-overlay { background: radial-gradient(ellipse at center, transparent 0%, rgba(10, 12, 22, .52) 100%), linear-gradient(160deg, rgba(10, 12, 22, .42), rgba(10, 12, 22, .76)); }
.login-card { position: relative; z-index: 1; width: min(400px, 100%); padding: clamp(24px, 6vw, 40px) clamp(20px, 6vw, 36px); box-sizing: border-box; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; background: rgba(18,20,30,.58); -webkit-backdrop-filter: blur(14px); backdrop-filter: blur(14px); box-shadow: 0 12px 40px rgba(0,0,0,.45); animation: card-in .5s ease both; }
.card-brand { display: flex; flex-direction: column; align-items: center; margin-bottom: 24px; color: #fff; }
.card-brand h1 { margin: 12px 0 0; font-size: 26px; font-weight: 700; letter-spacing: 1px; }
.card-brand p { margin: 6px 0 0; color: rgba(255,255,255,.66); font-size: 13px; }
.card-form { display: grid; gap: 14px; }
.card-form :deep(.q-field__control) { border-radius: 10px; background: rgba(255,255,255,.08); }
.card-form :deep(.q-field--dark .q-field__label), .card-form :deep(.q-field--dark .q-field__native), .card-form :deep(.q-field--dark .q-field__prepend), .card-form :deep(.q-field--dark .q-field__append) { color: rgba(255,255,255,.86); }
.remember { color: rgba(255,255,255,.86); }
.form-alert { color: #ffccd0; background: rgba(190,48,58,.2); }
.submit-btn { min-height: 48px; border-radius: 10px; font-size: 16px; font-weight: 600; letter-spacing: 4px; }
@keyframes bg-zoom { from { transform: scale(1); } to { transform: scale(1.06); } }
@keyframes card-in { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@media (min-width: 768px) { .login-card { width: min(440px, 100%); } }
@media (orientation: landscape) and (max-height: 560px) { .login-card { width: min(700px,100%); display: grid; grid-template-columns: 180px minmax(0,1fr); gap: 32px; align-items: center; } .card-brand { margin: 0; padding-right: 32px; border-right: 1px solid rgba(255,255,255,.14); } }
@media (prefers-reduced-motion: reduce) { .bg-wallpaper.is-loaded, .login-card { animation: none; } .bg-wallpaper { transition: none; } }
</style>
