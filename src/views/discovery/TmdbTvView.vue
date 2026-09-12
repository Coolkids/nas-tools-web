<script setup lang="ts">
import DiscoveryCatalog from '@/components/DiscoveryCatalog.vue'
import type { FilterField, TypeConfig } from '@/composables/useDiscovery'

const typeConfig: TypeConfig = { type: 'DISCOVER', subtype: 'TV', title: 'TMDB剧集' }
const filters: Record<string, FilterField> = {
  with_genres: {
    name: '类型',
    options: [
      { label: '全部', value: '' }, { label: '动作冒险', value: '10759' }, { label: '动画', value: '16' },
      { label: '喜剧', value: '35' }, { label: '犯罪', value: '80' }, { label: '纪录', value: '99' },
      { label: '剧情', value: '18' }, { label: '儿童', value: '10762' }, { label: '悬疑', value: '9648' },
      { label: '真人秀', value: '10764' }, { label: '科幻', value: '10765' }
    ]
  },
  with_original_language: {
    name: '语言',
    options: [
      { label: '全部', value: '' }, { label: '中文', value: 'zh' }, { label: '英语', value: 'en' },
      { label: '日语', value: 'ja' }, { label: '韩语', value: 'ko' }, { label: '法语', value: 'fr' },
      { label: '德语', value: 'de' }, { label: '俄语', value: 'ru' }, { label: '印地语', value: 'hi' }
    ]
  }
}
</script>

<template><DiscoveryCatalog :type-config="typeConfig" :filters="filters" /></template>
