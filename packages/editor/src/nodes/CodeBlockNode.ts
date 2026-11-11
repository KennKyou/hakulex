import type { VueDecorator } from '@hakulex/vue-lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { normalizeLanguage } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import CodeBlockEditor from '../components/CodeBlockEditor.vue'

export type SerializedCodeBlockNode = Spread<{ code: string, language: string }, SerializedLexicalNode>

/** Inserts a code block (optionally in a language) and focuses it. */
export const INSERT_CODE_BLOCK_COMMAND = createCommand<string | void>('INSERT_CODE_BLOCK_COMMAND')

/** `<pre><code class="language-x">` → language id. */
function languageFromDOM(pre: HTMLElement): string {
  const element = pre.querySelector('code') ?? pre
  const match = [...element.classList].map(c => /^(?:language|lang)-(.+)$/.exec(c)).find(Boolean)
  return normalizeLanguage(match?.[1] ?? element.dataset.language).id
}

/**
 * A code block edited with CodeMirror. Serializes as `code-block` with the code
 * as a string (not as Lexical text nodes).
 */
export class CodeBlockNode extends DecoratorNode<VueDecorator> {
  __code: string
  __language: string

  static getType(): string {
    return 'code-block'
  }

  static clone(node: CodeBlockNode): CodeBlockNode {
    return new CodeBlockNode(node.__code, node.__language, node.__key)
  }

  static importJSON(serialized: SerializedCodeBlockNode): CodeBlockNode {
    // Unlike a new block, a stored one keeps the name it was stored with.
    return $applyNodeReplacement(new CodeBlockNode(serialized.code, serialized.language)).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      pre: () => ({
        conversion: element => ({
          node: $createCodeBlockNode(element.textContent ?? '', languageFromDOM(element)),
        }),
        priority: 1,
      }),
    }
  }

  constructor(code = '', language = 'plaintext', key?: NodeKey) {
    super(key)
    this.__code = code
    this.__language = typeof language === 'string' && language.trim()
      ? language
      : 'plaintext'
  }

  exportJSON(): SerializedCodeBlockNode {
    return {
      ...super.exportJSON(),
      code: this.__code,
      language: this.__language,
    }
  }

  exportDOM(): DOMExportOutput {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = `language-${normalizeLanguage(this.__language).id}`
    code.textContent = this.__code
    pre.append(code)
    return { element: pre }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'hlx-code-block'
    return div
  }

  updateDOM(): false {
    return false
  }

  isInline(): false {
    return false
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return `${this.__code}\n`
  }

  getCode(): string {
    return this.getLatest().__code
  }

  setCode(code: string): this {
    const writable = this.getWritable()
    writable.__code = code
    return writable
  }

  /** The id to show and highlight with, which `exportJSON` doesn't change the stored name to. */
  getLanguage(): string {
    return normalizeLanguage(this.getLatest().__language).id
  }

  setLanguage(language: string): this {
    const id = normalizeLanguage(language).id
    if (id === this.getLanguage())
      return this
    const writable = this.getWritable()
    writable.__language = id
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(CodeBlockEditor, this.__key, { code: this.__code, language: normalizeLanguage(this.__language).id })
  }
}

export function $createCodeBlockNode(code = '', language = 'plaintext'): CodeBlockNode {
  return $applyNodeReplacement(new CodeBlockNode(code, normalizeLanguage(language).id))
}

export function $isCodeBlockNode(node: LexicalNode | null | undefined): node is CodeBlockNode {
  return node instanceof CodeBlockNode
}
