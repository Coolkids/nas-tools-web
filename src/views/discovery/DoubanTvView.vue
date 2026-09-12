<script setup lang="ts">
import DiscoveryCatalog from '@/components/DiscoveryCatalog.vue'
import type { FilterField, TypeConfig } from '@/composables/useDiscovery'

const typeConfig: TypeConfig = { type: 'DOUBANTAG', subtype: 'TV', title: '豆瓣剧集' }
const filters: Record<string, FilterField> = {
  sort: {
    name: '排序',
    options: [
      { label: '默认', value: '' }, { label: '综合排序', value: 'U' },
      { label: '首播时间', value: 'T' }, { label: '高分优先', value: 'S' }, { label: '近期热度', value: 'R' }
    ]
  },
  tags: {
    name: '地区',
    options: [
      { label: '全部', value: '' }, { label: '华语', value: '华语' }, { label: '中国大陆', value: '中国大陆' },
      { label: '中国香港', value: '中国香港' }, { label: '中国台湾', value: '中国台湾' }, { label: '欧美', value: '欧美' },
      { label: '韩国', value: '韩国' }, { label: '日本', value: '日本' }, { label: '印度', value: '印度' }, { label: '泰国', value: '泰国' }
    ]
  }
}
</script>

<template><DiscoveryCatalog :type-config="typeConfig" :filters="filters" /></template>
