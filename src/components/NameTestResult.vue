<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { NameTestData } from '@/api/system'
import { useModalStore } from '@/stores/modal'

const props = withDefaults(defineProps<{
  result: NameTestData | { name: string }
  input?: string
  source?: string
  compact?: boolean
}>(), {
  input: '',
  source: '',
  compact: false
})

const emit = defineEmits<{ 'open-details': [] }>()
const modal = useModalStore()
const data = computed(() => 'title' in props.result ? props.result : null)
const errorMessage = computed(() => 'title' in props.result ? '' : props.result.name)
const recognized = computed(() => Boolean(data.value?.tmdbid && tmdbUrl()))

const parsedFields = computed(() => {
  if (!data.value) return []
  return [
    ['名称', data.value.name],
    ['类型', data.value.type],
    ['年份', data.value.year],
    ['季集', data.value.season_episode],
    ['分集', data.value.part],
    ['质量', data.value.restype],
    ['特性', data.value.effect],
    ['类别', data.value.category],
    ['分辨率', data.value.pix],
    ['视频编码', data.value.video_codec],
    ['音频编码', data.value.audio_codec],
    ['制作组/字幕组', data.value.team],
    ['TMDB ID', data.value.tmdbid]
  ].filter(([, value]) => value !== undefined && value !== null && String(value) !== '')
})

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter(Boolean).map(String)
  return typeof value === 'string' && value ? [value] : []
}

const replacedWords = computed(() => toArray(data.value?.replaced_words))
const ignoredWords = computed(() => toArray(data.value?.ignored_words))
const offsetWords = computed(() => toArray(data.value?.offset_words))
const recognitionSource = computed(() => data.value?.recognition_source === 'ai' ? 'AI推理' : '原始解析')
const compactFields = computed(() => parsedFields.value.slice(0, 4))
const detailsOpen = ref(false)
watch([data, replacedWords, ignoredWords, offsetWords], ([value, replaced, ignored, offset]) => {
  if (value) detailsOpen.value = !value.tmdbid || replaced.length > 0 || ignored.length > 0 || offset.length > 0
}, { immediate: true })

function mediaPath() {
  const type = String(data.value?.type || '').toLowerCase()
  if (['电影', 'movie', 'mov'].includes(type)) return 'movie'
  if (['电视剧', '动漫', 'tv', 'anime'].includes(type)) return 'tv'
  return ''
}

function tmdbUrl() {
  if (!data.value?.tmdbid) return ''
  const returnedUrl = data.value.tmdblink
  if (returnedUrl) {
    try {
      const parsed = new URL(returnedUrl)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return returnedUrl
    } catch {
      // 使用下方的可验证回退地址。
    }
  }
  return mediaPath() ? `https://www.themoviedb.org/${mediaPath()}/${data.value.tmdbid}` : ''
}

function seasonUrl() {
  if (!data.value?.tmdbid) return ''
  if (data.value.tmdb_S_E_link) return data.value.tmdb_S_E_link
  const season = String(data.value.season_episode || '').match(/S(\d+)/i)?.[1] || String(data.value.season_episode || '').match(/第(\d+)季/)?.[1]
  return season ? `https://www.themoviedb.org/tv/${data.value.tmdbid}/season/${season}` : ''
}

async function copyValue(value: unknown, label: string) {
  const text = String(value ?? '')
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    modal.success(`${label}已复制`)
  } catch {
    modal.info(`${label}：${text}`)
  }
}

function openUrl(url: string) {
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

function searchName() {
  const query = data.value?.name || props.input
  if (query) openUrl(`https://www.themoviedb.org/search?query=${encodeURIComponent(query)}`)
}
</script>

<template>
  <div class="name-test-result" :class="{ compact }">
    <q-banner v-if="errorMessage" dense rounded class="result-error">
      <template #avatar><q-icon name="error_outline" color="negative" /></template>
      {{ errorMessage }}
    </q-banner>

    <template v-else-if="data">
      <div v-if="input || source" class="result-input">
        <div class="result-section-label">输入</div>
        <div class="result-input-text"><div class="result-input-value" :title="input || source">{{ input || source }}</div><div v-if="source && input" class="result-source" :title="source">路径：{{ source }}</div></div>
        <div class="result-input-actions"><q-btn v-if="input" flat dense round icon="content_copy" aria-label="复制输入" @click="copyValue(input, '输入')"><q-tooltip>复制完整输入</q-tooltip></q-btn><q-btn v-if="source" flat dense round icon="folder_copy" aria-label="复制路径" @click="copyValue(source, '路径')"><q-tooltip>复制完整路径</q-tooltip></q-btn></div>
      </div>

      <section class="result-section result-conclusion">
        <div class="result-section-heading"><span>识别结论</span><q-badge :color="recognized ? 'positive' : 'warning'" :label="recognized ? '已匹配媒体' : '仅解析文件名'" /></div>
        <div class="result-actions">
          <q-btn v-if="data.name || input" class="result-action" flat dense no-caps color="primary" icon="search" :label="`识别名称：${data.name || input}`" :title="data.name || input" @click="searchName" />
          <span v-else class="result-static">识别名称：未返回</span>
          <q-btn v-if="data.title" class="result-action" flat dense no-caps color="positive" icon="content_copy" :label="`标题：${data.title}`" :title="data.title" @click="copyValue(data.title, '标题')" />
          <span v-else class="result-static">标题：未返回</span>
          <div v-if="data.tmdbid" class="result-action-group">
            <q-btn v-if="tmdbUrl()" class="result-action result-action-main" flat dense no-caps color="positive" icon="open_in_new" :label="`TMDB ID：${data.tmdbid}`" :title="`打开 ${tmdbUrl()}`" @click="openUrl(tmdbUrl())" />
            <span v-else class="result-static result-action-main">TMDB ID：{{ data.tmdbid }} · 暂无可用链接</span>
            <q-btn class="result-copy-action" flat dense round color="positive" icon="content_copy" aria-label="复制 TMDB ID" @click="copyValue(data.tmdbid, 'TMDB ID')"><q-tooltip>复制 TMDB ID</q-tooltip></q-btn>
          </div>
          <q-btn v-if="data.season_episode && seasonUrl()" class="result-action" flat dense no-caps color="warning" icon="open_in_new" :label="`季集：${data.season_episode}`" :title="`打开 ${seasonUrl()}`" @click="openUrl(seasonUrl())" />
          <span v-else-if="data.season_episode" class="result-static">季集：{{ data.season_episode }} · 暂无可用链接</span>
        </div>
        <div class="conclusion-meta"><span>来源：{{ recognitionSource }}</span><span v-if="data.type">类型：{{ data.type }}</span><span v-if="data.year">年份：{{ data.year }}</span></div>
      </section>

      <section class="result-section parsed-section">
        <div class="result-section-heading"><span>解析信息</span><q-btn v-if="compact" flat dense color="primary" label="完整识别结果" @click="emit('open-details')" /></div>
        <div class="parsed-grid">
          <div v-for="([label, value]) in (compact ? compactFields : parsedFields)" :key="label" class="parsed-field"><span class="field-label">{{ label }}</span><span class="field-value" :title="String(value)">{{ value }}</span></div>
          <div v-if="!parsedFields.length" class="text-caption text-secondary">未返回解析信息</div>
        </div>
      </section>

      <q-expansion-item v-if="!compact" v-model="detailsOpen" dense icon="account_tree" label="识别过程" class="process-section">
        <div class="process-grid">
          <div class="process-row"><span class="field-label">识别来源</span><span class="field-value">{{ recognitionSource }}</span></div>
          <div v-if="data.org_string" class="process-row"><span class="field-label">原始识别用名</span><span class="field-value">{{ data.org_string }}</span></div>
          <div v-if="ignoredWords.length" class="process-row"><span class="field-label">应用屏蔽词</span><span class="field-value process-values"><q-chip v-for="word in ignoredWords" :key="`ignore-${word}`" dense color="grey-3" text-color="grey-8" :label="word" /></span></div>
          <div v-if="replacedWords.length" class="process-row"><span class="field-label">应用替换词</span><span class="field-value process-values"><q-chip v-for="word in replacedWords" :key="`replace-${word}`" dense color="grey-3" text-color="grey-8" :label="word" /></span></div>
          <div v-if="offsetWords.length" class="process-row"><span class="field-label">应用集数偏移</span><span class="field-value process-values"><q-chip v-for="word in offsetWords" :key="`offset-${word}`" dense color="grey-3" text-color="grey-8" :label="word" /></span></div>
          <div v-if="!data.org_string && !ignoredWords.length && !replacedWords.length && !offsetWords.length" class="text-caption text-secondary">未返回额外处理记录。</div>
        </div>
      </q-expansion-item>
    </template>
  </div>
</template>

<style scoped>
.name-test-result { display: grid; gap: 12px; margin-top: 16px; min-width: 0; color: var(--text-primary); }
.result-error { background: var(--negative-soft, rgba(193, 66, 66, .1)); }
.result-input { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface-muted); }
.result-input-text { min-width: 0; }
.result-input-actions { display: flex; align-items: center; gap: 2px; }
.result-section { display: grid; gap: 10px; min-width: 0; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 10px; }
.result-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 650; }
.result-section-label, .field-label { color: var(--text-secondary); font-size: 12px; }
.result-input-value, .field-value { min-width: 0; overflow-wrap: anywhere; }
.result-input-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-source { overflow-wrap: anywhere; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.result-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
.result-actions :deep(.q-btn) { max-width: 100%; }
.result-actions :deep(.q-btn__content) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-action-group { display: flex; align-items: center; gap: 4px; min-width: 0; max-width: 100%; }
.result-action-group .result-action-main { min-width: 0; }
.result-action-group :deep(.result-action-main) { flex: 1; }
.result-action-group :deep(.result-copy-action) { flex: 0 0 40px; }
.result-static { color: var(--text-primary); font-size: 13px; }
.conclusion-meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--text-secondary); font-size: 13px; }
.parsed-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
.parsed-field { display: grid; grid-template-columns: minmax(76px, auto) minmax(0, 1fr); gap: 8px; min-width: 0; padding: 6px 0; border-bottom: 1px dashed var(--border-subtle); }
.field-value { font-size: 13px; }
.process-section { overflow: hidden; border: 1px solid var(--border-subtle); border-radius: 10px; }
.process-grid { display: grid; gap: 8px; padding: 0 12px 12px; }
.process-row { display: grid; grid-template-columns: minmax(90px, auto) minmax(0, 1fr); gap: 10px; align-items: start; }
.process-values { display: flex; flex-wrap: wrap; gap: 4px; }
.compact { gap: 8px; margin-top: 8px; }
.compact .result-section { padding: 8px 10px; }
.compact .result-section-heading { font-size: 12px; }
@media (max-width: 599px) {
  .result-input { grid-template-columns: minmax(0, 1fr) auto; }
  .result-section-label { grid-column: 1 / -1; }
  .result-input-value { grid-column: 1; }
  .parsed-grid { grid-template-columns: 1fr; }
  .parsed-field, .process-row { grid-template-columns: minmax(88px, auto) minmax(0, 1fr); }
  .result-actions { align-items: stretch; flex-direction: column; }
  .result-actions :deep(.result-action) { justify-content: flex-start; width: 100%; min-height: 40px; }
  .result-actions :deep(.result-action .q-btn__content) { width: 100%; justify-content: flex-start; text-align: left; }
  .result-action-group { width: 100%; }
  .result-action-group :deep(.result-action-main) { width: auto; }
  .result-action-group :deep(.result-copy-action) { width: 40px; min-width: 40px; }
  .result-action-group :deep(.result-copy-action .q-btn__content) { width: auto; justify-content: center; }
  .compact .result-actions { flex-direction: row; }
  .compact .result-actions :deep(.result-action) { width: auto; max-width: 100%; }
  .compact .result-action-group { width: auto; max-width: 100%; }
}
</style>
