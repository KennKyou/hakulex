<script setup lang="ts">
import type { FileData, UploadFile, UploadVideo, VideoData } from '../media/types'
import type { MediaKind } from '../nodes/MediaNodes'
import { fileExtFromName, fileNameFromUrl, isSafeImageSrc, isSafeMediaSrc, normalizeFileName } from '@hakulex/renderer'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { MediaUploadError, uploadToFile, uploadToVideo } from '../media/upload'
import { useEditorTheme } from '../theme-context'

// Only adds: one in the document is edited in the panel beside it.
const props = defineProps<{
  kind: MediaKind
  upload?: UploadVideo | UploadFile
}>()
const emit = defineEmits<{ submit: [data: VideoData | FileData], cancel: [] }>()
const open = defineModel<boolean>('open', { required: true })

const theme = useEditorTheme()
const urlInput = useTemplateRef<HTMLInputElement>('urlInput')
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const isVideo = computed(() => props.kind === 'video')
const noun = computed(() => isVideo.value ? '影片' : '檔案')
const src = shallowRef('')
const poster = shallowRef('')
const name = shallowRef('')
const file = shallowRef<File | null>(null)
const busy = shallowRef(false)
const error = shallowRef<string | null>(null)
// Bumped on every close, so a result from an abandoned attempt is ignored.
let attempt = 0

onBeforeUnmount(() => attempt++)

// A typed URL replaces a chosen file; clear the input so it doesn't show a stale name.
function onUrlInput() {
  file.value = null
  error.value = null
  if (fileInput.value)
    fileInput.value.value = ''
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0] ?? null
  error.value = null
  if (chosen && isVideo.value && !chosen.type.startsWith('video/')) {
    file.value = null
    error.value = '請選擇影片檔。'
    return
  }
  file.value = chosen
  if (chosen)
    src.value = ''
}

function onOpenChange(value: boolean) {
  if (value || !open.value)
    return
  attempt++
  open.value = false
  emit('cancel')
}

/** A typed address: all that is known is the address, and for a file the name to show. */
function fromUrl(typed: string): VideoData | FileData {
  if (isVideo.value) {
    return {
      src: typed,
      poster: poster.value.trim() || undefined,
    }
  }
  const shown = normalizeFileName(name.value || fileNameFromUrl(typed))
  return {
    src: typed,
    name: shown,
    ext: fileExtFromName(shown),
    display: 'block',
  }
}

async function fromUpload(chosen: File): Promise<VideoData | FileData> {
  if (isVideo.value) {
    const data = await uploadToVideo(chosen, props.upload as UploadVideo)
    return { ...data, poster: poster.value.trim() || data.poster }
  }
  const data = await uploadToFile(chosen, props.upload as UploadFile)
  // A name the author typed wins over the file's.
  const typed = name.value.trim()
  const shown = typed
    ? normalizeFileName(typed)
    : data.name
  return {
    ...data,
    name: shown,
    ext: fileExtFromName(shown),
    display: 'block',
  }
}

async function submit() {
  if (busy.value)
    return
  error.value = null
  if (poster.value.trim() && !isSafeImageSrc(poster.value.trim())) {
    error.value = '這個封面網址無法使用。'
    return
  }

  const chosen = props.upload ? file.value : null
  if (!chosen) {
    const typed = src.value.trim()
    if (!isSafeMediaSrc(typed)) {
      error.value = typed
        ? '這個網址無法使用。'
        : `請輸入${noun.value}網址。`
      return
    }
    open.value = false
    emit('submit', fromUrl(typed))
    return
  }

  const id = attempt
  busy.value = true
  try {
    const data = await fromUpload(chosen)
    if (id !== attempt)
      return
    open.value = false
    emit('submit', data)
  }
  catch (cause) {
    if (id === attempt) {
      error.value = cause instanceof MediaUploadError
        ? cause.message
        : String(cause)
    }
  }
  finally {
    if (id === attempt)
      busy.value = false
  }
}
</script>

<template>
  <DialogRoot :open="open" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="hlx-dialog-overlay" />
      <DialogContent
        class="hlx-root hlx-dialog hlx-image-dialog hlx-media-dialog"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        @open-auto-focus.prevent="urlInput?.focus()"
        @close-auto-focus.prevent
      >
        <div class="hlx-dialog-head">
          <DialogTitle class="hlx-image-dialog-title">
            插入{{ noun }}
          </DialogTitle>
        </div>
        <DialogDescription class="hlx-visually-hidden">
          輸入{{ noun }}網址或選擇檔案。
        </DialogDescription>
        <form class="hlx-image-form" @submit.prevent="submit">
          <label class="hlx-image-field">
            <span>{{ noun }}網址</span>
            <input
              ref="urlInput"
              v-model="src"
              name="src"
              type="text"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              :disabled="busy"
              placeholder="https://example.com/"
              @input="onUrlInput"
            >
          </label>
          <label v-if="upload" class="hlx-image-field">
            <span>或選擇檔案</span>
            <input
              ref="fileInput"
              type="file"
              :accept="isVideo ? 'video/*' : undefined"
              :disabled="busy"
              @change="onFileChange"
            >
          </label>
          <label v-if="isVideo" class="hlx-image-field">
            <span>封面圖片網址</span>
            <input
              v-model="poster"
              name="poster"
              type="text"
              inputmode="url"
              autocomplete="off"
              spellcheck="false"
              :disabled="busy"
              placeholder="可留空"
            >
          </label>
          <label v-else class="hlx-image-field">
            <span>顯示名稱</span>
            <input
              v-model="name"
              name="name"
              type="text"
              autocomplete="off"
              :disabled="busy"
              placeholder="留空時使用檔案名稱"
            >
          </label>
          <p v-if="error" class="hlx-image-error" role="alert">
            {{ error }}
          </p>
          <p v-else-if="busy" class="hlx-image-status" role="status">
            上傳中…
          </p>
          <div class="hlx-dialog-foot hlx-image-actions">
            <button type="button" class="hlx-math-button" data-cancel @click="onOpenChange(false)">
              取消
            </button>
            <button type="submit" class="hlx-math-button" data-primary :disabled="busy">
              插入
            </button>
          </div>
        </form>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
