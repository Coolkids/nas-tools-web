<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import PageHeader from '@/components/PageHeader.vue'
import { useModalStore } from '@/stores/modal'
import { doAction } from '@/api'

interface UserItem {
  id: number
  name: string
  pris: string[]
}

interface GetUsersResult {
  code: number
  result?: UserItem[]
}

const ALL_PRIS = [
  '我的媒体库',
  '资源搜索',
  '探索',
  '站点管理',
  '订阅管理',
  '下载管理',
  '媒体整理',
  '服务',
  '系统设置'
]

const modal = useModalStore()

const users = ref<UserItem[]>([])
const loading = ref(false)

const dialogVisible = ref(false)
const submitting = ref(false)
const form = reactive({
  name: '',
  password: '',
  pris: ['资源搜索', '探索'] as string[]
})

async function loadUsers() {
  loading.value = true
  try {
    const res = await doAction<GetUsersResult>('get_users', {})
    if (res.code === 0 && Array.isArray(res.result)) {
      users.value = res.result
    }
  } catch {
    modal.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

function openDialog() {
  form.name = ''
  form.password = ''
  form.pris = ['资源搜索', '探索']
  dialogVisible.value = true
}

async function handleAdd() {
  if (!form.name) {
    modal.warning('请输入用户名')
    return
  }
  if (!form.password) {
    modal.warning('请输入密码')
    return
  }
  if (form.pris.length === 0) {
    modal.warning('请选择权限')
    return
  }
  submitting.value = true
  try {
    const res = await doAction<{ code: number; msg?: string }>('user_manager', {
      oper: 'add',
      name: form.name,
      password: form.password,
      pris: form.pris
    })
    if (res.code === 0) {
      modal.success('添加成功')
      dialogVisible.value = false
      await loadUsers()
    } else {
      modal.error(res.msg || '添加失败')
    }
  } catch {
    modal.error('添加失败')
  } finally {
    submitting.value = false
  }
}

async function handleDelete(name: string) {
  const ok = await modal.confirm(`确定删除用户 "${name}" ？`)
  if (!ok) return
  try {
    const res = await doAction<{ code: number; msg?: string }>('user_manager', {
      oper: 'del',
      name
    })
    if (res.code === 0) {
      modal.success('删除成功')
      await loadUsers()
    } else {
      modal.error(res.msg || '删除失败')
    }
  } catch {
    modal.error('删除失败')
  }
}

onMounted(loadUsers)

const userColumns = [
  { name: 'name', label: '用户名', field: 'name', align: 'left' as const },
  { name: 'pris', label: '权限', field: 'pris', align: 'left' as const },
  { name: 'actions', label: '操作', field: 'actions', align: 'right' as const }
]
</script>

<template>
  <div class="users-view">
    <PageHeader title="用户管理" description="管理系统用户及访问权限"><template #actions><q-btn color="primary" unelevated icon="person_add" label="新增用户" @click="openDialog" /></template></PageHeader>
    <q-card flat bordered class="users-card"><q-card-section class="row items-center"><span class="text-secondary">共 {{ users.length }} 条记录</span><q-space /><q-spinner-dots v-if="loading" color="primary" /></q-card-section><q-separator />
      <q-table v-if="!$q.screen.lt.sm" flat :rows="users" :columns="userColumns" row-key="id" hide-pagination :rows-per-page-options="[0]" no-data-label="没有数据"><template #body-cell-pris="slotProps"><q-td :props="slotProps"><q-badge v-for="pri in slotProps.row.pris" :key="pri" outline color="primary" class="pri-tag" :label="pri" /></q-td></template><template #body-cell-actions="slotProps"><q-td :props="slotProps"><q-btn flat round dense color="negative" icon="delete_outline" aria-label="删除用户" @click="handleDelete(slotProps.row.name)" /></q-td></template></q-table>
      <div v-else class="user-mobile-list"><q-card v-for="user in users" :key="user.id" flat bordered class="user-item"><q-card-section><div class="row items-center"><div class="text-subtitle2 text-weight-medium">{{ user.name }}</div><q-space /><q-btn flat round dense color="negative" icon="delete_outline" aria-label="删除用户" @click="handleDelete(user.name)" /></div><div class="pri-list q-mt-sm"><q-badge v-for="pri in user.pris" :key="pri" outline color="primary" :label="pri" /></div></q-card-section></q-card><div v-if="!loading && !users.length" class="empty-state"><q-icon name="group_off" size="42px" color="grey-5" />没有数据</div></div>
    </q-card>

    <q-dialog v-model="dialogVisible" :maximized="$q.screen.lt.sm" :full-width="!$q.screen.lt.sm" persistent><q-card class="user-dialog"><q-card-section class="row items-center no-wrap"><div class="text-h6">新增用户</div><q-space /><q-btn flat round dense icon="close" aria-label="关闭" @click="dialogVisible = false" /></q-card-section><q-separator /><q-form @submit.prevent="handleAdd"><q-card-section class="dialog-body"><div class="form-row"><q-input v-model="form.name" outlined dense label="用户名 *" /><q-input v-model="form.password" outlined dense label="密码 *" type="password" /></div><div class="permission-title">权限 *</div><div class="pri-group"><q-checkbox v-for="permission in ALL_PRIS" :key="permission" v-model="form.pris" :val="permission" :label="permission" color="primary" /></div></q-card-section><q-separator /><q-card-actions align="right" class="dialog-actions"><q-btn flat label="取消" :disable="submitting" @click="dialogVisible = false" /><q-btn color="primary" unelevated label="确定" :loading="submitting" type="submit" /></q-card-actions></q-form></q-card></q-dialog>
  </div>
</template>

<style scoped>
.users-card { border-radius: 16px; background: var(--surface); color: var(--text-primary); }.pri-tag { margin: 0 6px 4px 0; }.user-mobile-list { display: flex; flex-direction: column; gap: 10px; padding: 12px; }.user-item { border-radius: 12px; background: var(--surface-raised); }.pri-list { display: flex; flex-wrap: wrap; gap: 6px; }.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 52px 0; color: var(--text-secondary); }.user-dialog { width: min(600px, calc(100vw - 32px)); max-width: none; border-radius: 16px; background: var(--surface); color: var(--text-primary); }.dialog-body { padding: 20px 24px; }.form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.permission-title { margin: 18px 0 8px; font-size: 13px; font-weight: 600; }.pri-group { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }.dialog-actions { gap: 8px; padding: 12px 24px 16px; }@media (max-width: 599px) { .user-dialog { width: 100%; min-height: 100dvh; border-radius: 0; }.dialog-body { padding: 16px; }.form-row, .pri-group { grid-template-columns: 1fr; }.dialog-actions { position: sticky; bottom: 0; padding: 10px 16px calc(10px + var(--safe-bottom)); }.dialog-actions :deep(.q-btn) { min-height: 44px; } }
</style>
