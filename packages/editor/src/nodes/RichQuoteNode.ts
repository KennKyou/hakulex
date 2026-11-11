import type { SerializedQuoteNode } from '@lexical/rich-text'
import type { DOMConversionMap, DOMExportOutput, EditorConfig, ElementDOMSlot, LexicalEditor, LexicalNode, NodeKey } from 'lexical'
import { normalizeAttribution } from '@hakulex/renderer'
import { contentTheme } from '@hakulex/style-token'
import { QuoteNode } from '@lexical/rich-text'
import { $applyNodeReplacement, isHTMLElement, setDOMUnmanaged } from 'lexical'

export type SerializedRichQuoteNode = SerializedQuoteNode & { attribution: string | null }

const footerOf = (quote: HTMLElement) => quote.querySelector<HTMLElement>(`:scope > .${contentTheme.quoteAttribution}`)
function footerText(attribution: string | null) {
  return attribution
    ? `— ${attribution}`
    : ''
}

/**
 * A quote that says who it's by. Quotes without one stay plain `quote` nodes, so
 * documents only change when someone adds an attribution. Once cleared it stays
 * this type with `null`.
 */
export class RichQuoteNode extends QuoteNode {
  __attribution: string | null

  static getType(): string {
    return 'rich-quote'
  }

  static clone(node: RichQuoteNode): RichQuoteNode {
    return new RichQuoteNode(node.__attribution, node.__key)
  }

  static importJSON(json: SerializedRichQuoteNode): RichQuoteNode {
    return $createRichQuoteNode(normalizeAttribution(json.attribution)).updateFromJSON(json)
  }

  static importDOM(): DOMConversionMap {
    return {
      blockquote: (element) => {
        const footer = element.querySelector(':scope > footer')
        if (!footer)
          return null
        return {
          conversion: () => {
            const attribution = (footer.textContent ?? '').replace(/^\s*[—–-]\s*/, '')
            // So it isn't read as part of the quote too. This is a parsed copy, not the page.
            footer.remove()
            return {
              node: $createRichQuoteNode(attribution),
            }
          },
          priority: 1,
        }
      },
    }
  }

  constructor(attribution: unknown = null, key?: NodeKey) {
    super(key)
    this.__attribution = normalizeAttribution(attribution)
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    const footer = document.createElement('footer')
    footer.className = contentTheme.quoteAttribution
    footer.contentEditable = 'false'
    footer.textContent = footerText(this.__attribution)
    setDOMUnmanaged(footer)
    dom.append(footer)
    return dom
  }

  updateDOM(previous: this, dom: HTMLElement): false {
    if (previous.__attribution !== this.__attribution) {
      const footer = footerOf(dom)
      if (footer)
        footer.textContent = footerText(this.__attribution)
    }
    return false
  }

  getDOMSlot(element: HTMLElement): ElementDOMSlot<HTMLElement> {
    return super.getDOMSlot(element).withBefore(footerOf(element))
  }

  exportDOM(editor: LexicalEditor): DOMExportOutput {
    const output = super.exportDOM(editor)
    const { element } = output
    if (!isHTMLElement(element))
      return output
    footerOf(element)?.remove()
    const attribution = this.getAttribution()
    if (!attribution)
      return output
    return {
      ...output,
      // Appends in place, so nothing to hand back: Lexical would replace the element with it.
      after: (generated) => {
        if (isHTMLElement(generated)) {
          const footer = document.createElement('footer')
          footer.className = contentTheme.quoteAttribution
          footer.textContent = footerText(attribution)
          generated.append(footer)
        }
        return null
      },
    }
  }

  exportJSON(): SerializedRichQuoteNode {
    return {
      ...super.exportJSON(),
      attribution: this.getLatest().__attribution,
    }
  }

  getAttribution(): string | null {
    return this.getLatest().__attribution
  }

  setAttribution(attribution: unknown): this {
    const writable = this.getWritable()
    writable.__attribution = normalizeAttribution(attribution)
    return writable
  }
}

export function $createRichQuoteNode(attribution: unknown = null): RichQuoteNode {
  return $applyNodeReplacement(new RichQuoteNode(attribution))
}

export function $isRichQuoteNode(node: LexicalNode | null | undefined): node is RichQuoteNode {
  return node instanceof RichQuoteNode
}
