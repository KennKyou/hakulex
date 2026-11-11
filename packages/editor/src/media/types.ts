import type { FileDisplay } from '@hakulex/renderer'

/** What a video node stores. */
export interface VideoData {
  src: string
  poster?: string
  width?: number
  height?: number
}

/** What a file node stores. */
export interface FileData {
  src: string
  name: string
  size?: number
  mimeType?: string
  ext?: string
  display: FileDisplay
}

export interface UploadedVideo {
  src: string
  width?: number
  height?: number
  poster?: string
}

export interface UploadedFile {
  src: string
  /** Defaults to the chosen file's name. */
  name?: string
}

/** Stores a file and returns its URL. Errors it throws are shown to the author. */
export type UploadVideo = (file: File) => Promise<UploadedVideo>
export type UploadFile = (file: File) => Promise<UploadedFile>
