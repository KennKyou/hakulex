import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { UNKNOWN_BLOCK_TYPE, UNKNOWN_INLINE_TYPE, unknownWrapperRaw } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { DecoratorNode } from 'lexical'
import UnknownNode from '../components/UnknownNode.vue'

/** A node of a type this editor doesn't have, kept whole in `raw`. */
export interface SerializedUnknownNode extends SerializedLexicalNode {
  raw?: unknown
  [key: string]: unknown
}

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

abstract class UnknownBaseNode extends DecoratorNode<VueDecorator> {
  /** Everything stored, so a wrapper with bad `raw` still goes back unchanged. */
  __data: SerializedUnknownNode

  constructor(data: SerializedUnknownNode, key?: NodeKey) {
    super(key)
    this.__data = data
  }

  exportJSON(): SerializedUnknownNode {
    return copy(this.__data)
  }

  /** The stored node, if the wrapper is sound. */
  protected getRaw(): Record<string, unknown> | null {
    return unknownWrapperRaw(this.getLatest().__data as never)
  }

  /** The type to show. Stored content can make it anything, or nothing. */
  getUnknownType(): string {
    const type = this.getRaw()?.type
    return typeof type === 'string' && type
      ? type
      : '未知'
  }

  /** Never exported: a placeholder is not content, and `raw` isn't safe to pass on. */
  exportDOM(): DOMExportOutput {
    return { element: null }
  }

  updateDOM(): false {
    return false
  }

  isKeyboardSelectable(): boolean {
    return true
  }
}

export class UnknownBlockNode extends UnknownBaseNode {
  static getType(): string {
    return UNKNOWN_BLOCK_TYPE
  }

  static clone(node: UnknownBlockNode): UnknownBlockNode {
    return new UnknownBlockNode(node.__data, node.__key)
  }

  static importJSON(serialized: SerializedUnknownNode): UnknownBlockNode {
    return new UnknownBlockNode(copy(serialized))
  }

  createDOM(): HTMLElement {
    return document.createElement('div')
  }

  isInline(): false {
    return false
  }

  getTextContent(): string {
    return ''
  }

  decorate(): VueDecorator {
    return vueDecorator(UnknownNode, this.__key, {
      type: this.getUnknownType(),
      inline: false,
    })
  }
}

export class UnknownInlineNode extends UnknownBaseNode {
  static getType(): string {
    return UNKNOWN_INLINE_TYPE
  }

  static clone(node: UnknownInlineNode): UnknownInlineNode {
    return new UnknownInlineNode(node.__data, node.__key)
  }

  static importJSON(serialized: SerializedUnknownNode): UnknownInlineNode {
    return new UnknownInlineNode(copy(serialized))
  }

  createDOM(): HTMLElement {
    return document.createElement('span')
  }

  isInline(): true {
    return true
  }

  getTextContent(): string {
    const text = this.getRaw()?.text
    return typeof text === 'string'
      ? text
      : ''
  }

  decorate(): VueDecorator {
    return vueDecorator(UnknownNode, this.__key, {
      type: this.getUnknownType(),
      text: this.getTextContent(),
      inline: true,
    })
  }
}

export function $isUnknownBlockNode(node: LexicalNode | null | undefined): node is UnknownBlockNode {
  return node instanceof UnknownBlockNode
}

export function $isUnknownInlineNode(node: LexicalNode | null | undefined): node is UnknownInlineNode {
  return node instanceof UnknownInlineNode
}
