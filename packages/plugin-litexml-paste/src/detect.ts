import type { LitexmlRegistry } from '@hakulex/litexml'
import type { SerializedLexicalNode } from 'lexical'
import { createDefaultRegistry, deserializeNodesFromXml } from '@hakulex/litexml'

/** The tags only LiteXML has. */
const LITEXML_TAGS = [
  'doc',
  'fragment',
  'img',
  'video',
  'link-card',
  'embed',
  'codeblock',
  'mermaid',
  'math',
  'alert',
  'banner',
  'nested-doc',
  'details',
  'spoiler',
  'ruby',
  'mention',
  'tag',
  'comment',
  'footnote',
  'footnote-section',
  'gallery',
  'excalidraw',
  'chart',
  'grid',
  'cell',
  'steps',
  'step',
  'agent-diff',
  'code-snippet',
  'chat',
  'poll',
]

const LITEXML_TAG_PATTERN = new RegExp(`<\\/?(?:${LITEXML_TAGS.join('|')})(?:\\s|>|\\/>)`, 'i')

/**
 * HTML's ruby: LiteXML's <ruby> keeps its reading in an `rt` attribute and never has these
 * elements, so text with them is HTML, which Markdown paste reads as a ruby.
 */
const HTML_RUBY_PATTERN = /<\/?(?:rt|rp)(?:\s|>|\/>)/i

/** Whether text holds one of LiteXML's own tags, so pasting it should make blocks. */
export function detectLiteXml(text: string): boolean {
  const trimmed = text.trim()
  return LITEXML_TAG_PATTERN.test(trimmed) && !HTML_RUBY_PATTERN.test(trimmed)
}

let registry: LitexmlRegistry | null = null

/** The nodes LiteXML text describes, in the stored shape; `null` when it isn't LiteXML or holds none. */
export function parseLiteXmlSerializedNodes(xml: string): SerializedLexicalNode[] | null {
  if (!detectLiteXml(xml))
    return null
  registry ??= createDefaultRegistry()
  const nodes = deserializeNodesFromXml(xml, registry)
  return nodes.length > 0
    ? nodes
    : null
}
