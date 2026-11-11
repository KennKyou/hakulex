/** Heading text → URL fragment. Keeps letters and digits of any script (CJK included). */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}\-_]/gu, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'section'
}

/** Returns a slugger that de-duplicates within one document: `a`, `a-2`, `a-3`. */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text) => {
    const base = slugify(text)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1
      ? base
      : `${base}-${count}`
  }
}
