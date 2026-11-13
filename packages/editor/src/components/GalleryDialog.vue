<script setup lang="ts">
import type { GalleryAspect, GalleryFit, GalleryLayout, GalleryPerView } from '@hakulex/renderer'
import type { ImageData } from '../image/types'
import type { BlockFields } from '../plugins/ContentBlockPlugin'
import { GALLERY_ASPECTS, GALLERY_FITS, GALLERY_LAYOUTS, GALLERY_PER_VIEWS, isSafeImageSrc, normalizeGallery, normalizeMaxItemHeight } from '@hakulex/renderer'
import { computed, inject, onBeforeUnmount, reactive, shallowRef } from 'vue'
import { EditorCoreKey } from '../editor-core-key'
import { resolvePreprocessTargets } from '../image/editor-registry'
import { pickToImages, uploadToImage } from '../image/upload'
import BlockDialog from './BlockDialog.vue'

const props = defineProps<{ initial?: BlockFields }>()
const emit = defineEmits<{ save: [fields: BlockFields, unchanged: boolean], cancel: [] }>()

const core = inject(EditorCoreKey)!
const upload = core.uploadImage()
const pickImages = core.pickImages()
const pickLabel = core.pickImagesLabel()
/** Without it, an image only comes from an upload or the site's own images. */
const allowUrl = core.allowImageUrl()

interface Row {
  id: number
  /** The image as stored, so fields this dialog doesn't know stay. */
  source: Record<string, unknown>
  src: string
  alt: string
}

let nextId = 1
function toRow(source: Record<string, unknown>): Row {
  return {
    id: nextId++,
    source,
    src: typeof source.src === 'string'
      ? source.src
      : '',
    alt: typeof source.alt === 'string'
      ? source.alt
      : '',
  }
}

const stored = Array.isArray(props.initial?.images)
  ? (props.initial.images as unknown[]).filter((image): image is Record<string, unknown> => typeof image === 'object' && image !== null && !Array.isArray(image))
  : []
const settings = normalizeGallery(props.initial ?? {})

// A new gallery starts with a row to type an address in, when there's typing to do.
const rows = reactive<Row[]>(stored.length || !allowUrl
  ? stored.map(toRow)
  : [
      toRow({}),
    ])
const layout = shallowRef<GalleryLayout>(settings.layout)
const aspect = shallowRef<GalleryAspect>(settings.aspect)
const fit = shallowRef<GalleryFit>(settings.fit)
const perView = shallowRef<GalleryPerView>(settings.perView)
const maxItemHeight = shallowRef(settings.maxItemHeight === undefined
  ? ''
  : String(settings.maxItemHeight))
const error = shallowRef<string | null>(null)
const invalid = shallowRef(new Set<number>())
const uploading = shallowRef(0)
const picking = shallowRef(false)

function toStored({ source, src, alt }: Row) {
  const trimmed = src.trim()
  const { alt: _alt, src: _src, ...rest } = source
  // Those describe the old picture.
  if (trimmed !== source.src) {
    delete rest.width
    delete rest.height
    delete rest.thumbhash
    delete rest.fileId
  }
  return {
    src: trimmed,
    ...(alt.trim()
      ? {
          alt: alt.trim(),
        }
      : {}),
    ...rest,
  }
}

function result(): BlockFields {
  return {
    images: rows.filter(row => row.src.trim()).map(toStored),
    layout: layout.value,
    aspect: aspect.value,
    fit: fit.value,
    maxItemHeight: normalizeMaxItemHeight(Number(maxItemHeight.value.trim() || Number.NaN)),
    // One is the default, so it isn't stored; kept as it is while another layout is chosen.
    perView: perView.value === 1
      ? undefined
      : perView.value,
  }
}

const baseline = JSON.stringify(result())
const dirty = computed(() => JSON.stringify(result()) !== baseline)

/* Rows */

function move(index: number, delta: -1 | 1) {
  const moved = rows[index]
  rows[index] = rows[index + delta]
  rows[index + delta] = moved
}

/* Uploads */

let closed = false
let pickAbort: AbortController | null = null
onBeforeUnmount(() => {
  closed = true
  pickAbort?.abort()
})

/** Adds checked images at the end, in place of the blank row there to be filled. */
function append(images: ImageData[]) {
  if (!images.length)
    return
  const blank = rows.length === 1 && !rows[0].src.trim() && !rows[0].alt.trim()
  if (blank)
    rows.splice(0, 1)
  rows.push(...images.map(image => toRow({
    src: image.src,
    ...(image.altText
      ? { alt: image.altText }
      : {}),
    ...(image.width
      ? { width: image.width }
      : {}),
    ...(image.height
      ? { height: image.height }
      : {}),
    // Already checked: only a non-empty string comes through.
    ...(image.fileId
      ? { fileId: image.fileId }
      : {}),
  })))
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [
    ...(input.files ?? []),
  ]
  input.value = ''
  if (!upload)
    return
  const chosen = files.filter(file => file.type.startsWith('image/'))
  error.value = chosen.length < files.length
    ? '只能上傳圖片檔。'
    : null
  // A plugin may look at them first, such as the list of images to insert.
  const images = await resolvePreprocessTargets(chosen, 'gallery', core.imageTools)
  if (closed || !images.length)
    return
  uploading.value += images.length
  const results = await Promise.allSettled(images.map(file => uploadToImage(file, upload)))
  if (closed)
    return
  uploading.value -= images.length
  const added = results.flatMap(item => (item.status === 'fulfilled'
    ? [item.value]
    : []))
  append(added)
  const failed = results.length - added.length
  if (failed)
    error.value = `有 ${failed} 個檔案沒有上傳成功。`
}

/* The site's own images */

async function pick() {
  if (!pickImages || picking.value)
    return
  const controller = new AbortController()
  pickAbort = controller
  picking.value = true
  error.value = null
  const result = await pickToImages(pickImages, {
    purpose: 'gallery',
    multiple: true,
    signal: controller.signal,
  })
  // Closed while choosing: the dialog is gone.
  if (!result)
    return
  pickAbort = null
  picking.value = false
  append(result.images)
  if (result.errors.length)
    error.value = result.errors.join(' ')
}

/* Saving */

function save() {
  if (!dirty.value && props.initial) {
    emit('save', result(), true)
    return
  }
  const unsafe = rows.filter(row => row.src.trim() && !isSafeImageSrc(row.src.trim()))
  invalid.value = new Set(unsafe.map(row => row.id))
  if (unsafe.length) {
    error.value = '有圖片網址無法使用。'
    return
  }
  const fields = result()
  if (!props.initial && !(fields.images as unknown[]).length) {
    error.value = '請加入至少一張圖片。'
    return
  }
  emit('save', fields, false)
}
</script>

<template>
  <BlockDialog
    :title="initial ? '編輯圖庫' : '插入圖庫'"
    description="修改版面和圖片。⌘Enter 儲存。"
    :dirty="dirty"
    :busy="uploading > 0 || picking"
    :away="picking"
    @save="save"
    @cancel="emit('cancel')"
  >
    <div class="hlx-gallery-settings">
      <label>
        <span>版面</span>
        <select v-model="layout" data-field="layout">
          <option v-for="item in GALLERY_LAYOUTS" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
      <label>
        <span>比例</span>
        <select v-model="aspect" data-field="aspect" :disabled="layout === 'masonry'">
          <option v-for="item in GALLERY_ASPECTS" :key="item" :value="item">
            {{ item === 'auto' ? '原始' : item }}
          </option>
        </select>
      </label>
      <label>
        <span>裁切</span>
        <select v-model="fit" data-field="fit">
          <option v-for="item in GALLERY_FITS" :key="item.value" :value="item.value">
            {{ item.label }}
          </option>
        </select>
      </label>
      <label>
        <span>一次顯示</span>
        <select v-model="perView" data-field="perView" :disabled="layout !== 'carousel'">
          <option v-for="item in GALLERY_PER_VIEWS" :key="item" :value="item">
            {{ item }} 張
          </option>
        </select>
      </label>
      <label>
        <span>最大高度</span>
        <input
          v-model="maxItemHeight"
          data-field="maxItemHeight"
          inputmode="numeric"
          placeholder="不限"
          autocomplete="off"
          :disabled="layout !== 'masonry'"
        >
      </label>
    </div>
    <ol class="hlx-gallery-rows">
      <li v-for="(row, index) in rows" :key="row.id" class="hlx-gallery-row">
        <input
          v-model="row.src"
          data-field="src"
          inputmode="url"
          placeholder="圖片網址"
          :aria-label="`第 ${index + 1} 張的網址`"
          :aria-invalid="invalid.has(row.id) || undefined"
          :readonly="!allowUrl"
          autocomplete="off"
          spellcheck="false"
        >
        <input
          v-model="row.alt"
          data-field="alt"
          placeholder="替代文字"
          :aria-label="`第 ${index + 1} 張的替代文字`"
          autocomplete="off"
        >
        <button type="button" aria-label="上移" title="上移" :disabled="index === 0" @click="move(index, -1)">
          ↑
        </button>
        <button type="button" aria-label="下移" title="下移" :disabled="index === rows.length - 1" @click="move(index, 1)">
          ↓
        </button>
        <button type="button" aria-label="刪除圖片" title="刪除圖片" @click="rows.splice(index, 1)">
          ×
        </button>
      </li>
    </ol>
    <div class="hlx-gallery-add">
      <button v-if="allowUrl" type="button" @click="rows.push(toRow({}))">
        新增圖片
      </button>
      <label v-if="upload" class="hlx-gallery-upload">
        <span>上傳圖片</span>
        <input type="file" accept="image/*" multiple @change="onFiles">
      </label>
      <button
        v-if="pickImages"
        type="button"
        data-pick
        data-return-focus
        :disabled="picking"
        @click="pick"
      >
        {{ pickLabel }}
      </button>
    </div>
    <p v-if="error" class="hlx-block-dialog-error" role="alert">
      {{ error }}
    </p>
    <template #status>
      <span v-if="picking" role="status">選擇圖片中…</span>
      <span v-else-if="uploading" role="status">上傳 {{ uploading }} 個檔案中…</span>
      <span v-else>{{ rows.filter(row => row.src.trim()).length }} 張圖片</span>
    </template>
  </BlockDialog>
</template>
