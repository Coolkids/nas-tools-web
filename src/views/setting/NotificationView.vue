<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  Plus,
  Edit,
  Delete,
  Promotion,
  Connection,
  ArrowDown
} from '@element-plus/icons-vue'
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
  <div class="notification-view" v-loading="loading">
    <PageHeader title="消息通知" description="管理消息推送渠道与通知开关">
      <template #actions>
        <el-button :icon="Promotion" @click="openCustom">发送自定义消息</el-button>
        <el-button type="primary" :icon="Plus" @click="openAdd">新增消息通知</el-button>
      </template>
    </PageHeader>

    <el-card shadow="never">
      <el-table :data="list" stripe>
        <el-table-column label="类型" width="140">
          <template #default="{ row }">
            <span class="type-cell">
              <img v-if="channelImg(row.type)" class="type-icon-img" :src="channelImg(row.type)" :alt="channelName(row.type)" />
              <span>{{ channelName(row.type) }}</span>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="name" width="140" />
        <el-table-column label="推送内容" min-width="280">
          <template #default="{ row }">
            <el-tag
              v-for="s in switchNames(row.switchs)"
              :key="s"
              size="small"
              type="info"
              class="switch-tag"
            >{{ s }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="交互" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              v-if="CHANNELS.find((c) => c.id === row.type)?.search_type"
              :model-value="row.interactive === 1"
              @change="(v: boolean) => toggle(row, 'interactive', v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="启用" width="80" align="center">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled === 1"
              @change="(v: boolean) => toggle(row, 'enable', v)"
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" align="center">
          <template #default="{ row }">
            <el-button :icon="Edit" link @click="openEdit(row)">编辑</el-button>
            <el-button :icon="Delete" link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="form.cid ? '编辑消息通知' : '新增消息通知'"
      width="820px"
      :close-on-click-modal="false"
    >
      <div class="dialog-body">
        <el-form label-width="160px">
          <el-row :gutter="12">
            <el-col :span="24">
              <el-form-item label="名称" required>
                <el-input v-model="form.name" placeholder="别名" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="状态">
                <el-select v-model="form.enabled" style="width: 100%" :fit-input-width="false">
                  <el-option :value="1" label="启用" />
                  <el-option :value="0" label="停用" />
                </el-select>
              </el-form-item>
            </el-col>
            <el-col :span="12" v-if="currentChannel.search_type">
              <el-form-item label="交互">
                <el-select v-model="form.interactive" style="width: 100%" :fit-input-width="false">
                  <el-option :value="1" label="是" />
                  <el-option :value="0" label="否" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="类型" required>
            <div class="channel-grid">
              <label
                v-for="c in CHANNELS"
                :key="c.id"
                class="channel-item"
                :class="{ active: form.type === c.id }"
              >
                <input
                  class="channel-radio"
                  type="radio"
                  name="channel_type"
                  :value="c.id"
                  v-model="form.type"
                  @change="onTypeChange"
                />
                <img v-if="channelImg(c.id)" class="channel-icon-img" :src="channelImg(c.id)" :alt="c.name" />
                <span class="channel-name">{{ c.name }}</span>
              </label>
            </div>
          </el-form-item>
          <el-row :gutter="12">
            <el-col
              v-for="[key, f] in Object.entries(currentChannel.config)"
              :key="f.id"
              :span="f.type === 'switch' ? 6 : 12"
            >
              <el-form-item :required="f.required">
                <template #label>{{ f.title }}<HelpTip v-if="f.tooltip" :text="f.tooltip" /></template>
                <el-switch v-if="f.type === 'switch'" v-model="form.config[key]" />
                <el-select v-else-if="f.type === 'select'" v-model="form.config[key]" style="width: 100%" :fit-input-width="false">
                  <el-option v-for="(lbl, val) in f.options" :key="val" :value="val" :label="lbl" />
                </el-select>
                <el-input
                  v-else
                  v-model="form.config[key]"
                  :type="f.type === 'password' ? 'password' : 'text'"
                  :show-password="f.type === 'password'"
                  :placeholder="f.placeholder"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <div class="collapse-head">
            <el-button
              class="collapse-toggle"
              link
              size="small"
              :icon="ArrowDown"
              :class="{ open: !pushCollapsed }"
              @click="pushCollapsed = !pushCollapsed"
            >
              推送设置
            </el-button>
            <div class="collapse-actions">
              <el-button link size="small" @click="selectAllSwitchs(true)">全选</el-button>
              <el-button link size="small" @click="selectAllSwitchs(false)">全不选</el-button>
              <el-button link size="small" @click="invertSwitchs">反选</el-button>
            </div>
          </div>
          <el-collapse-transition>
            <div v-show="!pushCollapsed">
              <div class="collapse-body">
                <el-checkbox-group v-model="form.switchs" class="switch-group">
                  <el-checkbox-button v-for="s in SWITCHS" :key="s.id" :value="s.id" border>{{ s.name }}</el-checkbox-button>
                </el-checkbox-group>
              </div>
            </div>
          </el-collapse-transition>
        </el-form>
      </div>
      <template #footer>
        <el-button :icon="Connection" :loading="testing" @click="test">测试</el-button>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="customVisible" title="发送自定义消息" width="560px" :close-on-click-modal="false">
      <el-form label-width="80px">
        <el-form-item label="标题" required>
          <el-input v-model="customForm.title" />
        </el-form-item>
        <el-form-item label="图片">
          <el-input v-model="customForm.image" placeholder="url" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input v-model="customForm.text" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="customVisible = false">取消</el-button>
        <el-button type="primary" :loading="customSending" @click="sendCustom">发送</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.notification-view {
  padding: 16px;
}
.switch-tag {
  margin-right: 4px;
  margin-bottom: 4px;
}
.type-cell {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.type-icon {
  font-size: 16px;
  color: var(--el-color-primary);
}
.type-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
}
.switch-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px 12px;
}
.switch-group :deep(.el-checkbox-button__inner) {
  border-radius: 14px;
}
.channel-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 12px;
}
.channel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 0.15s, background-color 0.15s;
  min-width: 0;
}
.channel-item:hover {
  border-color: var(--el-color-primary);
}
.channel-item.active {
  border-color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
}
.channel-radio {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.channel-icon {
  font-size: 18px;
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.channel-icon-img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 2px;
}
.channel-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.el-form-item :deep(.el-form-item__label) {
  white-space: nowrap;
}
.dialog-body {
  max-height: 60vh;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}
.collapse-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  margin-top: 4px;
  border-top: 1px solid var(--el-border-color-lighter);
}
.collapse-toggle {
  font-size: 13px;
  font-weight: 600;
}
.collapse-toggle :deep(.el-icon) {
  transition: transform 0.2s ease;
}
.collapse-toggle.open :deep(.el-icon) {
  transform: rotate(180deg);
}
.collapse-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.collapse-actions .el-button {
  font-size: 12px;
}
.collapse-body {
  padding: 4px 0 8px;
}
</style>
