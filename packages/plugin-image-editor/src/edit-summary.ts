import type { ImageSize } from './resize'

export interface EditSummaryInput {
  cropped: boolean
  marks: number
  mosaics: number
  resizedTo: ImageSize | null
}

/** What was done to the picture, for its row in the list: 「已裁切 · 2 個標註 · 1920 × 1080」. */
export function buildEditSummary({ cropped, marks, mosaics, resizedTo }: EditSummaryInput): string {
  const parts: string[] = []
  if (cropped)
    parts.push('已裁切')
  if (marks > 0)
    parts.push(`${marks} 個標註`)
  if (mosaics > 0)
    parts.push(`${mosaics} 處馬賽克`)
  if (resizedTo)
    parts.push(`${resizedTo.width} × ${resizedTo.height}`)
  return parts.join(' · ')
}
