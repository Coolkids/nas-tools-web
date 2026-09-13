<script setup lang="ts">
import { computed, ref, useAttrs } from 'vue'
import ImagePreviewDialog from './ImagePreviewDialog.vue'

defineOptions({ inheritAttrs: false })

const props = withDefaults(defineProps<{
  src?: string
  previewSrc?: string
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
    <ImagePreviewDialog v-model="previewVisible" :src="src" :preview-src="previewSrc" :alt="alt" />
  </div>
</template>

<style scoped>
.poster-preview { display: block; min-width: 0; }
.poster-preview-image { display: block; width: 100%; height: 100%; cursor: zoom-in; }
</style>
