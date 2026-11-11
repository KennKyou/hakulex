import type { InjectionKey } from 'vue'

/** One image as `onImageClick` reports it. */
export interface RichImageInfo {
  src: string
  alt?: string
  caption?: string
  width?: number
  height?: number
}

export interface ImageClickPayload {
  /** The image that was clicked. */
  current: RichImageInfo
  /** Every image in its group: the renderer's single images in order, or one gallery's. */
  images: RichImageInfo[]
  /** Where `current` is in `images`. */
  index: number
  /** The `<img>` that was clicked, to return focus to or animate from. */
  target: HTMLElement
}

export type OnImageClick = (payload: ImageClickPayload) => void

interface Entry {
  element: () => HTMLElement | null
  info: () => RichImageInfo
}

export interface ImageClickContext {
  /** Whether images respond at all: only when the site gave `onImageClick`. */
  enabled: () => boolean
  /** A single image adds itself, to be in the group the others report. */
  register: (entry: Entry) => () => void
  /** A single image was opened. */
  openSingle: (target: HTMLElement, info: RichImageInfo) => void
  /** An image of a gallery was opened; a gallery is its own group. */
  openGroup: (target: HTMLElement, images: RichImageInfo[], index: number) => void
}

export const ImageClickKey: InjectionKey<ImageClickContext> = Symbol('ImageClick')

/** Leaves out what an image doesn't have, so a site gets only real values. */
export function imageInfo(image: { src: string, alt?: string, caption?: string, width?: number, height?: number }): RichImageInfo {
  const info: RichImageInfo = { src: image.src }
  if (image.alt)
    info.alt = image.alt
  if (image.caption)
    info.caption = image.caption
  if (image.width)
    info.width = image.width
  if (image.height)
    info.height = image.height
  return info
}

/** One per `RichRenderer`: its single images, put in document order when one is opened. */
export function createImageClickContext(handler: () => OnImageClick | undefined): ImageClickContext {
  const entries = new Set<Entry>()
  return {
    enabled: () => !!handler(),
    register(entry) {
      entries.add(entry)
      return () => entries.delete(entry)
    },
    openSingle(target, info) {
      const ordered = [...entries]
        .map(entry => ({
          element: entry.element(),
          entry,
        }))
        .filter((item): item is { element: HTMLElement, entry: Entry } => !!item.element)
        .sort((a, b) => a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING
          ? -1
          : 1)
      const found = ordered.findIndex(item => item.element === target)
      const images = found === -1
        ? [info]
        : ordered.map(item => item.entry.info())
      const index = Math.max(found, 0)
      handler()?.({
        current: images[index],
        images,
        index,
        target,
      })
    },
    openGroup(target, images, index) {
      handler()?.({
        current: images[index],
        images,
        index,
        target,
      })
    },
  }
}

/** Enter and Space open a focused image, as a click does. */
export function isOpenKey(event: KeyboardEvent) {
  return event.key === 'Enter' || event.key === ' '
}
