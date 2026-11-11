import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMConversionMap, DOMExportOutput, LexicalCommand, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { parseEmbedUrl, parseHttpUrl } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import EmbedEditor from '../components/EmbedEditor.vue'
import { createDecoratorChannel } from '../decorator-channel'

/** Inserts an empty embed with its input focused. */
export const INSERT_EMBED_COMMAND: LexicalCommand<void> = createCommand('INSERT_EMBED_COMMAND')

/** Asks an embed's component to focus its input. */
export const embedFocusChannel = createDecoratorChannel<void>()

export interface EmbedData {
  url: string
  source: string | null
}

export type SerializedEmbedNode = Spread<Pick<EmbedData, keyof EmbedData>, SerializedLexicalNode>

/**
 * A third-party page, shown as an iframe by the renderer and as its URL here. `source` is only
 * kept in the document: the renderer works it out from the URL, since a document can claim anything.
 */
export class EmbedNode extends DecoratorNode<VueDecorator> {
  __url: string
  __source: string | null

  static getType(): string {
    return 'embed'
  }

  static clone(node: EmbedNode): EmbedNode {
    return new EmbedNode(node.__url, node.__source, node.__key)
  }

  static importJSON(json: SerializedEmbedNode): EmbedNode {
    return $applyNodeReplacement(new EmbedNode(json.url, json.source)).updateFromJSON(json)
  }

  static importDOM(): DOMConversionMap {
    return {
      a: element => (element.dataset.hlxEmbed !== undefined
        ? {
            conversion: () => {
              const href = element.getAttribute('href')
              return {
                node: parseHttpUrl(href)
                  ? $applyNodeReplacement(new EmbedNode(href, element.dataset.source ?? parseEmbedUrl(href)?.source ?? null))
                  : null,
                forChild: () => null,
              }
            },
            priority: 2,
          }
        : null),
    }
  }

  constructor(url: unknown = '', source: unknown = null, key?: NodeKey) {
    super(key)
    this.__url = typeof url === 'string'
      ? url
      : ''
    this.__source = typeof source === 'string'
      ? source
      : null
  }

  exportJSON(): SerializedEmbedNode {
    return {
      ...super.exportJSON(),
      url: this.__url,
      source: this.__source,
    }
  }

  exportDOM(): DOMExportOutput {
    if (!parseHttpUrl(this.__url)) {
      const element = document.createElement('span')
      element.textContent = this.__url
      return { element }
    }
    const element = document.createElement('a')
    element.setAttribute('href', this.__url)
    element.setAttribute('rel', 'noopener noreferrer')
    element.dataset.hlxEmbed = ''
    if (this.__source !== null)
      element.dataset.source = this.__source
    element.textContent = this.__url
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-embed-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return this.__url
  }

  getUrl(): string {
    return this.getLatest().__url
  }

  getSource(): string | null {
    return this.getLatest().__source
  }

  /** Changes the URL. The source follows, so the two never disagree after an edit. */
  setUrl(url: string): this {
    const writable = this.getWritable()
    writable.__url = url
    writable.__source = parseEmbedUrl(url)?.source ?? null
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(EmbedEditor, this.__key, { url: this.__url })
  }
}

export function $createEmbedNode(url = ''): EmbedNode {
  return $applyNodeReplacement(new EmbedNode(url, parseEmbedUrl(url)?.source ?? null))
}

export function $isEmbedNode(node: LexicalNode | null | undefined): node is EmbedNode {
  return node instanceof EmbedNode
}
