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
import MermaidEditor from '../components/MermaidEditor.vue'

export type SerializedMermaidNode = Spread<{ diagram: string }, SerializedLexicalNode>

/** Inserts a diagram; with no source, an empty one whose editor opens. */
export const INSERT_MERMAID_COMMAND = createCommand<string | void>('INSERT_MERMAID_COMMAND')

/** A Mermaid diagram. Serializes as `mermaid` with the source in `diagram`. */
export class MermaidNode extends DecoratorNode<VueDecorator> {
  __diagram: string

  static getType(): string {
    return 'mermaid'
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__diagram, node.__key)
  }

  static importJSON(serialized: SerializedMermaidNode): MermaidNode {
    return $createMermaidNode(serialized.diagram).updateFromJSON(serialized)
  }

  static importDOM(): DOMConversionMap {
    return {
      // `<pre class="mermaid">` is the common convention (and what exportDOM writes).
      // Beats the code block's <pre> conversion.
      pre: element => (element.classList.contains('mermaid')
        ? {
            conversion: el => ({
              node: $createMermaidNode(el.textContent ?? ''),
            }),
            priority: 2,
          }
        : null),
    }
  }

  constructor(diagram = '', key?: NodeKey) {
    super(key)
    this.__diagram = diagram
  }

  exportJSON(): SerializedMermaidNode {
    return {
      ...super.exportJSON(),
      diagram: this.__diagram,
    }
  }

  exportDOM(): DOMExportOutput {
    const pre = document.createElement('pre')
    pre.className = 'mermaid'
    pre.textContent = this.__diagram
    return { element: pre }
  }

  createDOM(): HTMLElement {
    const div = document.createElement('div')
    div.className = 'hlx-mermaid-block'
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
    return `${this.__diagram}\n`
  }

  getDiagram(): string {
    return this.getLatest().__diagram
  }

  setDiagram(diagram: string): this {
    const writable = this.getWritable()
    writable.__diagram = diagram
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(MermaidEditor, this.__key, { diagram: this.__diagram })
  }
}

export function $createMermaidNode(diagram = ''): MermaidNode {
  return $applyNodeReplacement(new MermaidNode(diagram))
}

export function $isMermaidNode(node: LexicalNode | null | undefined): node is MermaidNode {
  return node instanceof MermaidNode
}
