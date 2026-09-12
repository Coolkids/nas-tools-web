<script setup lang="ts">
import DiscoveryCatalog from '@/components/DiscoveryCatalog.vue'
import type { FilterField, TypeConfig } from '@/composables/useDiscovery'

const typeConfig: TypeConfig = { type: 'DOUBANTAG', subtype: 'MOV', title: '豆瓣电影' }
const filters: Record<string, FilterField> = {
  sort: {
    name: '排序',
    options: [
      { label: '默认', value: '' }, { label: '综合排序', value: 'U' },
      { label: '首播时间', value: 'T' }, { label: '高分优先', value: 'S' }, { label: '近期热度', value: 'R' }
    ]
  },
  tags: {
    name: '类型',
    options: [
      { label: '全部', value: '' }, { label: '喜剧', value: '喜剧' }, { label: '爱情', value: '爱情' },
      { label: '动作', value: '动作' }, { label: '科幻', value: '科幻' }, { label: '动画', value: '动画' },
      { label: '悬疑', value: '悬疑' }, { label: '犯罪', value: '犯罪' }, { label: '惊悚', value: '惊悚' },
      { label: '冒险', value: '冒险' }, { label: '奇幻', value: '奇幻' }, { label: '恐怖', value: '恐怖' },
      { label: '战争', value: '战争' }, { label: '武侠', value: '武侠' }, { label: '灾难', value: '灾难' }
    ]
  }
}
</script>

<template><DiscoveryCatalog :type-config="typeConfig" :filters="filters" /></template>
