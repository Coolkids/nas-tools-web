<script setup lang="ts">
import DiscoveryCatalog from '@/components/DiscoveryCatalog.vue'
import type { FilterField, TypeConfig } from '@/composables/useDiscovery'

const typeConfig: TypeConfig = { type: 'DISCOVER', subtype: 'MOV', title: 'TMDB电影' }
const filters: Record<string, FilterField> = {
  with_genres: {
    name: '类型',
    options: [
      { label: '全部', value: '' }, { label: '冒险', value: '12' }, { label: '动画', value: '16' },
      { label: '喜剧', value: '35' }, { label: '犯罪', value: '80' }, { label: '剧情', value: '18' },
      { label: '奇幻', value: '14' }, { label: '恐怖', value: '27' }, { label: '悬疑', value: '9648' },
      { label: '爱情', value: '10749' }, { label: '科幻', value: '878' }, { label: '惊悚', value: '53' }, { label: '战争', value: '10752' }
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
