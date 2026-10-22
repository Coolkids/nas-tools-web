<script setup lang="ts">
import { computed } from 'vue'
import { objectValue } from '@/utils/recognitionEvents'
const props = defineProps<{ scores?: unknown; weights?: unknown; titleChecks?: unknown }>()
const scores = computed(() => objectValue(props.scores))
const weights = computed(() => objectValue(props.weights))
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const format = (value: unknown) => number(value)?.toFixed(4) ?? '未记录'
const labels: Record<string, string> = { title: '名称相似度', type_episode: '类型与季集', year: '年份', consensus: '独立引擎共识', popularity: '热度' }
const rows = computed(() => Object.entries(labels).map(([key, label]) => ({ key, label,
  score: scores.value[key], weight: weights.value[key], contribution: scores.value[`${key}_contribution`] })))
const weightSum = computed(() => Object.values(weights.value).reduce<number>((total, value) => total + (number(value) ?? 0), 0))
const checks = computed(() => Array.isArray(props.titleChecks) ? props.titleChecks.map(objectValue) : [])
</script>
<template>
  <div class="score-breakdown" aria-label="评分分项">
    <div class="score-table-scroll"><table><thead><tr><th>评分项目</th><th>得分</th><th>有效权重</th><th>加权值</th></tr></thead>
      <tbody><tr v-for="row in rows" :key="row.key"><th scope="row">{{ row.label }}</th><td>{{ number(row.weight) === null ? '未参与' : format(row.score) }}</td><td>{{ number(row.weight) === null ? '—' : format(row.weight) }}</td><td>{{ number(row.weight) === null ? '—' : format(row.contribution) }}</td></tr></tbody>
    </table></div>
    <p class="score-note">总分 = 加权值之和 ÷ 有效权重之和（{{ weightSum.toFixed(4) }}）。缺少证据的项目不参与计算。</p>
    <p v-if="Object.keys(scores).length" class="score-gates">最高名称匹配分 {{ format(scores.name_similarity) }} · {{ number(scores.parser_group_min_similarity) === null ? '主名称最低相似度' : '引擎名称组最低匹配分' }} {{ format(scores.parser_group_min_similarity ?? scores.primary_min_similarity) }}<br />证据完整：{{ number(scores.evidence_sufficient) === null ? '未记录' : scores.evidence_sufficient ? '是' : '否' }} · 名称冲突：{{ number(scores.title_conflict) === null ? '未记录' : scores.title_conflict ? '是' : '否' }}</p>
    <ul v-if="checks.length" class="title-checks"><li v-for="(check, index) in checks" :key="index" :class="{ 'text-negative': typeof check.similarity === 'number' && typeof check.threshold === 'number' && check.similarity < check.threshold }">{{ check.provider_id }}：「{{ check.title }}」→「{{ check.matched_title }}」，匹配分 {{ format(check.similarity) }}，门槛 {{ format(check.threshold) }}<template v-if="check.primary_title && check.primary_title !== check.title">（主名称：{{ check.primary_title }}；已采用{{ check.source_field === 'secondary_title' ? '副标题' : '别名' }}验证）</template><template v-if="check.match_kind === 'official_keyword'"> · 命中完整官方名称关键词，字面相似度 {{ format(check.raw_similarity) }}</template></li></ul>
  </div>
</template>
<style scoped>
.score-breakdown { margin: 12px 0; min-width: 0; }.score-table-scroll { overflow-x: auto; }table { width: 100%; border-collapse: collapse; font-size: 12px; }th, td { padding: 8px; text-align: right; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }th:first-child { text-align: left; }.score-note, .score-gates, .title-checks { font-size: 12px; line-height: 1.7; color: var(--text-secondary); }.title-checks { padding-left: 20px; overflow-wrap: anywhere; }
</style>
