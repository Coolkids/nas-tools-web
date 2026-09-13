<script setup lang="ts">
import { api as viewerApi } from 'v-viewer'
import type Viewer from 'viewerjs'
import { computed, nextTick, onBeforeUnmount, watch } from 'vue'

type ViewerWithRoot = Viewer & { viewer?: HTMLElement }
type PreviewMode = 'fit' | 'original'

const props = withDefaults(defineProps<{
  modelValue: boolean
  src?: string
  previewSrc?: string
  alt?: string
}>(), {
  src: '',
  previewSrc: '',
  alt: '图片预览'
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

let previewMode: PreviewMode = 'fit'
let activeViewer: ViewerWithRoot | null = null

function originalImageUrl(url: string) {
  return url.replace(/\/t\/p\/(?:w\d+|h\d+)(?=\/)/, '/t/p/original')
}

const originalSrc = computed(() => props.previewSrc || originalImageUrl(props.src))

function viewerRoot() {
  return activeViewer?.viewer
}

function syncModeButton() {
  const root = viewerRoot()
  if (!root) return
  root.querySelector('.viewer-fit-screen')?.classList.toggle('viewer-mode-active', previewMode === 'fit')
  root.querySelector('.viewer-original-size')?.classList.toggle('viewer-mode-active', previewMode === 'original')
}

function setPreviewMode(mode: PreviewMode) {
  previewMode = mode
  if (activeViewer) {
    if (mode === 'fit') activeViewer.reset()
    else activeViewer.zoomTo(1, true)
    syncModeButton()
  }
}

function createViewer() {
  if (!props.src || !props.modelValue || activeViewer) return

  previewMode = 'fit'
  const viewer = viewerApi({
    images: [{
      src: props.src,
      alt: props.alt,
      'data-source': originalSrc.value || props.src
    }],
    options: {
      className: 'nas-image-viewer',
      initialCoverage: 0.9,
      keyboard: true,
      navbar: false,
      navigation: false,
      title: true,
      toolbar: {
        fitScreen: { show: true, size: 'large', click: () => setPreviewMode('fit') },
        originalSize: { show: true, size: 'large', click: () => setPreviewMode('original') },
        zoomIn: true,
        zoomOut: true,
        reset: { show: true, click: () => setPreviewMode('fit') },
        oneToOne: false,
        prev: false,
        play: false,
        next: false,
        rotateLeft: false,
        rotateRight: false,
        flipHorizontal: false,
        flipVertical: false
      },
      url: 'data-source',
      movable: true,
      zoomable: true,
      zoomOnGesture: true,
      zoomOnTouch: true,
      zoomOnWheel: true,
      slideOnTouch: false,
      slideOnWheel: false,
      hidden: () => {
        activeViewer = null
        emit('update:modelValue', false)
      }
    }
  }) as ViewerWithRoot

  activeViewer = viewer
  syncModeButton()
}

function closeViewer() {
  activeViewer?.hide()
}

watch(() => props.modelValue, (isVisible) => {
  if (isVisible) {
    void nextTick(() => {
      if (props.modelValue) createViewer()
    })
  } else {
    closeViewer()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  activeViewer?.destroy()
  activeViewer = null
})
</script>

<template>
  <span class="image-preview-anchor" aria-hidden="true" />
</template>

<style>
.image-preview-anchor {
  display: none;
}

.nas-image-viewer .viewer-toolbar > ul > li.viewer-fit-screen,
.nas-image-viewer .viewer-toolbar > ul > li.viewer-original-size {
  width: auto;
  min-width: 58px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  line-height: 30px;
  text-align: center;
}

.nas-image-viewer .viewer-toolbar > ul > li.viewer-fit-screen::before {
  content: '适合屏幕';
  display: block;
  width: auto;
  height: 30px;
  margin: 0 7px;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}

.nas-image-viewer .viewer-toolbar > ul > li.viewer-original-size::before {
  content: '原始分辨率';
  display: block;
  width: auto;
  height: 30px;
  margin: 0 7px;
  color: inherit;
  font-size: inherit;
  line-height: inherit;
}

.nas-image-viewer .viewer-toolbar > ul > li.viewer-mode-active {
  background-color: var(--q-primary, #315bd6);
}

@media (max-width: 599px) {
  .nas-image-viewer .viewer-toolbar > ul {
    max-width: calc(100vw - 24px);
    overflow-x: auto;
  }

  .nas-image-viewer .viewer-toolbar > ul > li.viewer-fit-screen,
  .nas-image-viewer .viewer-toolbar > ul > li.viewer-original-size {
    min-width: 54px;
  }
}
</style>
