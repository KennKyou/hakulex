/*
 * A site's icon, found: the usual places
 * on the site, tried in order, the first picture that loads. Each site is asked once.
 */

const PLACES = [
  '/favicon.ico',
  '/favicon.png',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
]

const found = new Map<string, Promise<string | null>>()

/** The site an http(s) link goes to, or `null`. */
export function faviconHost(href: string): string | null {
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.hostname
      : null
  }
  catch {
    return null
  }
}

function loads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = url
  })
}

/** The first of the site's icons that loads, or `null` when none does. */
export function findFavicon(host: string): Promise<string | null> {
  let search = found.get(host)
  if (!search) {
    search = (async () => {
      for (const place of PLACES) {
        const url = `https://${host}${place}`
        if (await loads(url))
          return url
      }
      return null
    })()
    found.set(host, search)
  }
  return search
}
