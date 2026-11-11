import { isSafeImageSrc, normalizeImageSize } from './image/src'

export type GalleryLayout = 'grid' | 'masonry' | 'carousel'
export type GalleryAspect = 'auto' | '1:1' | '4:3' | '16:9' | '3:4'
export type GalleryFit = 'cover' | 'contain'

export const GALLERY_LAYOUTS: { value: GalleryLayout, label: string }[] = [
  { value: 'grid', label: '格狀' },
  { value: 'masonry', label: '瀑布流' },
  { value: 'carousel', label: '輪播' },
]
export const GALLERY_ASPECTS: GalleryAspect[] = ['auto', '1:1', '4:3', '16:9', '3:4']
export const GALLERY_FITS: { value: GalleryFit, label: string }[] = [
  { value: 'cover', label: '填滿' },
  { value: 'contain', label: '完整顯示' },
]

export interface GalleryImageData {
  src: string
  alt: string
  width?: number
  height?: number
}

/** How many images a carousel shows at once; a fraction shows part of the next one. */
export const GALLERY_PER_VIEWS = [1, 1.2, 1.5, 2, 2.5, 3] as const
export type GalleryPerView = typeof GALLERY_PER_VIEWS[number]

export interface GalleryData {
  images: GalleryImageData[]
  layout: GalleryLayout
  aspect: GalleryAspect
  fit: GalleryFit
  maxItemHeight?: number
  perView: GalleryPerView
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** One of the listed counts, or 1. */
export function normalizePerView(value: unknown): GalleryPerView {
  return GALLERY_PER_VIEWS.includes(value as GalleryPerView)
    ? value as GalleryPerView
    : 1
}

/** A positive height in pixels, or undefined. */
export function normalizeMaxItemHeight(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

/**
 * What a stored gallery shows. Stored content is untrusted: settings come from fixed lists,
 * so none of it becomes a style, and images that aren't safe are left out.
 */
export function normalizeGallery(node: Record<string, unknown>): GalleryData {
  const pick = <T>(list: readonly T[], value: unknown, fallback: T): T => (list.includes(value as T)
    ? value as T
    : fallback)
  return {
    images: Array.isArray(node.images)
      ? node.images.filter(isObject).flatMap(image => (isSafeImageSrc(image.src)
          ? [
              {
                src: image.src,
                alt: typeof image.alt === 'string'
                  ? image.alt
                  : '',
                width: normalizeImageSize(image.width),
                height: normalizeImageSize(image.height),
              },
            ]
          : []))
      : [],
    layout: pick(GALLERY_LAYOUTS.map(item => item.value), node.layout, 'grid'),
    aspect: pick(GALLERY_ASPECTS, node.aspect, 'auto'),
    fit: pick(GALLERY_FITS.map(item => item.value), node.fit, 'cover'),
    maxItemHeight: normalizeMaxItemHeight(node.maxItemHeight),
    perView: normalizePerView(node.perView),
  }
}
