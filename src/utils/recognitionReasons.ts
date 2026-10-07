// 名称测试与识别记录共用原因文案，避免同一失败显示不同提示。
export const recognitionReasonLabels: Record<string, string> = {
  ambiguous_tmdb: '多个 TMDB 条目的名称或别名命中标题，无法确定唯一结果',
  tmdb_network_error: 'TMDB 网络请求失败',
  tmdb_no_results: 'TMDB 查询无结果',
  no_tmdb_match: 'TMDB 候选名称或别名未在标题中找到',
  tmdb_unavailable: 'TMDB 未配置或不可用',
  tmdb_disallowed_by_profile: '当前识别配置禁止查询 TMDB',
  recognition_deadline_exceeded: '识别超时',
  recognition_not_completed: '识别未完成',
  empty_title: '资源名称为空',
  no_name_parsed: '未能解析出媒体名称',
  insufficient_title_evidence: '标题匹配证据不足',
  provider_error: '名称解析器运行失败',
  indexer_seeders_zero: '索引器过滤：做种数为零',
  local_parse_no_name: '本地解析未得到名称',
  indexer_type_mismatch: '索引器过滤：媒体类型不匹配',
  indexer_filter_rejected: '索引器规则过滤拒绝',
  indexer_imdb_match: '索引器 IMDB 条目复用',
  indexer_media_cache_match: '索引器媒体缓存命中',
  rss_media_cache_hit: 'RSS 媒体缓存命中',
  rss_already_downloaded: 'RSS 过滤：已成功订阅过',
  rss_subscription_filter_rejected: 'RSS 订阅规则不匹配'
}
