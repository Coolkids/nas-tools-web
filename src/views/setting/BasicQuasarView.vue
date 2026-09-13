<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'
import { getSystemConfig } from '@/api/config'

type Option = { value: string; label: string }
type SettingField = {
  key: string
  label: string
  kind?: 'input' | 'select' | 'toggle'
  type?: 'text' | 'password'
  placeholder?: string
  help?: string
  options?: Option[]
}

const { config, loading, load, save } = useConfigForm()
const modal = useModalStore()

const RMT_MODES: Option[] = [
  { value: 'copy', label: '复制' },
  { value: 'link', label: '硬链接' },
  { value: 'softlink', label: '软链接' },
  { value: 'move', label: '移动' },
  { value: 'rclonecopy', label: 'Rclone复制' },
  { value: 'rclone', label: 'Rclone移动' },
  { value: 'miniocopy', label: 'Minio复制' },
  { value: 'minio', label: 'Minio移动' }
]

const activeTab = ref('system')
const form = reactive<Record<string, unknown>>({})

const SYSTEM_KEYS = [
  'app.logtype', 'app.logpath', 'app.logserver', 'app.loglevel', 'app.wallpaper',
  'app.web_port', 'app.login_user', 'app.login_password', 'app.ssl_cert', 'app.ssl_key',
  'app.proxies', 'app.domain', 'app.user_agent'
]
const MEDIA_KEYS = [
  'app.rmt_tmdbkey', 'app.tmdb_domain', 'app.rmt_match_mode', 'media.category',
  'pt.rmt_mode', 'media.min_filesize', 'media.ignored_paths', 'media.ignored_files',
  'pt.download_order', 'media.movie_name_format', 'media.tv_name_format',
  'media.filesize_cover', 'media.refresh_mediaserver', 'media.nfo_poster'
]
const SERVICE_KEYS = [
  'pt.ptsignin_cron', 'pt.pt_check_interval', 'pt.search_rss_interval',
  'media.mediasync_interval', 'pt.pt_monitor', 'pt.pt_monitor_only',
  'pt.search_auto', 'pt.search_no_result_rss'
]
const SECURITY_KEYS = [
  'security.media_server_webhook_allow_ip.ipv4', 'security.media_server_webhook_allow_ip.ipv6',
  'security.telegram_webhook_allow_ip.ipv4', 'security.telegram_webhook_allow_ip.ipv6',
  'security.synology_webhook_allow_ip.ipv4', 'security.synology_webhook_allow_ip.ipv6', 'security.api_key'
]
const LAB_KEYS = [
  'laboratory.search_keyword', 'laboratory.search_tmdbweb', 'laboratory.tmdb_cache_expire',
  'laboratory.use_douban_titles', 'laboratory.search_en_title', 'laboratory.tmdb_proxy'
]

const SCRAPER_NFO = [
  { group: '电影', items: [
    { key: 'scraper_nfo.movie.basic', label: '基础信息' }, { key: 'scraper_nfo.movie.credits', label: '演职人员' },
    { key: 'scraper_nfo.movie.credits_chinese', label: '演职人员中文' }
  ] },
  { group: '电视剧', items: [
    { key: 'scraper_nfo.tv.basic', label: '基础信息' }, { key: 'scraper_nfo.tv.credits', label: '演职人员' },
    { key: 'scraper_nfo.tv.credits_chinese', label: '演职人员中文' }, { key: 'scraper_nfo.tv.season_basic', label: '季-基础信息' },
    { key: 'scraper_nfo.tv.episode_basic', label: '集-基础信息' }, { key: 'scraper_nfo.tv.episode_credits', label: '集-演职人员' }
  ] }
]
const SCRAPER_PIC = [
  { group: '电影图片', items: [
    { key: 'scraper_pic.movie.poster', label: 'poster' }, { key: 'scraper_pic.movie.backdrop', label: 'fanart' },
    { key: 'scraper_pic.movie.background', label: 'background' }, { key: 'scraper_pic.movie.logo', label: 'logo' },
    { key: 'scraper_pic.movie.disc', label: 'disc' }, { key: 'scraper_pic.movie.banner', label: 'banner' }, { key: 'scraper_pic.movie.thumb', label: 'thumb' }
  ] },
  { group: '电视剧图片', items: [
    { key: 'scraper_pic.tv.poster', label: 'poster' }, { key: 'scraper_pic.tv.backdrop', label: 'fanart' },
    { key: 'scraper_pic.tv.background', label: 'show' }, { key: 'scraper_pic.tv.logo', label: 'logo' },
    { key: 'scraper_pic.tv.clearart', label: 'clearart' }, { key: 'scraper_pic.tv.banner', label: 'banner' }, { key: 'scraper_pic.tv.thumb', label: 'thumb' }
  ] },
  { group: '电视剧-季图片', items: [
    { key: 'scraper_pic.tv.season_poster', label: 'poster' }, { key: 'scraper_pic.tv.season_banner', label: 'banner' }, { key: 'scraper_pic.tv.season_thumb', label: 'thumb' }
  ] },
  { group: '电视剧-集图片', items: [{ key: 'scraper_pic.tv.episode_thumb', label: 'thumb' }] }
]
const SCRAPER_KEYS = [...SCRAPER_NFO, ...SCRAPER_PIC].flatMap((s) => s.items.map((i) => i.key))
const SELECT_OPTIONS = {
  logtype: [{ value: 'console', label: '控制台' }, { value: 'file', label: '文件' }, { value: 'server', label: '日志中心' }],
  loglevel: [{ value: 'info', label: 'INFO' }, { value: 'debug', label: 'DEBUG' }, { value: 'error', label: 'ERROR' }],
  wallpaper: [{ value: 'themoviedb', label: '电影海报' }, { value: 'bing', label: 'Bing每日壁纸' }],
  tmdbDomain: [{ value: 'api.themoviedb.org', label: 'api.themoviedb.org' }, { value: 'api.tmdb.org', label: 'api.tmdb.org' }],
  matchMode: [{ value: 'normal', label: '正常模式' }, { value: 'strict', label: '严格模式' }],
  downloadOrder: [{ value: '', label: '默认' }, { value: 'site', label: '站点优先' }, { value: 'seeder', label: '做种数优先' }]
}

const SYSTEM_FIELDS: SettingField[] = [
  { key: 'app.logtype', label: '日志输出类型', kind: 'select', options: SELECT_OPTIONS.logtype, help: '选择日志输出位置。' },
  { key: 'app.logpath', label: '日志文件路径', placeholder: '/config/logs', help: '日志输出类型为文件时需要配置。' },
  { key: 'app.logserver', label: '日志中心地址', placeholder: '127.0.0.1:514', help: '日志中心地址和端口。' },
  { key: 'app.loglevel', label: '日志级别', kind: 'select', options: SELECT_OPTIONS.loglevel, help: '一般使用 INFO，排查问题时可使用 DEBUG。' },
  { key: 'app.wallpaper', label: 'WEB壁纸来源', kind: 'select', options: SELECT_OPTIONS.wallpaper, help: '登录界面壁纸来源。' },
  { key: 'app.web_port', label: 'WEB服务端口', placeholder: '3000' },
  { key: 'app.login_user', label: 'WEB管理用户', placeholder: 'admin' },
  { key: 'app.login_password', label: 'WEB管理密码', type: 'password', placeholder: 'password' },
  { key: 'app.ssl_cert', label: 'HTTPS证书文件路径', placeholder: 'pem格式证书' },
  { key: 'app.ssl_key', label: 'HTTPS密钥文件路径' },
  { key: 'app.proxies', label: '代理服务器', placeholder: '127.0.0.1:7890', help: '支持 Http、socks5、socks5h 协议。' },
  { key: 'app.domain', label: '外网访问地址', placeholder: 'http://IP:PORT' },
  { key: 'app.user_agent', label: 'User-Agent', placeholder: 'Mozilla/5.0 ...' }
]
const MEDIA_FIELDS: SettingField[] = [
  { key: 'app.rmt_tmdbkey', label: 'TMDB API Key', placeholder: '支持多个 key，用 ; 分隔', help: '需要在 themoviedb.org 申请 API Key。' },
  { key: 'app.tmdb_domain', label: 'TMDB域名', kind: 'select', options: SELECT_OPTIONS.tmdbDomain },
  { key: 'app.rmt_match_mode', label: 'TMDB匹配模式', kind: 'select', options: SELECT_OPTIONS.matchMode },
  { key: 'media.category', label: '二级分类策略', placeholder: 'default-category' },
  { key: 'pt.rmt_mode', label: '默认文件转移方式', kind: 'select', options: RMT_MODES },
  { key: 'media.min_filesize', label: '转移最小文件大小(MB)', placeholder: '200' },
  { key: 'media.ignored_paths', label: '文件路径转移忽略词', placeholder: '正则表达式，;分隔' },
  { key: 'media.ignored_files', label: '文件名转移忽略词', placeholder: '正则表达式，;分隔' },
  { key: 'pt.download_order', label: '下载优先规则', kind: 'select', options: SELECT_OPTIONS.downloadOrder },
  { key: 'media.movie_name_format', label: '电影重命名格式', placeholder: '{title} ({year})/{title}-{part} ({year}) - {videoFormat}' },
  { key: 'media.tv_name_format', label: '电视剧重命名格式', placeholder: '{title} ({year})/Season {season}/{title}-{part} - {season_episode}' },
  { key: 'media.filesize_cover', label: '高质量文件覆盖', kind: 'toggle', help: '更高质量的同名文件会覆盖媒体库文件。' },
  { key: 'media.refresh_mediaserver', label: '实时刷新媒体库', kind: 'toggle', help: '转移完成后刷新 Emby、Jellyfin 或 Plex。' },
  { key: 'media.nfo_poster', label: '刮削元数据及图片', kind: 'toggle', help: '自动生成 nfo 描述文件及图片。' }
]
const SERVICE_FIELDS: SettingField[] = [
  { key: 'pt.ptsignin_cron', label: '站点签到时间', placeholder: '留空关闭自动签到' },
  { key: 'pt.pt_check_interval', label: '订阅RSS周期(秒)', placeholder: '留空关闭RSS订阅' },
  { key: 'pt.search_rss_interval', label: '订阅搜索周期(小时)', placeholder: '留空关闭订阅定时搜索' },
  { key: 'media.mediasync_interval', label: '媒体库同步周期(小时)', placeholder: '留空关闭媒体库同步' },
  { key: 'pt.pt_monitor', label: '下载软件监控', kind: 'toggle' },
  { key: 'pt.pt_monitor_only', label: '只管理NAStool下载', kind: 'toggle' },
  { key: 'pt.search_auto', label: '远程搜索自动择优下载', kind: 'toggle' },
  { key: 'pt.search_no_result_rss', label: '远程下载不完整自动订阅', kind: 'toggle' }
]
const SECURITY_FIELDS: SettingField[] = [
  { key: 'security.media_server_webhook_allow_ip.ipv4', label: '媒体服务器Webhook源IPv4', placeholder: '允许的IPv4 CIDR' },
  { key: 'security.media_server_webhook_allow_ip.ipv6', label: '媒体服务器Webhook源IPv6', placeholder: '允许的IPv6 CIDR' },
  { key: 'security.telegram_webhook_allow_ip.ipv4', label: 'Telegram源IPv4', placeholder: '允许的IPv4 CIDR' },
  { key: 'security.telegram_webhook_allow_ip.ipv6', label: 'Telegram源IPv6', placeholder: '允许的IPv6 CIDR' },
  { key: 'security.synology_webhook_allow_ip.ipv4', label: 'Synology Chat源IPv4', placeholder: '允许的IPv4 CIDR' },
  { key: 'security.synology_webhook_allow_ip.ipv6', label: 'Synology Chat源IPv6', placeholder: '允许的IPv6 CIDR' },
  { key: 'security.api_key', label: 'API密钥' }
]
const LAB_FIELDS: SettingField[] = [
  { key: 'laboratory.search_keyword', label: '辅助识别', kind: 'toggle' },
  { key: 'laboratory.search_tmdbweb', label: '增强识别', kind: 'toggle' },
  { key: 'laboratory.tmdb_cache_expire', label: 'TMDB缓存过期策略', kind: 'toggle' },
  { key: 'laboratory.use_douban_titles', label: '使用豆瓣名称联想', kind: 'toggle' },
  { key: 'laboratory.search_en_title', label: '搜索优先使用英文名', kind: 'toggle' },
  { key: 'laboratory.tmdb_proxy', label: '使用TMDB代理服务', kind: 'toggle' }
]

const SETTING_DESCRIPTIONS: Record<string, string> = {
  'app.web_port': 'WEB 界面监听的端口，修改后需要重新启动服务。',
  'app.login_user': '登录 WEB 管理界面时使用的用户名。',
  'app.login_password': '登录 WEB 管理界面时使用的密码。',
  'app.ssl_cert': '启用 HTTPS 时填写证书文件的绝对路径。',
  'app.ssl_key': '启用 HTTPS 时填写私钥文件的绝对路径。',
  'app.domain': '对外访问地址，用于生成回调或媒体链接。',
  'app.user_agent': '访问外部站点时使用的请求标识，通常保持默认即可。',
  'app.tmdb_domain': '选择访问 TMDB API 的域名，网络受限时可切换。',
  'app.rmt_match_mode': '控制媒体名称匹配的宽松程度，严格模式可减少误匹配。',
  'media.category': '按媒体类型或来源生成二级分类目录，留空使用默认策略。',
  'pt.rmt_mode': '未单独指定转移方式时，媒体文件默认采用的方式。',
  'media.min_filesize': '小于该大小的文件不会自动转移，单位为 MB。',
  'media.ignored_paths': '路径中匹配这些规则的文件不会参与转移，多个规则用分号分隔。',
  'media.ignored_files': '文件名匹配这些规则的文件不会参与转移，多个规则用分号分隔。',
  'pt.download_order': '同一媒体有多个候选资源时，用于决定优先下载的规则。',
  'media.movie_name_format': '电影整理后的目录和文件名格式，可使用标题、年份、制作组等变量。',
  'media.tv_name_format': '电视剧整理后的目录和文件名格式，可使用季集等变量。',
  'pt.ptsignin_cron': '按 Cron 时间执行站点签到，留空表示关闭自动签到。',
  'pt.pt_check_interval': '检查 RSS 订阅的间隔，单位为秒；留空表示关闭。',
  'pt.search_rss_interval': '执行订阅搜索的间隔，单位为小时；留空表示关闭。',
  'media.mediasync_interval': '同步媒体服务器媒体库的间隔，单位为小时；留空表示关闭。',
  'pt.pt_monitor': '定时读取下载软件任务，并处理已完成的下载。',
  'pt.pt_monitor_only': '开启后只管理由 NAStool 创建或管理的下载任务。',
  'pt.search_auto': '远程搜索返回多个资源时，自动选择符合规则的最佳资源。',
  'pt.search_no_result_rss': '远程搜索不完整时，自动创建 RSS 订阅等待后续资源。',
  'security.media_server_webhook_allow_ip.ipv4': '允许访问媒体服务器 Webhook 的 IPv4 网段，支持 CIDR。',
  'security.media_server_webhook_allow_ip.ipv6': '允许访问媒体服务器 Webhook 的 IPv6 网段，支持 CIDR。',
  'security.telegram_webhook_allow_ip.ipv4': '允许访问 Telegram Webhook 的 IPv4 网段，支持 CIDR。',
  'security.telegram_webhook_allow_ip.ipv6': '允许访问 Telegram Webhook 的 IPv6 网段，支持 CIDR。',
  'security.synology_webhook_allow_ip.ipv4': '允许访问 Synology Chat Webhook 的 IPv4 网段，支持 CIDR。',
  'security.synology_webhook_allow_ip.ipv6': '允许访问 Synology Chat Webhook 的 IPv6 网段，支持 CIDR。',
  'security.api_key': '外部 API 调用使用的密钥，请妥善保管并避免分享。',
  'laboratory.search_keyword': '使用文件名中的关键词辅助查找媒体信息。',
  'laboratory.search_tmdbweb': '在 API 匹配失败时，尝试通过 TMDB 网页结果增强识别。',
  'laboratory.tmdb_cache_expire': '启用 TMDB 缓存过期处理，避免长期使用过期结果。',
  'laboratory.use_douban_titles': '使用豆瓣标题作为额外名称，提高中文名称匹配率。',
  'laboratory.search_en_title': '搜索时优先尝试英文标题，适合英文资源名较多的场景。',
  'laboratory.tmdb_proxy': '通过配置的代理访问 TMDB，适用于直连不稳定的网络。'
}

function fieldHelp(field: SettingField) {
  return field.help || SETTING_DESCRIPTIONS[field.key] || ''
}

const scraperVisible = ref(false)
const scraperTab = ref('nfo')
const scriptVisible = ref(false)
const scriptTab = ref('css')
const scriptForm = reactive({ css: '', javascript: '' })
const scriptLoading = ref(false)
const scriptSaving = ref(false)
const releaseGroupsVisible = ref(false)
const releaseGroups = ref('')

function getCfg(path: string): unknown {
  let cur: unknown = config.value
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur
}

function syncForm() {
  const str = (path: string, def = ''): string => {
    const value = getCfg(path)
    return value === undefined || value === null ? def : String(value)
  }
  const sw = (path: string): boolean => !!getCfg(path)
  SYSTEM_KEYS.forEach((key) => {
    if (key === 'app.proxies') {
      const proxies = getCfg('app.proxies') as { http?: string } | undefined
      let value = proxies?.http || ''
      if (value.startsWith('http://')) value = value.replace('http://', '')
      form[key] = value
    } else form[key] = str(key)
  })
  form['app.logtype'] = str('app.logtype', 'console')
  form['app.wallpaper'] = str('app.wallpaper', 'themoviedb')
  form['app.loglevel'] = str('app.loglevel', 'info')
  form['app.tmdb_domain'] = str('app.tmdb_domain', 'api.themoviedb.org')
  MEDIA_KEYS.forEach((key) => { if (typeof form[key] === 'undefined') form[key] = str(key) })
  form['pt.rmt_mode'] = str('pt.rmt_mode', 'copy')
  form['app.rmt_match_mode'] = str('app.rmt_match_mode', 'normal')
  form['media.filesize_cover'] = sw('media.filesize_cover')
  form['media.refresh_mediaserver'] = sw('media.refresh_mediaserver')
  form['media.nfo_poster'] = sw('media.nfo_poster')
  SERVICE_KEYS.forEach((key) => { form[key] = str(key) })
  form['pt.pt_monitor'] = sw('pt.pt_monitor')
  form['pt.pt_monitor_only'] = sw('pt.pt_monitor_only')
  form['pt.search_auto'] = sw('pt.search_auto')
  form['pt.search_no_result_rss'] = sw('pt.search_no_result_rss')
  SECURITY_KEYS.forEach((key) => { form[key] = str(key) })
  form['pt.download_order'] = str('pt.download_order', '')
  LAB_KEYS.forEach((key) => { form[key] = sw(key) })
  SCRAPER_KEYS.forEach((key) => { form[key] = sw(key) })
  releaseGroups.value = str('laboratory.release_groups')
}

function setValue(key: string, value: unknown) {
  form[key] = value
}

function setBoolean(key: string, value: boolean | null) {
  form[key] = Boolean(value)
}

async function loadData() {
  await load()
  syncForm()
}

async function saveSection(keys: string[]) {
  const items: Record<string, unknown> = {}
  keys.forEach((key) => { items[key] = form[key] })
  await save(items)
}

function openScraper() {
  syncForm()
  scraperVisible.value = true
}

async function saveScraper() {
  const ok = await save(SCRAPER_KEYS.reduce((acc, key) => {
    acc[key] = form[key]
    return acc
  }, {} as Record<string, unknown>))
  if (ok) scraperVisible.value = false
}

async function openScript() {
  scriptLoading.value = true
  scriptVisible.value = true
  try {
    const res = await getSystemConfig('CustomScript')
    if (res.code === 0 && res.value) {
      scriptForm.css = (res.value.css as string) || ''
      scriptForm.javascript = (res.value.javascript as string) || ''
    }
  } catch {
    modal.error('加载自定义脚本失败')
  } finally {
    scriptLoading.value = false
  }
}

async function saveScript() {
  scriptSaving.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('save_user_script', { css: scriptForm.css, javascript: scriptForm.javascript })
    if (res.code === 0) {
      modal.success('保存成功')
      scriptVisible.value = false
    } else modal.error(res.msg || '保存失败')
  } finally {
    scriptSaving.value = false
  }
}

function openReleaseGroups() {
  releaseGroups.value = String(form['laboratory.release_groups'] || getCfg('laboratory.release_groups') || '')
  releaseGroupsVisible.value = true
}

async function saveReleaseGroups() {
  const value = releaseGroups.value.replace(/;$/g, '')
  form['laboratory.release_groups'] = value
  const ok = await save({ 'laboratory.release_groups': value })
  if (ok) releaseGroupsVisible.value = false
}

onMounted(loadData)
</script>

<template>
  <div class="basic-view page-shell">
    <PageHeader title="基础设置" description="系统、媒体、服务、安全与实验室配置" />
    <q-card flat bordered class="settings-card">
      <q-tabs v-model="activeTab" active-color="primary" indicator-color="primary" align="left" narrow-indicator scrollable>
        <q-tab name="system" label="系统" />
        <q-tab name="media" label="媒体" />
        <q-tab name="service" label="服务" />
        <q-tab name="security" label="安全" />
        <q-tab name="laboratory" label="实验室" />
      </q-tabs>
      <q-separator />
      <q-tab-panels v-model="activeTab" animated>
        <q-tab-panel v-for="(fields, tab) in { system: SYSTEM_FIELDS, media: MEDIA_FIELDS, service: SERVICE_FIELDS, security: SECURITY_FIELDS, laboratory: LAB_FIELDS }" :key="tab" :name="tab">
          <div class="setting-grid">
            <div v-for="field in fields" :key="field.key" class="setting-field">
              <q-toggle v-if="field.kind === 'toggle'" :model-value="Boolean(form[field.key])" color="primary" :label="field.label" class="toggle-field" @update:model-value="setBoolean(field.key, $event)">
                <HelpTip v-if="fieldHelp(field)" :text="fieldHelp(field)" />
              </q-toggle>
              <q-select v-else-if="field.kind === 'select'" :model-value="String(form[field.key] ?? '')" outlined dense emit-value map-options :label="field.label" :options="field.options" @update:model-value="setValue(field.key, $event)">
                <template #append><HelpTip v-if="fieldHelp(field)" :text="fieldHelp(field)" /></template>
              </q-select>
              <q-input v-else :model-value="String(form[field.key] ?? '')" outlined dense :label="field.label" :type="field.type || 'text'" :placeholder="field.placeholder" @update:model-value="setValue(field.key, $event)">
                <template #append><HelpTip v-if="fieldHelp(field)" :text="fieldHelp(field)" /></template>
              </q-input>
              <div v-if="fieldHelp(field)" class="setting-help">{{ fieldHelp(field) }}</div>
            </div>
          </div>
          <div class="card-footer">
            <template v-if="tab === 'system'"><q-btn outline color="primary" label="自定义 CSS/JavaScript" @click="openScript" /></template>
            <template v-if="tab === 'media'"><q-btn outline color="primary" label="刮削设置" @click="openScraper" /><q-btn outline color="primary" label="自定义制作组/字幕组" @click="openReleaseGroups" /></template>
            <q-btn color="primary" unelevated label="保存" :loading="loading" @click="saveSection(tab === 'system' ? SYSTEM_KEYS : tab === 'media' ? MEDIA_KEYS : tab === 'service' ? SERVICE_KEYS : tab === 'security' ? SECURITY_KEYS : LAB_KEYS)" />
          </div>
        </q-tab-panel>
      </q-tab-panels>
    </q-card>

    <q-dialog v-model="scraperVisible" :maximized="$q.screen.lt.sm" persistent>
      <q-card class="dialog-card scraper-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">刮削设置</div><q-space /><q-btn flat round dense icon="close" @click="scraperVisible = false" /></q-card-section>
        <q-separator />
        <q-tabs v-model="scraperTab" active-color="primary" indicator-color="primary" align="left"><q-tab name="nfo" label="元数据" /><q-tab name="pic" label="图片" /></q-tabs>
        <q-tab-panels v-model="scraperTab" animated><q-tab-panel name="nfo"><div v-for="section in SCRAPER_NFO" :key="section.group" class="scraper-section"><div class="scraper-title">{{ section.group }}</div><q-checkbox v-for="item in section.items" :key="item.key" :model-value="Boolean(form[item.key])" :label="item.label" @update:model-value="setBoolean(item.key, $event)" /></div></q-tab-panel><q-tab-panel name="pic"><div v-for="section in SCRAPER_PIC" :key="section.group" class="scraper-section"><div class="scraper-title">{{ section.group }}</div><q-checkbox v-for="item in section.items" :key="item.key" :model-value="Boolean(form[item.key])" :label="item.label" @update:model-value="setBoolean(item.key, $event)" /></div></q-tab-panel></q-tab-panels>
        <q-separator /><q-card-actions align="right"><q-btn flat label="取消" @click="scraperVisible = false" /><q-btn color="primary" label="保存" @click="saveScraper" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="scriptVisible" :maximized="$q.screen.lt.sm" persistent>
      <q-card class="dialog-card script-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">自定义 CSS/JavaScript</div><q-space /><q-btn flat round dense icon="close" @click="scriptVisible = false" /></q-card-section>
        <q-separator /><q-tabs v-model="scriptTab" active-color="primary" indicator-color="primary" align="left"><q-tab name="css" label="CSS" /><q-tab name="js" label="JavaScript" /></q-tabs>
        <q-tab-panels v-model="scriptTab" animated><q-tab-panel name="css"><q-input v-model="scriptForm.css" type="textarea" outlined autogrow :loading="scriptLoading" placeholder="/* 自定义CSS */" /></q-tab-panel><q-tab-panel name="js"><q-input v-model="scriptForm.javascript" type="textarea" outlined autogrow :loading="scriptLoading" placeholder="// 自定义JavaScript" /></q-tab-panel></q-tab-panels>
        <q-separator /><q-card-actions align="right"><q-btn flat label="取消" @click="scriptVisible = false" /><q-btn color="primary" label="保存" :loading="scriptSaving" @click="saveScript" /></q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="releaseGroupsVisible" :maximized="$q.screen.lt.sm">
      <q-card class="dialog-card release-dialog">
        <q-card-section class="row items-center no-wrap"><div class="text-h6">自定义制作组/字幕组 <HelpTip text="多个制作组/字幕组请用 ; 分隔，支持正则表达式。" /></div><q-space /><q-btn flat round dense icon="close" @click="releaseGroupsVisible = false" /></q-card-section>
        <q-card-section><q-input v-model="releaseGroups" type="textarea" outlined autogrow :rows="6" placeholder="多个制作组/字幕组用;分隔，支持正则表达式" /></q-card-section>
        <q-card-actions align="right"><q-btn flat label="取消" @click="releaseGroupsVisible = false" /><q-btn color="primary" label="保存" @click="saveReleaseGroups" /></q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.basic-view { padding: 16px; }
.settings-card { overflow: hidden; }
.setting-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.setting-field { min-width: 0; }
.toggle-field { min-height: 42px; align-items: center; }
.setting-help { margin: -8px 8px 0 12px; color: var(--text-secondary); font-size: 12px; line-height: 1.5; }
.card-footer { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border-subtle); padding: 16px 0 0; margin-top: 8px; }
.dialog-card { width: min(92vw, 800px); max-width: none; }
.scraper-dialog { width: min(92vw, 720px); }
.script-dialog { width: min(92vw, 800px); }
.release-dialog { width: min(92vw, 640px); }
.scraper-section { margin-bottom: 18px; }
.scraper-title { font-weight: 600; margin-bottom: 8px; padding-left: 8px; border-left: 3px solid var(--q-primary); }
.scraper-section :deep(.q-checkbox) { margin-right: 16px; min-width: 120px; }
@media (max-width: 700px) {
  .basic-view { padding: 12px; }
  .setting-grid { grid-template-columns: 1fr; gap: 10px; }
  .card-footer { justify-content: stretch; }
  .card-footer .q-btn { flex: 1; min-height: 44px; }
  .dialog-card { width: 100%; min-height: 100dvh; }
}
</style>
