import type { InjectionKey } from 'vue'
import type { LinkCardBadge, LinkCardData, LinkCardFetchContext, LinkCardMatch, LinkCardPart, LinkCardProvider, LinkCardSettings } from './types'
import { LINK_CARD_ICONS } from '../callout-icons'
import { isSafeImageSrc } from '../image/src'

/** A site's link card settings, read when a card shows. */
export const LinkCardSettingsKey: InjectionKey<() => LinkCardSettings | undefined> = Symbol('hakulex-link-cards')

/** Built-in providers and a site's, by name (a site's replaces a built-in one), highest priority first. */
export function mergeLinkCardProviders(builtin: readonly LinkCardProvider[], extra?: readonly LinkCardProvider[]): LinkCardProvider[] {
  const byName = new Map(builtin.map(provider => [provider.name, provider]))
  for (const provider of extra ?? [])
    byName.set(provider.name, provider)
  return [
    ...byName.values(),
  ].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
}

/** The first provider that knows this address, and what it reads from it. */
export function matchLinkCardUrl(url: string, providers: readonly LinkCardProvider[]): { provider: LinkCardProvider, match: LinkCardMatch } | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  }
  catch {
    return null
  }
  for (const provider of providers) {
    const match = provider.matchUrl(parsed)
    if (match)
      return { provider, match }
  }
  return null
}

/** A request for a source: its adapter, then the site's `fetchJson`, then `fetch`. */
export async function fetchJsonWithContext<T = any>(url: string, context?: LinkCardFetchContext, provider?: string, init?: RequestInit): Promise<T> {
  const adapter = provider
    ? context?.adapters?.[provider]
    : undefined
  if (adapter)
    return adapter.request<T>(url, init)
  if (context?.fetchJson)
    return context.fetchJson<T>(url, init)
  const response = await fetch(url, init)
  if (!response.ok)
    throw new Error(`Request failed: ${response.status}`)
  return response.json() as Promise<T>
}

/** A GitHub API request, through the `github` adapter when there is one. */
export function fetchGitHubApi<T = any>(path: string, context?: LinkCardFetchContext): Promise<T> {
  return fetchJsonWithContext<T>(`https://api.github.com${path.replace('https://api.github.com', '')}`, context, 'github')
}

/* What a source returns comes from elsewhere: only text, known icons and plain colors are kept. */

const COLOR = /^#[0-9a-f]{3,8}$/i

function text(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : undefined
}
function icon(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(LINK_CARD_ICONS, value)
    ? value as keyof typeof LINK_CARD_ICONS
    : undefined
}
function color(value: unknown) {
  return typeof value === 'string' && COLOR.test(value)
    ? value
    : undefined
}
function part(value: unknown): LinkCardPart | null {
  if (!value || typeof value !== 'object')
    return null
  const raw = value as Record<string, unknown>
  const group = Array.isArray(raw.group)
    ? raw.group.map(part).filter(item => item !== null)
    : undefined
  const result: LinkCardPart = {
    text: text(raw.text),
    icon: icon(raw.icon),
    color: color(raw.color),
    tone: raw.tone === 'faded' || raw.tone === 'tag'
      ? raw.tone
      : undefined,
    group: group?.length
      ? group
      : undefined,
  }
  return result.text || result.icon || result.group
    ? result
    : null
}

/** `null` when it has no title: then there is nothing better than what the document stores. */
export function cleanLinkCardData(value: unknown): LinkCardData | null {
  if (!value || typeof value !== 'object')
    return null
  const raw = value as Record<string, unknown>
  const title = text(raw.title)
  if (!title)
    return null
  const badge = raw.badge && typeof raw.badge === 'object'
    ? raw.badge as Record<string, unknown>
    : undefined
  const badgeText = text(badge?.text)
  const description = Array.isArray(raw.description)
    ? raw.description.map(part).filter(item => item !== null)
    : text(raw.description)
  return {
    title,
    plainTitle: raw.plainTitle === true,
    badge: badge && badgeText
      ? {
        text: badgeText,
        icon: icon(badge.icon),
        color: color(badge.color),
        mono: badge.mono === true,
      } satisfies LinkCardBadge
      : undefined,
    description: Array.isArray(description) && !description.length
      ? undefined
      : description,
    image: isSafeImageSrc(raw.image)
      ? raw.image as string
      : undefined,
    color: color(raw.color),
  }
}

/*
 * A page asks once for each card: what came back, or is on its way, is kept by the provider's
 * name and the id. A failure isn't kept, so the next card that shows asks again.
 */
const cache = new Map<string, Promise<LinkCardData | null>>()

export function fetchLinkCard(provider: LinkCardProvider, id: string, context?: LinkCardFetchContext): Promise<LinkCardData | null> {
  const key = `${provider.name}\n${id}`
  let request = cache.get(key)
  if (!request) {
    request = Promise.resolve()
      .then(() => provider.fetch(id, context))
      .then(cleanLinkCardData)
      .then((data) => {
        if (!data)
          cache.delete(key)
        return data
      }, (error: unknown) => {
        cache.delete(key)
        throw error
      })
    cache.set(key, request)
  }
  return request
}
