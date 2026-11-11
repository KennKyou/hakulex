import type { LINK_CARD_ICONS } from '../callout-icons'

/*
 * A source of link card data: it knows a site's addresses and
 * fetches what a card shows for one. Sources return data,
 * which the card draws the same way.
 */

/** How a card from this source is laid out: four shapes. */
export type LinkCardShape = 'compact' | 'expanded' | 'wide' | 'poster'

export type LinkCardIconName = keyof typeof LINK_CARD_ICONS

/** A piece of a card's description or the badge beside its title. */
export interface LinkCardPart {
  text?: string
  icon?: LinkCardIconName
  /** A color of the source's own, such as a pull request's state. */
  color?: string
  /** `faded`: fainter, as a repository's name. `tag`: in a small rounded box, as a category. */
  tone?: 'faded' | 'tag'
  /** Pieces kept together on one line, closer together, as a change's added and deleted lines. */
  group?: LinkCardPart[]
}

export interface LinkCardBadge {
  text: string
  icon?: LinkCardIconName
  color?: string
  /** Smaller and in the code font, as a paper's identifier. */
  mono?: boolean
}

export interface LinkCardData {
  title: string
  /** In the normal weight, as a commit's message. */
  plainTitle?: boolean
  badge?: LinkCardBadge
  /** Text, or pieces laid out on a line in the code font. */
  description?: string | LinkCardPart[]
  image?: string
  /** The source's color, which tints the card. */
  color?: string
}

export interface LinkCardMatch {
  id: string
  /** Where the card links to, when not the stored URL. */
  fullUrl?: string
}

/** Makes a request for a source, such as with a token or through the site's own proxy. */
export interface LinkCardApiAdapter {
  request: <T = unknown>(input: string, init?: RequestInit) => Promise<T>
}

export interface LinkCardFetchContext {
  /** By the source's `provider`, such as `github`. */
  adapters?: Record<string, LinkCardApiAdapter>
  /** For every source without an adapter. Without it, `fetch`. */
  fetchJson?: <T = unknown>(input: string, init?: RequestInit) => Promise<T>
}

export interface LinkCardProvider {
  /** Unique; a site's provider with a built-in one's name replaces it. */
  readonly name: string
  readonly displayName?: string
  /** Tried first when higher. */
  readonly priority?: number
  readonly shape?: LinkCardShape
  /** Which adapter makes its requests. */
  readonly provider?: string
  matchUrl: (url: URL) => LinkCardMatch | null
  isValidId: (id: string) => boolean
  fetch: (id: string, context?: LinkCardFetchContext) => Promise<LinkCardData>
}

/** A site's settings for link cards, given to `RichRenderer` and `RichEditor` as `linkCards`. */
export interface LinkCardSettings extends LinkCardFetchContext {
  /** Merged with the built-in ones by name. */
  providers?: readonly LinkCardProvider[]
  /** `false`: cards show only what the document stores, and nothing is fetched. */
  enabled?: boolean
}
