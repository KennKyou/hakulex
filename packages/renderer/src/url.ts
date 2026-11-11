const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:'])

/** Accepts absolute http(s) / mailto / tel URLs; rejects `javascript:` and the like. */
export function validateUrl(url: string): boolean {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol)
  }
  catch {
    return false
  }
}
