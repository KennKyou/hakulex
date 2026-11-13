<script setup lang="ts">
import type { UploadedImage } from '@hakulex/editor'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'

/*
 * Stands in for a site's own media library, which `pickImages` opens over the editor's
 * dialog. A plain dialog of the site's, not the editor's: it takes focus and Esc itself.
 */
const props = defineProps<{ multiple: boolean }>()
const emit = defineEmits<{ done: [images: UploadedImage[]] }>()

interface LibraryImage extends UploadedImage {
  fileId: string
}

const library: LibraryImage[] = [
  {
    src: 'https://picsum.photos/id/1015/800/600',
    width: 800,
    height: 600,
    fileId: 'media-1015',
    altText: '河谷',
  },
  {
    src: 'https://picsum.photos/id/1025/800/600',
    width: 800,
    height: 600,
    fileId: 'media-1025',
    altText: '小狗',
  },
  {
    src: 'https://picsum.photos/id/1035/800/600',
    width: 800,
    height: 600,
    fileId: 'media-1035',
    altText: '瀑布',
  },
  {
    src: 'https://picsum.photos/id/1043/800/600',
    width: 800,
    height: 600,
    fileId: 'media-1043',
    altText: '海岸',
  },
]

const chosen = shallowRef<string[]>([])
const panel = useTemplateRef<HTMLElement>('panel')

function toggle(image: LibraryImage) {
  const has = chosen.value.includes(image.fileId)
  if (!props.multiple) {
    chosen.value = has
      ? []
      : [image.fileId]
    return
  }
  chosen.value = has
    ? chosen.value.filter(id => id !== image.fileId)
    : [...chosen.value, image.fileId]
}

function confirm() {
  emit('done', chosen.value.map(id => library.find(image => image.fileId === id)!))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape')
    emit('done', [])
}

onMounted(() => {
  panel.value?.querySelector<HTMLElement>('button')?.focus()
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div class="site-picker-backdrop" @click.self="emit('done', [])">
      <div ref="panel" class="site-picker" role="dialog" aria-modal="true" aria-label="媒體庫">
        <p class="site-picker-title">
          媒體庫（示範）
        </p>
        <div class="site-picker-grid">
          <button
            v-for="image in library"
            :key="image.fileId"
            type="button"
            class="site-picker-item"
            :aria-pressed="chosen.includes(image.fileId)"
            :aria-label="image.altText"
            @click="toggle(image)"
          >
            <img :src="image.src" alt="">
          </button>
        </div>
        <div class="site-picker-foot">
          <button type="button" class="pg-button" @click="emit('done', [])">
            取消
          </button>
          <button type="button" class="pg-button" :disabled="!chosen.length" @click="confirm">
            選擇 {{ chosen.length || '' }} 張
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.site-picker-backdrop {
  position: fixed;
  z-index: 100;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.3);
}

.site-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(480px, calc(100vw - 32px));
  padding: 16px;
  border-radius: 12px;
  background: var(--doc-bg, #fff);
  color: var(--doc-text, #111);
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.25);
}

.site-picker-title {
  margin: 0;
  font-weight: 600;
}

.site-picker-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.site-picker-item {
  padding: 0;
  overflow: hidden;
  border: 2px solid transparent;
  border-radius: 8px;
  background: none;
  cursor: pointer;
  aspect-ratio: 4 / 3;
}

.site-picker-item[aria-pressed='true'] {
  border-color: #2563eb;
}

.site-picker-item img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.site-picker-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
