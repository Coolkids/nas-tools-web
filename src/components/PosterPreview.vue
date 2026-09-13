<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  src?: string
  alt?: string
  fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down'
}>(), {
  fit: 'cover'
})

const attrs = useAttrs()
const previewVisible = ref(false)
const imageAttrs = computed(() => {
  const { class: _class, style: _style, ...rest } = attrs
  return rest
})

function openPreview() {
  if (props.src) previewVisible.value = true
}
</script>

<template>
  <div class="poster-preview" :class="attrs.class" :style="attrs.style">
    <q-img v-if="src" v-bind="imageAttrs" :src="src" :alt="alt" :fit="fit" class="poster-preview-image" @click.stop="openPreview">
      <template #error>
        <slot name="error" />
      </template>
    </q-img>
    <slot v-else name="empty" />
    <q-dialog v-model="previewVisible">
      <q-card class="poster-preview-dialog">
        <q-img :src="src" fit="contain" class="poster-preview-large" />
        <q-btn class="poster-preview-close" round color="dark" icon="close" aria-label="关闭" @click="previewVisible = false" />
      </q-card>
    </q-dialog>
  </div>
</template>

<style scoped>
.poster-preview { display: block; min-width: 0; }
.poster-preview-image { display: block; width: 100%; height: 100%; cursor: zoom-in; }
.poster-preview-dialog { position: relative; max-width: min(90vw, 720px); background: transparent; box-shadow: none; }
.poster-preview-large { max-height: 85vh; min-width: 240px; }
.poster-preview-close { position: absolute; top: 10px; right: 10px; opacity: .85; }
</style>
