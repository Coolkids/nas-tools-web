<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import DefaultLayout from '@/layouts/DefaultLayout.vue'
import { useAppStore } from '@/stores/app'
import GlobalRequestProgress from '@/components/GlobalRequestProgress.vue'

const route = useRoute()
const appStore = useAppStore()
onMounted(() => {
  appStore.init()
})
</script>

<template>
  <div class="q-app app-root">
    <GlobalRequestProgress />
    <RouterView v-if="route.meta?.public" />
    <DefaultLayout v-else />
  </div>
</template>
