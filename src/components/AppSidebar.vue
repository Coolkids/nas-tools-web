<script setup lang="ts">
import { computed, ref, toRefs, watch } from 'vue'
import { useRoute } from 'vue-router'
import { navigationGroups, primaryNavigation } from '@/navigation'

const props = withDefaults(defineProps<{ mini?: boolean; mobile?: boolean; mobileGroup?: string | null }>(), { mini: false, mobile: false, mobileGroup: null })
const { mini, mobile } = toRefs(props)
const emit = defineEmits<{ navigate: []; 'toggle-mini': [] }>()
const route = useRoute()

const activePath = computed(() => route.path)
const activeGroup = computed(() => navigationGroups.find((group) =>
  group.items.some((item) => activePath.value === item.to || activePath.value.startsWith(`${item.to}/`))
))
const selectedMobileGroup = ref(props.mobileGroup || activeGroup.value?.label || '')
watch(() => props.mobileGroup, (group) => { selectedMobileGroup.value = group || activeGroup.value?.label || '' })
watch(activeGroup, (group) => {
  if (props.mobile && !props.mobileGroup && group) selectedMobileGroup.value = group.label
})

function isActive(to: string) {
  return activePath.value === to || activePath.value.startsWith(`${to}/`)
}
</script>

<template>
  <div class="sidebar-content" :class="{ 'sidebar-content--mini': mini }">
    <div class="sidebar-brand">
      <q-avatar rounded color="primary" text-color="white" icon="movie" size="40px" />
      <div v-if="!mini" class="sidebar-brand-copy">
        <div class="sidebar-brand-title">NAStool</div>
        <div class="sidebar-brand-subtitle">媒体管理中心</div>
      </div>
    </div>

    <q-scroll-area class="sidebar-scroll">
      <q-list padding class="sidebar-list">
        <q-item
          v-for="item in primaryNavigation"
          :key="item.to"
          v-ripple
          clickable
          :to="item.to"
          :active="isActive(item.to)"
          active-class="nav-item--active"
          :aria-current="isActive(item.to) ? 'page' : undefined"
          @click="emit('navigate')"
        >
          <q-item-section avatar><q-icon :name="item.icon" /></q-item-section>
          <q-item-section v-if="!mini">{{ item.label }}</q-item-section>
        </q-item>

        <q-separator spaced />

        <template v-if="mobile">
          <q-item-label header class="mobile-menu-heading">选择功能分组</q-item-label>
          <q-item
            v-for="group in navigationGroups"
            :key="group.label"
            v-ripple
            clickable
            :active="selectedMobileGroup === group.label"
            active-class="nav-item--active"
            @click="selectedMobileGroup = group.label"
          >
            <q-item-section avatar><q-icon :name="group.icon" /></q-item-section>
            <q-item-section>{{ group.label }}</q-item-section>
            <q-item-section side><q-icon name="chevron_right" size="18px" /></q-item-section>
          </q-item>
          <q-separator spaced />
          <q-item-label v-if="!selectedMobileGroup" header>请选择一个功能分组</q-item-label>
          <q-item
            v-for="group in navigationGroups.filter((item) => item.label === selectedMobileGroup)"
            :key="`mobile-${group.label}`"
            class="mobile-submenu-title"
          >
            <q-item-section avatar><q-icon :name="group.icon" color="primary" /></q-item-section>
            <q-item-section class="text-primary text-weight-medium">{{ group.label }}</q-item-section>
          </q-item>
          <q-item
            v-for="item in navigationGroups.find((group) => group.label === selectedMobileGroup)?.items || []"
            :key="`mobile-${item.to}`"
            v-ripple
            clickable
            :to="item.to"
            :active="isActive(item.to)"
            active-class="nav-item--active"
            :aria-current="isActive(item.to) ? 'page' : undefined"
            @click="emit('navigate')"
          >
            <q-item-section avatar><q-icon :name="item.icon" size="20px" /></q-item-section>
            <q-item-section>{{ item.label }}</q-item-section>
          </q-item>
        </template>

        <template v-else v-for="group in navigationGroups" :key="group.label">
          <q-item
            v-if="mini"
            v-ripple
            clickable
            :active="activeGroup?.label === group.label"
            active-class="nav-item--active"
            :aria-label="group.label"
            @click="emit('toggle-mini')"
          >
            <q-item-section avatar><q-icon :name="group.icon" /></q-item-section>
            <q-tooltip>{{ group.label }}</q-tooltip>
          </q-item>

          <q-expansion-item
            v-else
            :icon="group.icon"
            :label="group.label"
            :default-opened="activeGroup?.label === group.label"
            expand-icon="expand_more"
            class="nav-group"
            :header-class="activeGroup?.label === group.label ? 'nav-group--active' : ''"
          >
            <q-item
              v-for="item in group.items"
              :key="item.to"
              v-ripple
              clickable
              dense
              :to="item.to"
              :active="isActive(item.to)"
              active-class="nav-item--active"
              :aria-current="isActive(item.to) ? 'page' : undefined"
              @click="emit('navigate')"
            >
              <q-item-section avatar><q-icon :name="item.icon" size="20px" /></q-item-section>
              <q-item-section>{{ item.label }}</q-item-section>
            </q-item>
          </q-expansion-item>
        </template>
      </q-list>
    </q-scroll-area>

    <q-separator />
    <q-btn
      v-if="mobile"
      flat
      stretch
      class="sidebar-collapse-btn"
      icon="close"
      label="关闭菜单"
      aria-label="关闭菜单"
      @click="emit('navigate')"
    />
    <q-btn
      v-else
      flat
      stretch
      class="sidebar-collapse-btn"
      :icon="mini ? 'chevron_right' : 'chevron_left'"
      :label="mini ? undefined : '收起菜单'"
      :aria-label="mini ? '展开菜单' : '收起菜单'"
      @click="emit('toggle-mini')"
    />
  </div>
</template>

<style scoped>
.sidebar-content { display: flex; flex-direction: column; height: 100%; background: var(--surface); }
.sidebar-content--mini .sidebar-list { padding-inline: 0; }
.sidebar-content--mini .sidebar-scroll :deep(.q-scrollarea__container) { overflow-x: hidden; }
.sidebar-content--mini .sidebar-scroll :deep(.q-scrollarea__bar--h), .sidebar-content--mini .sidebar-scroll :deep(.q-scrollarea__thumb--h) { display: none; }
.sidebar-brand { display: flex; align-items: center; gap: 12px; min-height: 72px; padding: 16px; }
.sidebar-brand-copy { min-width: 0; }
.sidebar-brand-title { font-size: 17px; font-weight: 700; letter-spacing: .2px; }
.sidebar-brand-subtitle { margin-top: 2px; color: var(--text-secondary); font-size: 12px; }
.sidebar-scroll { flex: 1; min-height: 0; }
.sidebar-list { padding: 12px; }
.sidebar-list :deep(.q-item) { min-height: 44px; border-radius: 8px; color: var(--text-secondary); }
.sidebar-list :deep(.q-item__section--avatar) { min-width: 40px; }
.sidebar-list :deep(.q-expansion-item__content .q-item) { margin: 2px 0 2px 12px; }
.sidebar-list :deep(.nav-item--active) { color: var(--q-primary); background: var(--primary-soft); font-weight: 600; }
.sidebar-list :deep(.nav-group--active) { color: var(--q-primary); }
.sidebar-collapse-btn { min-height: 52px; color: var(--text-secondary); }
.mobile-menu-heading { color: var(--text-secondary); }
.mobile-submenu-title { margin-top: 4px; background: var(--surface-muted); }
</style>
