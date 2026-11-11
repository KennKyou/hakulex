import { parseHttpUrl } from './embed'
import { isSafeImageSrc } from './image/src'

/** A link card, ready to show. Stored content is untrusted, so anything unsafe is left out. */
export interface LinkCardProps {
  /** Missing when the stored URL isn't http(s): then it shows as text. */
  href?: string
  title: string
  description?: string
  /** Where the link goes, shorter than the URL. */
  host?: string
  favicon?: string
  image?: string
  /** No title is stored: the URL stands in for it. */
  untitled?: boolean
  /** A provider's name and the id it reads, when the document names them. */
  source?: string
  sourceId?: string
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}
function picture(value: unknown) {
  return isSafeImageSrc(value)
    ? value
    : undefined
}

/** `null` when there is nothing to show. */
export function normalizeLinkCard(node: Record<string, unknown>): LinkCardProps | null {
  const raw = text(node.url)
  const stored = text(node.title)
  const title = stored ?? raw
  if (!title)
    return null
  const url = parseHttpUrl(raw)
  return {
    href: url ? raw : undefined,
    title,
    description: text(node.description),
    host: url
      ? `${url.hostname}${url.pathname === '/'
        ? ''
        : url.pathname}`
      : raw,
    favicon: picture(node.favicon),
    image: picture(node.image),
    untitled: !stored,
    source: text(node.source),
    sourceId: text(node.id),
  }
}
