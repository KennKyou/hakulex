import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalCommand, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { DEFAULT_DYNAMIC_HEIGHT } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import DynamicEditor from '../components/DynamicEditor.vue'

export type SerializedDynamicNode = SerializedLexicalNode & Record<string, unknown>

/** Adds an empty dynamic block at the caret, with its panel open. */
export const INSERT_DYNAMIC_COMMAND: LexicalCommand<void> = createCommand('INSERT_DYNAMIC_COMMAND')

/**
 * A component the site serves as a module, loaded by its address. Holds the
 * JSON as loaded, so it goes out as it came in, and reads it when showing it.
 */
export class DynamicNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'dynamic'
  }

  static clone(node: DynamicNode): DynamicNode {
    return new DynamicNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedDynamicNode): DynamicNode {
    return $applyNodeReplacement(new DynamicNode(json)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedDynamicNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  // A program, not text: HTML has nothing to say about it.
  exportDOM(): DOMExportOutput {
    return { element: null }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-dynamic-block'
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
    return ''
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
    return vueDecorator(DynamicEditor, this.__key, { fields: this.__raw })
  }
}

/** A new one stores all three fields. */
export function $createDynamicNode(fields: Record<string, unknown> = { url: '', props: {}, initialHeight: DEFAULT_DYNAMIC_HEIGHT }): DynamicNode {
  return $applyNodeReplacement(new DynamicNode(fields))
}

export function $isDynamicNode(node: LexicalNode | null | undefined): node is DynamicNode {
  return node instanceof DynamicNode
}
