import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { chartTable, parseChartSource } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import ChartEditor from '../components/ChartEditor.vue'

export type SerializedChartNode = SerializedLexicalNode & Record<string, unknown>

/**
 * A chart, from a spec stored as a JSON string. Holds the JSON as loaded, so
 * an unedited spec comes back exactly as it was written.
 */
export class ChartNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'chart'
  }

  static clone(node: ChartNode): ChartNode {
    return new ChartNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedChartNode): ChartNode {
    return $applyNodeReplacement(new ChartNode(json)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedChartNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  /** For pasting somewhere else: the data as a table, or the spec when it isn't valid. */
  exportDOM(): DOMExportOutput {
    const parsed = parseChartSource(this.__raw.spec)
    if (!parsed.ok) {
      const pre = document.createElement('pre')
      pre.textContent = typeof this.__raw.spec === 'string'
        ? this.__raw.spec
        : ''
      return { element: pre }
    }
    const { columns, rows } = chartTable(parsed.spec)
    const table = document.createElement('table')
    if (typeof parsed.spec.title === 'string' && parsed.spec.title) {
      const caption = document.createElement('caption')
      caption.textContent = parsed.spec.title
      table.append(caption)
    }
    const head = document.createElement('tr')
    for (const column of columns) {
      const cell = document.createElement('th')
      cell.textContent = column
      head.append(cell)
    }
    table.append(head)
    for (const row of rows) {
      const line = document.createElement('tr')
      for (const value of row) {
        const cell = document.createElement('td')
        cell.textContent = value === null
          ? ''
          : String(value)
        line.append(cell)
      }
      table.append(line)
    }
    return { element: table }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-chart-block'
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
    const parsed = parseChartSource(this.__raw.spec)
    return parsed.ok && typeof parsed.spec.title === 'string'
      ? parsed.spec.title
      : ''
  }

  getFields(): Record<string, unknown> {
    return this.getLatest().__raw
  }

  /** Replaces what the fields name. Other stored fields stay. */
  setFields(fields: Record<string, unknown>): this {
    const writable = this.getWritable()
    writable.__raw = {
      ...writable.__raw,
      ...fields,
    }
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(ChartEditor, this.__key, { fields: this.__raw })
  }
}

export function $createChartNode(fields: Record<string, unknown>): ChartNode {
  return $applyNodeReplacement(new ChartNode(fields))
}

export function $isChartNode(node: LexicalNode | null | undefined): node is ChartNode {
  return node instanceof ChartNode
}
