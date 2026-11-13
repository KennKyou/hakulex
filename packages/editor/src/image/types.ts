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
  /**
   * The application's own id for the stored file, from `uploadImage`. Only kept: it goes
   * with this picture, so a new `src` without a new id drops it.
   */
  fileId?: string
}

export interface UploadedImage {
  src: string
  width?: number
  height?: number
  altText?: string
  /** The application's own id for the stored file. Kept in the document when it's a non-empty string. */
  fileId?: string
}

/** A file id worth keeping: a non-empty string. */
export function isFileId(value: unknown): value is string {
  return typeof value === 'string' && value !== ''
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

export interface PickImagesOptions {
  /** Where the author asked: inserting images, replacing one, or a gallery. */
  purpose: 'insert' | 'replace' | 'gallery'
  /** Whether more than one may be chosen. False when replacing. */
  multiple: boolean
  /**
   * Aborted when the dialog that asked closes (cancelled, or the editor unmounted). The site
   * should close whatever it showed; what it returns after that is ignored.
   */
  signal: AbortSignal
}

/**
 * Lets the author choose images the site already has, from wherever it keeps them. Returns the
 * chosen ones; an empty list means none were. Errors it throws are shown to the author. Each
 * result is checked like an upload's, so a `fileId` is kept the same way.
 */
export type PickImages = (options: PickImagesOptions) => Promise<UploadedImage[]>
