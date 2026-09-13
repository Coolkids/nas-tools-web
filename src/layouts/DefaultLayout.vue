<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useQuasar } from 'quasar'
import AppSidebar from '@/components/AppSidebar.vue'
import AppHeader from '@/components/AppHeader.vue'
import GlobalOverlays from '@/components/GlobalOverlays.vue'
import { mobileNavigation } from '@/navigation'

const $q = useQuasar()
const drawerOpen = ref(false)
const miniDrawer = ref(false)
const mobileGroup = ref<string | null>(null)
const isPhone = computed(() => $q.screen.lt.sm)
const isDesktop = computed(() => $q.screen.gt.sm)

watch(isDesktop, (desktop) => {
  if (desktop) drawerOpen.value = false
}, { immediate: true })

function toggleDrawer() {
  drawerOpen.value = !drawerOpen.value
}

function openMobileGroup(label: string) {
  mobileGroup.value = label
  drawerOpen.value = true
}

function openMobileMenu() {
  mobileGroup.value = null
  drawerOpen.value = true
}

function closeDrawer() {
  if (isPhone.value || $q.screen.lt.md) drawerOpen.value = false
}
</script>

<template>
  <q-layout view="hHh LpR fFf" class="app-layout">
    <q-header class="app-header" bordered>
      <AppHeader
        :mobile="isPhone"
        :drawer-open="drawerOpen"
        @toggle-drawer="toggleDrawer"
      />
    </q-header>

    <q-drawer
      v-model="drawerOpen"
      bordered
      :mini="isDesktop && miniDrawer"
      :breakpoint="1023"
      :width="240"
      :mini-width="72"
      :show-if-above="isDesktop"
      class="app-drawer"
      aria-label="主导航"
      @hide="drawerOpen = false"
    >
      <AppSidebar
        :mobile="isPhone"
        :mobile-group="mobileGroup"
        :mini="isDesktop && miniDrawer"
        @navigate="closeDrawer"
        @toggle-mini="miniDrawer = !miniDrawer"
      />
    </q-drawer>

    <q-page-container class="app-page-container">
      <q-page class="app-main">
        <RouterView v-slot="{ Component }">
          <component :is="Component" />
        </RouterView>
      </q-page>
    </q-page-container>

    <q-footer v-if="isPhone" bordered class="app-bottom-nav">
      <q-tabs dense no-caps active-color="primary" indicator-color="transparent" class="text-grey-7">
        <q-route-tab v-for="item in mobileNavigation.slice(0, 1)" :key="item.to" :to="item.to" :icon="item.icon" :label="item.label" />
        <q-tab v-for="item in mobileNavigation.slice(1)" :key="item.label" :name="item.label" :icon="item.icon" :label="item.label" @click="openMobileGroup(item.label)" />
        <q-tab name="more" icon="more_horiz" label="更多" @click="openMobileMenu" />
      </q-tabs>
    </q-footer>

    <GlobalOverlays />
  </q-layout>
</template>
