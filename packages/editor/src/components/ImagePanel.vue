<script setup lang="ts">
import type { ImageData, UploadImage } from '../image/types'
import { isSafeImageSrc, normalizeImageLayout, normalizeImageSize } from '@hakulex/renderer'
import { inject, onBeforeUnmount, shallowRef } from 'vue'
import { EditorCoreKey } from '../editor-core-key'
import { resolvePreprocessTargets } from '../image/editor-registry'
import { probeImageSize } from '../image/probe'
import { ImageUploadError, uploadToImage } from '../image/upload'

/*
 * An image's fields, beside it. Text goes in as it is typed; an address only when it is
 * entered, once it has loaded and its size is known.
 */

const props = defineProps<{ data: ImageData, upload?: UploadImage }>()
const emit = defineEmits<{ write: [patch: Partial<ImageData>, field?: string], endTyping: [] }>()
const tools = inject(EditorCoreKey, null)?.imageTools ?? null

const src = shallowRef(props.data.src)
const altText = shallowRef(props.data.altText)
const caption = shallowRef(props.data.caption ?? '')
const displayWidth = shallowRef(String(props.data.displayWidth ?? ''))
const layout = shallowRef<string>(normalizeImageLayout(props.data.layout) ?? '')
const busy = shallowRef<'uploading' | 'checking' | null>(null)
const error = shallowRef<{ field: string, message: string } | null>(null)
// Bumped on every new address, file and close, so a result from an abandoned one is ignored.
let attempt = 0
onBeforeUnmount(() => attempt++)

const invalid = (name: string) => error.value?.field === name || undefined

function onAlt() {
  error.value = null
  emit('write', { altText: altText.value }, 'alt')
}
function onAltDone() {
  emit('write', {
    altText: altText.value.trim(),
  }, 'alt')
}

function onCaption() {
  error.value = null
  emit('write', { caption: caption.value }, 'caption')
}

function onWidth() {
  const value = displayWidth.value.trim()
  const percent = Number(value)
  if (value && !(percent >= 10 && percent <= 100)) {
    error.value = { field: 'displayWidth', message: '顯示寬度要在 10 到 100 之間。' }
    return
  }
  error.value = null
  emit('write', {
    displayWidth: value
      ? Math.round(percent)
      : undefined,
  }, 'displayWidth')
}

function onLayout() {
  error.value = null
  emit('write', { layout: layout.value || undefined })
}

async function onSrc() {
  const typed = src.value.trim()
  if (typed === props.data.src) {
    error.value = null
    return
  }
  const id = ++attempt
  if (!isSafeImageSrc(typed)) {
    busy.value = null
    error.value = {
      field: 'src',
      message: typed ? '這個網址無法使用。' : '請輸入圖片網址。',
    }
    return
  }
  error.value = null
  busy.value = 'checking'
  try {
    const size = await probeImageSize(typed)
    if (id !== attempt)
      return
    busy.value = null
    emit('write', {
      src: typed,
      width: normalizeImageSize(size.width),
      height: normalizeImageSize(size.height),
    })
  }
  catch {
    if (id !== attempt)
      return
    busy.value = null
    error.value = { field: 'src', message: '無法載入這張圖片。' }
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  const chosen = input.files?.[0]
  input.value = ''
  if (!chosen || !props.upload)
    return
  const id = ++attempt
  if (!chosen.type.startsWith('image/')) {
    busy.value = null
    error.value = { field: 'file', message: '請選擇圖片檔。' }
    return
  }
  error.value = null
  // A plugin may look at it first, such as the list of images to insert.
  const [file] = await resolvePreprocessTargets([chosen], 'replace', tools)
  if (id !== attempt || !file)
    return
  busy.value = 'uploading'
  try {
    const image = await uploadToImage(file, props.upload)
    if (id !== attempt)
      return
    busy.value = null
    src.value = image.src
    emit('write', {
      src: image.src,
      width: image.width,
      height: image.height,
      altText: props.data.altText || image.altText,
      fileId: image.fileId,
    })
  }
  catch (cause) {
    if (id !== attempt)
      return
    busy.value = null
    error.value = {
      field: 'file',
      message: cause instanceof ImageUploadError
        ? cause.message
        : String(cause),
    }
  }
}
</script>

<template>
  <label class="hlx-chart-field">
    <span>圖片網址</span>
    <input
      v-model="src"
      name="src"
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="https://example.com/image.png"
      :aria-invalid="invalid('src')"
      @change="onSrc"
      @keydown.enter.prevent="onSrc"
    >
  </label>
  <!-- A button in the panel's look; the browser's own file input stays out of sight. -->
  <label v-if="upload" class="hlx-chart-wide-button hlx-block-panel-file" :data-disabled="busy ? '' : undefined">
    <input type="file" class="hlx-visually-hidden" accept="image/*" :disabled="!!busy" @change="onFile">
    選擇檔案替換…
  </label>
  <label class="hlx-chart-field">
    <span>替代文字</span>
    <input
      v-model="altText"
      name="alt"
      type="text"
      autocomplete="off"
      placeholder="描述這張圖片，給看不到圖片的讀者"
      @input="onAlt"
      @change="onAltDone"
      @focusout="emit('endTyping')"
    >
  </label>
  <label class="hlx-chart-field">
    <span>圖說</span>
    <input
      v-model="caption"
      name="caption"
      type="text"
      autocomplete="off"
      placeholder="顯示在圖片下方，可留空"
      @input="onCaption"
      @focusout="emit('endTyping')"
    >
  </label>
  <div class="hlx-chart-form-pair">
    <label>
      <span>顯示寬度（%）</span>
      <input
        v-model="displayWidth"
        name="displayWidth"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="原始大小"
        :aria-invalid="invalid('displayWidth')"
        @input="onWidth"
        @focusout="emit('endTyping')"
      >
    </label>
    <label>
      <span>版面</span>
      <select v-model="layout" name="layout" @change="onLayout">
        <option value="">
          預設
        </option>
        <option value="float-left">
          靠左，文字繞排
        </option>
        <option value="float-right">
          靠右，文字繞排
        </option>
      </select>
    </label>
  </div>
  <p v-if="error" class="hlx-block-panel-error" role="alert">
    {{ error.message }}
  </p>
  <p v-else-if="busy" class="hlx-block-panel-status" role="status">
    {{ busy === 'uploading' ? '上傳中…' : '載入圖片中…' }}
  </p>
</template>
