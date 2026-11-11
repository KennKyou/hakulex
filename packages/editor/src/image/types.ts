/** What an image node stores. */
export interface ImageData {
  src: string
  altText: string
  width?: number
  height?: number
  caption?: string
  /** Percent of the content width, 10 to 100. */
  displayWidth?: number
  /** As stored: it can hold what there's no look for, which is then shown as the default. */
  layout?: unknown
}

export interface UploadedImage {
  src: string
  width?: number
  height?: number
  altText?: string
}

/**
 * Stores a file wherever the application wants and returns its URL. Errors it
 * throws are shown to the author. There is no abort signal: cancelling the dialog
 * ignores the result, but the file may already be stored.
 */
export type UploadImage = (file: File, options?: UploadImageOptions) => Promise<UploadedImage>

export interface UploadImageOptions {
  /** The author asked to keep the original: skip compressing it. Only from the image list. */
  keepOriginal?: boolean
}
