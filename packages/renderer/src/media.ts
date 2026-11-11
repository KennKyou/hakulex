const HAS_SCHEME = /^[a-z][a-z\d+.-]*:/i
// eslint-disable-next-line no-control-regex -- browsers strip these from URLs, which hides schemes
const CONTROL_OR_SPACE_START = /[\u0000-\u001F\u007F]|^\s/

/**
 * Accepts http(s) and relative paths. Stored content is untrusted, so anything else
 * is refused, including `data:` and `blob:` (valid only in the page that made it)
 * and protocol-relative or backslash paths.
 */
export function isSafeMediaSrc(src: unknown): src is string {
  if (typeof src !== 'string' || !src || CONTROL_OR_SPACE_START.test(src))
    return false
  if (src.startsWith('//') || src.startsWith('\\'))
    return false
  return !HAS_SCHEME.test(src) || /^https?:/i.test(src)
}

/** A whole number of bytes, or undefined for anything else. */
export function normalizeFileSize(size: unknown): number | undefined {
  return typeof size === 'number' && Number.isInteger(size) && size >= 0
    ? size
    : undefined
}

export function normalizeMimeType(type: unknown): string | undefined {
  return typeof type === 'string' && /^[\w.+-]+\/[\w.+-]+$/.test(type)
    ? type
    : undefined
}

export function normalizeFileExt(ext: unknown): string | undefined {
  return typeof ext === 'string' && /^[a-z\d]{1,8}$/i.test(ext)
    ? ext.toLowerCase()
    : undefined
}

export type FileDisplay = 'block' | 'inline'

export function normalizeFileDisplay(display: unknown): FileDisplay {
  return display === 'inline'
    ? 'inline'
    : 'block'
}

export function normalizeFileName(name: unknown): string {
  return (typeof name === 'string' && name.trim()) || '檔案'
}

export function fileExtFromName(name: string): string | undefined {
  const index = name.lastIndexOf('.')
  return index > 0
    ? normalizeFileExt(name.slice(index + 1))
    : undefined
}

/** The last part of a URL's path, decoded, for a file nobody named. */
export function fileNameFromUrl(url: string): string {
  const last = url.split(/[?#]/)[0].split('/').pop() ?? ''
  try {
    return decodeURIComponent(last)
  }
  catch {
    return last
  }
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

export function formatFileSize(size: number): string {
  let value = size
  let unit = 0
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024
    unit++
  }
  return `${Number(value.toFixed(1))} ${SIZE_UNITS[unit]}`
}

/** `PDF · 1.5 KB`, or as much of it as is known. */
export function fileMetaText(file: { name: string, size?: number, mimeType?: string, ext?: string }): string {
  const fromType = normalizeFileExt(file.mimeType?.split('/')[1])
  const ext = file.ext ?? fileExtFromName(file.name) ?? fromType
  return [
    ext?.toUpperCase(),
    file.size === undefined
      ? undefined
      : formatFileSize(file.size),
  ].filter(Boolean).join(' · ')
}
