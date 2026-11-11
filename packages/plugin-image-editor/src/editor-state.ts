import type { AnnotationState } from '@markerjs/markerjs3'
import type { Ref, ShallowRef } from 'vue'
import type { CropRect } from './crop'
import type { MosaicMode } from './mosaic'
import { computed, onScopeDispose, shallowRef } from 'vue'
import { clampCropRect, isFullImageCrop } from './crop'
import { applyMosaic } from './mosaic'
import { applyCropRebase } from './pipeline'

/*
 * What the edit screen keeps track of: the tool, the crop
 * not yet applied, and the bitmap the tools work on, with each mosaic's step back.
 */

export type EditorTool
  = | 'crop'
    | 'arrow'
    | 'pen'
    | 'rect'
    | 'ellipse'
    | 'text'
    | 'counter'
    | 'cover'
    | 'mosaic'

/** How the output's long edge is chosen. */
export type SizeMode = 'original' | 'preset' | 'custom'

export const isAnnotationTool = (tool: EditorTool) => tool !== 'crop' && tool !== 'mosaic'

export interface ImageSize {
  height: number
  width: number
}

/** A selection in percent of the shown picture, as the crop marquee keeps it. */
export interface PercentCrop {
  x: number
  y: number
  width: number
  height: number
}

/** CleanShot's default: the whole picture is selected to start with. */
export const FULL_IMAGE_CROP: PercentCrop = { height: 100, width: 100, x: 0, y: 0 }

export function useImageEditorState(objectUrl: Ref<string>) {
  const activeTool = shallowRef<EditorTool>('crop')
  const rebasedBitmapUrl = shallowRef<string | null>(null)
  const crop = shallowRef<PercentCrop>(FULL_IMAGE_CROP)
  /** Always in the picture's own pixels. */
  const croppedAreaPixels = shallowRef<CropRect | null>(null)
  const naturalSize = shallowRef<ImageSize | null>(null)
  /** Bitmaps to go back to on undo; `null` stands for the file itself. */
  const mosaicHistory = shallowRef<(string | null)[]>([])
  const mosaicBusy = shallowRef(false)
  /** The marks, kept here so they outlive the marker surface across tools. */
  const markerState = shallowRef<AnnotationState | null>(null)
  let disposed = false

  const sourceUrl = computed(() => rebasedBitmapUrl.value ?? objectUrl.value)

  onScopeDispose(() => {
    disposed = true
    if (rebasedBitmapUrl.value)
      URL.revokeObjectURL(rebasedBitmapUrl.value)
    for (const url of mosaicHistory.value) {
      if (url)
        URL.revokeObjectURL(url)
    }
  })

  /** A selection of the whole picture, or of nothing, keeps the file as it is. */
  const hasPendingCrop = computed(() => {
    const area = croppedAreaPixels.value
    const size = naturalSize.value
    return !!area && !!size && area.width >= 1 && area.height >= 1
      && !isFullImageCrop(area, size.width, size.height)
  })

  function resetCrop() {
    crop.value = FULL_IMAGE_CROP
    croppedAreaPixels.value = null
  }

  /** Applies the crop, then switches; if cutting fails, the selection stays. */
  async function confirmCropAndSwitch(tool: EditorTool) {
    const area = croppedAreaPixels.value
    const size = naturalSize.value
    if (!area || !size)
      return
    const rect = clampCropRect(area, size.width, size.height)
    try {
      const rebase = await applyCropRebase(sourceUrl.value, rect, markerState.value)
      if (rebasedBitmapUrl.value)
        URL.revokeObjectURL(rebasedBitmapUrl.value)
      // Earlier bitmaps no longer match, so mosaic undo stops here.
      for (const url of mosaicHistory.value) {
        if (url)
          URL.revokeObjectURL(url)
      }
      mosaicHistory.value = []
      rebasedBitmapUrl.value = rebase.bitmapUrl
      markerState.value = rebase.markerState
      resetCrop()
      naturalSize.value = { height: rect.height, width: rect.width }
      activeTool.value = tool
      return rect
    }
    catch {}
  }

  /** One at a time, on the latest bitmap: a later one would undo an earlier redaction. */
  async function applyMosaicArea(area: CropRect, mode: MosaicMode, block: number) {
    const size = naturalSize.value
    if (!size || mosaicBusy.value)
      return
    const rect = clampCropRect(area, size.width, size.height)
    if (rect.width < 1 || rect.height < 1)
      return
    mosaicBusy.value = true
    try {
      const bitmapUrl = await applyMosaic(sourceUrl.value, rect, mode, block)
      if (disposed) {
        URL.revokeObjectURL(bitmapUrl)
        return
      }
      mosaicHistory.value = [...mosaicHistory.value, rebasedBitmapUrl.value]
      rebasedBitmapUrl.value = bitmapUrl
    }
    finally {
      mosaicBusy.value = false
    }
  }

  function undoMosaic() {
    if (!mosaicHistory.value.length || mosaicBusy.value)
      return
    const previous = mosaicHistory.value.at(-1) ?? null
    if (rebasedBitmapUrl.value)
      URL.revokeObjectURL(rebasedBitmapUrl.value)
    mosaicHistory.value = mosaicHistory.value.slice(0, -1)
    rebasedBitmapUrl.value = previous
  }

  return {
    activeTool,
    applyMosaicArea,
    confirmCropAndSwitch,
    crop,
    croppedAreaPixels,
    hasPendingCrop,
    markerState,
    mosaicBusy,
    mosaicCount: computed(() => mosaicHistory.value.length),
    naturalSize,
    rebasedBitmapUrl: rebasedBitmapUrl as Readonly<ShallowRef<string | null>>,
    resetCrop,
    sourceUrl,
    undoMosaic,
  }
}

export type ImageEditorState = ReturnType<typeof useImageEditorState>
