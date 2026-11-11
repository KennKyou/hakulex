import type { ImageData, UploadImage } from './types'
import { isSafeImageSrc, normalizeImageSize } from '@hakulex/renderer'
import { keepsOriginal } from './dialog-model'
import { probeImageSize } from './probe'

/** Why an uploaded file can't become an image; the message is shown to the author. */
export class ImageUploadError extends Error {}

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
    throw new ImageUploadError(`上傳失敗：${cause instanceof Error
      ? cause.message
      : String(cause)}`)
  }
  if (!isSafeImageSrc(result.src))
    throw new ImageUploadError('上傳回傳的網址無法使用。')

  let width = normalizeImageSize(result.width)
  let height = normalizeImageSize(result.height)
  if (!width || !height) {
    try {
      ({ width, height } = await probeImageSize(result.src))
    }
    catch {
      throw new ImageUploadError('無法載入這張圖片。')
    }
  }
  return {
    src: result.src,
    altText: result.altText ?? '',
    width,
    height,
  }
}
