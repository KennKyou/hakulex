import type {
  BaseSelection,
  DOMConversionMap,
  DOMExportOutput,
  EditorConfig,
  LexicalCommand,
  LexicalNode,
  NodeKey,
  SerializedElementNode,
  Spread,
} from 'lexical'
import { normalizeRubyReading } from '@hakulex/renderer'
import { $applyNodeReplacement, $isRangeSelection, createCommand, ElementNode } from 'lexical'

/** Hides the selected text as a spoiler, or shows it again when it already is one. */
export const TOGGLE_SPOILER_COMMAND: LexicalCommand<void> = createCommand('TOGGLE_SPOILER_COMMAND')
/** Sets the reading of the selected text. A blank reading removes the ruby. */
export const SET_RUBY_COMMAND: LexicalCommand<string> = createCommand('SET_RUBY_COMMAND')

/** Inline wrappers whose edges stay put: text typed there lands outside, so they don't grow. */
abstract class InlineWrapperNode extends ElementNode {
  isInline(): true {
    return true
  }

  canBeEmpty(): false {
    return false
  }

  canInsertTextBefore(): false {
    return false
  }

  canInsertTextAfter(): false {
    return false
  }

  /** Copying text from inside keeps the wrapper, as links do. */
  extractWithChild(_child: LexicalNode, selection: BaseSelection): boolean {
    if (!$isRangeSelection(selection))
      return false
    return this.isParentOf(selection.anchor.getNode())
      && this.isParentOf(selection.focus.getNode())
      && selection.getTextContent().length > 0
  }
}

export type SerializedSpoilerNode = SerializedElementNode

export class SpoilerNode extends InlineWrapperNode {
  static getType(): string {
    return 'spoiler'
  }

  static clone(node: SpoilerNode): SpoilerNode {
    return new SpoilerNode(node.__key)
  }

  static importJSON(json: SerializedSpoilerNode): SpoilerNode {
    return $createSpoilerNode().updateFromJSON(json)
  }

  static importDOM(): DOMConversionMap {
    return {
      span: element => (element.dataset.hlxSpoiler !== undefined || element.classList.contains('hlx-spoiler')
        ? {
            conversion: () => ({
              node: $createSpoilerNode(),
            }),
            priority: 2,
          }
        : null),
    }
  }

  // Hidden unless the stylesheet says otherwise: authors see the text while editing.
  createDOM(): HTMLElement {
    const element = document.createElement('span')
    element.className = 'hlx-spoiler hlx-spoiler--hidden'
    return element
  }

  updateDOM(): false {
    return false
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.dataset.hlxSpoiler = ''
    return { element }
  }
}

export function $createSpoilerNode(): SpoilerNode {
  return $applyNodeReplacement(new SpoilerNode())
}

export function $isSpoilerNode(node: LexicalNode | null | undefined): node is SpoilerNode {
  return node instanceof SpoilerNode
}

export type SerializedRubyNode = Spread<{ reading: string }, SerializedElementNode>

/** Drops the text inside: `rt` and `rp` are read by the `ruby` conversion. */
function dropContent() {
  return {
    conversion: () => ({
      node: null,
      forChild: () => null,
    }),
    priority: 2 as const,
  }
}

export class RubyNode extends InlineWrapperNode {
  __reading: string

  static getType(): string {
    return 'ruby'
  }

  static clone(node: RubyNode): RubyNode {
    return new RubyNode(node.__reading, node.__key)
  }

  static importJSON(json: SerializedRubyNode): RubyNode {
    return $createRubyNode().updateFromJSON(json)
  }

  static importDOM(): DOMConversionMap {
    return {
      ruby: () => ({
        conversion: (element) => {
          const reading = [
            ...element.querySelectorAll('rt'),
          ]
            .map(rt => rt.textContent?.trim())
            .filter(Boolean)
            .join(' ')
          return {
            node: reading
              ? $createRubyNode(reading)
              : null,
          }
        },
        priority: 2,
      }),
      rt: dropContent,
      rp: dropContent,
    }
  }

  constructor(reading = '', key?: NodeKey) {
    super(key)
    this.__reading = normalizeRubyReading(reading)
  }

  updateFromJSON(json: SerializedRubyNode): this {
    return super.updateFromJSON(json).setReading(json.reading)
  }

  exportJSON(): SerializedRubyNode {
    return {
      ...super.exportJSON(),
      reading: this.getReading(),
    }
  }

  getReading(): string {
    return this.getLatest().__reading
  }

  setReading(reading: unknown): this {
    const writable = this.getWritable()
    writable.__reading = normalizeRubyReading(reading)
    return writable
  }

  createDOM(_config: EditorConfig): HTMLElement {
    // The reading is drawn from this attribute, as there is no `rt` here. A real one
    // either takes the caret, or with contenteditable="false" collapses a triple click.
    const element = document.createElement('ruby')
    element.className = 'hlx-ruby'
    element.dataset.reading = this.__reading
    return element
  }

  updateDOM(prev: RubyNode, element: HTMLElement): false {
    if (prev.__reading !== this.__reading)
      element.dataset.reading = this.__reading
    return false
  }

  exportDOM(): DOMExportOutput {
    const reading = this.getReading()
    return {
      element: document.createElement('ruby'),
      // Lexical appends the children afterwards, and the reading has to follow them.
      after: (generated) => {
        const rt = document.createElement('rt')
        rt.textContent = reading
        ;(generated as HTMLElement).append(rt)
      },
    }
  }
}

export function $createRubyNode(reading = ''): RubyNode {
  return $applyNodeReplacement(new RubyNode(reading))
}

export function $isRubyNode(node: LexicalNode | null | undefined): node is RubyNode {
  return node instanceof RubyNode
}
