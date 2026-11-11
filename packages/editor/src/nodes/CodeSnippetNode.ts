import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { normalizeSnippetFiles } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import CodeSnippetEditor from '../components/CodeSnippetEditor.vue'

export type SerializedCodeSnippetNode = SerializedLexicalNode & Record<string, unknown>

/**
 * Files of code. Holds the JSON as loaded, and reads it when showing it: a document nobody
 * edited has to come out the same, with whatever fields it has or doesn't have.
 */
export class CodeSnippetNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'code-snippet'
  }

  static clone(node: CodeSnippetNode): CodeSnippetNode {
    return new CodeSnippetNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedCodeSnippetNode): CodeSnippetNode {
    return $applyNodeReplacement(new CodeSnippetNode(json)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedCodeSnippetNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  /** For pasting somewhere else. Pasting here goes through JSON, and stays a snippet. */
  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    for (const file of normalizeSnippetFiles(this.__raw.files)) {
      const title = document.createElement('strong')
      title.textContent = file.filename
      const code = document.createElement('code')
      code.textContent = file.code
      const pre = document.createElement('pre')
      pre.append(code)
      element.append(title, pre)
    }
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-snippet-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return normalizeSnippetFiles(this.__raw.files).map(file => file.code).join('\n')
  }

  getFiles(): unknown {
    return this.getLatest().__raw.files
  }

  setFiles(files: unknown[]): this {
    const writable = this.getWritable()
    writable.__raw = { ...writable.__raw, files }
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(CodeSnippetEditor, this.__key, { files: this.__raw.files })
  }
}

export function $createCodeSnippetNode(files: unknown[]): CodeSnippetNode {
  return $applyNodeReplacement(new CodeSnippetNode({ files }))
}

export function $isCodeSnippetNode(node: LexicalNode | null | undefined): node is CodeSnippetNode {
  return node instanceof CodeSnippetNode
}
