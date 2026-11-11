/** The hue of a tag's background. A whole number, so stored text can't reach the style. */
export function tagHue(text: string): number {
  let hash = 0
  for (let i = 0; i < text.length; i++)
    hash = (text.charCodeAt(i) + ((hash << 5) - hash)) | 0
  return ((hash % 360) + 360) % 360
}

/**
 * Comment text that can't end the comment it goes in. A DOM comment serializes
 * as it is, so stored `-->` would otherwise turn what follows into real HTML.
 */
export function safeCommentText(text: string): string {
  return text
    .replace(/-(?=-)/g, '- ')
    .replace(/^-?>/, ' $&')
    .replace(/<!-$/, '$& ')
}

/** Who a quote is by: trimmed, or null when it isn't usable text. */
export function normalizeAttribution(value: unknown): string | null {
  return typeof value === 'string'
    ? value.trim() || null
    : null
}
