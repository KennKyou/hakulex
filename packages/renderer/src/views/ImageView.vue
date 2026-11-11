<script setup lang="ts">
import { computed, h, inject, onBeforeUnmount, watchEffect } from 'vue'
import { ImageClickKey, imageInfo, isOpenKey } from '../image-click'
import { isSafeImageSrc, normalizeCaption, normalizeDisplayWidth, normalizeImageSize } from '../image/src'

const props = defineProps<{
  src: string
  altText?: string
  width?: number
  height?: number
  caption?: string
  displayWidth?: number
}>()

const caption = computed(() => normalizeCaption(props.caption))

/* In a RichRenderer given onImageClick, the image opens; elsewhere, as in the editor, it doesn't. */
const clicks = inject(ImageClickKey, null)
const clickable = computed(() => !!clicks?.enabled() && isSafeImageSrc(props.src))
function info() {
  return imageInfo({
    src: props.src,
    alt: props.altText,
    caption: caption.value,
    width: normalizeImageSize(props.width),
    height: normalizeImageSize(props.height),
  })
}
let element: HTMLElement | null = null
let unregister: (() => void) | undefined
watchEffect(() => {
  unregister?.()
  unregister = clickable.value
    ? clicks!.register({
        element: () => element,
        info,
      })
    : undefined
})
onBeforeUnmount(() => unregister?.())

function open(event: Event) {
  clicks?.openSingle(event.currentTarget as HTMLElement, info())
}

/** The picture itself, with or without a figure around it. */
function Picture() {
  if (!isSafeImageSrc(props.src))
    return h('span', { class: 'hlx-image-invalid' }, props.altText || '無法顯示圖片')
  const attrs: Record<string, unknown> = {
    class: 'hlx-image',
    src: props.src,
    alt: props.altText ?? '',
    width: normalizeImageSize(props.width),
    height: normalizeImageSize(props.height),
    loading: 'lazy',
    decoding: 'async',
  }
  // Only set when needed: Vue SSR prints `style=""` for an undefined style.
  const displayWidth = normalizeDisplayWidth(props.displayWidth)
  if (displayWidth)
    attrs.style = { width: `${displayWidth}%` }
  if (clickable.value) {
    Object.assign(attrs, {
      'class': 'hlx-image hlx-image-clickable',
      'tabindex': 0,
      'aria-haspopup': 'dialog',
      'ref': (el: unknown) => {
        element = el as HTMLElement | null
      },
      'onClick': open,
      'onKeydown': (event: KeyboardEvent) => {
        if (!isOpenKey(event))
          return
        event.preventDefault()
        open(event)
      },
    })
  }
  return h('img', attrs)
}
</script>

<template>
  <figure v-if="caption" class="hlx-image-figure">
    <Picture />
    <figcaption class="hlx-image-caption">
      {{ caption }}
    </figcaption>
  </figure>
  <Picture v-else />
</template>
