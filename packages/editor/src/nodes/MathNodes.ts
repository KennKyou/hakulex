import type { VueDecorator } from '@hakulex/vue-lexical'
import type {
  DOMConversionMap,
  DOMExportOutput,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from 'lexical'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, createCommand, DecoratorNode } from 'lexical'
import MathEditor from '../components/MathEditor.vue'

export type SerializedMathNode = Spread<{ equation: string }, SerializedLexicalNode>
/** `color` is only stored: nothing here reads it, but it stays in the document. */
export type SerializedKaTeXInlineNode = Spread<{ color?: unknown }, SerializedMathNode>

/** Inserts an equation; with no `equation`, an empty one whose editor opens. */
export const INSERT_MATH_COMMAND = createCommand<{ display: boolean, equation?: string }>('INSERT_MATH_COMMAND')

function exportMathDOM(tag: 'span' | 'div', display: 'inline' | 'block', equation: string): DOMExportOutput {
  const element = document.createElement(tag)
  element.dataset.math = display
  element.textContent = equation
  return { element }
}

/** `$...$` inside text. Serializes as `katex-inline`. */
export class KaTeXInlineNode extends DecoratorNode<VueDecorator> {
  __equation: string
  /** `undefined` when the document has none. */
  __color: unknown

  static getType(): string {
    return 'katex-inline'
  }

  static clone(node: KaTeXInlineNode): KaTeXInlineNode {
    const clone = new KaTeXInlineNode(node.__equation, node.__key)
    clone.__color = node.__color
    return clone
  }

  static importJSON(serialized: SerializedKaTeXInlineNode): KaTeXInlineNode {
    const node = $createKaTeXInlineNode(serialized.equation).updateFromJSON(serialized)
    node.__color = serialized.color
    return node
  }

  static importDOM(): DOMConversionMap {
    return {
      span: element => (element.dataset.math === 'inline'
        ? {
            conversion: el => ({
              node: $createKaTeXInlineNode(el.textContent ?? ''),
            }),
            priority: 1,
          }
        : null),
    }
  }

  constructor(equation = '', key?: NodeKey) {
    super(key)
    this.__equation = equation
  }

  exportJSON(): SerializedKaTeXInlineNode {
    return {
      ...super.exportJSON(),
      equation: this.__equation,
      ...(this.__color === undefined
        ? {}
        : { color: this.__color }),
    }
  }

  exportDOM(): DOMExportOutput {
    return exportMathDOM('span', 'inline', this.__equation)
  }

  createDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'hlx-math-inline'
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): true {
    return true
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return this.__equation
  }

  getEquation(): string {
    return this.getLatest().__equation
  }

  setEquation(equation: string): this {
    const writable = this.getWritable()
    writable.__equation = equation
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(MathEditor, this.__key, { equation: this.__equation, displayMode: false })
  }
}

/** `$$...$$` on its own. Serializes as `katex-block`. */
export class KaTeXBlockNode extends DecoratorNode<VueDecorator> {
  __equation: string

  static getType(): string {
    return 'katex-block'
  }

  static clone(node: KaTeXBlockNode): KaTeXBlockNode {
    return new KaTeXBlockNode(node.__equation, node.__key)
  }

  static importJSON(serialized: SerializedMathNode): KaTeXBlockNode {
    return $createKaTeXBlockNode(serialized.equation).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      div: element => (element.dataset.math === 'block'
        ? {
            conversion: el => ({
              node: $createKaTeXBlockNode(el.textContent ?? ''),
            }),
            priority: 1,
          }
        : null),
    }
  }

  constructor(equation = '', key?: NodeKey) {
    super(key)
    this.__equation = equation
  }

  exportJSON(): SerializedMathNode {
    return {
      ...super.exportJSON(),
      equation: this.__equation,
    }
  }

  exportDOM(): DOMExportOutput {
    return exportMathDOM('div', 'block', this.__equation)
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'hlx-math-block'
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
    return `${this.__equation}\n`
  }

  getEquation(): string {
    return this.getLatest().__equation
  }

  setEquation(equation: string): this {
    const writable = this.getWritable()
    writable.__equation = equation
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(MathEditor, this.__key, { equation: this.__equation, displayMode: true })
  }
}

export function $createKaTeXInlineNode(equation = ''): KaTeXInlineNode {
  return $applyNodeReplacement(new KaTeXInlineNode(equation))
}

export function $isKaTeXInlineNode(node: LexicalNode | null | undefined): node is KaTeXInlineNode {
  return node instanceof KaTeXInlineNode
}

export function $createKaTeXBlockNode(equation = ''): KaTeXBlockNode {
  return $applyNodeReplacement(new KaTeXBlockNode(equation))
}

export function $isKaTeXBlockNode(node: LexicalNode | null | undefined): node is KaTeXBlockNode {
  return node instanceof KaTeXBlockNode
}

export type MathNode = KaTeXInlineNode | KaTeXBlockNode

export function $isMathNode(node: LexicalNode | null | undefined): node is MathNode {
  return $isKaTeXInlineNode(node) || $isKaTeXBlockNode(node)
}
