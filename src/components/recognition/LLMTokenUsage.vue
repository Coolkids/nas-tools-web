<script setup lang="ts">
import { computed } from 'vue'
import { objectValue } from '@/utils/recognitionEvents'
const props = defineProps<{ usage?: unknown; compact?: boolean; aggregate?: boolean }>()
const value = computed(() => objectValue(props.usage))
const available = computed(() => Object.keys(value.value).length > 0)
const label = (count: unknown) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 ? count.toLocaleString() : '未提供'
const extras = [['输入缓存命中', 'prompt_cache_hit_tokens'], ['输入缓存未命中', 'prompt_cache_miss_tokens'], ['推理', 'reasoning_tokens']]
</script>
<template>
  <div class="llm-token-usage" :class="{ compact }" aria-label="API Token 用量">
    <template v-if="available">
      <div><span v-if="value.usage_complete === false">已知 </span>输入 {{ label(value.prompt_tokens) }} · 输出 {{ label(value.completion_tokens) }} · 合计 {{ label(value.total_tokens) }} Token</div>
      <small v-if="value.api_calls === 0">{{ aggregate ? '当前范围没有已知 API 调用' : '本次未调用 API' }}</small>
      <small v-else-if="!compact">API 调用 {{ label(value.api_calls) }} 次</small>
      <small v-if="value.usage_complete === false">部分 usage 未提供，仅显示已返回的用量</small>
      <div v-if="!compact" class="token-extras"><span v-for="[name, key] in extras.filter(([, key]) => value[key] !== null && value[key] !== undefined)" :key="key">{{ name }} {{ label(value[key]) }}</span></div>
    </template><span v-else>Token：未记录</span>
  </div>
</template>
<style scoped>
.llm-token-usage { font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }.llm-token-usage small { display: block; color: var(--text-secondary); font-size: 12px; }.token-extras { display: flex; flex-wrap: wrap; gap: 4px 16px; color: var(--text-secondary); }.compact { min-width: 190px; font-size: 12px; }
</style>
