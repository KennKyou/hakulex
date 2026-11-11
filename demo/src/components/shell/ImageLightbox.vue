<script setup lang="ts">
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue'
import { closeLightbox, lightbox } from '../../site/lightbox'

/* One lightbox for the whole demo: a modal dialog with the image, its caption and where it is. */
const dialog = useTemplateRef<HTMLDialogElement>('dialog')
const index = shallowRef(0)
const images = computed(() => lightbox.value?.images ?? [])
const image = computed(() => images.value[index.value])
const many = computed(() => images.value.length > 1)
const label = computed(() => image.value?.caption || image.value?.alt || '')

watch(lightbox, async (payload, previous) => {
  if (payload) {
    index.value = payload.index
    await nextTick()
    if (!dialog.value?.open)
      dialog.value?.showModal()
    document.documentElement.classList.add('lightbox-open')
  }
  else {
    dialog.value?.close()
    document.documentElement.classList.remove('lightbox-open')
    // Back to the image that opened it, wherever the reader was.
    previous?.target.focus({ preventScroll: true })
  }
})

function go(by: number) {
  const next = index.value + by
  if (next >= 0 && next < images.value.length)
    index.value = next
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowRight')
    go(1)
  else if (event.key === 'ArrowLeft')
    go(-1)
}

/* A click anywhere but the image and the buttons closes it, as on most sites. */
function onClick(event: MouseEvent) {
  if (!(event.target as Element).closest('.lightbox-image, button'))
    closeLightbox()
}
</script>

<template>
  <dialog
    ref="dialog"
    class="lightbox"
    aria-label="圖片"
    @close="closeLightbox"
    @cancel.prevent="closeLightbox"
    @keydown="onKeydown"
    @click="onClick"
  >
    <template v-if="image">
      <div class="lightbox-bar">
        <span v-if="many" class="lightbox-count">{{ index + 1 }} / {{ images.length }}</span>
        <button type="button" class="lightbox-close" aria-label="關閉" @click="closeLightbox">
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div class="lightbox-stage">
        <button v-if="many" type="button" class="lightbox-nav prev" aria-label="上一張" :disabled="index === 0" @click="go(-1)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
        </button>
        <img :key="image.src + index" class="lightbox-image" :src="image.src" :alt="image.alt ?? ''">
        <button v-if="many" type="button" class="lightbox-nav next" aria-label="下一張" :disabled="index === images.length - 1" @click="go(1)">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>
      <p v-if="label" class="lightbox-caption">
        {{ label }}
      </p>
    </template>
  </dialog>
</template>

<style>
html.lightbox-open {
  overflow: hidden;
}

.lightbox {
  width: 100vw;
  max-width: none;
  height: 100dvh;
  max-height: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: #f5f5f5;
}

.lightbox[open] {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

.lightbox::backdrop {
  background: rgb(10 10 10 / 0.94);
}

.lightbox-bar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 16px;
  font-size: 13px;
}

.lightbox-count {
  margin-right: auto;
  color: rgb(255 255 255 / 0.7);
  font-variant-numeric: tabular-nums;
}

.lightbox-stage {
  position: relative;
  display: grid;
  place-items: center;
  min-height: 0;
  padding: 0 64px;
}

.lightbox-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
  box-shadow: 0 12px 40px rgb(0 0 0 / 0.5);
  animation: lightbox-in 160ms ease-out;
}

@keyframes lightbox-in {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
}

.lightbox-caption {
  max-width: 720px;
  margin: 0 auto;
  padding: 14px 16px 20px;
  color: rgb(255 255 255 / 0.8);
  font-size: 14px;
  text-align: center;
}

.lightbox button {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.1);
  color: inherit;
  cursor: pointer;
  transition: background 120ms;
}

.lightbox button:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.2);
}

.lightbox button:disabled {
  opacity: 0.3;
  cursor: default;
}

.lightbox button:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

.lightbox svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lightbox-close {
  width: 36px;
  height: 36px;
}

.lightbox-nav {
  position: absolute;
  top: 50%;
  width: 44px;
  height: 44px;
  transform: translateY(-50%);
}

.lightbox-nav.prev {
  left: 12px;
}

.lightbox-nav.next {
  right: 12px;
}

@media (max-width: 767px) {
  .lightbox-stage {
    padding: 0 8px;
  }

  .lightbox-nav {
    top: auto;
    bottom: 8px;
    transform: none;
    background: rgb(0 0 0 / 0.5);
  }
}
</style>
