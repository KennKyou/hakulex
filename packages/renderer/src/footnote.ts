import type { VNode, VNodeChild } from 'vue'
import type { SerializedNode } from './types'
import { contentTheme } from '@hakulex/style-token'
import { h } from 'vue'
import { nestedRoots } from './steps'
import { validateUrl } from './url'

export interface FootnoteIndex {
  /** Display numbers, by first appearance in the document. */
  numbers: Map<string, number>
  /** Non-blank content by identifier. */
  definitions: Map<string, string>
}

/** What a stored identifier means: nothing usable when it is not text or is blank. */
export function normalizeFootnoteIdentifier(identifier: unknown): string {
  return typeof identifier === 'string'
    ? identifier.trim()
    : ''
}

/** Stored content is untrusted. Only text values of a plain object survive. */
export function normalizeFootnoteDefinitions(definitions: unknown): Record<string, string> {
  if (typeof definitions !== 'object' || definitions === null || Array.isArray(definitions))
    return {}
  // fromEntries defines own properties, so a `__proto__` key can't change the prototype.
  return Object.fromEntries(Object.entries(definitions).filter(([, value]) => typeof value === 'string'))
}

export function collectFootnotes(root: SerializedNode): FootnoteIndex {
  const index: FootnoteIndex = {
    numbers: new Map(),
    definitions: new Map(),
  }
  const walk = (node: SerializedNode) => {
    if (node.type === 'footnote') {
      const identifier = normalizeFootnoteIdentifier(node.identifier)
      if (identifier && !index.numbers.has(identifier))
        index.numbers.set(identifier, index.numbers.size + 1)
    }
    else if (node.type === 'footnote-section') {
      for (const [identifier, content] of Object.entries(normalizeFootnoteDefinitions(node.definitions))) {
        if (content.trim() && !index.definitions.has(identifier))
          index.definitions.set(identifier, content)
      }
    }
    node.children?.forEach(walk)
    nestedRoots(node).forEach(walk)
  }
  walk(root)
  return index
}

// Stops at spaces and at full-width punctuation, which CJK text puts right after a URL.
const URL_PATTERN = /https?:\/\/[^\s<>"，。、；：！？（）「」『』]+/g
const TRAILING_PUNCTUATION = /[.,;:!?)\]'*_~]+$/

/** Content is plain text, except for http(s) URLs. */
export function linkifyFootnote(content: string): (string | VNode)[] {
  const parts: (string | VNode)[] = []
  let last = 0
  for (const match of content.matchAll(URL_PATTERN)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, '')
    if (!validateUrl(url))
      continue
    if (match.index > last)
      parts.push(content.slice(last, match.index))
    parts.push(h('a', {
      class: contentTheme.link,
      href: url,
      rel: 'noopener noreferrer',
      target: '_blank',
    }, url))
    last = match.index + url.length
  }
  if (last < content.length)
    parts.push(content.slice(last))
  return parts
}

export const footnoteTargetId = (identifier: string) => `footnote-${identifier}`
export const footnoteRefId = (identifier: string) => `footnote-ref-${identifier}`

export interface FootnoteRefProps {
  identifier: string
  number: number | undefined
  content: string | undefined
  /** Only the first reference to a note has an id, as ids can't repeat. */
  first: boolean
}

/** Shared with the editor, so both have the same DOM. */
export function renderFootnoteRef({ identifier, number, content, first }: FootnoteRefProps): VNodeChild {
  const attrs = { 'class': 'hlx-footnote-ref', 'data-hlx-footnote': identifier }
  const label = String(number ?? '')
  // Nothing to go to: only the number.
  if (!content)
    return h('sup', attrs, label)
  return h('sup', attrs, [
    h('a', {
      'id': first
        ? footnoteRefId(identifier)
        : undefined,
      'href': `#${encodeURIComponent(footnoteTargetId(identifier))}`,
      'role': 'doc-noteref',
      'title': content,
      'aria-label': `註腳 ${label}`,
    }, label),
  ])
}

export interface FootnoteItem {
  identifier: string
  number: number
  content: string
}

/** What a section shows: referenced notes that have content, in number order. */
export function footnoteItems(index: FootnoteIndex): FootnoteItem[] {
  return [...index.numbers]
    .flatMap(([identifier, number]) => {
      const content = index.definitions.get(identifier)
      return content
        ? [
            { identifier, number, content },
          ]
        : []
    })
}

/*
 * The way back to the reference: Lucide's undo-2 arrow (ISC), drawn in the text color. The
 * character ↩ would do, but Apple's systems show it as a colored emoji.
 */
function backIcon() {
  return h('svg', {
    'class': 'hlx-footnote-back-icon',
    'viewBox': '0 0 24 24',
    'width': '1em',
    'height': '1em',
    'fill': 'none',
    'stroke': 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }, [
    h('path', { d: 'M9 14 4 9l5-5' }),
    h('path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }),
  ])
}

export function renderFootnoteSection(items: FootnoteItem[]): VNodeChild {
  if (!items.length)
    return null
  return h('section', { 'class': 'hlx-footnotes', 'role': 'doc-endnotes', 'data-hlx-footnotes': '' }, [
    h('hr', { class: 'hlx-footnotes-divider' }),
    h('ol', { class: 'hlx-footnotes-list' }, items.map(({ identifier, number, content }) => h('li', {
      'key': identifier,
      'class': 'hlx-footnote',
      'id': footnoteTargetId(identifier),
      'value': number,
      'data-hlx-definition': identifier,
    }, [
      h('span', { class: 'hlx-footnote-text' }, linkifyFootnote(content)),
      ' ',
      h('a', {
        'class': 'hlx-footnote-back',
        'href': `#${encodeURIComponent(footnoteRefId(identifier))}`,
        'role': 'doc-backlink',
        'aria-label': `回到引用 ${number}`,
      }, [
        backIcon(),
      ]),
    ]))),
  ])
}
