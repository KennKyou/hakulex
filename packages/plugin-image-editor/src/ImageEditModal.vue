<script setup lang="ts">
import type { ImageEditResult } from '@hakulex/editor'
import type { AnnotationTool } from './annotation'
import type { CropRect } from './crop'
import type { EditorTool, PercentCrop, SizeMode } from './editor-state'
import type { MosaicMode } from './mosaic'
import { useEditorTheme } from '@hakulex/editor'
import { ImageOff } from '@lucide/vue'
import { DialogContent, DialogDescription, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'
import { STROKE_TOOLS, STROKE_WIDTHS, SWATCH_COLORS } from './annotation'
import AnnotationSurface from './AnnotationSurface.vue'
import { clampCropRect, displayedToNatural } from './crop'
import CropMarquee from './CropMarquee.vue'
import { buildEditSummary } from './edit-summary'
import { isAnnotationTool, useImageEditorState } from './editor-state'
import { clampMosaicStrength, MOSAIC_DEFAULT_STRENGTH } from './mosaic'
import MosaicOptionsBar from './MosaicOptionsBar.vue'
import OutputSizeControl from './OutputSizeControl.vue'
import { exportResult } from './pipeline'
import { canShrinkTo, scaleToLongEdge } from './resize'
import ToolOptionsBar from './ToolOptionsBar.vue'
import ToolRail from './ToolRail.vue'

/*
 * The image edit screen, nearly the whole screen: tools on the left, their options on top,
 * the picture in the middle, the output size and the buttons below.
 */
const props = defineProps<{ file: File }>()
const emit = defineEmits<{ confirm: [result: ImageEditResult], cancel: [] }>()

const theme = useEditorTheme()
const image = useTemplateRef<HTMLImageElement>('image')
const marks = useTemplateRef<{ undo: () => void, redo: () => void }>('marks')

const objectUrl = shallowRef(typeof URL.createObjectURL === 'function'
  ? URL.createObjectURL(props.file)
  : '')
onBeforeUnmount(() => {
  if (objectUrl.value)
    URL.revokeObjectURL(objectUrl.value)
})

const editor = useImageEditorState(objectUrl)
const { activeTool, crop, croppedAreaPixels, hasPendingCrop, naturalSize, sourceUrl } = editor

const decodeError = shallowRef(false)
const exporting = shallowRef(false)
const errorMessage = shallowRef<string | null>(null)
const originalSize = shallowRef<{ width: number, height: number } | null>(null)
const mosaicMode = shallowRef<MosaicMode>('pixelate')
const mosaicStrength = shallowRef(MOSAIC_DEFAULT_STRENGTH.pixelate)
const strokeColor = shallowRef<string>(SWATCH_COLORS[0])
const strokeWidth = shallowRef<number>(STROKE_WIDTHS[1])
const history = shallowRef({ canUndo: false, canRedo: false })
/** The next counter's number, kept across tools. */
const counter = shallowRef(1)
/** The mosaic's selection while dragging; it goes once applied. */
const mosaicCrop = shallowRef<PercentCrop | null>(null)

const pendingCropRect = computed(() => (activeTool.value === 'crop' && hasPendingCrop.value
  ? croppedAreaPixels.value
  : null))
const outputBase = computed(() => pendingCropRect.value ?? naturalSize.value)

// The output's long edge.
const sizeMode = shallowRef<SizeMode>('original')
const presetEdge = shallowRef<number | null>(null)
const customEdge = shallowRef('')
const maxLongEdge = computed(() => {
  const requested = sizeMode.value === 'custom'
    ? Number(customEdge.value)
    : presetEdge.value
  return requested && outputBase.value && canShrinkTo(outputBase.value, requested)
    ? requested
    : null
})

function onSizeMode(mode: SizeMode, edge: number | null) {
  sizeMode.value = mode
  presetEdge.value = edge
}

function onImageLoad() {
  const img = image.value
  if (!img)
    return
  const size = { width: img.naturalWidth, height: img.naturalHeight }
  naturalSize.value = size
  originalSize.value ??= size
}

/** From pixels shown to the picture's own, with how much bigger those are. */
function toNatural(pixels: CropRect) {
  const img = image.value
  if (!img || !img.width || !img.height)
    return null
  return {
    rect: displayedToNatural(pixels, img.naturalWidth / img.width, img.naturalHeight / img.height),
    scale: img.naturalWidth / img.width,
  }
}

function onCropChange(value: PercentCrop) {
  if (activeTool.value === 'mosaic')
    mosaicCrop.value = value
  else
    crop.value = value
}

function onCropComplete(pixels: CropRect) {
  const natural = toNatural(pixels)
  if (activeTool.value === 'mosaic') {
    mosaicCrop.value = null
    if (!natural || pixels.width < 2 || pixels.height < 2)
      return
    editor.applyMosaicArea(natural.rect, mosaicMode.value, mosaicStrength.value * natural.scale).then(
      () => {
        errorMessage.value = null
      },
      (cause) => {
        console.error('[hakulex image editor] mosaic failed', cause)
        errorMessage.value = '無法在這個範圍打上馬賽克。'
      },
    )
    return
  }
  // Whole pixels inside the picture, as react-image-crop gives.
  const size = naturalSize.value
  if (natural && size)
    croppedAreaPixels.value = clampCropRect(natural.rect, size.width, size.height)
}

function onMosaicMode(mode: MosaicMode) {
  mosaicMode.value = mode
  mosaicStrength.value = clampMosaicStrength(mode, mosaicStrength.value)
}

function selectTool(tool: EditorTool) {
  if (tool === activeTool.value)
    return
  if (activeTool.value === 'crop' && hasPendingCrop.value) {
    void editor.confirmCropAndSwitch(tool)
    return
  }
  activeTool.value = tool
}

function summaryFor(output: File) {
  if (output === props.file)
    return ''
  const size = pendingCropRect.value ?? naturalSize.value
  const original = originalSize.value
  return buildEditSummary({
    cropped: pendingCropRect.value !== null
      || (!!original && !!size && (size.width !== original.width || size.height !== original.height)),
    marks: editor.markerState.value?.markers.length ?? 0,
    mosaics: editor.mosaicCount.value,
    resizedTo: maxLongEdge.value !== null && size
      ? scaleToLongEdge(size, maxLongEdge.value)
      : null,
  })
}

async function confirm() {
  exporting.value = true
  errorMessage.value = null
  try {
    const output = await exportResult({
      hasRebasedBitmap: editor.rebasedBitmapUrl.value !== null,
      markerState: editor.markerState.value,
      maxLongEdge: maxLongEdge.value,
      original: props.file,
      pendingCropRect: pendingCropRect.value,
      sourceUrl: sourceUrl.value,
    })
    emit('confirm', {
      file: output,
      summary: summaryFor(output),
    })
  }
  catch (cause) {
    console.error('[hakulex image editor] export failed', cause)
    errorMessage.value = '無法輸出編輯後的圖片，請再試一次或放棄編輯。'
    exporting.value = false
  }
}

function onOpenChange(open: boolean) {
  if (!open)
    emit('cancel')
}
</script>

<template>
  <DialogRoot :open="true" @update:open="onOpenChange">
    <DialogPortal>
      <DialogContent
        class="hlx-root hlx-picture-editor"
        :data-variant="theme.variant"
        :data-color-scheme="theme.colorScheme"
        :style="theme.style"
        @open-auto-focus.prevent
        @close-auto-focus.prevent
      >
        <div class="hlx-picture-editor-top">
          <DialogTitle class="hlx-picture-editor-title">
            編輯圖片
          </DialogTitle>
          <div class="hlx-picture-editor-controls">
            <template v-if="!decodeError">
              <button
                v-if="activeTool === 'crop'"
                type="button"
                class="hlx-picture-editor-ghost"
                :disabled="!hasPendingCrop"
                @click="editor.resetCrop()"
              >
                重設裁切
              </button>
              <MosaicOptionsBar
                v-else-if="activeTool === 'mosaic'"
                :mode="mosaicMode"
                :strength="mosaicStrength"
                :can-undo="editor.mosaicCount.value > 0 && !editor.mosaicBusy.value"
                @mode="onMosaicMode"
                @strength="mosaicStrength = clampMosaicStrength(mosaicMode, $event)"
                @undo="editor.undoMosaic()"
              />
              <ToolOptionsBar
                v-else
                :stroke-color="strokeColor"
                :stroke-width="strokeWidth"
                :show-stroke-width="STROKE_TOOLS.has(activeTool as never)"
                :can-undo="history.canUndo"
                :can-redo="history.canRedo"
                @color="strokeColor = $event"
                @width="strokeWidth = $event"
                @undo="marks?.undo()"
                @redo="marks?.redo()"
              />
            </template>
          </div>
        </div>
        <DialogDescription class="hlx-visually-hidden">
          裁切、標註、打馬賽克或縮小這張圖片，完成後回到清單。
        </DialogDescription>
        <div class="hlx-picture-editor-body">
          <ToolRail :active-tool="activeTool" :disabled="decodeError" @select="selectTool" />
          <div class="hlx-picture-editor-canvas">
            <div v-if="decodeError" class="hlx-picture-editor-error-state">
              <ImageOff :size="24" aria-hidden="true" />
              <span>這張圖片無法編輯。</span>
            </div>
            <CropMarquee
              v-else-if="sourceUrl && !isAnnotationTool(activeTool)"
              :crop="activeTool === 'mosaic' ? mosaicCrop : crop"
              :disabled="activeTool === 'mosaic' && editor.mosaicBusy.value"
              :data-tool="activeTool"
              @change="onCropChange"
              @complete="onCropComplete"
            >
              <img
                ref="image"
                class="hlx-crop-image"
                :src="sourceUrl"
                :alt="file.name"
                draggable="false"
                @load="onImageLoad"
                @error="decodeError = true"
              >
            </CropMarquee>
            <AnnotationSurface
              v-else-if="sourceUrl"
              ref="marks"
              :source-url="sourceUrl"
              :tool="activeTool as AnnotationTool"
              :stroke-color="strokeColor"
              :stroke-width="strokeWidth"
              :state="editor.markerState.value"
              :counter="counter"
              @history="(canUndo, canRedo) => history = { canUndo, canRedo }"
              @state="editor.markerState.value = $event"
              @counted="counter++"
              @decode-error="decodeError = true"
            />
            <!-- Always shown: marker.js's Linkware license asks for a visible credit. -->
            <a class="hlx-picture-editor-credit" href="https://markerjs.com" target="_blank" rel="noreferrer">marker.js</a>
          </div>
        </div>
        <div class="hlx-picture-editor-footer">
          <OutputSizeControl
            :size="outputBase"
            :mode="sizeMode"
            :max-long-edge="maxLongEdge"
            :custom-edge="customEdge"
            @mode="onSizeMode"
            @custom-edge="customEdge = $event"
          />
          <div class="hlx-picture-editor-spacer">
            <span v-if="errorMessage" class="hlx-picture-editor-error" role="alert">{{ errorMessage }}</span>
          </div>
          <button type="button" class="hlx-picture-editor-secondary" @click="emit('cancel')">
            放棄編輯
          </button>
          <button
            type="button"
            class="hlx-picture-editor-primary"
            :disabled="decodeError || exporting || editor.mosaicBusy.value"
            @click="confirm"
          >
            完成
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
