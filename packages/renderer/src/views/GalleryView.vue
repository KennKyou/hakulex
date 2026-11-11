<script setup lang="ts">
import type { GalleryData } from '../gallery'
import { computed, inject, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { attachCarouselDrag } from '../carousel-drag'
import { ImageClickKey, imageInfo, isOpenKey } from '../image-click'

const props = defineProps<{ gallery: GalleryData }>()

// One image has nothing to scroll to.
const layout = computed(() => (props.gallery.layout === 'carousel' && props.gallery.images.length < 2
  ? 'grid'
  : props.gallery.layout))

function itemStyle() {
  const { aspect } = props.gallery
  return aspect === 'auto' || layout.value === 'masonry'
    ? undefined
    : {
        aspectRatio: aspect.replace(':', ' / '),
      }
}

function imageStyle() {
  const { aspect, fit, maxItemHeight } = props.gallery
  if (layout.value === 'masonry') {
    return maxItemHeight
      ? { maxHeight: `${maxItemHeight}px`, objectFit: fit }
      : undefined
  }
  return aspect === 'auto'
    ? undefined
    : { objectFit: fit }
}

/* In a RichRenderer given onImageClick, an image opens with the rest of this gallery as its group. */
const clicks = inject(ImageClickKey, null)
const clickable = computed(() => !!clicks?.enabled())

function open(event: Event, at: number) {
  clicks?.openGroup(event.currentTarget as HTMLElement, props.gallery.images.map(image => imageInfo(image)), at)
}

function openWithKey(event: KeyboardEvent, at: number) {
  if (!isOpenKey(event))
    return
  event.preventDefault()
  open(event, at)
}

/* The carousel is a scrolling box, which works without JavaScript too. These only drive it. */
const track = useTemplateRef<HTMLElement>('track')
/** The item at the left edge. */
const index = shallowRef(0)
/** Scrolled to the right end, where the last image shows even when it isn't at the left. */
const atEnd = shallowRef(false)
const last = computed(() => props.gallery.images.length - 1)
const shown = computed(() => (atEnd.value
  ? last.value
  : index.value))

/*
 * More than one at a time: only for a carousel, from a fixed list, so it is safe as a style.
 * Bound only when set: Vue SSR prints `style=""` for an undefined style.
 */
const perView = computed(() => (layout.value === 'carousel' && props.gallery.perView !== 1
  ? props.gallery.perView
  : undefined))

/** From one item to the next: the items' own spacing, or the track's width before layout. */
function stride(element: HTMLElement) {
  const items = element.children as HTMLCollectionOf<HTMLElement>
  const apart = items.length > 1
    ? items[1].offsetLeft - items[0].offsetLeft
    : 0
  return apart > 0
    ? apart
    : element.clientWidth
}

function go(next: number) {
  index.value = Math.max(0, Math.min(last.value, next))
  atEnd.value = index.value === last.value
  if (track.value)
    track.value.scrollTo({ left: index.value * stride(track.value), behavior: 'smooth' })
}

function onScroll() {
  const element = track.value
  if (!element?.clientWidth)
    return
  index.value = Math.max(0, Math.min(last.value, Math.round(element.scrollLeft / stride(element))))
  const end = element.scrollWidth - element.clientWidth
  atEnd.value = index.value === last.value || (end > 0 && element.scrollLeft >= end - 1)
}

let detach: (() => void) | undefined
onMounted(() => {
  if (track.value) {
    detach = attachCarouselDrag(track.value, {
      enabled: () => layout.value === 'carousel',
      settle: () => track.value && go(Math.round(track.value.scrollLeft / stride(track.value))),
    })
  }
})
onBeforeUnmount(() => detach?.())
</script>

<template>
  <div
    class="hlx-gallery"
    :data-layout="layout"
    v-bind="perView ? { 'data-per-view': '', 'style': { '--hlx-gallery-per-view': perView } } : {}"
  >
    <div ref="track" class="hlx-gallery-track" @scroll.passive="onScroll">
      <figure
        v-for="(image, i) in gallery.images"
        :key="i"
        class="hlx-gallery-item"
        :style="itemStyle()"
      >
        <img
          :src="image.src"
          :alt="image.alt"
          :width="image.width"
          :height="image.height"
          :style="imageStyle()"
          loading="lazy"
          draggable="false"
          v-bind="clickable ? { 'class': 'hlx-image-clickable', 'tabindex': 0, 'aria-haspopup': 'dialog' } : {}"
          @click="clickable && open($event, i)"
          @keydown="clickable && openWithKey($event, i)"
        >
      </figure>
    </div>
    <div v-if="layout === 'carousel'" class="hlx-gallery-controls">
      <button type="button" aria-label="上一張" :disabled="shown === 0" @click="go(index - 1)">
        ←
      </button>
      <span class="hlx-gallery-count">{{ shown + 1 }} / {{ gallery.images.length }}</span>
      <button type="button" aria-label="下一張" :disabled="shown === last" @click="go(index + 1)">
        →
      </button>
    </div>
  </div>
</template>
