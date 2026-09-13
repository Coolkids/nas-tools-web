<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { doAction } from '@/api'
import { useModalStore } from '@/stores/modal'
import PageHeader from '@/components/PageHeader.vue'
import HelpTip from '@/components/HelpTip.vue'

interface FieldDef {
  id: string
  required?: boolean
  title: string
  tooltip?: string
  type: 'text' | 'password' | 'switch' | 'select'
  placeholder?: string
  default?: string
  options?: Record<string, string>
}
interface ChannelDef {
  id: string
  name: string
  img?: string
  search_type?: boolean
  config: Record<string, FieldDef>
}

const CHANNEL_IMG: Record<string, string> = {
  telegram: 'telegram.png',
  wechat: 'wechat.png',
  serverchan: 'serverchan.png',
  bark: 'bark.webp',
  pushdeer: 'pushdeer.png',
  pushplus: 'pushplus.jpg',
  iyuu: 'iyuu.png',
  slack: 'slack.png',
  gotify: 'gotify.png',
  chanify: 'chanify.png',
  synologychat: 'synologychat.png'
}

function channelImg(id: string): string {
  return CHANNEL_IMG[id] ? `/static/img/${CHANNEL_IMG[id]}` : ''
}
interface MessageClient {
  id: number
  name: string
  type: string
  config: Record<string, unknown>
  switchs: string[]
  interactive: number
  enabled: number
}

const CHANNELS: ChannelDef[] = [
  {
    id: 'telegram', name: 'Telegram', search_type: true,
    config: {
      token: { id: 'telegram_token', required: true, title: 'Bot Token', tooltip: 'telegram机器人的Token，关注BotFather创建机器人', type: 'text' },
      chat_id: { id: 'telegram_chat_id', required: true, title: 'Chat ID', tooltip: '接受消息通知的用户、群组或频道Chat ID，关注@getidsbot获取', type: 'text' },
      user_ids: { id: 'telegram_user_ids', required: false, title: 'User IDs', tooltip: '允许使用交互的用户Chat ID，留空则只允许管理用户使用，关注@getidsbot获取', type: 'text', placeholder: '使用,分隔多个Id' },
      admin_ids: { id: 'telegram_admin_ids', required: false, title: 'Admin IDs', tooltip: '允许使用管理命令的用户Chat ID，关注@getidsbot获取', type: 'text', placeholder: '使用,分隔多个Id' },
      webhook: { id: 'telegram_webhook', required: false, title: 'Webhook', tooltip: 'Telegram机器人消息有两种模式：Webhook或消息轮循；开启后将使用Webhook方式，需要在基础设置中正确配置好外网访问地址，同时受Telegram官方限制，外网访问地址需要设置为以下端口之一：443, 80, 88, 8443，且需要有公网认证的可信SSL证书；关闭后将使用消息轮循方式，使用该方式需要在基础设置->安全处将Telegram ipv4源地址设置为127.0.0.1，如同时使用了内置的SSL证书功能，消息轮循方式可能无法正常使用', type: 'switch' }
    }
  },
  {
    id: 'wechat', name: '微信', search_type: true,
    config: {
      corpid: { id: 'wechat_corpid', required: true, title: '企业ID', tooltip: '每个企业都拥有唯一的corpid，获取此信息可在管理后台“我的企业”－“企业信息”下查看“企业ID”（需要有管理员权限）', type: 'text' },
      corpsecret: { id: 'wechat_corpsecret', required: true, title: '应用Secret', tooltip: '每个应用都拥有唯一的secret，获取此信息可在管理后台“应用与小程序”－“自建”下查看“Secret”（需要有管理员权限）', type: 'text', placeholder: 'Secret' },
      agentid: { id: 'wechat_agentid', required: true, title: '应用ID', tooltip: '每个应用都拥有唯一的agentid，获取此信息可在管理后台“应用与小程序”－“自建”下查看“AgentId”（需要有管理员权限）', type: 'text', placeholder: 'AgentId' },
      default_proxy: { id: 'wechat_default_proxy', required: false, title: '消息推送代理', tooltip: '由于微信官方限制，2022年6月20日后创建的企业微信应用需要有固定的公网IP地址并加入IP白名单后才能发送消息，使用有固定公网IP的代理服务器转发可解决该问题；代理服务器需自行搭建，搭建方法可参考项目主页说明', type: 'text', placeholder: 'https://wechat.nastool.cn' },
      token: { id: 'wechat_token', required: false, title: 'Token', tooltip: '需要交互功能时才需要填写，在微信企业应用管理后台-接收消息设置页面生成，填入完成后重启本应用，然后再在微信页面输入地址确定', type: 'text', placeholder: 'API接收消息Token' },
      encodingAESKey: { id: 'wechat_encodingAESKey', required: false, title: 'EncodingAESKey', tooltip: '需要交互功能时才需要填写，在微信企业应用管理后台-接收消息设置页面生成，填入完成后重启本应用，然后再在微信页面输入地址确定', type: 'text', placeholder: 'API接收消息EncodingAESKey' }
    }
  },
  {
    id: 'serverchan', name: 'Server酱',
    config: {
      sckey: { id: 'serverchan_sckey', required: true, title: 'SCKEY', tooltip: '填写ServerChan的API Key，SCT类型，在https://sct.ftqq.com/中申请', type: 'text', placeholder: 'SCT...' }
    }
  },
  {
    id: 'bark', name: 'Bark',
    config: {
      server: { id: 'bark_server', required: true, title: 'Bark服务器地址', tooltip: '自己搭建Bark服务端请实际配置，否则可使用：https://api.day.app', type: 'text', placeholder: 'https://api.day.app', default: 'https://api.day.app' },
      apikey: { id: 'bark_apikey', required: true, title: 'API Key', tooltip: '在Bark客户端中点击右上角的“...”按钮，选择“生成Bark Key”，然后将生成的KEY填入此处', type: 'text' },
      params: { id: 'bark_params', required: false, title: '附加参数', tooltip: '添加到Bark通知中的附加参数，可用于自定义通知特性', type: 'text', placeholder: 'group=xxx&sound=xxx&url=xxx' }
    }
  },
  {
    id: 'pushdeer', name: 'PushDeer',
    config: {
      server: { id: 'pushdeer_server', required: true, title: 'PushDeer服务器地址', tooltip: '自己搭建pushdeer服务端请实际配置，否则可使用：https://api2.pushdeer.com', type: 'text', placeholder: 'https://api2.pushdeer.com', default: 'https://api2.pushdeer.com' },
      apikey: { id: 'pushdeer_apikey', required: true, title: 'API Key', tooltip: 'pushdeer客户端生成的KEY', type: 'text' }
    }
  },
  {
    id: 'pushplus', name: 'PushPlus',
    config: {
      token: { id: 'pushplus_token', required: true, title: 'Token', tooltip: '在PushPlus官网中申请，申请地址：http://pushplus.plus/', type: 'text' },
      channel: { id: 'pushplus_channel', required: true, title: '推送渠道', tooltip: '使用PushPlus中配置的发送渠道，具体参考pushplus.plus官网文档说明，支持第三方webhook、钉钉、飞书、邮箱等', type: 'select', options: { wechat: '微信', mail: '邮箱', webhook: '第三方Webhook' }, default: 'wechat' },
      topic: { id: 'pushplus_topic', required: false, title: '群组编码', tooltip: 'PushPlus中创建的群组，如未设置可为空', type: 'text' },
      webhook: { id: 'pushplus_webhook', required: false, title: 'Webhook编码', tooltip: 'PushPlus中创建的webhook编码，发送渠道为第三方webhook时需要填入', type: 'text' }
    }
  },
  {
    id: 'iyuu', name: '爱语飞飞',
    config: {
      token: { id: 'iyuumsg_token', required: true, title: '令牌Token', tooltip: '在爱语飞飞官网中申请，申请地址：https://iyuu.cn/', type: 'text', placeholder: '登录https://iyuu.cn获取' }
    }
  },
  {
    id: 'slack', name: 'Slack', search_type: true,
    config: {
      bot_token: { id: 'slack_bot_token', required: true, title: 'Bot User OAuth Token', tooltip: '在Slack中创建应用，获取Bot User OAuth Token', type: 'text', placeholder: 'xoxb-xxxxxxxxxxxx-xxxxxxxxxxxxxxxx' },
      app_token: { id: 'slack_app_token', required: true, title: 'App-Level Token', tooltip: '在Slack中创建应用，获取App-Level Token', type: 'text', placeholder: 'xapp-xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx' },
      channel: { id: 'slack_channel', required: false, title: '频道名称', tooltip: 'Slack中的频道名称，默认为全体；需要将机器人添加到该频道，以接收非交互类的通知消息', type: 'text', placeholder: '全体' }
    }
  },
  {
    id: 'gotify', name: 'Gotify',
    config: {
      server: { id: 'gotify_server', required: true, title: 'Gotify服务器地址', tooltip: '自己搭建gotify服务端地址', type: 'text', placeholder: 'http://localhost:8800' },
      token: { id: 'gotify_token', required: true, title: '令牌Token', tooltip: 'Gotify服务端APPS下创建的token', type: 'text' },
      priority: { id: 'gotify_priority', required: false, title: '消息Priority', tooltip: '消息通知优先级，请填写数字(1-8)，默认：8', type: 'text', placeholder: '8' }
    }
  },
  {
    id: 'chanify', name: 'Chanify',
    config: {
      server: { id: 'chanify_server', required: true, title: 'Chanify服务器地址', tooltip: '自己搭建Chanify服务端地址或使用https://api.chanify.net', type: 'text', placeholder: 'https://api.chanify.net', default: 'https://api.chanify.net' },
      token: { id: 'chanify_token', required: true, title: '令牌', tooltip: '在Chanify客户端频道中获取', type: 'text' }
    }
  },
  {
    id: 'synologychat', name: 'Synology Chat', search_type: true,
    config: {
      webhook_url: { id: 'synologychat_webhook_url', required: true, title: '机器人传入URL', tooltip: '在Synology Chat中创建机器人，获取机器人传入URL', type: 'text', placeholder: 'https://xxx/webapi/entry.cgi?api=xxx' },
      token: { id: 'synologychat_token', required: true, title: '令牌', tooltip: '在Synology Chat中创建机器人，获取机器人令牌', type: 'text', placeholder: '' }
    }
  }
]

const SWITCHS = [
  { id: 'download_start', name: '新增下载' },
  { id: 'download_fail', name: '下载失败' },
  { id: 'transfer_finished', name: '入库完成' },
  { id: 'transfer_fail', name: '入库失败' },
  { id: 'rss_added', name: '新增订阅' },
  { id: 'rss_finished', name: '订阅完成' },
  { id: 'site_signin', name: '站点签到' },
  { id: 'site_message', name: '站点消息' },
  { id: 'brushtask_added', name: '刷流下种' },
  { id: 'brushtask_remove', name: '刷流删种' },
  { id: 'mediaserver_message', name: '媒体服务' },
  { id: 'custom_message', name: '自定义消息' }
]

const modal = useModalStore()
const list = ref<MessageClient[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const pushCollapsed = ref(true)
const saving = ref(false)
const testing = ref(false)
const form = reactive({
  cid: '' as string | number,
  name: '',
  type: CHANNELS[0].id,
  enabled: 1,
  interactive: 1,
  switchs: SWITCHS.map((s) => s.id),
  config: {} as Record<string, unknown>
})

const customVisible = ref(false)
const customSending = ref(false)
const customForm = reactive({ title: '', image: '', text: '' })

const currentChannel = computed(() => CHANNELS.find((c) => c.id === form.type) || CHANNELS[0])
const tableColumns = [
  { name: 'type', label: '类型', field: 'type', align: 'left' as const },
  { name: 'name', label: '名称', field: 'name', align: 'left' as const },
  { name: 'switchs', label: '推送内容', field: 'switchs', align: 'left' as const },
  { name: 'interactive', label: '交互', field: 'interactive', align: 'center' as const },
  { name: 'enabled', label: '启用', field: 'enabled', align: 'center' as const },
  { name: 'actions', label: '操作', field: 'actions', align: 'right' as const }
]

onMounted(load)

async function load() {
  loading.value = true
  try {
    const res = await doAction<{ code: number; detail: Record<string, MessageClient> }>('get_message_client', {})
    if (res.code === 0 && res.detail) {
      list.value = Object.values(res.detail)
    }
  } finally {
    loading.value = false
  }
}

function channelName(type: string) {
  return CHANNELS.find((c) => c.id === type)?.name || type
}

function switchNames(switchs: string[]) {
  return switchs.map((s) => SWITCHS.find((sw) => sw.id === s)?.name || s)
}

function resetConfigFields() {
  const cfg: Record<string, unknown> = {}
  for (const [key, f] of Object.entries(currentChannel.value.config)) {
    if (f.type === 'switch') cfg[key] = !!f.default
    else cfg[key] = f.default || ''
  }
  form.config = cfg
}

function openAdd() {
  form.cid = ''
  form.name = ''
  form.type = CHANNELS[0].id
  form.enabled = 1
  form.interactive = 1
  form.switchs = SWITCHS.map((s) => s.id)
  pushCollapsed.value = true
  resetConfigFields()
  dialogVisible.value = true
}

function openEdit(row: MessageClient) {
  form.cid = row.id
  form.name = row.name
  form.type = row.type
  form.enabled = row.enabled
  form.interactive = row.interactive
  form.switchs = row.switchs && row.switchs.length ? [...row.switchs] : SWITCHS.map((s) => s.id)
  const cfg: Record<string, unknown> = {}
  const ch = CHANNELS.find((c) => c.id === row.type)
  if (ch) {
    for (const [key, f] of Object.entries(ch.config)) {
      const v = row.config?.[key]
      if (f.type === 'switch') cfg[key] = !!v
      else cfg[key] = v ?? f.default ?? ''
    }
  }
  form.config = cfg
  pushCollapsed.value = true
  dialogVisible.value = true
}

function onTypeChange() {
  resetConfigFields()
}

function setConfigValue(key: string, value: string | number | boolean | null | undefined) {
  form.config[key] = value ?? ''
}

function buildParams() {
  const configObj: Record<string, unknown> = {}
  for (const [key, f] of Object.entries(currentChannel.value.config)) {
    if (f.type === 'switch') configObj[key] = form.config[key] ? 1 : 0
    else configObj[key] = form.config[key] ?? ''
  }
  return {
    cid: form.cid,
    name: form.name,
    type: form.type,
    config: JSON.stringify(configObj),
    switchs: form.switchs,
    enabled: form.enabled,
    interactive: form.interactive
  }
}

function selectAllSwitchs(flag: boolean) {
  form.switchs = flag ? SWITCHS.map((s) => s.id) : []
}

function invertSwitchs() {
  form.switchs = SWITCHS.filter((s) => !form.switchs.includes(s.id)).map((s) => s.id)
}

function toggleSwitch(id: string) {
  form.switchs = form.switchs.includes(id)
    ? form.switchs.filter((item) => item !== id)
    : [...form.switchs, id]
}

async function submit() {
  if (!form.name) {
    modal.warning('名称不能为空')
    return
  }
  for (const [, f] of Object.entries(currentChannel.value.config)) {
    if (f.required && f.type !== 'switch' && !form.config[f.id.replace(/^[a-z]+_/, '')]) {
      const key = Object.entries(currentChannel.value.config).find(([, v]) => v.id === f.id)?.[0]
      if (key && !form.config[key]) {
        modal.warning(`${f.title}不能为空`)
        return
      }
    }
  }
  saving.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('update_message_client', buildParams())
    if (res.code === 0) {
      dialogVisible.value = false
      modal.success('保存成功')
      load()
    } else {
      modal.error(res.msg || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

async function test() {
  testing.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('test_message_client', buildParams())
    if (res.code === 0) modal.success('测试成功')
    else modal.error('测试失败')
  } finally {
    testing.value = false
  }
}

async function toggle(row: MessageClient, flag: 'interactive' | 'enable', checked: boolean) {
  const res = await doAction<{ code: number }>('check_message_client', {
    flag, cid: row.id, checked, type: row.type
  })
  if (res.code === 0) {
    if (flag === 'interactive') row.interactive = checked ? 1 : 0
    else row.enabled = checked ? 1 : 0
    load()
  }
}

async function remove(row: MessageClient) {
  const ok = await modal.confirm(`确认删除消息服务「${row.name}」？`)
  if (!ok) return
  const res = await doAction<{ code: number }>('delete_message_client', { cid: row.id })
  if (res.code === 0) {
    modal.success('删除成功')
    load()
  }
}

function openCustom() {
  customForm.title = ''
  customForm.image = ''
  customForm.text = ''
  customVisible.value = true
}

async function sendCustom() {
  if (!customForm.title) {
    modal.warning('标题不能为空')
    return
  }
  customSending.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('send_custom_message', {
      title: customForm.title,
      text: customForm.text,
      image: customForm.image
    })
    if (res.code === 0) {
      modal.success('自定义消息已发送')
      customVisible.value = false
    }
  } finally {
    customSending.value = false
  }
}
</script>

<template>
  <div class="notification-view">
    <PageHeader title="消息通知" description="管理消息推送渠道与通知开关"><template #actions><q-btn outline icon="campaign" label="发送自定义消息" @click="openCustom" /><q-btn color="primary" unelevated icon="add" label="新增消息通知" @click="openAdd" /></template></PageHeader>
    <q-card flat bordered class="notification-card"><q-inner-loading :showing="loading"><q-spinner-dots color="primary" size="40px" /></q-inner-loading>
      <q-table v-if="!$q.screen.lt.sm" flat :rows="list" :columns="tableColumns" row-key="id" hide-pagination :rows-per-page-options="[0]" no-data-label="没有消息通知"><template #body-cell-type="slotProps"><q-td :props="slotProps"><span class="type-cell"><img v-if="channelImg(slotProps.row.type)" class="type-icon-img" :src="channelImg(slotProps.row.type)" :alt="channelName(slotProps.row.type)" /><span>{{ channelName(slotProps.row.type) }}</span></span></q-td></template><template #body-cell-switchs="slotProps"><q-td :props="slotProps"><q-badge v-for="name in switchNames(slotProps.row.switchs)" :key="name" outline color="primary" class="switch-tag" :label="name" /></q-td></template><template #body-cell-interactive="slotProps"><q-td :props="slotProps"><q-toggle v-if="CHANNELS.find((channel) => channel.id === slotProps.row.type)?.search_type" :model-value="slotProps.row.interactive === 1" color="primary" @update:model-value="(value) => toggle(slotProps.row, 'interactive', value)" /></q-td></template><template #body-cell-enabled="slotProps"><q-td :props="slotProps"><q-toggle :model-value="slotProps.row.enabled === 1" color="positive" @update:model-value="(value) => toggle(slotProps.row, 'enable', value)" /></q-td></template><template #body-cell-actions="slotProps"><q-td :props="slotProps"><div class="row justify-end q-gutter-xs"><q-btn flat dense color="primary" icon="edit" label="编辑" @click="openEdit(slotProps.row)" /><q-btn flat dense color="negative" icon="delete" label="删除" @click="remove(slotProps.row)" /></div></q-td></template></q-table>
      <div v-else class="notification-mobile-list"><q-card v-for="row in list" :key="row.id" flat bordered class="notification-item"><q-card-section><div class="row items-center no-wrap"><span class="type-cell"><img v-if="channelImg(row.type)" class="type-icon-img" :src="channelImg(row.type)" :alt="channelName(row.type)" /><span class="text-weight-medium">{{ row.name }}</span></span><q-space /><q-badge outline color="primary" :label="channelName(row.type)" /></div><div class="switch-list q-mt-sm"><q-badge v-for="name in switchNames(row.switchs)" :key="name" outline color="primary" :label="name" /></div><div class="row items-center q-gutter-md q-mt-sm"><q-toggle v-if="CHANNELS.find((channel) => channel.id === row.type)?.search_type" :model-value="row.interactive === 1" color="primary" label="交互" @update:model-value="(value) => toggle(row, 'interactive', value)" /><q-toggle :model-value="row.enabled === 1" color="positive" label="启用" @update:model-value="(value) => toggle(row, 'enable', value)" /></div></q-card-section><q-card-actions align="right"><q-btn flat color="primary" icon="edit" label="编辑" @click="openEdit(row)" /><q-btn flat color="negative" icon="delete" label="删除" @click="remove(row)" /></q-card-actions></q-card><div v-if="!loading && !list.length" class="empty-state"><q-icon name="notifications_off" size="42px" color="grey-5" />没有消息通知</div></div>
    </q-card>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent><q-card class="notify-dialog"><q-card-section class="row items-center no-wrap"><div class="text-h6">{{ form.cid ? '编辑消息通知' : '新增消息通知' }}</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="dialogVisible = false" /></q-card-section><q-separator /><q-form @submit.prevent="submit"><q-card-section class="dialog-body"><div class="form-grid"><q-input v-model="form.name" outlined dense label="名称 *" placeholder="别名" /><q-select v-model="form.enabled" outlined dense emit-value map-options label="状态" :options="[{ value: 1, label: '启用' }, { value: 0, label: '停用' }]" /><q-select v-if="currentChannel.search_type" v-model="form.interactive" outlined dense emit-value map-options label="交互" :options="[{ value: 1, label: '是' }, { value: 0, label: '否' }]" /></div><div class="field-title">类型 *</div><div class="channel-grid"><div v-for="channel in CHANNELS" :key="channel.id" class="channel-item" :class="{ active: form.type === channel.id }" role="radio" :aria-checked="form.type === channel.id" tabindex="0" @click="form.type = channel.id; onTypeChange()" @keydown.enter.prevent="form.type = channel.id; onTypeChange()"><img v-if="channelImg(channel.id)" class="channel-icon-img" :src="channelImg(channel.id)" :alt="channel.name" /><span class="channel-name">{{ channel.name }}</span><q-icon v-if="form.type === channel.id" name="check_circle" color="primary" class="channel-check" /></div></div><div class="config-grid"><template v-for="[key, field] in Object.entries(currentChannel.config)" :key="field.id"><q-toggle v-if="field.type === 'switch'" :model-value="Boolean(form.config[key])" color="primary" :label="field.title" class="switch-field" @update:model-value="(value) => setConfigValue(key, value)" /><q-select v-else-if="field.type === 'select'" :model-value="String(form.config[key] ?? field.default ?? '')" outlined dense emit-value map-options :label="`${field.title}${field.required ? ' *' : ''}`" :options="Object.entries(field.options || {}).map(([value, label]) => ({ value, label }))" @update:model-value="(value) => setConfigValue(key, value)"><template #append><HelpTip v-if="field.tooltip" :text="field.tooltip" /></template></q-select><q-input v-else :model-value="String(form.config[key] ?? '')" outlined dense :label="`${field.title}${field.required ? ' *' : ''}`" :type="field.type === 'password' ? 'password' : 'text'" :placeholder="field.placeholder" @update:model-value="(value) => setConfigValue(key, value)"><template #append><HelpTip v-if="field.tooltip" :text="field.tooltip" /></template></q-input></template></div><div class="collapse-head"><q-btn flat dense color="primary" :icon="pushCollapsed ? 'expand_more' : 'expand_less'" label="推送设置" @click="pushCollapsed = !pushCollapsed" /><div class="collapse-actions"><q-btn flat dense color="primary" size="sm" label="全选" @click="selectAllSwitchs(true)" /><q-btn flat dense color="primary" size="sm" label="全不选" @click="selectAllSwitchs(false)" /><q-btn flat dense color="primary" size="sm" label="反选" @click="invertSwitchs" /></div></div><q-slide-transition><div v-show="!pushCollapsed" class="collapse-body"><div class="switch-group"><button v-for="item in SWITCHS" :key="item.id" type="button" class="switch-option" :class="{ active: form.switchs.includes(item.id) }" :aria-pressed="form.switchs.includes(item.id)" @click="toggleSwitch(item.id)"><span>{{ item.name }}</span><q-icon v-if="form.switchs.includes(item.id)" name="check" size="18px" /></button></div></div></q-slide-transition></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat icon="wifi" label="测试" :loading="testing" @click="test" /><q-btn flat label="取消" :disable="saving || testing" @click="dialogVisible = false" /><q-btn color="primary" unelevated label="确定" :loading="saving" type="submit" /></q-card-actions></q-form></q-card></q-dialog>

    <q-dialog v-model="customVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent><q-card class="custom-dialog"><q-card-section class="row items-center no-wrap"><div class="text-h6">发送自定义消息</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="customVisible = false" /></q-card-section><q-separator /><q-form @submit.prevent="sendCustom"><q-card-section class="custom-form"><q-input v-model="customForm.title" outlined dense label="标题 *" /><q-input v-model="customForm.image" outlined dense label="图片" placeholder="URL" /><q-input v-model="customForm.text" outlined label="内容" type="textarea" autogrow /></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" @click="customVisible = false" /><q-btn color="primary" unelevated icon="send" label="发送" :loading="customSending" type="submit" /></q-card-actions></q-form></q-card></q-dialog>
  </div>
</template>

<style scoped>
.notification-card { border-radius: 16px; background: var(--surface); color: var(--text-primary); }.switch-tag { margin: 0 5px 4px 0; }.type-cell { display: inline-flex; align-items: center; gap: 7px; }.type-icon-img { width: 22px; height: 22px; border-radius: 3px; object-fit: contain; }.notification-mobile-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; }.notification-item { border-radius: 12px; background: var(--surface-raised); }.switch-list { display: flex; flex-wrap: wrap; gap: 6px; }.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 52px 0; color: var(--text-secondary); }.notify-dialog, .custom-dialog { width: min(820px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }.custom-dialog { width: min(560px, calc(100vw - 32px)); }.dialog-body { max-height: 66vh; overflow-y: auto; padding: 20px 24px; }.form-grid, .config-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }.field-title { margin: 20px 0 8px; font-size: 13px; font-weight: 600; }.channel-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 10px; }.channel-item { position: relative; display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 64px; overflow: hidden; padding: 9px 10px; border: 1px solid var(--border-subtle); border-radius: 10px; cursor: pointer; transition: border-color .15s, background-color .15s; }.channel-item:hover, .channel-item:focus-visible { border-color: var(--q-primary); outline: none; }.channel-item.active { border-color: var(--q-primary); background: var(--primary-soft); }.channel-icon-img { width: 40px; height: 40px; max-width: 40px; max-height: 40px; flex: 0 0 40px; border-radius: 8px; object-fit: contain; }.channel-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }.channel-check { margin-left: auto; }.config-grid { margin-top: 18px; }.switch-field { min-height: 40px; }.collapse-head { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; padding-top: 8px; border-top: 1px solid var(--border-subtle); }.collapse-actions { display: flex; gap: 2px; }.collapse-body { padding: 8px 0; }.switch-group { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }.switch-option { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 42px; padding: 8px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface); color: var(--text-primary); font: inherit; font-size: 13px; text-align: left; cursor: pointer; transition: border-color .15s, background-color .15s, color .15s, box-shadow .15s; }.switch-option:hover, .switch-option:focus-visible { border-color: var(--q-primary); outline: none; }.switch-option.active { border-color: var(--q-primary); background: var(--primary-soft); color: var(--q-primary); font-weight: 600; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--q-primary), transparent 65%); }.custom-form { display: grid; gap: 14px; }.dialog-actions { gap: 8px; padding: 12px 24px 16px; }
@media (max-width: 800px) { .channel-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }.text-secondary { color: var(--text-secondary); }
@media (max-width: 599px) { .notify-dialog, .custom-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }.dialog-body { max-height: none; padding: 16px; }.form-grid, .config-grid, .channel-grid { grid-template-columns: 1fr; }.channel-item { min-height: 60px; }.channel-icon-img { width: 36px; height: 36px; flex-basis: 36px; }.collapse-head { align-items: flex-start; flex-direction: column; gap: 4px; }.switch-group { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }.switch-option { min-height: 44px; }.dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); }.dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
