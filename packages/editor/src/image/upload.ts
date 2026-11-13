import type { ImageData, PickImages, PickImagesOptions, UploadedImage, UploadImage } from './types'
import { isSafeImageSrc, normalizeImageSize } from '@hakulex/renderer'
import { keepsOriginal } from './dialog-model'
import { probeImageSize } from './probe'
import { isFileId } from './types'

/** Why an uploaded or chosen image can't be used; the message is shown to the author. */
export class ImageUploadError extends Error {
  constructor(message: string, readonly reason?: 'src' | 'size') {
    super(message)
  }
}

/**
 * Checks what an upload or `pickImages` gave and returns everything an image node needs: `src`
 * must be safe, a missing size is read from the picture, and `fileId` is kept only when it is a
 * non-empty string. Rejects with an `ImageUploadError` when the image can't be used.
 */
export async function toImageData(result: UploadedImage): Promise<ImageData> {
  if (!result || !isSafeImageSrc(result.src))
    throw new ImageUploadError('圖片的網址無法使用。', 'src')

  let width = normalizeImageSize(result.width)
  let height = normalizeImageSize(result.height)
  if (!width || !height) {
    try {
      ({ width, height } = await probeImageSize(result.src))
    }
    catch {
      throw new ImageUploadError('無法載入這張圖片。', 'size')
    }
  }
  return {
    src: result.src,
    altText: typeof result.altText === 'string'
      ? result.altText
      : '',
    width,
    height,
    ...(isFileId(result.fileId)
      ? { fileId: result.fileId }
      : {}),
  }
}

/** Uploads a file and returns everything an image node needs, with `src` checked. */
export async function uploadToImage(file: File, upload: UploadImage): Promise<ImageData> {
  let result
  try {
    // Only a file the author asked to keep gets the option.
    result = keepsOriginal(file)
      ? await upload(file, { keepOriginal: true })
      : await upload(file)
  }
  catch (cause) {
    throw new ImageUploadError(`上傳失敗：${errorMessage(cause)}`)
  }
  if (!result || !isSafeImageSrc(result.src))
    throw new ImageUploadError('上傳回傳的網址無法使用。')
  return toImageData(result)
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : String(cause)
}

/**
 * Asks the site for images and checks each one. What can't be used is left out and said why;
 * an error from the site is said as 「選擇失敗：…」. `null` once the signal is aborted: the
 * dialog that asked is gone.
 */
export async function pickToImages(
  pick: PickImages,
  options: PickImagesOptions,
): Promise<{ images: ImageData[], errors: string[] } | null> {
  let picked: unknown
  let failure: string | null = null
  try {
    picked = await pick(options)
  }
  catch (cause) {
    failure = `選擇失敗：${errorMessage(cause)}`
  }
  // The Esc or click that closed the site's dialog is still going on to the editor's: the
  // editor's dialog has to go on ignoring it until it's done.
  await new Promise(resolve => setTimeout(resolve))
  if (options.signal.aborted)
    return null
  if (failure) {
    return {
      images: [],
      errors: [failure],
    }
  }
  const list = Array.isArray(picked)
    ? picked
    : []
  const chosen = options.multiple
    ? list
    : list.slice(0, 1)
  const results = await Promise.allSettled(chosen.map(item => toImageData(item as UploadedImage)))
  if (options.signal.aborted)
    return null
  const images: ImageData[] = []
  const errors = new Set<string>()
  for (const result of results) {
    if (result.status === 'fulfilled')
      images.push(result.value)
    else
      errors.add(pickErrorMessage(result.reason))
  }
  return {
    images,
    errors: [...errors],
  }
}

function pickErrorMessage(cause: unknown): string {
  // Said of the whole choice, which may hold more than one.
  if (cause instanceof ImageUploadError && cause.reason === 'src')
    return '有圖片的網址無法使用。'
  return cause instanceof ImageUploadError
    ? cause.message
    : `選擇失敗：${errorMessage(cause)}`
}
