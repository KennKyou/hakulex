<script setup lang="ts">
import { computed } from 'vue'
import { fileMetaText, isSafeMediaSrc, normalizeFileDisplay, normalizeFileExt, normalizeFileName, normalizeFileSize, normalizeMimeType } from '../media'

const props = defineProps<{
  src: string
  name?: string
  size?: number
  mimeType?: string
  ext?: string
  display?: string
}>()

const safe = computed(() => isSafeMediaSrc(props.src))
const name = computed(() => normalizeFileName(props.name))
const size = computed(() => normalizeFileSize(props.size))
const mimeType = computed(() => normalizeMimeType(props.mimeType))
const inline = computed(() => normalizeFileDisplay(props.display) === 'inline')
const meta = computed(() => fileMetaText({
  name: name.value,
  size: size.value,
  mimeType: mimeType.value,
  ext: normalizeFileExt(props.ext),
}))
</script>

<template>
  <a
    v-if="safe"
    class="hlx-file"
    :class="{ 'hlx-file--inline': inline }"
    :href="src"
    :download="name"
    rel="noopener noreferrer"
    target="_blank"
    data-hlx-file=""
    :data-size="size"
    :data-mime-type="mimeType"
    :data-display="inline ? 'inline' : undefined"
  >
    <svg class="hlx-file-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" /></svg>
    <span class="hlx-file-name">{{ name }}</span>
    <span v-if="meta && !inline" class="hlx-file-meta">{{ meta }}</span>
  </a>
  <span v-else class="hlx-file hlx-file--invalid" :class="{ 'hlx-file--inline': inline }">
    <span class="hlx-file-name">{{ name }}</span>
    <span class="hlx-file-meta">無法下載</span>
  </span>
</template>
