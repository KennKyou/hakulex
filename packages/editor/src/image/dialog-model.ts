import type { GpsInfo, ImageEditPrivacy } from './editor-registry'
import { isSafeImageSrc } from '@hakulex/renderer'

/*
 * The list of images to insert: each row is a file (as
 * chosen and as edited) or an address already loaded.
 */

export type ImageDialogMode = 'insert' | 'replace'

export type ImageDialogEntry
  = | { kind: 'file', file: File }
    | { kind: 'url', src: string, width: number, height: number }

export interface FileRow {
  kind: 'file'
  id: string
  original: File
  /** The file to upload: the original, or what editing made of it. */
  current: File
  gps: GpsInfo | null
  removeGps: boolean
  /** What editing did, such as 「已裁切 · 1 個標註」. */
  summary: string
}

export interface UrlRow {
  kind: 'url'
  id: string
  src: string
  width: number
  height: number
}

export type ReviewRow = FileRow | UrlRow

/** Canvas flattens these: an edited GIF loses its animation, an SVG becomes pixels. */
const FLATTENED_BY_CANVAS = new Set(['image/gif', 'image/svg+xml'])

export const isImageFile = (file: File) => file.type.startsWith('image/')
export const isEditableImage = (file: File) => !FLATTENED_BY_CANVAS.has(file.type)

let rowCounter = 0
export const nextRowId = () => `image-row-${++rowCounter}`

export function toFileRow(file: File): FileRow {
  return {
    kind: 'file',
    id: nextRowId(),
    original: file,
    current: file,
    gps: null,
    removeGps: true,
    summary: '',
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** The last part of an address's path, as a name for it. */
export function urlFileName(src: string): string {
  try {
    const { pathname } = new URL(src)
    return decodeURIComponent(pathname.split('/').pop() || '') || src
  }
  catch {
    return src
  }
}

export function isUsableImageUrl(src: string): boolean {
  return isSafeImageSrc(src)
}

export function imageDialogCopy(mode: ImageDialogMode, count: number): { title: string, action: string } {
  if (mode === 'replace')
    return { title: '替換圖片', action: '替換' }
  const label = count > 1
    ? `插入 ${count} 張圖片`
    : '插入圖片'
  return { title: label, action: label }
}

/** Whether a row's location was asked to go, and couldn't. */
export function blocksInsert(row: ReviewRow, failedIds: readonly string[]): boolean {
  return row.kind === 'file'
    && failedIds.includes(row.id)
    && row.removeGps
    && !!row.gps
    && row.current === row.original
}

/**
 * What to insert. A file whose location is to go is replaced by the site's cleaned copy; an
 * edited file has none left, as canvas drops it.
 */
export async function finalizeRows(
  rows: readonly ReviewRow[],
  stripGps: ImageEditPrivacy['stripGps'] | undefined,
): Promise<{ entries: ImageDialogEntry[], failedIds: string[] }> {
  const failedIds: string[] = []
  const entries = await Promise.all(rows.map(async (row): Promise<ImageDialogEntry | null> => {
    if (row.kind === 'url') {
      return {
        kind: 'url',
        src: row.src,
        width: row.width,
        height: row.height,
      }
    }
    const edited = row.current !== row.original
    if (edited || !row.removeGps || !row.gps)
      return { kind: 'file', file: row.current }
    try {
      if (!stripGps)
        throw new Error('No GPS stripper configured')
      return { kind: 'file', file: await stripGps(row.original) }
    }
    catch {
      failedIds.push(row.id)
      return null
    }
  }))
  return {
    entries: entries.filter((entry): entry is ImageDialogEntry => entry !== null),
    failedIds,
  }
}

const keptOriginals = new WeakSet<File>()

/** Asks the upload for this file to keep it as it is. */
export function markKeepOriginal(file: File): File {
  keptOriginals.add(file)
  return file
}

export function keepsOriginal(file: File): boolean {
  return keptOriginals.has(file)
}
