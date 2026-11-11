<script setup lang="ts">
import type { FileRow, ImageDialogEntry, ImageDialogMode, ReviewRow } from '../image/dialog-model'
import type { GpsInfo, ImageEditorCapability, ImageEditPrivacy } from '../image/editor-registry'
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { computed, nextTick, onBeforeUnmount, reactive, shallowRef, useTemplateRef, watch } from 'vue'
import {
  blocksInsert,
  finalizeRows,
  formatBytes,
  imageDialogCopy,
  isEditableImage,
  isImageFile,
  isUsableImageUrl,
  markKeepOriginal,
  nextRowId,
  toFileRow,
  urlFileName,
} from '../image/dialog-model'
import { probeImageSize } from '../image/probe'
import { useEditorTheme } from '../theme-context'

/*
 * The two-step image dialog: where the images come from, then the list to check, edit
 * or remove each one. Nothing is uploaded here: the entries go to whoever opened it.
 */
const props = withDefaults(defineProps<{
  mode?: ImageDialogMode
  /** Files to start with, as when pasting: the dialog opens on the list. */
  initialFiles?: File[]
  allowUrl?: boolean
  /** Whether files can be added; without an upload there is nowhere for them to go. */
  canUpload?: boolean
  editor?: ImageEditorCapability | null
  privacy?: ImageEditPrivacy
  allowKeepOriginal?: boolean
}>(), {
  mode: 'insert',
  initialFiles: undefined,
  allowUrl: true,
  canUpload: false,
  editor: null,
  privacy: undefined,
  allowKeepOriginal: false,
})
const emit = defineEmits<{ submit: [entries: ImageDialogEntry[]], cancel: [] }>()

const FORMATS_HINT = 'PNG、JPG、GIF、WebP、AVIF'
const PREVIEW_DELAY_MS = 300

const theme = useEditorTheme()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const content = useTemplateRef<{ $el: HTMLElement }>('content')

function initialRows(): ReviewRow[] {
  const images = (props.initialFiles ?? []).filter(isImageFile)
  return (props.mode === 'replace'
    ? images.slice(0, 1)
    : images).map(toFileRow)
}

const startedWithFiles = (props.initialFiles ?? []).some(isImageFile)
const rows = shallowRef<ReviewRow[]>(initialRows())
const step = shallowRef<'source' | 'review'>(startedWithFiles
  ? 'review'
  : 'source')
const failedIds = shallowRef<string[]>([])
const inserting = shallowRef(false)
const keepOriginal = shallowRef(false)
const confirming = shallowRef(false)
const fileError = shallowRef<string | null>(null)
const dragActive = shallowRef(false)

const copy = computed(() => imageDialogCopy(props.mode, step.value === 'review'
  ? rows.value.length
  : 1))
const dirty = computed(() => rows.value.some(row => row.kind === 'file' && row.current !== row.original)
  || (!startedWithFiles && rows.value.length > 0))
const blocked = computed(() => rows.value.some(row => blocksInsert(row, failedIds.value)))

// ---- What each file looks like: its picture and size, read once per file.

interface FileInfo { url: string, width?: number, height?: number, failed?: boolean }
const infos = reactive(new Map<File, FileInfo>())
const infoOf = (file: File) => infos.get(file)
watch(rows, (current) => {
  if (typeof URL.createObjectURL !== 'function')
    return
  for (const row of current) {
    if (row.kind !== 'file' || infos.has(row.current))
      continue
    const file = row.current
    const url = URL.createObjectURL(file)
    infos.set(file, { url })
    probeImageSize(url).then(
      size => Object.assign(infos.get(file) ?? {}, size),
      () => Object.assign(infos.get(file) ?? {}, { failed: true }),
    )
  }
}, { immediate: true })
onBeforeUnmount(() => {
  for (const info of infos.values())
    URL.revokeObjectURL(info.url)
})

// ---- Location, looked for once per row while the list is open.

const detections = new Map<string, Promise<GpsInfo | null>>()
watch(rows, (current) => {
  const privacy = props.privacy
  if (!privacy)
    return
  for (const row of current) {
    if (row.kind !== 'file' || detections.has(row.id))
      continue
    const detection = privacy.detectGps(row.original).catch(() => null)
    detections.set(row.id, detection)
    void detection.then(gps => updateRow(row.id, { gps }))
  }
}, { immediate: true })

function updateRow(id: string, change: Partial<FileRow>) {
  rows.value = rows.value.map(row => (row.id === id && row.kind === 'file'
    ? {
        ...row,
        ...change,
      }
    : row))
}

// ---- Adding and removing.

function addFiles(files: File[]) {
  const images = files.filter(isImageFile)
  if (!images.length) {
    if (files.length)
      fileError.value = '請選擇圖片檔。'
    return
  }
  fileError.value = null
  failedIds.value = []
  rows.value = props.mode === 'replace'
    ? [
        toFileRow(images[0]),
      ]
    : [
        ...rows.value,
        ...images.map(toFileRow),
      ]
  step.value = 'review'
}

function pickFiles() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles([
    ...(input.files ?? []),
  ])
  input.value = ''
}

function removeRow(id: string) {
  rows.value = rows.value.filter(row => row.id !== id)
  if (rows.value.length)
    return
  if (startedWithFiles)
    emit('cancel')
  else
    step.value = 'source'
}

async function editRow(target: FileRow) {
  const editor = props.editor
  if (!editor)
    return
  const result = await editor.edit(target.current)
  if (!result || result.file === target.current)
    return
  const row = rows.value.find(item => item.id === target.id)
  if (row?.kind !== 'file')
    return
  updateRow(row.id, {
    current: result.file,
    summary: [row.summary, result.summary].filter(Boolean).join(' · '),
  })
}

function rowName(row: ReviewRow) {
  return row.kind === 'file'
    ? row.original.name
    : urlFileName(row.src)
}

function rowMeta(row: FileRow) {
  const edited = row.current !== row.original
  const info = infoOf(row.current)
  const type = row.current.type.replace('image/', '').toUpperCase()
  return [
    edited
      ? row.summary || null
      : null,
    info?.width
      ? `${info.width} × ${info.height}`
      : null,
    formatBytes(row.current.size),
    edited
      ? null
      : type || null,
  ].filter(Boolean).join(' · ')
}

function canEdit(row: FileRow) {
  return !!props.editor && isEditableImage(row.current) && !infoOf(row.current)?.failed
}

// ---- An address, loaded a moment after typing stops.

type UrlState
  = | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'error', message: string }
    | { status: 'loaded', width: number, height: number }
const url = shallowRef('')
/** Enter before the address has loaded adds it once it has. */
let addWhenLoaded = false
const urlState = shallowRef<UrlState>({ status: 'idle' })
let urlTimer: ReturnType<typeof setTimeout> | undefined
let urlAttempt = 0
watch(url, (value) => {
  addWhenLoaded = false
  clearTimeout(urlTimer)
  const id = ++urlAttempt
  const src = value.trim()
  if (!src) {
    urlState.value = { status: 'idle' }
    return
  }
  if (!isUsableImageUrl(src)) {
    urlState.value = { status: 'error', message: '不支援這種網址。' }
    return
  }
  urlState.value = { status: 'loading' }
  urlTimer = setTimeout(() => {
    probeImageSize(src).then(
      (size) => {
        if (id !== urlAttempt)
          return
        urlState.value = { status: 'loaded', ...size }
        if (addWhenLoaded)
          addUrl()
      },
      () => {
        if (id === urlAttempt)
          urlState.value = { status: 'error', message: '無法載入這張圖片。' }
      },
    )
  }, PREVIEW_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(urlTimer))

function onUrlEnter() {
  if (urlState.value.status === 'loading')
    addWhenLoaded = true
  else
    addUrl()
}

function addUrl() {
  const state = urlState.value
  if (state.status !== 'loaded')
    return
  const row: ReviewRow = {
    kind: 'url',
    id: nextRowId(),
    src: url.value.trim(),
    width: state.width,
    height: state.height,
  }
  rows.value = props.mode === 'replace'
    ? [row]
    : [...rows.value, row]
  url.value = ''
  step.value = 'review'
}

// The list takes over: the insert button is next, so Enter inserts.
watch(step, async (value) => {
  if (value !== 'review')
    return
  await nextTick()
  content.value?.$el.querySelector<HTMLElement>('.hlx-image-dialog-foot [data-primary]')?.focus()
})

// ---- Inserting.

async function insert() {
  if (inserting.value || blocked.value || !rows.value.length)
    return
  inserting.value = true
  // A location still being looked for is waited for: a photo mustn't slip through with it.
  const ids = [
    ...detections.keys(),
  ]
  const found = await Promise.all(ids.map(id => detections.get(id)!))
  const known = new Map(ids.map((id, index) => [id, found[index]]))
  const merged = rows.value.map(row => (row.kind === 'file' && known.has(row.id)
    ? { ...row, gps: known.get(row.id) ?? null }
    : row))
  const result = await finalizeRows(merged, props.privacy?.stripGps)
  inserting.value = false
  if (result.failedIds.length) {
    rows.value = merged
    failedIds.value = result.failedIds
    return
  }
  if (keepOriginal.value) {
    for (const entry of result.entries) {
      if (entry.kind === 'file')
        markKeepOriginal(entry.file)
    }
  }
  emit('submit', result.entries)
}

// ---- Leaving.

function leave() {
  if (dirty.value)
    confirming.value = true
  else
    emit('cancel')
}

function onOpenChange(value: boolean) {
  if (!value)
    leave()
}

function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  if (event.isComposing)
    return
  if (confirming.value)
    confirming.value = false
  else
    leave()
}

function onKeydown(event: KeyboardEvent) {
  if (step.value !== 'review' || event.key !== 'Enter' || !(event.metaKey || event.ctrlKey) || event.isComposing)
    return
  event.preventDefault()
  event.stopPropagation()
  void insert()
}

function onPaste(event: ClipboardEvent) {
  if (!props.canUpload)
    return
  const files = [
    ...(event.clipboardData?.files ?? []),
  ].filter(isImageFile)
  if (!files.length)
    return
  event.preventDefault()
  addFiles(files)
}

function hasImageData(data: DataTransfer | null) {
  if (!data)
    return false
  return [...data.files].some(isImageFile) || [...data.items].some(item => item.type.startsWith('image/'))
}

function onZoneDragOver(event: DragEvent) {
  if (!hasImageData(event.dataTransfer))
    return
  event.preventDefault()
  dragActive.value = true
}

function onZoneDrop(event: DragEvent) {
  event.preventDefault()
  event.stopPropagation()
  dragActive.value = false
  addFiles([
    ...(event.dataTransfer?.files ?? []),
  ].filter(isImageFile))
}

function onZoneKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' '))
    return
  event.preventDefault()
  pickFiles()
}

function focusFirst(event: Event) {
  event.preventDefault()
  content.value?.$el.querySelector<HTMLElement>('[data-autofocus]')?.focus()
}
</script>

<template>
  <DialogRoot :open="true" @update:open="onOpenChange">
    <DialogPortal>
      <DialogOverlay class="hlx-dialog-overlay" />
      <DialogContent
        ref="content"
        class="hlx-root hlx-dialog hlx-image-dialog hlx-image-list-dialog"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        @open-auto-focus="focusFirst"
        @close-auto-focus.prevent
        @escape-key-down="onEscape"
        @keydown.capture="onKeydown"
        @paste="onPaste"
        @dragover.prevent
        @drop.prevent
      >
        <div class="hlx-dialog-head">
          <DialogTitle class="hlx-image-dialog-title">
            {{ copy.title }}
          </DialogTitle>
          <button type="button" class="hlx-image-dialog-close" aria-label="關閉" title="關閉" @click="leave">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <DialogDescription class="hlx-visually-hidden">
          選擇、拖放或貼上圖片，或輸入網址，確認清單後插入。
        </DialogDescription>
        <input
          v-if="canUpload"
          ref="fileInput"
          class="hlx-image-dialog-file"
          type="file"
          accept="image/*"
          :multiple="mode !== 'replace'"
          tabindex="-1"
          aria-hidden="true"
          @change="onFileChange"
        >
        <div class="hlx-image-dialog-body">
          <template v-if="step === 'source'">
            <div
              v-if="canUpload"
              class="hlx-image-dropzone"
              role="button"
              tabindex="0"
              aria-label="把圖片拖到這裡，或選擇檔案"
              :data-drag-active="dragActive ? '' : undefined"
              data-autofocus
              @dragenter="onZoneDragOver"
              @dragover="onZoneDragOver"
              @dragleave="dragActive = false"
              @drop="onZoneDrop"
              @keydown="onZoneKeydown"
            >
              <span class="hlx-image-dropzone-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3v12M7 8l5-5 5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
              </span>
              <span class="hlx-image-dropzone-title">把圖片拖到這裡</span>
              <button type="button" tabindex="-1" @click="pickFiles">
                選擇檔案
              </button>
              <span class="hlx-image-dialog-hint">或按 <kbd>⌘</kbd><kbd>V</kbd> 貼上</span>
            </div>
            <p v-if="fileError" class="hlx-image-dialog-error" role="alert">
              {{ fileError }}
            </p>
            <template v-if="allowUrl">
              <div v-if="canUpload" class="hlx-image-dialog-divider">
                或從網址
              </div>
              <label class="hlx-image-url-field">
                <span>圖片網址</span>
                <span class="hlx-image-url-row">
                  <input
                    v-model="url"
                    name="src"
                    type="text"
                    inputmode="url"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="https://example.com/image.jpg"
                    :aria-invalid="urlState.status === 'error' || undefined"
                    :data-autofocus="canUpload ? undefined : ''"
                    @keydown.enter.prevent="onUrlEnter"
                  >
                  <img v-if="urlState.status === 'loaded'" class="hlx-image-url-thumb" :src="url.trim()" alt="">
                  <button type="button" data-primary :disabled="urlState.status !== 'loaded'" @click="addUrl">
                    加入
                  </button>
                </span>
                <span v-if="urlState.status === 'error'" class="hlx-image-dialog-error" role="alert">{{ urlState.message }}</span>
                <span v-else-if="urlState.status === 'loaded'" class="hlx-image-dialog-hint">已載入 · {{ urlState.width }} × {{ urlState.height }}</span>
                <span v-else-if="urlState.status === 'loading'" class="hlx-image-dialog-hint">載入預覽中…</span>
              </label>
            </template>
          </template>
          <template v-else>
            <ul class="hlx-image-rows">
              <li
                v-for="row in rows"
                :key="row.id"
                class="hlx-image-row"
                data-image-dialog-row
                :data-failed="row.kind === 'file' && blocksInsert(row, failedIds) ? '' : undefined"
              >
                <img
                  v-if="row.kind === 'url' || infoOf(row.current)?.url"
                  class="hlx-image-row-thumb"
                  :src="row.kind === 'url' ? row.src : infoOf(row.current)!.url"
                  alt=""
                >
                <span v-else class="hlx-image-row-thumb" />
                <div class="hlx-image-row-body">
                  <div class="hlx-image-row-title">
                    <span class="hlx-image-row-name" :title="row.kind === 'url' ? row.src : row.original.name">{{ rowName(row) }}</span>
                    <span v-if="row.kind === 'file' && row.current !== row.original" class="hlx-image-row-edited">已編輯</span>
                  </div>
                  <span v-if="row.kind === 'url'" class="hlx-image-row-meta">{{ row.width }} × {{ row.height }} · 來自連結</span>
                  <template v-else>
                    <span class="hlx-image-row-meta">{{ rowMeta(row) }}</span>
                    <span v-if="editor && !isEditableImage(row.current)" class="hlx-image-row-meta">動畫或向量圖，編輯後會變成靜態圖</span>
                    <label v-if="row.current === row.original && row.gps" class="hlx-image-check">
                      <input
                        type="checkbox"
                        :checked="row.removeGps"
                        @change="updateRow(row.id, { removeGps: ($event.target as HTMLInputElement).checked })"
                      >
                      <span>上傳前移除 GPS</span>
                    </label>
                    <span v-if="blocksInsert(row, failedIds)" class="hlx-image-dialog-error">無法移除這張圖片的位置</span>
                  </template>
                </div>
                <button
                  v-if="row.kind === 'file' && canEdit(row)"
                  type="button"
                  class="hlx-image-row-edit"
                  @click="editRow(row)"
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4" /></svg>
                  {{ row.current !== row.original ? '重新編輯' : '編輯' }}
                </button>
                <button
                  type="button"
                  class="hlx-image-row-remove"
                  :aria-label="`移除 ${rowName(row)}`"
                  title="移除"
                  @click="removeRow(row.id)"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </li>
            </ul>
            <button v-if="mode !== 'replace' && canUpload" type="button" class="hlx-image-add-more" @click="pickFiles">
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              加入更多
            </button>
            <label v-if="allowKeepOriginal && rows.some(row => row.kind === 'file')" class="hlx-image-check">
              <input v-model="keepOriginal" type="checkbox">
              <span>保留原圖（不壓縮）</span>
            </label>
          </template>
        </div>
        <div v-if="confirming" class="hlx-dialog-foot hlx-image-dialog-foot" role="alert">
          <span class="hlx-image-dialog-hint">要放棄這些圖片嗎？</span>
          <button type="button" @click="confirming = false">
            繼續編輯
          </button>
          <button type="button" data-danger @click="emit('cancel')">
            放棄
          </button>
        </div>
        <div v-else class="hlx-dialog-foot hlx-image-dialog-foot">
          <template v-if="step === 'source'">
            <span class="hlx-image-dialog-hint">{{ FORMATS_HINT }}</span>
            <button v-if="rows.length" type="button" @click="step = 'review'">
              繼續
            </button>
          </template>
          <template v-else>
            <span :class="blocked ? 'hlx-image-dialog-error' : 'hlx-image-dialog-hint'">
              {{ blocked ? '保留位置或移除標出的圖片才能繼續' : '按插入之前不會上傳任何檔案' }}
            </span>
            <button v-if="startedWithFiles" type="button" @click="leave">
              取消
            </button>
            <button v-else type="button" @click="step = 'source'">
              返回
            </button>
            <button type="button" data-primary data-autofocus :disabled="inserting || blocked" @click="insert">
              {{ copy.action }}
              <kbd>⌘↵</kbd>
            </button>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
