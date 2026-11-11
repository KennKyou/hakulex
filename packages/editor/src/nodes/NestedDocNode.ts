import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalCommand, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import type { NestedContent } from '../nested/content'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, $getEditor, createCommand, DecoratorNode } from 'lexical'
import NestedDocEditor from '../components/NestedDocEditor.vue'
import { createEmptyContent, createNestedContent, editedContent, nestedText } from '../nested/content'

/** Inserts a blank nested document with focus inside. */
export const INSERT_NESTED_DOC_COMMAND: LexicalCommand<void> = createCommand('INSERT_NESTED_DOC_COMMAND')

export type SerializedNestedDocNode = SerializedLexicalNode & Record<string, unknown>

/**
 * A document inside the document. Its editor is shared by every version of this node, so
 * deleting the block and undoing brings the content back.
 */
export class NestedDocNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>
  __content: NestedContent

  static getType(): string {
    return 'nested-doc'
  }

  static clone(node: NestedDocNode): NestedDocNode {
    return new NestedDocNode(node.__raw, node.__content, node.__key)
  }

  static importJSON(json: SerializedNestedDocNode): NestedDocNode {
    return $applyNodeReplacement(new NestedDocNode(json, createNestedContent($getEditor(), json.content))).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, content?: NestedContent, key?: NodeKey) {
    super(key)
    this.__raw = raw
    this.__content = content as NestedContent
  }

  exportJSON(): SerializedNestedDocNode {
    const edited = editedContent(this.getLatest().__content)
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
      ...(edited === undefined
        ? {}
        : { content: edited }),
    }
  }

  /** For pasting somewhere else. Pasting here goes through JSON, and stays a nested document. */
  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    element.textContent = this.getTextContent()
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-nested-doc-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return nestedText(this.__content.editor)
  }

  getContent(): NestedContent {
    return this.getLatest().__content
  }

  decorate(): VueDecorator {
    return vueDecorator(NestedDocEditor, this.__key, { content: this.__content })
  }
}

/** A blank one. Call it inside an update of the editor that will hold it. */
export function $createNestedDocNode(): NestedDocNode {
  const content = createEmptyContent()
  return $applyNodeReplacement(new NestedDocNode({ content }, createNestedContent($getEditor(), content)))
}

export function $isNestedDocNode(node: LexicalNode | null | undefined): node is NestedDocNode {
  return node instanceof NestedDocNode
}
