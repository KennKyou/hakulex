const ALLOWED_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|avif)[;,]/i
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i
// eslint-disable-next-line no-control-regex -- browsers strip these from URLs, which hides schemes
const CONTROL_OR_SPACE_START = /[\u0000-\u001F\u007F]|^\s/

/**
 * Accepts http(s), relative paths and raster `data:image/` values. Stored content
 * is untrusted, so anything else is refused, including `blob:` (only valid in the
 * page that made it), SVG data URLs and protocol-relative or backslash paths.
 */
export function isSafeImageSrc(src: unknown): src is string {
  if (typeof src !== 'string' || !src || CONTROL_OR_SPACE_START.test(src))
    return false
  if (src.startsWith('//') || src.startsWith('\\'))
    return false
  if (!HAS_SCHEME.test(src))
    return true
  return /^https?:/i.test(src) || ALLOWED_DATA_IMAGE.test(src)
}

/** A positive integer pixel size, or undefined for anything else. */
export function normalizeImageSize(size: unknown): number | undefined {
  return typeof size === 'number' && Number.isInteger(size) && size > 0
    ? size
    : undefined
}

/** A percentage of the content width, as a whole number from 10 to 100, or undefined. */
export function normalizeDisplayWidth(width: unknown): number | undefined {
  return typeof width === 'number' && Number.isFinite(width)
    ? Math.round(Math.min(100, Math.max(10, width)))
    : undefined
}

/** The layouts there is a look for. Anything else stored in `layout` shows as the default. */
export type ImageLayout = 'float-left' | 'float-right'

export function normalizeImageLayout(layout: unknown): ImageLayout | undefined {
  return layout === 'float-left' || layout === 'float-right'
    ? layout
    : undefined
}

/**
 * The block's attributes for a layout. A floating image's display width goes on the
 * block, which the picture then fills: on both it would count twice.
 */
export function imageLayoutAttrs(layout: unknown, displayWidth: unknown): Record<string, string> {
  const shown = normalizeImageLayout(layout)
  if (!shown)
    return {}
  const width = normalizeDisplayWidth(displayWidth)
  return {
    'data-layout': shown,
    ...(width
      ? { style: `--hlx-image-width:${width}%` }
      : {}),
  }
}

/** A caption with text in it, or undefined. */
export function normalizeCaption(caption: unknown): string | undefined {
  return typeof caption === 'string'
    ? caption.trim() || undefined
    : undefined
}
