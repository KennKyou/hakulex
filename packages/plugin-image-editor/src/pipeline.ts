import type { AnnotationState } from '@markerjs/markerjs3'
import type { CropRect } from './crop'
import { offsetMarkerState } from './annotation'
import { buildResult } from './build-result'
import { canvasToObjectUrl, cropCanvas, extractCrop, sourceToCanvas } from './crop'
import { rasterizeAnnotations } from './rasterize'
import { scaleCanvasToLongEdge } from './resize'

/*
 * From what the author did to a file: crops become a new bitmap when
 * another tool is picked, and the export draws the rest at the picture's own size.
 */

export interface CropRebase {
  bitmapUrl: string
  markerState: AnnotationState | null
}

/**
 * Cuts the bitmap to the crop, so the other tools work on what's left. Marks keep their place
 * on the picture; those outside are only out of sight.
 */
export async function applyCropRebase(sourceUrl: string, rect: CropRect, markerState: AnnotationState | null): Promise<CropRebase> {
  const canvas = await extractCrop(sourceUrl, rect)
  return {
    bitmapUrl: await canvasToObjectUrl(canvas),
    markerState: markerState
      ? {
          ...offsetMarkerState(markerState, -rect.x, -rect.y),
          width: rect.width,
          height: rect.height,
        }
      : null,
  }
}

export interface ExportInput {
  /** Whether the bitmap shown is no longer the file's: cropped or pixelated. */
  hasRebasedBitmap: boolean
  markerState: AnnotationState | null
  maxLongEdge: number | null
  original: File
  /** A crop not yet applied, in the picture's own pixels. */
  pendingCropRect: CropRect | null
  sourceUrl: string
}

/** The file to upload: the original itself when nothing changed. */
export async function exportResult({
  hasRebasedBitmap,
  markerState,
  maxLongEdge,
  original,
  pendingCropRect,
  sourceUrl,
}: ExportInput): Promise<File> {
  let canvas: HTMLCanvasElement | null = null
  if (markerState?.markers.length) {
    // Marks are drawn at the picture's own size, then cut with it.
    canvas = await rasterizeAnnotations(sourceUrl, markerState)
    if (pendingCropRect)
      canvas = cropCanvas(canvas, pendingCropRect)
  }
  else if (pendingCropRect) {
    canvas = await extractCrop(sourceUrl, pendingCropRect)
  }
  else if (hasRebasedBitmap || maxLongEdge !== null) {
    canvas = await sourceToCanvas(sourceUrl)
  }
  if (canvas && maxLongEdge !== null)
    canvas = scaleCanvasToLongEdge(canvas, maxLongEdge)
  return buildResult(original, canvas)
}
