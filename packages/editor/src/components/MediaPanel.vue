<script setup lang="ts">
import type { FileData, UploadFile, UploadVideo, VideoData } from '../media/types'
import type { MediaKind } from '../nodes/MediaNodes'
import { fileExtFromName, fileNameFromUrl, isSafeImageSrc, isSafeMediaSrc, normalizeFileName } from '@hakulex/renderer'
import { computed, onBeforeUnmount, shallowRef } from 'vue'
import { MediaUploadError, uploadToFile, uploadToVideo } from '../media/upload'

/*
 * A video's or file's fields, beside it. A name goes in as it is typed; an address only when
 * it is entered, since a half-typed one would have the player load it.
 */

const props = defineProps<{
  kind: MediaKind
  data: VideoData | FileData
  upload?: UploadVideo | UploadFile
}>()
const emit = defineEmits<{ write: [patch: Partial<VideoData & FileData>, field?: string], endTyping: [] }>()

const isVideo = computed(() => props.kind === 'video')
const video = () => props.data as VideoData
const file = () => props.data as FileData

const src = shallowRef(props.data.src)
const poster = shallowRef(isVideo.value
  ? video().poster ?? ''
  : '')
const name = shallowRef(isVideo.value
  ? ''
  : file().name)
const busy = shallowRef(false)
const error = shallowRef<{ field: string, message: string } | null>(null)
// Bumped on every file and on closing, so an upload from an abandoned one is ignored.
let attempt = 0
onBeforeUnmount(() => attempt++)

const invalid = (field: string) => error.value?.field === field || undefined

function onSrc() {
  const typed = src.value.trim()
  if (typed === props.data.src) {
    error.value = null
    return
  }
  if (!isSafeMediaSrc(typed)) {
    error.value = {
      field: 'src',
      message: typed
        ? '這個網址無法使用。'
        : `請輸入${isVideo.value ? '影片' : '檔案'}網址。`,
    }
    return
  }
  error.value = null
  // What was known about the old source doesn't describe the new one.
  emit('write', isVideo.value
    ? { src: typed, width: undefined, height: undefined }
    : { src: typed, size: undefined, mimeType: undefined })
}

function onPoster() {
  const typed = poster.value.trim()
  if (typed && !isSafeImageSrc(typed)) {
    error.value = { field: 'poster', message: '這個封面網址無法使用。' }
    return
  }
  error.value = null
  emit('write', { poster: typed || undefined })
}

function onName() {
  error.value = null
  const shown = normalizeFileName(name.value || fileNameFromUrl(file().src))
  emit('write', {
    name: shown,
    ext: fileExtFromName(shown),
  }, 'name')
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0]
  input.value = ''
  if (!chosen || !props.upload)
    return
  const id = ++attempt
  if (isVideo.value && !chosen.type.startsWith('video/')) {
    busy.value = false
    error.value = { field: 'file', message: '請選擇影片檔。' }
    return
  }
  error.value = null
  busy.value = true
  try {
    if (isVideo.value) {
      const data = await uploadToVideo(chosen, props.upload as UploadVideo)
      if (id !== attempt)
        return
      src.value = data.src
      emit('write', { ...data, poster: video().poster ?? data.poster })
    }
    else {
      const data = await uploadToFile(chosen, props.upload as UploadFile)
      if (id !== attempt)
        return
      src.value = data.src
      name.value = data.name
      emit('write', { ...data, display: file().display })
    }
    busy.value = false
  }
  catch (cause) {
    if (id !== attempt)
      return
    busy.value = false
    error.value = {
      field: 'file',
      message: cause instanceof MediaUploadError
        ? cause.message
        : String(cause),
    }
  }
}
</script>

<template>
  <label v-if="!isVideo" class="hlx-chart-field">
    <span>顯示名稱</span>
    <input
      v-model="name"
      name="name"
      type="text"
      autocomplete="off"
      placeholder="留空時使用檔案名稱"
      @input="onName"
      @focusout="emit('endTyping')"
    >
  </label>
  <label class="hlx-chart-field">
    <span>{{ isVideo ? '影片' : '檔案' }}網址</span>
    <input
      v-model="src"
      name="src"
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="https://example.com/"
      :aria-invalid="invalid('src')"
      @change="onSrc"
      @keydown.enter.prevent="onSrc"
    >
  </label>
  <label v-if="isVideo" class="hlx-chart-field">
    <span>封面圖片網址</span>
    <input
      v-model="poster"
      name="poster"
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="可留空"
      :aria-invalid="invalid('poster')"
      @change="onPoster"
      @keydown.enter.prevent="onPoster"
    >
  </label>
  <!-- A button in the panel's look; the browser's own file input stays out of sight. -->
  <label v-if="upload" class="hlx-chart-wide-button hlx-block-panel-file" :data-disabled="busy ? '' : undefined">
    <input type="file" class="hlx-visually-hidden" :accept="isVideo ? 'video/*' : undefined" :disabled="busy" @change="onFile">
    選擇檔案替換…
  </label>
  <p v-if="error" class="hlx-block-panel-error" role="alert">
    {{ error.message }}
  </p>
  <p v-else-if="busy" class="hlx-block-panel-status" role="status">
    上傳中…
  </p>
</template>
