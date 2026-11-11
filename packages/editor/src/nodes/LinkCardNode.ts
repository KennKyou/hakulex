import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMConversionMap, DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { normalizeLinkCard } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import LinkCardEditor from '../components/LinkCardEditor.vue'

export type SerializedLinkCardNode = SerializedLexicalNode & Record<string, unknown>

/**
 * A link shown as a card, with what the document stores about the page. Holds the JSON as
 * loaded, so fields nothing here reads stay, and reads it when showing it: it can be anything.
 */
export class LinkCardNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'link-card'
  }

  static clone(node: LinkCardNode): LinkCardNode {
    return new LinkCardNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedLinkCardNode): LinkCardNode {
    return $applyNodeReplacement(new LinkCardNode(json)).updateFromJSON(json)
  }

  static importDOM(): DOMConversionMap {
    return {
      a: element => (element.dataset.hlxLinkCard !== undefined
        ? {
            conversion: () => ({
              node: $createLinkCardNode(Object.fromEntries(Object.entries({
                url: element.getAttribute('href'),
                title: element.textContent?.trim(),
                description: element.dataset.description,
                favicon: element.dataset.favicon,
                image: element.dataset.image,
              }).filter(([, value]) => value))),
              // The text is the title, already read.
              after: () => [],
            }),
            priority: 2,
          }
        : null),
    }
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedLinkCardNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  exportDOM(): DOMExportOutput {
    const card = normalizeLinkCard(this.__raw)
    if (!card)
      return { element: null }
    if (!card.href) {
      const element = document.createElement('span')
      element.textContent = card.title
      return { element }
    }
    const element = document.createElement('a')
    element.setAttribute('href', card.href)
    element.setAttribute('rel', 'noopener noreferrer')
    element.dataset.hlxLinkCard = ''
    for (const name of ['description', 'favicon', 'image'] as const) {
      const value = card[name]
      if (value)
        element.dataset[name] = value
    }
    element.textContent = card.title
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-link-card-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return normalizeLinkCard(this.__raw)?.title ?? ''
  }

  getFields(): Record<string, unknown> {
    return this.getLatest().__raw
  }

  /** Replaces what the fields name, removing those set to undefined. Other stored fields stay. */
  setFields(fields: Record<string, unknown>): this {
    const writable = this.getWritable()
    const raw = {
      ...writable.__raw,
      ...fields,
    }
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined)
        delete raw[name]
    }
    writable.__raw = raw
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(LinkCardEditor, this.__key, { fields: this.__raw })
  }
}

export function $createLinkCardNode(fields: Record<string, unknown>): LinkCardNode {
  return $applyNodeReplacement(new LinkCardNode(fields))
}

export function $isLinkCardNode(node: LexicalNode | null | undefined): node is LinkCardNode {
  return node instanceof LinkCardNode
}
