export interface NavigationItem {
  label: string
  icon: string
  to: string
}

export interface NavigationGroup {
  label: string
  icon: string
  items: NavigationItem[]
}

/** 应用导航唯一数据源：侧栏、移动端“更多”和路由高亮共用。 */
export const navigationGroups: NavigationGroup[] = [
  {
    label: '探索', icon: 'explore', items: [
      { label: '推荐', icon: 'auto_awesome', to: '/recommend' },
      { label: '榜单 / Bangumi', icon: 'leaderboard', to: '/ranking' }
    ]
  },
  {
    label: '订阅', icon: 'subscriptions', items: [
      { label: '电影订阅', icon: 'movie', to: '/movie_rss' },
      { label: '电视剧订阅', icon: 'live_tv', to: '/tv_rss' },
      { label: '订阅日历', icon: 'calendar_month', to: '/rss_calendar' },
      { label: '订阅历史', icon: 'history', to: '/rss_history' },
      { label: '自定义订阅', icon: 'rss_feed', to: '/user_rss' },
      { label: 'RSS解析器', icon: 'schema', to: '/rss_parser' }
    ]
  },
  {
    label: '下载', icon: 'download', items: [
      { label: '正在下载', icon: 'downloading', to: '/downloading' },
      { label: '最近下载', icon: 'download_done', to: '/downloaded' },
      { label: '自动删种', icon: 'delete_sweep', to: '/torrent_remove' }
    ]
  },
  {
    label: '整理', icon: 'folder_copy', items: [
      { label: '文件管理', icon: 'folder_open', to: '/mediafile' },
      { label: '手动识别', icon: 'find_in_page', to: '/unidentification' },
      { label: '转移历史', icon: 'swap_horiz', to: '/history' },
      { label: 'TMDB缓存', icon: 'cached', to: '/tmdbcache' }
    ]
  },
  {
    label: '服务与工具', icon: 'handyman', items: [{ label: '服务', icon: 'build', to: '/service' }]
  },
  {
    label: '设置', icon: 'settings', items: [
      { label: '基础设置', icon: 'tune', to: '/basic' },
      { label: '自定义识别词', icon: 'spellcheck', to: '/customwords' },
      { label: '下载器', icon: 'cloud_download', to: '/downloader' },
      { label: '下载设置', icon: 'download_for_offline', to: '/download_setting' },
      { label: '目录同步', icon: 'sync', to: '/directorysync' },
      { label: '索引器', icon: 'manage_search', to: '/indexer' },
      { label: '媒体服务器', icon: 'dns', to: '/mediaserver' },
      { label: '媒体库', icon: 'video_settings', to: '/library' },
      { label: '消息通知', icon: 'notifications', to: '/notification' },
      { label: '字幕', icon: 'subtitles', to: '/subtitle' },
      { label: '豆瓣同步', icon: 'sync_alt', to: '/douban' },
      { label: '过滤规则', icon: 'filter_alt', to: '/filterrule' },
      { label: '用户管理', icon: 'group', to: '/users' }
    ]
  }
]

export const primaryNavigation: NavigationItem[] = [
  { label: '概览', icon: 'home', to: '/index' },
  { label: '资源搜索', icon: 'search', to: '/search' }
]

export const mobileNavigation: NavigationItem[] = [
  primaryNavigation[0],
  { label: '探索', icon: 'explore', to: '/recommend' },
  { label: '订阅', icon: 'subscriptions', to: '/movie_rss' },
  { label: '下载', icon: 'download', to: '/downloading' }
]
