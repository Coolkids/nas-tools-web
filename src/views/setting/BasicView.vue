<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'
import { useConfigForm } from '@/composables/useConfigForm'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'
import { getSystemConfig } from '@/api/config'

const { config, loading, load, save } = useConfigForm()
const modal = useModalStore()

const RMT_MODES = [
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
  'security.media_server_webhook_allow_ip.ipv4',
  'security.media_server_webhook_allow_ip.ipv6',
  'security.telegram_webhook_allow_ip.ipv4',
  'security.telegram_webhook_allow_ip.ipv6',
  'security.synology_webhook_allow_ip.ipv4',
  'security.synology_webhook_allow_ip.ipv6',
  'security.api_key'
]
const LAB_KEYS = [
  'laboratory.search_keyword', 'laboratory.search_tmdbweb', 'laboratory.tmdb_cache_expire',
  'laboratory.use_douban_titles', 'laboratory.search_en_title', 'laboratory.tmdb_proxy'
]

const SCRAPER_NFO = [
  { group: '电影', items: [
    { key: 'scraper_nfo.movie.basic', label: '基础信息' },
    { key: 'scraper_nfo.movie.credits', label: '演职人员' },
    { key: 'scraper_nfo.movie.credits_chinese', label: '演职人员中文' }
  ] },
  { group: '电视剧', items: [
    { key: 'scraper_nfo.tv.basic', label: '基础信息' },
    { key: 'scraper_nfo.tv.credits', label: '演职人员' },
    { key: 'scraper_nfo.tv.credits_chinese', label: '演职人员中文' },
    { key: 'scraper_nfo.tv.season_basic', label: '季-基础信息' },
    { key: 'scraper_nfo.tv.episode_basic', label: '集-基础信息' },
    { key: 'scraper_nfo.tv.episode_credits', label: '集-演职人员' }
  ] }
]
const SCRAPER_PIC = [
  { group: '电影图片', items: [
    { key: 'scraper_pic.movie.poster', label: 'poster' },
    { key: 'scraper_pic.movie.backdrop', label: 'fanart' },
    { key: 'scraper_pic.movie.background', label: 'background' },
    { key: 'scraper_pic.movie.logo', label: 'logo' },
    { key: 'scraper_pic.movie.disc', label: 'disc' },
    { key: 'scraper_pic.movie.banner', label: 'banner' },
    { key: 'scraper_pic.movie.thumb', label: 'thumb' }
  ] },
  { group: '电视剧图片', items: [
    { key: 'scraper_pic.tv.poster', label: 'poster' },
    { key: 'scraper_pic.tv.backdrop', label: 'fanart' },
    { key: 'scraper_pic.tv.background', label: 'show' },
    { key: 'scraper_pic.tv.logo', label: 'logo' },
    { key: 'scraper_pic.tv.clearart', label: 'clearart' },
    { key: 'scraper_pic.tv.banner', label: 'banner' },
    { key: 'scraper_pic.tv.thumb', label: 'thumb' }
  ] },
  { group: '电视剧-季图片', items: [
    { key: 'scraper_pic.tv.season_poster', label: 'poster' },
    { key: 'scraper_pic.tv.season_banner', label: 'banner' },
    { key: 'scraper_pic.tv.season_thumb', label: 'thumb' }
  ] },
  { group: '电视剧-集图片', items: [
    { key: 'scraper_pic.tv.episode_thumb', label: 'thumb' }
  ] }
]
const SCRAPER_KEYS = [...SCRAPER_NFO, ...SCRAPER_PIC].flatMap((s) => s.items.map((i) => i.key))

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
  const parts = path.split('.')
  let cur: unknown = config.value
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

function syncForm() {
  const str = (path: string, def = ''): string => {
    const v = getCfg(path)
    return v === undefined || v === null ? def : String(v)
  }
  const sw = (path: string): boolean => !!getCfg(path)

  SYSTEM_KEYS.forEach((k) => {
    if (k === 'app.proxies') {
      const proxies = getCfg('app.proxies') as { http?: string } | undefined
      let p = proxies?.http || ''
      if (p.startsWith('http://')) p = p.replace('http://', '')
      form[k] = p
    } else {
      form[k] = str(k, k === 'app.logtype' ? 'console' : k === 'app.wallpaper' ? 'themoviedb' : k === 'app.tmdb_domain' ? '' : '')
    }
  })
  form['app.logtype'] = str('app.logtype', 'console')
  form['app.wallpaper'] = str('app.wallpaper', 'themoviedb')
  form['app.loglevel'] = str('app.loglevel', 'info')
  form['app.tmdb_domain'] = str('app.tmdb_domain', 'api.themoviedb.org')

  MEDIA_KEYS.forEach((k) => {
    if (typeof form[k] === 'undefined') form[k] = str(k)
  })
  form['pt.rmt_mode'] = str('pt.rmt_mode', 'copy')
  form['app.rmt_match_mode'] = str('app.rmt_match_mode', 'normal')
  form['media.filesize_cover'] = sw('media.filesize_cover')
  form['media.refresh_mediaserver'] = sw('media.refresh_mediaserver')
  form['media.nfo_poster'] = sw('media.nfo_poster')

  SERVICE_KEYS.forEach((k) => (form[k] = str(k)))
  form['pt.pt_monitor'] = sw('pt.pt_monitor')
  form['pt.pt_monitor_only'] = sw('pt.pt_monitor_only')
  form['pt.search_auto'] = sw('pt.search_auto')
  form['pt.search_no_result_rss'] = sw('pt.search_no_result_rss')

  SECURITY_KEYS.forEach((k) => (form[k] = str(k)))
  form['pt.download_order'] = str('pt.download_order', '')

  LAB_KEYS.forEach((k) => {
    if (k.startsWith('laboratory.')) form[k] = sw(k)
  })

  SCRAPER_KEYS.forEach((k) => (form[k] = sw(k)))
  releaseGroups.value = str('laboratory.release_groups')
}

async function loadData() {
  await load()
  syncForm()
}

async function saveSection(keys: string[]) {
  const items: Record<string, unknown> = {}
  keys.forEach((k) => {
    items[k] = form[k]
  })
  await save(items)
}

function openScraper() {
  syncForm()
  scraperVisible.value = true
}

async function saveScraper() {
  const ok = await save(SCRAPER_KEYS.reduce((acc, k) => {
    acc[k] = form[k]
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
    const res = await doAction<{ code: number; msg?: string }>('save_user_script', {
      css: scriptForm.css,
      javascript: scriptForm.javascript
    })
    if (res.code === 0) {
      modal.success('保存成功')
      scriptVisible.value = false
    } else {
      modal.error(res.msg || '保存失败')
    }
  } finally {
    scriptSaving.value = false
  }
}

function openReleaseGroups() {
  releaseGroups.value = String(form['laboratory.release_groups'] || getCfg('laboratory.release_groups') || '')
  releaseGroupsVisible.value = true
}

async function saveReleaseGroups() {
  let val = releaseGroups.value.replace(/;$/g, '')
  form['laboratory.release_groups'] = val
  const ok = await save({ 'laboratory.release_groups': val })
  if (ok) releaseGroupsVisible.value = false
}

onMounted(loadData)
</script>

<template>
  <div class="basic-view" v-loading="loading">
    <PageHeader title="基础设置" description="系统、媒体、服务、安全与实验室配置" />

    <el-tabs v-model="activeTab" class="basic-tabs">
      <el-tab-pane label="系统" name="system">
        <el-card shadow="never">
          <el-form label-width="160px">
            <el-row :gutter="16">
              <el-col :span="6">
                <el-form-item label="日志输出类型" required>
                  <el-select v-model="form['app.logtype']">
                    <el-option value="console" label="控制台" />
                    <el-option value="file" label="文件" />
                    <el-option value="server" label="日志中心" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>日志文件路径<HelpTip text="日志输出类型为文件时需要配置该项" /></template>
                  <el-input v-model="form['app.logpath']" placeholder="/config/logs" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>日志中心地址<HelpTip text="日志输出类型为日志中心时需要配置该项；需要配置IP地址和端口，配置示例：127.0.0.1:514" /></template>
                  <el-input v-model="form['app.logserver']" placeholder="127.0.0.1:514" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>日志级别<HelpTip text="一般情况下请选择INFO，排查问题可选择DEBUG" /></template>
                  <el-select v-model="form['app.loglevel']">
                    <el-option value="info" label="INFO" />
                    <el-option value="debug" label="DEBUG" />
                    <el-option value="error" label="ERROR" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="6">
                <el-form-item>
                  <template #label>WEB壁纸来源<HelpTip text="登录界面壁纸来源：TMDB、Bing，设置为TMDB时需在媒体配置TMDB API Key" /></template>
                  <el-select v-model="form['app.wallpaper']">
                    <el-option value="themoviedb" label="电影海报" />
                    <el-option value="bing" label="Bing每日壁纸" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="WEB服务端口" required>
                  <el-input v-model="form['app.web_port']" placeholder="3000" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="WEB管理用户" required>
                  <el-input v-model="form['app.login_user']" placeholder="admin" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="WEB管理密码" required>
                  <el-input v-model="form['app.login_password']" type="password" show-password placeholder="password" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="6">
                <el-form-item>
                  <template #label>HTTPS证书文件路径<HelpTip text="需要是pem格式的证书文件" /></template>
                  <el-input v-model="form['app.ssl_cert']" placeholder="pem格式证书" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="HTTPS密钥文件路径">
                  <el-input v-model="form['app.ssl_key']" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>代理服务器<HelpTip text="将使用代理访服务器访问themoviedb、telegram、公开bt站等境外网站及程序更新(git)，站点默认不使用代理，如需使用需在站点维护中开启；配置格式示例：127.0.0.1:7890（Http协议）、socks5://127.0.0.1:8018、socks5h://127.0.0.1:8018(remote DNS)" /></template>
                  <el-input v-model="form['app.proxies']" placeholder="127.0.0.1:7890" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>外网访问地址<HelpTip text="使用该地址进行通知点击跳转以及设置Telegram机器人Webhook；需要配置IP地址和端口，如为https则需要加https://前缀；如启用Telegram机器人Webhook，则端口必须为：443, 80, 88, 8443之一，80、443一般运营商会封禁，建议使用88、8443" /></template>
                  <el-input v-model="form['app.domain']" placeholder="http://IP:PORT" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item>
                  <template #label>User-Agent<HelpTip text="如发现被豆瓣、PT站等封堵，请适当修改此项" /></template>
                  <el-input v-model="form['app.user_agent']" placeholder="Mozilla/5.0 ..." />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <div class="card-footer">
            <el-button @click="openScript">自定义 CSS/JavaScript</el-button>
            <el-button type="primary" :loading="loading" @click="saveSection(SYSTEM_KEYS)">保存</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="媒体" name="media">
        <el-card shadow="never">
          <el-form label-width="170px">
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item>
                  <template #label>TMDB API Key<HelpTip text="在themoviedb.org网站申请API Key，该项必须配置，否则所有功能无法正常运行, 支持多个key用;分割" /></template>
                  <el-input v-model="form['app.rmt_tmdbkey']" placeholder="支持多个key用;分隔" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>TMDB域名<HelpTip text="如api.themoviedb.org无法访问可偿试使用api.tmdb.org，如均无法访问，则需要修改host或者使用网络代理" /></template>
                  <el-select v-model="form['app.tmdb_domain']">
                    <el-option value="api.themoviedb.org" label="api.themoviedb.org" />
                    <el-option value="api.tmdb.org" label="api.tmdb.org" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>TMDB匹配模式<HelpTip text="正常模式下会提升识别成功率，但也可能会导致误识别率增加；严格模式可以降低误识别率，但可能导致很多文件名/种子名中年份不正确的无法被识别（特别是剧集，需要是首播年份）" /></template>
                  <el-select v-model="form['app.rmt_match_mode']">
                    <el-option value="normal" label="正常模式" />
                    <el-option value="strict" label="严格模式" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item>
                  <template #label>二级分类策略<HelpTip text="电影/电视剧/动漫是否需要二级分类，启用二级分类后会在电影/电视剧/动漫目录下按二级分类名建立子目录；此处配置分类的策略名，配置文件目录中需要有与策略名同名的.yaml配置文件，默认策略default-category分类设置可参考default-category.yaml；如不需要启动分类，则该项配置为空" /></template>
                  <el-input v-model="form['media.category']" placeholder="default-category" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>默认文件转移方式<HelpTip text="默认使用的文件转移方式，下载器监控转移等场景使用，根据不同的程序版本可选项会有所不同。硬链接模式要求源目录和目的目录或媒体库目录在一个磁盘分区或者存储空间/共享文件夹，Docker运行时需要直接映射源目录和目的目录或媒体库目录的上级目录，否则docker仍然会认为是跨盘；移动模式会直接移动原文件，会影响做种，请谨慎使用；Rclone针对网盘场景，需要自行映射rclone配置目录到容器中（/root/.config/rclone）或在容器内使用rclone config完成rclone配置，网盘配置名称必须为：NASTOOL；Minio针对S3/云原生场景，需要自行在容器内使用mc alias set NASTOOL完成minio配置(alias的名称必须为NASTOOL)，并在minio控制台增加一个名为data的bucket(名称必须为data)" /></template>
                  <el-select v-model="form['pt.rmt_mode']">
                    <el-option v-for="m in RMT_MODES" :key="m.value" :value="m.value" :label="m.label" />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>转移最小文件大小(MB)<HelpTip text="小于该大小的文件将会忽略，不进行转移重命名" /></template>
                  <el-input v-model="form['media.min_filesize']" placeholder="200" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item>
                  <template #label>文件路径转移忽略词<HelpTip text="文件路径包含忽略词的，忽略转移，支持正则表达式，注意特殊字符转义" /></template>
                  <el-input v-model="form['media.ignored_paths']" placeholder="正则表达式，;分隔" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>文件名转移忽略词<HelpTip text="文件名（包括扩展名）包含忽略词的，忽略转移，支持正则表达式，注意特殊字符转义" /></template>
                  <el-input v-model="form['media.ignored_files']" placeholder="正则表达式，;分隔" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>下载优先规则<HelpTip text="订阅及远程搜索下载将按此优先规则选择下载资源，其中站点优先决定于维护的站点优先级或索引器中配置的站点顺序，默认为站点优先" /></template>
                  <el-select v-model="form['pt.download_order']">
                    <el-option value="" label="默认" />
                    <el-option value="site" label="站点优先" />
                    <el-option value="seeder" label="做种数优先" />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="12">
                <el-form-item>
                  <template #label>电影重命名格式<HelpTip text="程序会按定义的命名格式对电影进行重命名；/代表上下级目录，{}内为占位符；占位符会使用文件识别出来的实际值替换；占位符外的字符会当成普通字符，直接体现在名称上。
电影占位符：
{title}：标题
{en_title}：英文标题
{original_title}：原语种标题
{original_name}：原文件名
{year}：年份
{edition}：版本(Bluray/WEB-DL等)
{videoFormat}：分辨率(1080p/4k等)
{videoCodec}：视频编码
{audioCodec}：音频编码及声道
{tmdbid}：TMDB的ID
{part}：part1/disc1/dvd1
{releaseGroup}：制作组/字幕组
{name}：识别名称（文件名中识别出的名称，可用自定义识别词替换）" /></template>
                  <el-input v-model="form['media.movie_name_format']" placeholder="{title} ({year})/{title}-{part} ({year}) - {videoFormat}" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item>
                  <template #label>电视剧重命名格式<HelpTip text="程序会按定义的命名格式对电视剧进行重命名；/代表上下级目录，{}内为占位符；占位符会使用文件识别出来的实际值替换，占位符外的字符会当成普通字符，直接体现在名称上。
电视剧占位符：
{title}：标题
{en_title}：英文标题
{original_title}：原语种标题
{original_name}：原文件名
{year}：年份
{edition}：版本(Bluray/WEB-DL等)
{videoFormat}：分辨率(1080p/4k等)
{videoCodec}：视频编码
{audioCodec}：音频编码及声道
{tmdbid}：TMDB的ID
{season}：季数
{episode}：集数
{episode_title}：集标题
{season_episode}：剧集SxxExx
{part}：part1/disc1/dvd1
{releaseGroup}：制作组/字幕组
{name}：识别名称（文件名中识别出的名称，可用自定义识别词替换）" /></template>
                  <el-input v-model="form['media.tv_name_format']" placeholder="{title} ({year})/Season {season}/{title}-{part} - {season_episode}" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item>
                  <template #label>高质量文件覆盖<HelpTip text="开启后，如下载了更高质量的同名文件时，会覆盖媒体库中已有的文件，否则不会进行转移处理" /></template>
                  <el-switch v-model="form['media.filesize_cover']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>实时刷新媒体库<HelpTip text="开启后，文件转移完成时会实时刷新媒体服务器（Emby/Jellyfin/Plex）的媒体库" /></template>
                  <el-switch v-model="form['media.refresh_mediaserver']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>刮削元数据及图片<HelpTip text="开启后会自动生成nfo描述文件及图片，协助媒体服务器识别和刮削，在刮削设置中自定义刮削内容" /></template>
                  <el-switch v-model="form['media.nfo_poster']" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <div class="card-footer">
            <el-button @click="openScraper">刮削设置</el-button>
            <el-button @click="openReleaseGroups">自定义制作组/字幕组</el-button>
            <el-button type="primary" :loading="loading" @click="saveSection(MEDIA_KEYS)">保存</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="服务" name="service">
        <el-card shadow="never">
          <el-form label-width="170px">
            <el-row :gutter="16">
              <el-col :span="6">
                <el-form-item>
                  <template #label>站点签到时间<HelpTip text="站点自动签到时间，三种配置方法：1、配置间隔，单位小时，比如23.5；2、配置固定时间，如08:00；3、配置时间范围，如08:00-09:00，表示在该时间范围内随机执行一次；配置为空则不启用自动站点签到功能。对于有独立签到页面的站点，可以在站点维护中维护站点地址为签到页面地址实现签到；对于有签到功能但没有独立签到页面的站点，需要在站点维护中开启浏览仿真才能签到；对于没有签到功能的站点仅自动登录一次站点实现保号。" /></template>
                  <el-input v-model="form['pt.ptsignin_cron']" placeholder="留空关闭自动签到" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>订阅RSS周期(秒)<HelpTip text="RSS订阅刷新的时间间隔，需要在订阅管理中设置订阅站点；如配置为空则不启动RSS订阅功能；为了减小站点压力，最小周期不能小于300秒" /></template>
                  <el-input v-model="form['pt.pt_check_interval']" placeholder="留空关闭RSS订阅" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>订阅搜索周期(小时)<HelpTip text="定时对电影/电视剧订阅进行站点存量资源检索下载，用于对RSS订阅进行查漏补缺。以小时为单位，最小间隔为6小时，设置小于6小时时将强制设定为6小时。该项会对站点造成压力，应尽量通过维护站点RSS实现订阅追新，如非必要请不要开启" /></template>
                  <el-input v-model="form['pt.search_rss_interval']" placeholder="留空关闭订阅定时搜索" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>媒体库同步周期(小时)<HelpTip text="定时同步媒体服务器数据到本地，用于展示媒体是否存在，留空则不启用同步服务" /></template>
                  <el-input v-model="form['media.mediasync_interval']" placeholder="留空关闭媒体库同步" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="4">
                <el-form-item>
                  <template #label>下载软件监控<HelpTip text="监控下载软件，下载完成后自动进行文件转移，与目录同步监控下载目录二选一开启" /></template>
                  <el-switch v-model="form['pt.pt_monitor']" />
                </el-form-item>
              </el-col>
              <el-col :span="4">
                <el-form-item>
                  <template #label>只管理NAStool下载<HelpTip text="启用后只有含NASTOOL标签的下载任务才会被自动转移和显示，关闭则下载软件中所有的任务都会转移和显示；仅支持Qbittorrent、Transmission下载器" /></template>
                  <el-switch v-model="form['pt.pt_monitor_only']" />
                </el-form-item>
              </el-col>
              <el-col :span="4">
                <el-form-item>
                  <template #label>远程搜索自动择优下载<HelpTip text="启用后在微信、Telegram发送名称后会自动择优下载，否则需要点击链接跳转后手工选择" /></template>
                  <el-switch v-model="form['pt.search_auto']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label-width="auto">
                  <template #label>远程下载不完整自动订阅<HelpTip text="启用后在微信、Telegram发送名称搜索下载不完整时将自动添加订阅" /></template>
                  <el-switch v-model="form['pt.search_no_result_rss']" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <div class="card-footer">
            <el-button type="primary" :loading="loading" @click="saveSection(SERVICE_KEYS)">保存</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="安全" name="security">
        <el-card shadow="never">
          <el-form label-width="200px">
            <el-row :gutter="16">
              <el-col :span="6">
                <el-form-item label-width="auto">
                  <template #label>媒体服务器Webhook源IPv4<HelpTip text="仅允许配置的地址范围内地址调用Webhook，多个地址段用,号分隔，默认为0.0.0.0/0,::/0即不做限制" /></template>
                  <el-input v-model="form['security.media_server_webhook_allow_ip.ipv4']" placeholder="允许的IPv4 CIDR" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="媒体服务器Webhook源IPv6">
                  <el-input v-model="form['security.media_server_webhook_allow_ip.ipv6']" placeholder="允许的IPv6 CIDR" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>Telegram源IPv4<HelpTip text="仅接收配置的地址范围内发送的Telegram消息，多个地址段用,号分隔，配置为0.0.0.0/0,::/0则不做限制；使用Telegram WebHook且未做代理转发时推荐IPv4地址设置为：149.154.160.0/20,91.108.4.0/22，关闭Telegram WebHook时推荐IPv4地址设置为：127.0.0.1" /></template>
                  <el-input v-model="form['security.telegram_webhook_allow_ip.ipv4']" placeholder="允许的IPv4 CIDR" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="Telegram源IPv6">
                  <el-input v-model="form['security.telegram_webhook_allow_ip.ipv6']" placeholder="允许的IPv6 CIDR" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="6">
                <el-form-item>
                  <template #label>Synology Chat源IPv4<HelpTip text="仅接收配置的地址范围内发送的Synology Chat消息，多个地址段用,号分隔，配置为0.0.0.0/0,::/0则不做限制，为了安全建议按实际情况设置" /></template>
                  <el-input v-model="form['security.synology_webhook_allow_ip.ipv4']" placeholder="允许的IPv4 CIDR" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item label="Synology Chat源IPv6">
                  <el-input v-model="form['security.synology_webhook_allow_ip.ipv6']" placeholder="允许的IPv6 CIDR" />
                </el-form-item>
              </el-col>
              <el-col :span="6">
                <el-form-item>
                  <template #label>API密钥<HelpTip text="使用Jellyseerr、Overseerr等调用本程序订阅接口时，需要在Authorization中填入该密钥" /></template>
                  <el-input v-model="form['security.api_key']" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <div class="card-footer">
            <el-button type="primary" :loading="loading" @click="saveSection(SECURITY_KEYS)">保存</el-button>
          </div>
        </el-card>
      </el-tab-pane>

      <el-tab-pane label="实验室" name="laboratory">
        <el-card shadow="never">
          <el-form label-width="220px">
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item>
                  <template #label>辅助识别<HelpTip text="开启后，无法识别到媒体信息时会尝试猜测和纠正关键词并再次匹配，会大大增加识别耗时，一般情况下不建议开启" /></template>
                  <el-switch v-model="form['laboratory.search_keyword']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>增强识别<HelpTip text="开启后，通过TMDB的API无法识别到媒体信息时，会尝试通过themoviedb.org网站再次搜索匹配，仅个别极端情况下有效，会大大增加识别耗时，一般情况下不建议开启" /></template>
                  <el-switch v-model="form['laboratory.search_tmdbweb']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>TMDB缓存过期策略<HelpTip text="开启TMDB缓存过期策略后，默认7天过期，过期缓存将被删除,  7天内访问过期时间可以被刷新，建议开启" /></template>
                  <el-switch v-model="form['laboratory.tmdb_cache_expire']" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row :gutter="16">
              <el-col :span="8">
                <el-form-item>
                  <template #label>使用豆瓣名称联想<HelpTip text="开启将使用豆瓣进行电影电视剧的名称联想，允许中文名不完整时自动联想，但如豆瓣数据与TMDB不一致时可能会无法搜索；关闭后使用TMDB的数据，对中文支持不友好，但不会有无法搜索的问题" /></template>
                  <el-switch v-model="form['laboratory.use_douban_titles']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>搜索优先使用英文名<HelpTip text="开启后对于精确搜索场景将会优先使用英文名搜索，否则优先使用中文名搜索" /></template>
                  <el-switch v-model="form['laboratory.search_en_title']" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item>
                  <template #label>使用TMDB代理服务<HelpTip text="使用内建的TMDB代理服务器转发媒体识别请求，网络无法连接TMDB时可选择开启" /></template>
                  <el-switch v-model="form['laboratory.tmdb_proxy']" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <div class="card-footer">
            <el-button type="primary" :loading="loading" @click="saveSection(LAB_KEYS)">保存</el-button>
          </div>
        </el-card>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="scraperVisible" title="刮削设置" width="720px" :close-on-click-modal="false">
      <el-tabs v-model="scraperTab">
        <el-tab-pane label="元数据" name="nfo">
          <div v-for="sec in SCRAPER_NFO" :key="sec.group" class="scraper-section">
            <div class="scraper-title">{{ sec.group }}</div>
            <el-checkbox v-for="i in sec.items" :key="i.key" v-model="form[i.key]">{{ i.label }}</el-checkbox>
          </div>
        </el-tab-pane>
        <el-tab-pane label="图片" name="pic">
          <div v-for="sec in SCRAPER_PIC" :key="sec.group" class="scraper-section">
            <div class="scraper-title">{{ sec.group }}</div>
            <el-checkbox v-for="i in sec.items" :key="i.key" v-model="form[i.key]">{{ i.label }}</el-checkbox>
          </div>
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="scraperVisible = false">取消</el-button>
        <el-button type="primary" @click="saveScraper">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="scriptVisible" title="自定义 CSS/JavaScript" width="800px" :close-on-click-modal="false">
      <el-tabs v-model="scriptTab" v-loading="scriptLoading">
        <el-tab-pane label="CSS" name="css">
          <el-input v-model="scriptForm.css" type="textarea" :rows="18" placeholder="/* 自定义CSS */" />
        </el-tab-pane>
        <el-tab-pane label="JavaScript" name="js">
          <el-input v-model="scriptForm.javascript" type="textarea" :rows="18" placeholder="// 自定义JavaScript" />
        </el-tab-pane>
      </el-tabs>
      <template #footer>
        <el-button @click="scriptVisible = false">取消</el-button>
        <el-button type="primary" :loading="scriptSaving" @click="saveScript">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="releaseGroupsVisible" title="自定义制作组/字幕组" width="640px" :close-on-click-modal="false">
      <el-input v-model="releaseGroups" type="textarea" :rows="6" placeholder="多个制作组/字幕组用;分隔，支持正则表达式" />
      <template #footer>
        <el-button @click="releaseGroupsVisible = false">取消</el-button>
        <el-button type="primary" @click="saveReleaseGroups">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.basic-view {
  padding: 16px;
}
.basic-tabs :deep(.el-tabs__content) {
  padding-top: 8px;
}
.card-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
  padding-top: 12px;
  margin-top: 8px;
}
.scraper-section {
  margin-bottom: 16px;
}
.scraper-title {
  font-weight: 600;
  margin-bottom: 8px;
  border-left: 3px solid var(--el-color-primary);
  padding-left: 8px;
}
.scraper-section .el-checkbox {
  margin-right: 16px;
  min-width: 120px;
}
</style>
