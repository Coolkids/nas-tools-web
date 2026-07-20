<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { User, Lock, Film } from '@element-plus/icons-vue'
import { login } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const form = ref({ username: '', password: '', remember: true })
const errorMsg = ref('')
const wallpaper = ref('')
const bgLoaded = ref(false)

const wallpaperStyle = computed(() => {
  if (!wallpaper.value) return {}
  return { backgroundImage: `url(data:image/jpg;base64,${wallpaper.value})` }
})

onMounted(async () => {
  form.value.username = ''
  form.value.password = ''
  try {
    const res = await fetch('/wallpaper')
    const data = await res.json()
    if (data.code === 0 && data.wallpaper) {
      // 预加载完成后再淡入，避免大图解码闪烁
      const src = `data:image/jpg;base64,${data.wallpaper}`
      const img = new Image()
      img.onload = () => {
        wallpaper.value = data.wallpaper
        bgLoaded.value = true
      }
      img.src = src
    }
  } catch { /* ignore */ }
})

async function handleLogin() {
  errorMsg.value = ''
  if (!form.value.username || !form.value.password) {
    errorMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    const res = await login(form.value.username, form.value.password, form.value.remember)
    if (res.success) {
      const redirect = (route.query.redirect as string) || '/index'
      router.replace(redirect)
    } else {
      errorMsg.value = res.message || '登录失败'
    }
  } catch (e) {
    errorMsg.value = '网络错误，请确认后端服务已启动'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <!-- 背景层：渐变兜底 + 壁纸淡入 + 暗色蒙层，fixed 避免 iOS 背景抖动 -->
    <div class="bg-base" aria-hidden="true"></div>
    <div class="bg-wallpaper" :class="{ 'is-loaded': bgLoaded }" :style="wallpaperStyle" aria-hidden="true"></div>
    <div class="bg-overlay" aria-hidden="true"></div>

    <main class="login-card">
      <div class="card-brand">
        <div class="brand-logo">
          <el-icon :size="30"><Film /></el-icon>
        </div>
        <h1 class="brand-title">NAStool</h1>
        <p class="brand-subtitle">影视资源一站式管理</p>
      </div>

      <el-form class="card-form" size="large" @submit.prevent="handleLogin">
        <el-form-item>
          <el-input
            v-model="form.username"
            placeholder="用户名"
            :prefix-icon="User"
            autocomplete="username"
            enterkeyhint="next"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            show-password
            :prefix-icon="Lock"
            autocomplete="current-password"
            enterkeyhint="go"
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <div class="form-row">
          <el-checkbox v-model="form.remember">记住我</el-checkbox>
        </div>
        <el-alert
          v-if="errorMsg"
          :title="errorMsg"
          type="error"
          :closable="false"
          show-icon
          class="form-alert"
        />
        <el-button class="submit-btn" type="primary" :loading="loading" @click="handleLogin">
          登 录
        </el-button>
      </el-form>
    </main>
  </div>
</template>

<style scoped>
/* ===== 页面容器：grid 居中 + 可滚动溢出 + 安全区适配 ===== */
.login-page {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
    max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
  box-sizing: border-box;
  overflow: hidden auto;
}

/* ===== 背景层 ===== */
.bg-base,
.bg-wallpaper,
.bg-overlay {
  position: fixed;
  inset: 0;
  pointer-events: none;
}
.bg-base {
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
}
.bg-wallpaper {
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 0.8s ease;
}
.bg-wallpaper.is-loaded {
  opacity: 1;
  animation: bg-zoom 24s ease-in-out infinite alternate;
}
.bg-overlay {
  background:
    radial-gradient(ellipse at center, rgba(10, 12, 22, 0) 0%, rgba(10, 12, 22, 0.45) 100%),
    linear-gradient(160deg, rgba(10, 12, 22, 0.5) 0%, rgba(10, 12, 22, 0.72) 100%);
}
@keyframes bg-zoom {
  from { transform: scale(1); }
  to { transform: scale(1.06); }
}

/* ===== 登录卡片：流式宽度，覆盖手机/平板/桌面 ===== */
.login-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(400px, 100%);
  padding: clamp(24px, 6vw, 40px) clamp(20px, 6vw, 36px);
  box-sizing: border-box;
  border-radius: 16px;
  background: rgba(18, 20, 30, 0.55);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  animation: card-in 0.5s ease both;
}
@keyframes card-in {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== 品牌区 ===== */
.card-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: clamp(16px, 4vw, 28px);
}
.brand-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 16px;
  color: #fff;
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3, #79bbff));
  box-shadow: 0 6px 18px rgba(64, 158, 255, 0.4);
}
.brand-title {
  margin: 12px 0 0;
  font-size: clamp(22px, 5vw, 26px);
  font-weight: 700;
  letter-spacing: 1px;
  color: #fff;
}
.brand-subtitle {
  margin: 6px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

/* ===== 表单：深色玻璃上的控件覆写 ===== */
.card-form :deep(.el-form-item) {
  margin-bottom: 18px;
}
.card-form :deep(.el-input__wrapper) {
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18) inset;
  border-radius: 10px;
  transition: box-shadow 0.2s ease, background 0.2s ease;
}
.card-form :deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.32) inset;
}
.card-form :deep(.el-input__wrapper.is-focus) {
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset;
}
.card-form :deep(.el-input__inner) {
  height: 46px;
  color: #fff;
}
.card-form :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.45);
}
.card-form :deep(.el-input__prefix),
.card-form :deep(.el-input__suffix) {
  color: rgba(255, 255, 255, 0.6);
}
.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.form-row :deep(.el-checkbox__label) {
  color: rgba(255, 255, 255, 0.85);
}
.form-alert {
  margin-bottom: 16px;
  border-radius: 8px;
}
.submit-btn {
  width: 100%;
  height: 46px;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 4px;
}

/* ===== 触屏手机：输入字号 >=16px 避免 iOS 聚焦自动放大 ===== */
@media (max-width: 768px) {
  .card-form :deep(.el-input__inner) {
    font-size: 16px;
  }
}

/* ===== 小屏手机（<=360px）收紧内边距 ===== */
@media (max-width: 360px) {
  .login-card {
    padding: 24px 18px;
  }
}

/* ===== 平板及以上：卡片略加宽 ===== */
@media (min-width: 768px) {
  .login-card {
    width: min(440px, 100%);
  }
}

/* ===== 横屏且高度受限（手机横屏）：左右分栏布局 ===== */
@media (orientation: landscape) and (max-height: 560px) {
  .login-card {
    flex-direction: row;
    align-items: center;
    width: min(700px, 100%);
    padding: clamp(16px, 4vh, 28px) clamp(20px, 4vw, 36px);
    gap: clamp(20px, 4vw, 36px);
  }
  .card-brand {
    flex-shrink: 0;
    justify-content: center;
    min-width: 180px;
    margin-bottom: 0;
    padding-right: clamp(20px, 4vw, 36px);
    border-right: 1px solid rgba(255, 255, 255, 0.12);
  }
  .card-form {
    flex: 1;
    min-width: 0;
  }
  .card-form :deep(.el-form-item) {
    margin-bottom: 14px;
  }
  .card-form :deep(.el-input__inner) {
    height: 42px;
  }
  .form-row {
    margin-bottom: 14px;
  }
  .submit-btn {
    height: 42px;
  }
}

/* ===== 超矮横屏（<=400px）：进一步压缩品牌区 ===== */
@media (orientation: landscape) and (max-height: 400px) {
  .brand-logo {
    width: 44px;
    height: 44px;
    border-radius: 12px;
  }
  .brand-subtitle {
    display: none;
  }
}

/* ===== 尊重系统减弱动效设置 ===== */
@media (prefers-reduced-motion: reduce) {
  .bg-wallpaper.is-loaded,
  .login-card {
    animation: none;
  }
  .bg-wallpaper {
    transition: none;
  }
}
</style>
