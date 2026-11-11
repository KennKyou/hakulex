import type { FileData, UploadFile, UploadVideo, VideoData } from './types'
import { fileExtFromName, isSafeImageSrc, isSafeMediaSrc, normalizeFileName, normalizeFileSize, normalizeImageSize, normalizeMimeType } from '@hakulex/renderer'

/** Why an upload can't become a node; the message is shown to the author. */
export class MediaUploadError extends Error {}

async function runUpload<T extends { src: string }>(upload: () => Promise<T>): Promise<T> {
  let result
  try {
    result = await upload()
  }
  catch (cause) {
    throw new MediaUploadError(`上傳失敗：${cause instanceof Error
      ? cause.message
      : String(cause)}`)
  }
  if (!isSafeMediaSrc(result.src))
    throw new MediaUploadError('上傳回傳的網址無法使用。')
  return result
}

const PROBE_TIMEOUT = 3000

/** The video's size, if the browser can tell in time. Nothing depends on it, so it never fails. */
export function probeVideoSize(src: string): Promise<{ width?: number, height?: number }> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (size: { width?: number, height?: number }) => {
      clearTimeout(timer)
      video.removeAttribute('src')
      resolve(size)
    }
    timer = setTimeout(finish, PROBE_TIMEOUT, {})
    video.preload = 'metadata'
    video.onloadedmetadata = () => finish({
      width: normalizeImageSize(video.videoWidth),
      height: normalizeImageSize(video.videoHeight),
    })
    video.onerror = () => finish({})
    video.src = src
  })
}

export async function uploadToVideo(file: File, upload: UploadVideo): Promise<VideoData> {
  const result = await runUpload(() => upload(file))
  let width = normalizeImageSize(result.width)
  let height = normalizeImageSize(result.height)
  if (!width || !height)
    ({ width, height } = await probeVideoSize(result.src))
  return {
    src: result.src,
    poster: isSafeImageSrc(result.poster)
      ? result.poster
      : undefined,
    width,
    height,
  }
}

export function fileDataFrom(file: File, src: string, name?: string): FileData {
  const shown = normalizeFileName(name || file.name)
  return {
    src,
    name: shown,
    size: normalizeFileSize(file.size),
    mimeType: normalizeMimeType(file.type),
    ext: fileExtFromName(shown),
    display: 'block',
  }
}

export async function uploadToFile(file: File, upload: UploadFile): Promise<FileData> {
  const result = await runUpload(() => upload(file))
  return fileDataFrom(file, result.src, result.name)
}
