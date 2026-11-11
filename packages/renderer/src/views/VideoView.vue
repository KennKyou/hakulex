<script setup lang="ts">
import { computed } from 'vue'
import { isSafeImageSrc, normalizeImageSize } from '../image/src'
import { isSafeMediaSrc } from '../media'

const props = defineProps<{
  src: string
  poster?: string
  width?: number
  height?: number
}>()

const safe = computed(() => isSafeMediaSrc(props.src))
const poster = computed(() => isSafeImageSrc(props.poster)
  ? props.poster
  : undefined)
// Together they give the ratio; one alone says nothing.
const size = computed(() => {
  const width = normalizeImageSize(props.width)
  const height = normalizeImageSize(props.height)
  // The ratio is set outright too: until it plays, a browser sizes the player by its poster.
  return width && height
    ? {
        width,
        height,
        style: { aspectRatio: `${width} / ${height}` },
      }
    : {}
})
</script>

<template>
  <video
    v-if="safe"
    class="hlx-video"
    :class="{ 'hlx-video--unsized': !size.width }"
    :src="src"
    :poster="poster"
    v-bind="size"
    controls
    playsinline
    preload="metadata"
  >
    <a :href="src">下載影片</a>
  </video>
  <span v-else class="hlx-media-invalid">無法播放這部影片</span>
</template>
