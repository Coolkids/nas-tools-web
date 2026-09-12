<script setup lang="ts">
import DiscoveryCatalog from '@/components/DiscoveryCatalog.vue'
import type { TypeConfig } from '@/composables/useDiscovery'

const typeConfig: TypeConfig = { type: 'DOWNLOADED', title: '最近下载' }
</script>

<template><DiscoveryCatalog :type-config="typeConfig" :show-tabs="false" /></template>
