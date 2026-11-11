import type { VueDecorator } from '@hakulex/vue-lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalCommand,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { normalizeFootnoteDefinitions, normalizeFootnoteIdentifier } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import FootnoteReference from '../components/FootnoteReference.vue'
import FootnoteSection from '../components/FootnoteSection.vue'

/** Inserts a reference at the caret, with an unused identifier, and goes to its content. */
export const INSERT_FOOTNOTE_COMMAND: LexicalCommand<void> = createCommand('INSERT_FOOTNOTE_COMMAND')

export type SerializedFootnoteNode = Spread<{ identifier: string }, SerializedLexicalNode>

/** `[^1]` in text. Numbered for display only: the document just stores the identifier. */
export class FootnoteNode extends DecoratorNode<VueDecorator> {
  __identifier: string

  static getType(): string {
    return 'footnote'
  }

  static clone(node: FootnoteNode): FootnoteNode {
    return new FootnoteNode(node.__identifier, node.__key)
  }

  static importJSON(serialized: SerializedFootnoteNode): FootnoteNode {
    return $createFootnoteNode(serialized.identifier).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      sup: element => (element.dataset.hlxFootnote
        ? {
            conversion: el => ({
              node: $createFootnoteNode(el.dataset.hlxFootnote),
              // The number inside is for display.
              forChild: () => null,
            }),
            priority: 2,
          }
        : null),
    }
  }

  constructor(identifier: unknown = '', key?: NodeKey) {
    super(key)
    this.__identifier = normalizeFootnoteIdentifier(identifier)
  }

  exportJSON(): SerializedFootnoteNode {
    return {
      ...super.exportJSON(),
      identifier: this.__identifier,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('sup')
    element.dataset.hlxFootnote = this.__identifier
    return { element }
  }

  createDOM(): HTMLElement {
    return document.createElement('span')
  }

  updateDOM(): false {
    return false
  }

  isInline(): true {
    return true
  }

  // Arrow keys pass over it: a selected reference has nothing to offer, and typing would go astray.
  isKeyboardSelectable(): false {
    return false
  }

  getTextContent(): string {
    return this.__identifier
      ? `[^${this.__identifier}]`
      : ''
  }

  getIdentifier(): string {
    return this.getLatest().__identifier
  }

  decorate(): VueDecorator {
    return vueDecorator(FootnoteReference, this.__key, { identifier: this.__identifier })
  }
}

export function $createFootnoteNode(identifier?: unknown): FootnoteNode {
  return $applyNodeReplacement(new FootnoteNode(identifier))
}

export function $isFootnoteNode(node: LexicalNode | null | undefined): node is FootnoteNode {
  return node instanceof FootnoteNode
}

export type SerializedFootnoteSectionNode = Spread<{ definitions: Record<string, string> }, SerializedLexicalNode>

/** The notes themselves. FootnotePlugin keeps one, last in the document. */
export class FootnoteSectionNode extends DecoratorNode<VueDecorator> {
  __definitions: Record<string, string>

  static getType(): string {
    return 'footnote-section'
  }

  static clone(node: FootnoteSectionNode): FootnoteSectionNode {
    return new FootnoteSectionNode(node.__definitions, node.__key)
  }

  static importJSON(serialized: SerializedFootnoteSectionNode): FootnoteSectionNode {
    return $createFootnoteSectionNode(serialized.definitions).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      section: element => (element.dataset.hlxFootnotes !== undefined
        ? {
            conversion: (el) => {
              const entries = [
                ...el.querySelectorAll<HTMLElement>('[data-hlx-definition]'),
              ].map(item => [
                item.dataset.hlxDefinition,
                item.querySelector('.hlx-footnote-text')?.textContent ?? '',
              ])
              return {
                node: $createFootnoteSectionNode(Object.fromEntries(entries)),
                forChild: () => null,
              }
            },
            priority: 2,
          }
        : null),
    }
  }

  constructor(definitions: unknown = {}, key?: NodeKey) {
    super(key)
    this.__definitions = normalizeFootnoteDefinitions(definitions)
  }

  exportJSON(): SerializedFootnoteSectionNode {
    return {
      ...super.exportJSON(),
      definitions: this.__definitions,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('section')
    element.dataset.hlxFootnotes = ''
    const list = document.createElement('ol')
    for (const [identifier, content] of Object.entries(this.__definitions)) {
      const item = document.createElement('li')
      item.dataset.hlxDefinition = identifier
      const text = document.createElement('span')
      text.className = 'hlx-footnote-text'
      text.textContent = content
      item.append(text)
      list.append(item)
    }
    element.append(list)
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-footnote-host'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): false {
    return false
  }

  isKeyboardSelectable(): false {
    return false
  }

  // Notes aren't part of the running text.
  getTextContent(): string {
    return ''
  }

  getDefinitions(): Record<string, string> {
    return this.getLatest().__definitions
  }

  setDefinitions(definitions: Record<string, string>): this {
    const writable = this.getWritable()
    writable.__definitions = definitions
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(FootnoteSection, this.__key, { definitions: this.__definitions })
  }
}

export function $createFootnoteSectionNode(definitions?: unknown): FootnoteSectionNode {
  return $applyNodeReplacement(new FootnoteSectionNode(definitions))
}

export function $isFootnoteSectionNode(node: LexicalNode | null | undefined): node is FootnoteSectionNode {
  return node instanceof FootnoteSectionNode
}
