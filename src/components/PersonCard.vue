<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const props = defineProps<{
  personId?: string | number
  image?: string
  name?: string
  role?: string
}>()

const router = useRouter()
const imageFailed = ref(false)
watch(() => props.image, () => { imageFailed.value = false })

function openPerson() {
  if (props.personId) void router.push({ path: '/discovery_person', query: { id: String(props.personId), name: props.name } })
}
</script>

<template>
  <article class="person-card" :aria-label="name || '人物'" tabindex="0" @click="openPerson" @keyup.enter="openPerson">
    <div class="person-image-wrap">
      <q-img v-if="image && !imageFailed" :src="image" :alt="name || '人物头像'" class="person-image" fit="cover" @error="imageFailed = true" />
      <div v-else class="person-placeholder" aria-hidden="true"><q-icon name="person" size="30px" /></div>
    </div>
    <h3 class="person-name">{{ name || '未知人物' }}</h3>
    <div v-if="role" class="person-role">{{ role }}</div>
  </article>
</template>

<style scoped>
.person-card { min-width: 0; padding: 16px 12px; border: 1px solid var(--border-subtle); border-radius: 10px; background: var(--surface); cursor: pointer; text-align: center; transition: transform .18s ease, box-shadow .18s ease; }
.person-card:hover, .person-card:focus-within { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(20, 29, 48, .12); }
.person-image-wrap { width: 80px; height: 80px; margin: 0 auto 12px; overflow: hidden; border-radius: 50%; background: var(--surface-muted); }
.person-image { width: 100%; height: 100%; }
.person-placeholder { display: grid; place-items: center; width: 100%; height: 100%; color: var(--text-secondary); }
.person-name { display: -webkit-box; overflow: hidden; margin: 0 0 4px; color: var(--text-primary); font-size: 14px; line-height: 1.3; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.person-role { display: -webkit-box; overflow: hidden; color: var(--text-secondary); font-size: 12px; line-height: 1.35; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
@media (prefers-reduced-motion: reduce) { .person-card { transition: none; } }
</style>
