<script setup lang="ts">
import { computed } from 'vue'
import RecognitionJsonViewer from '@/components/RecognitionJsonViewer.vue'
import LLMTokenUsage from './LLMTokenUsage.vue'
import RecognitionScoreBreakdown from './RecognitionScoreBreakdown.vue'
import { durationLabel, nodeLabel, objectValue, reasonLabel, statusColor, statusLabel, tmdbLink, type RecognitionNode } from '@/utils/recognitionEvents'
const props = defineProps<{ node?: RecognitionNode; requestInput?: unknown }>()
const legacy = computed(() => objectValue(props.node?.payload.legacy_action))
const budget = computed(() => props.node?.payload.budget_ms)
const llm = computed(() => objectValue(props.node?.payload.llm))
const release = computed(() => objectValue(props.node?.payload.release_metadata))
const releaseLabels: Record<string, string> = { release_group: '发布组', source: '来源', resolution: '分辨率', video_codec: '视频编码', audio_codec: '音频编码', subtitles: '字幕' }
const input = computed(() => objectValue(props.node?.payload.input || legacy.value.input || (props.node?.id === 'request' ? props.requestInput : undefined)))
const output = computed(() => objectValue(props.node?.payload.output))
const rules = computed(() => props.node?.events.filter(event => event.event_type === 'word_rule_matched').map(event => event.payload) || [])
const pages = computed(() => props.node?.events.filter(event => event.event_type === 'search_page').map(event => event.payload) || [])
const failures = computed(() => props.node?.events.filter(event => event.event_type === 'search_failed').map(event => event.payload) || [])
const queries = computed(() => props.node?.events.filter(event => event.event_type === 'query_planned').map(event => event.payload) || [])
const englishConfirmed = computed(() => props.node?.events.some(event => event.event_type === 'english_query_confirmed'))
const conflicts = computed(() => Array.isArray(props.node?.payload.conflicts) ? props.node!.payload.conflicts.map(objectValue) : [])
const coverageIssues = computed(() => Array.isArray(props.node?.payload.coverage_issues) ? props.node!.payload.coverage_issues.map(objectValue) : [])
const candidates = computed(() => Array.isArray(props.node?.payload.candidates) ? props.node!.payload.candidates.map(objectValue) : [])
const scope = computed(() => objectValue(props.node?.payload.scope))
const identityDetail = computed(() => props.node?.events.slice().reverse().find(event => event.event_type === 'identity_detail_loaded')?.payload)
const thresholds = computed(() => objectValue(props.node?.payload.thresholds))
const ruleLabels: Record<string, string> = { ignore: '屏蔽', replace: '替换', replace_offset: '替换并偏移集数', offset: '集数偏移' }
const cacheLabels: Record<string, string> = { miss: '未命中，继续解析', bypassed: '本次跳过缓存', identity: '已验证作品缓存', cache: '缓存', resolved: '本次查询确认' }
const episodeSourceLabels: Record<string, string> = { anitopy: 'Anitopy', openai: 'OpenAPI', anitopy_ml: 'Anitopy-ML', default: '默认第一季', file: '当前文件', parent: '父目录', override: '手动指定', absolute_mapping: '手动季集映射' }
const rows = (value: unknown) => Array.isArray(value) ? value.map(objectValue) : []
const scoreText = (value: unknown) => typeof value === 'number' ? value.toFixed(4) : '未记录'
</script>
<template>
  <section class="node-detail" aria-label="流程节点详情">
    <template v-if="node"><h3>{{ nodeLabel(node.id) }}</h3><q-badge :color="statusColor(node.status)">{{ statusLabel(node.status) }}</q-badge>
      <dl><dt>实际耗时</dt><dd>{{ durationLabel(node.durationMs) }}</dd><dt>事件数量</dt><dd>{{ node.events.length }}</dd><dt>阶段预算</dt><dd>{{ budget === null ? '不限时' : typeof budget === 'number' ? durationLabel(budget) : '未记录' }}</dd><dt>缓存来源</dt><dd>{{ cacheLabels[String(node.payload.cache_source)] || node.payload.cache_source || '未记录' }}</dd></dl>
      <q-banner v-if="node.snapshotOnly" dense>仅有当前节点状态，之前的事件已不在可用窗口中；没有历史输入、输出或耗时可回放。</q-banner>
      <p v-if="node.payload.error || node.payload.reason || legacy.reason" class="node-reason">原因：{{ reasonLabel(node.payload.error || node.payload.reason || legacy.reason) }}</p>
      <section v-if="['request', 'preprocess'].includes(node.id)" aria-label="名称输入与输出" class="evidence-section">
        <dl><dt>输入标题</dt><dd>{{ input.title ?? '此记录未保存输入标题' }}</dd><dt v-if="input.secondary_title || input.subtitle">输入副标题</dt><dd v-if="input.secondary_title || input.subtitle">{{ input.secondary_title || input.subtitle }}</dd>
          <template v-if="node.id === 'preprocess'"><dt>输出标题</dt><dd>{{ output.title ?? '此记录未保存预处理输出，请重新识别以查看' }}</dd><dt v-if="output.secondary_title">输出副标题</dt><dd v-if="output.secondary_title">{{ output.secondary_title }}</dd></template></dl>
        <template v-if="node.id === 'preprocess'"><h4>命中的自定义识别词</h4>
          <p v-if="!rules.length">{{ node.payload.matched_rule_count === 0 ? '未命中自定义识别词。' : '此记录未保存规则命中明细，请重新识别以查看。' }}</p>
          <article v-for="(rule, index) in rules" :key="index" class="evidence-card"><p><strong>规则 #{{ rule.rule_id }} · {{ ruleLabels[String(rule.operation)] || rule.operation }}</strong> · {{ rule.source === 'secondary_title' ? '副标题' : '主标题' }}</p><dl><dt>匹配内容</dt><dd>{{ rule.pattern || '按集数前后缀匹配' }}</dd><dt v-if="rule.replacement">替换为</dt><dd v-if="rule.replacement">{{ rule.replacement }}</dd><template v-if="rule.offset"><dt>集数偏移</dt><dd>{{ rule.front }} · {{ rule.back }} · {{ rule.offset }}</dd></template><dt>处理前</dt><dd>{{ rule.input_title }}</dd><dt>处理后</dt><dd>{{ rule.output_title }}</dd></dl></article>
        </template>
      </section>
      <section v-if="node.id === 'identity'" class="evidence-section" aria-label="作品缓存说明"><p>作品缓存只按去除发布组、季集号和技术后缀后的标题查找。同一作品各集复用已确认的 TMDB ID，跳过解析引擎与搜索；当前文件的季集信息单独校验。TMDB 详情独立过期和热刷新，失效时重新获取并缓存。</p><dl v-if="scope.canonical_name"><dt>缓存标题</dt><dd>{{ scope.canonical_name }}</dd><dt>类型校验</dt><dd>{{ scope.media_type }}</dd><dt>年份校验</dt><dd>{{ scope.year ?? '未限定' }}</dd></dl><p v-if="identityDetail">本次 TMDB 详情：{{ identityDetail.cache_source === 'cache' ? '读取详情缓存' : '从 TMDB 获取并写入详情缓存' }}。</p></section>
      <p v-if="node.id === 'identity_result'">本次作品验证完成。<a v-if="tmdbLink(node.payload.media_type, node.payload.tmdb_id)" :href="tmdbLink(node.payload.media_type, node.payload.tmdb_id)!" target="_blank" rel="noopener noreferrer">TMDB {{ node.payload.tmdb_id }}</a></p>
      <section v-if="node.id === 'episode' && (output.season !== undefined || output.episodes)" class="evidence-section" aria-label="季集选择依据"><p>季集按 Anitopy → OpenAPI → Anitopy-ML 的顺序逐项选用；缺少季号、有集号时使用第一季。手动指定的季集或映射优先采用。</p><dl><dt>季</dt><dd>{{ output.season ?? '未提供' }}<template v-if="output.season_source"> · {{ episodeSourceLabels[String(output.season_source)] || output.season_source }}</template></dd><dt>集</dt><dd>{{ output.episodes }}<template v-if="output.episodes_source"> · {{ episodeSourceLabels[String(output.episodes_source)] || output.episodes_source }}</template></dd></dl></section>
      <section v-if="node.id === 'episode' && node.payload.source === 'tmdb_single_season'" class="evidence-section" aria-label="单季集号确认"><p>TMDB 详情只有第 1 季，且本集在该季集数范围内，因此可以将绝对集号确认为本季集号。</p><p>原集号：{{ input.episodes }} · 已确认：第 {{ output.season }} 季，第 {{ output.episodes }} 集。</p></section>
      <section v-if="node.id === 'query_plan'" aria-label="计划搜索关键词" class="evidence-section"><p v-if="englishConfirmed">英文名称已确认作品，候补的其他名称未查询。</p><article v-for="(query, index) in queries" :key="index" class="evidence-card"><strong>{{ query.query }}</strong><p>{{ query.endpoint_type }} · 年份 {{ query.year_filter ?? '不限' }} · {{ query.phase === 'english_first' ? '英文优先阶段 · ' : query.phase === 'other_names' ? '其他名称回退阶段 · ' : query.phase === 'relaxed_year' ? '年份过滤回退阶段 · ' : '' }}{{ query.reason ? reasonLabel(query.reason) : '参与搜索' }}</p></article><p v-if="!queries.length">此记录未保存查询规划明细。</p></section>
      <section v-if="node.id === 'tmdb_search'" aria-label="TMDB 搜索明细" class="evidence-section">
        <article v-for="(page, index) in pages" :key="index" class="evidence-card"><h4>搜索关键词：{{ objectValue(page.request_params).query || page.query_id }}</h4><p>第 {{ page.page }} / {{ page.total_pages }} 页 · 共 {{ page.total_results }} 个结果 · 本页返回 {{ page.returned_count ?? '未记录' }} 个 · 参与候选 {{ page.consumed_count ?? '未记录' }} 个{{ page.cache_source ? ' · 命中搜索缓存' : '' }}</p>
          <ul v-if="rows(page.results).length" class="search-results"><li v-for="(result, resultIndex) in rows(page.results)" :key="resultIndex"><a v-if="tmdbLink(result.media_type, result.id)" :href="tmdbLink(result.media_type, result.id)!" target="_blank" rel="noopener noreferrer">{{ result.title || '未提供标题' }} · TMDB {{ result.id }}</a><span v-else>{{ result.title || '未提供标题' }} · ID {{ result.id ?? '未记录' }}</span><span v-if="result.original_title && result.original_title !== result.title">（{{ result.original_title }}）</span></li></ul>
          <p v-else>{{ page.returned_count === 0 ? '本页没有搜索结果。' : '此记录未保存返回标题和 ID，请重新识别以查看。' }}</p><p v-if="page.results_truncated" class="text-warning">本页日志只展示前 40 项，返回总数及实际候选覆盖另行记录。</p>
        </article>
        <p v-for="(failure, index) in failures" :key="`error-${index}`" class="text-negative">{{ failure.query || failure.query_id || '详情验证' }}：{{ reasonLabel(failure.error) }}</p>
        <p v-if="!pages.length && !failures.length">没有已记录的搜索响应；可检查是否命中作品缓存或跳过搜索。</p>
      </section>
      <section v-if="node.id === 'rank'" aria-label="候选评分明细" class="evidence-section"><p v-if="Object.keys(thresholds).length">名称门槛 {{ scoreText(thresholds.min_name_similarity) }} · 总分门槛 {{ scoreText(thresholds.match_threshold) }} · 最低分差 {{ scoreText(thresholds.min_score_gap) }}</p>
        <p v-if="node.payload.coverage">查询覆盖：{{ node.payload.coverage === 'complete' ? '完整' : '不完整' }}<template v-if="typeof node.payload.detail_complete === 'boolean'"> · 已选候选详情：{{ node.payload.detail_complete ? '获取完整' : '获取不完整' }}</template></p>
        <ul v-if="coverageIssues.length" aria-label="覆盖不足的具体原因"><li v-for="(issue, index) in coverageIssues" :key="index"><strong>{{ issue.query || (issue.tmdb_id ? `TMDB ${issue.tmdb_id}` : '查询') }}</strong>：{{ reasonLabel(issue.reason) }}<template v-if="typeof issue.total_pages === 'number'"> · 已读 {{ issue.pages_fetched }} 页 / 共 {{ issue.total_pages }} 页 · 共 {{ issue.total_results }} 条</template><template v-if="issue.error"> · {{ reasonLabel(issue.error) }}</template></li></ul>
        <ul v-if="conflicts.length" class="conflict-details"><li v-for="(conflict, index) in conflicts" :key="index">{{ reasonLabel(conflict.code) }}<template v-if="conflict.provider_id">：{{ conflict.provider_id }}「{{ conflict.title }}」与「{{ conflict.matched_title }}」的相似度 {{ scoreText(conflict.similarity) }}，要求 {{ scoreText(conflict.threshold) }}</template><template v-if="conflict.episodes"> · 季 {{ conflict.season ?? '未知' }} · 集 {{ conflict.episodes }}</template></li></ul>
        <article v-for="(candidate, index) in candidates" :key="index" class="evidence-card"><h4>#{{ candidate.rank }} {{ candidate.title }}</h4><p>总分 {{ scoreText(candidate.score) }} · 分差 {{ scoreText(candidate.gap) }}<a v-if="tmdbLink(candidate.media_type, candidate.tmdb_id)" :href="tmdbLink(candidate.media_type, candidate.tmdb_id)!" target="_blank" rel="noopener noreferrer"> · TMDB {{ candidate.tmdb_id }}</a></p><p v-if="Array.isArray(candidate.hard_reject) && candidate.hard_reject.length" class="text-negative">硬拒绝：{{ candidate.hard_reject.map(reasonLabel).join('、') }}</p><RecognitionScoreBreakdown :scores="candidate.scores" :weights="candidate.available_weights" :title-checks="candidate.title_checks" /></article>
        <p>{{ candidates.length ? '此节点展示前 5 名；全部候选与评分可在“候选评分”页签查看。' : '各项目评分可在“候选评分”页签查看；此历史节点未保存评分快照。' }}</p>
      </section>
      <div v-if="Object.keys(llm).length" class="llm-details"><p>模型：{{ llm.model }} · 提取方案：{{ llm.extraction_mode }}</p><LLMTokenUsage :usage="llm.usage" />
        <p class="text-caption text-secondary">Prompt：{{ llm.prompt_version }}</p>
        <dl v-if="Object.keys(release).length"><template v-for="(label, key) in releaseLabels" :key="key"><dt>{{ label }}</dt><dd>{{ release[key] ?? '未提取' }}</dd></template></dl>
        <q-expansion-item v-if="Array.isArray(llm.attempts) && llm.attempts.length" label="单次 API 调用用量">
          <article v-for="(attempt, index) in llm.attempts" :key="index" class="api-attempt"><p>第 {{ objectValue(attempt).attempt_index }} 次 · HTTP {{ objectValue(attempt).http_status ?? '未返回' }} · {{ objectValue(attempt).finish_reason || '未记录结束原因' }} · {{ durationLabel(objectValue(attempt).latency_ms) }}</p><LLMTokenUsage :usage="objectValue(attempt).usage" compact /></article>
        </q-expansion-item>
      </div>
      <p v-else-if="node.id === 'openai' && node.status === 'skipped'">本节点已跳过，未调用 API（0 Token）。</p>
      <q-expansion-item v-if="Object.keys(input).length" label="节点输入原始数据"><RecognitionJsonViewer :value="input" /></q-expansion-item>
      <q-expansion-item label="节点输出与记录数据"><RecognitionJsonViewer :value="node.payload.output || legacy.output || node.payload" /></q-expansion-item>
    </template><p v-else class="text-secondary">选择一个节点查看已记录的输入、输出、预算、缓存和原因。</p>
  </section>
</template>
<style scoped>
.node-detail { min-width: 0; overflow-wrap: anywhere; border: 1px solid var(--border-subtle); border-radius: 10px; padding: 18px; }h3 { font-size: 16px; margin: 0 0 12px; }dl { display: grid; grid-template-columns: auto 1fr; gap: 8px 18px; font-size: 13px; }dt { color: var(--text-secondary); }dd { margin: 0; }.node-reason { color: var(--q-warning); font-size: 13px; }
.evidence-section { margin: 16px 0; font-size: 13px; line-height: 1.7; }.evidence-card { padding: 12px 0; border-top: 1px solid var(--border-subtle); }h4 { font-size: 14px; margin: 8px 0; }.search-results, .conflict-details { padding-left: 20px; }.search-results li { margin: 6px 0; }a { color: var(--q-primary); }@media(max-width: 600px) { dl { grid-template-columns: 1fr; gap: 4px; }dd { margin-bottom: 8px; } }
</style>
