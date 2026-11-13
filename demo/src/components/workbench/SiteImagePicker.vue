<script setup lang="ts">
import type { UploadedImage } from '@hakulex/editor'
import { onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { siteScheme } from '../../site/theme'

/*
 * Stands in for a site's own media library, which `pickImages` opens over the editor's
 * dialog. A plain dialog of the site's, not the editor's: it takes focus and Esc itself.
 * It is put in <body>, outside the site's root, so it says the scheme again for the tokens.
 */
const props = defineProps<{ multiple: boolean }>()
const emit = defineEmits<{ done: [images: UploadedImage[]] }>()

interface LibraryImage extends UploadedImage {
  fileId: string
}

const library: LibraryImage[] = [
  {
    src: 'https://dummyimage.com/800x600/4a6b8a/fff.png?text=River',
    width: 800,
    height: 600,
    fileId: 'media-1015',
    altText: '河谷',
  },
  {
    src: 'https://dummyimage.com/800x600/a0785a/fff.png?text=Dog',
    width: 800,
    height: 600,
    fileId: 'media-1025',
    altText: '小狗',
  },
  {
    src: 'https://dummyimage.com/800x600/3f7f6f/fff.png?text=Waterfall',
    width: 800,
    height: 600,
    fileId: 'media-1035',
    altText: '瀑布',
  },
  {
    src: 'https://dummyimage.com/800x600/2f5f8f/fff.png?text=Coast',
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
    <div
      class="hlx-root site-picker-backdrop"
      :data-color-scheme="siteScheme"
      @click.self="emit('done', [])"
    >
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
  background: var(--hlx-color-scrim);
}

.site-picker {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: min(480px, calc(100vw - 32px));
  box-sizing: border-box;
  padding: 16px;
  border: 1px solid var(--hlx-color-border);
  border-radius: var(--hlx-chrome-radius-lg);
  background: var(--hlx-color-bg-elevated);
  color: var(--hlx-color-text);
  box-shadow: var(--hlx-shadow-modal);
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
  border: 2px solid var(--hlx-color-border-subtle);
  border-radius: var(--hlx-chrome-radius-md);
  background: var(--hlx-color-bg-subtle);
  cursor: pointer;
  aspect-ratio: 4 / 3;
}

.site-picker-item:hover {
  border-color: var(--hlx-color-border);
}

.site-picker-item[aria-pressed='true'] {
  border-color: var(--hlx-color-accent);
  box-shadow: 0 0 0 2px var(--hlx-color-accent-light);
}

.site-picker-item:focus-visible,
.site-picker-foot .pg-button:focus-visible {
  outline: 2px solid var(--hlx-color-accent);
  outline-offset: 2px;
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
