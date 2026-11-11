/*
 * How a link reads in the panel.
 */

/** No address yet: blank, or just a scheme. */
export function isEmptyLink(url: string): boolean {
  const trimmed = url.trim()
  return trimmed === '' || /^https?:\/\/$/i.test(trimmed)
}

/** The address without its scheme or a trailing slash. */
export function displayUrl(url: string): string {
  return url.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '')
}

/** Cut from the middle, so both the site and the end of the path show. */
export function middleTruncate(text: string, max: number): string {
  if (text.length <= max)
    return text
  const keep = max - 1
  const head = Math.ceil(keep / 2)
  return `${text.slice(0, head)}…${text.slice(text.length - (keep - head))}`
}
