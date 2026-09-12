<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()
</script>

<template>
  <div class="not-found-page">
    <q-card flat bordered class="not-found-card">
      <q-card-section class="column items-center text-center q-pa-xl">
        <q-icon name="error_outline" size="72px" color="warning" />
        <div class="text-h4 q-mt-md">404</div>
        <div class="text-body1 text-grey-7 q-mt-sm">抱歉，页面不存在</div>
        <q-btn color="primary" unelevated label="返回首页" class="q-mt-lg" @click="router.push('/index')" />
      </q-card-section>
    </q-card>
  </div>
</template>

<style scoped>
.not-found-page { display: grid; place-items: center; min-height: calc(100vh - var(--app-header-height)); padding: 24px; background: var(--page-bg); }
.not-found-card { width: min(100%, 420px); }
</style>
