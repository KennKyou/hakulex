import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMConversionMap, DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode, Spread } from 'lexical'
import { mentionLabel, mentionUrl } from '@hakulex/renderer'
import { contentTheme } from '@hakulex/style-token'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import MentionEditor from '../components/MentionEditor.vue'

export interface MentionData {
  platform: string
  handle: string
  displayName?: string
}

export type SerializedMentionNode = Spread<Pick<MentionData, keyof MentionData>, SerializedLexicalNode>

function asText(value: unknown) {
  return typeof value === 'string'
    ? value
    : ''
}

function normalizeMention(data: Partial<Record<keyof MentionData, unknown>>): MentionData {
  return {
    platform: asText(data.platform),
    handle: asText(data.handle),
    ...(typeof data.displayName === 'string'
      ? { displayName: data.displayName }
      : {}),
  }
}

/** Inline, so it reads as part of the sentence: arrow keys pass over it and it deletes in one go. */
export class MentionNode extends DecoratorNode<VueDecorator> {
  __data: MentionData

  static getType(): string {
    return 'mention'
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__data, node.__key)
  }

  static importJSON(json: SerializedMentionNode): MentionNode {
    return $applyNodeReplacement(new MentionNode(json)).updateFromJSON(json)
  }

  static importDOM(): DOMConversionMap {
    const convert = (element: HTMLElement) => (element.dataset.hlxMention !== undefined
      ? {
          conversion: () => ({
            node: $createMentionNode(element.dataset.platform ?? '', element.dataset.handle ?? '', element.dataset.displayName),
            forChild: () => null,
          }),
          priority: 2 as const,
        }
      : null)
    return { a: convert, span: convert }
  }

  constructor(data: Partial<Record<keyof MentionData, unknown>>, key?: NodeKey) {
    super(key)
    this.__data = normalizeMention(data)
  }

  exportJSON(): SerializedMentionNode {
    return {
      ...super.exportJSON(),
      ...this.__data,
    }
  }

  exportDOM(): DOMExportOutput {
    const data = this.__data
    const url = mentionUrl(data)
    const element = document.createElement(url ? 'a' : 'span')
    if (url) {
      element.setAttribute('href', url)
      element.setAttribute('rel', 'noopener noreferrer')
    }
    element.className = contentTheme.mention
    element.dataset.hlxMention = ''
    element.dataset.platform = data.platform
    element.dataset.handle = data.handle
    if (data.displayName !== undefined)
      element.dataset.displayName = data.displayName
    element.textContent = url
      ? mentionLabel(data)
      : this.getTextContent()
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('span')
    element.className = 'hlx-mention-node'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return true
  }

  isKeyboardSelectable(): boolean {
    return false
  }

  getTextContent(): string {
    return `@${mentionLabel(this.__data)}`
  }

  getData(): MentionData {
    return this.getLatest().__data
  }

  setData(data: MentionData): this {
    const writable = this.getWritable()
    writable.__data = normalizeMention(data)
    return writable
  }

  decorate(): VueDecorator {
    return vueDecorator(MentionEditor, this.__key, { data: this.__data })
  }
}

export function $createMentionNode(platform: string, handle: string, displayName?: string): MentionNode {
  return $applyNodeReplacement(new MentionNode({ platform, handle, displayName }))
}

export function $isMentionNode(node: LexicalNode | null | undefined): node is MentionNode {
  return node instanceof MentionNode
}
