import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { normalizePoll } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import PollEditor from '../components/PollEditor.vue'

export { createPollId } from './poll-id'

export type SerializedPollNode = SerializedLexicalNode & Record<string, unknown>

/**
 * A poll's question and options. Votes aren't in the document: a backend keeps them by
 * `pollId`. Holds the JSON as loaded, so fields nothing here reads stay.
 */
export class PollNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'poll'
  }

  static clone(node: PollNode): PollNode {
    return new PollNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedPollNode): PollNode {
    return $applyNodeReplacement(new PollNode(json)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedPollNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  /** For pasting somewhere else: the question and the options, without results. */
  exportDOM(): DOMExportOutput {
    const poll = normalizePoll(this.__raw)
    if (!poll)
      return { element: null }
    const element = document.createElement('div')
    if (poll.question) {
      const question = document.createElement('p')
      question.textContent = poll.question
      element.append(question)
    }
    const list = document.createElement('ul')
    for (const option of poll.options) {
      const item = document.createElement('li')
      item.textContent = option.label
      list.append(item)
    }
    element.append(list)
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-poll-block'
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
    const poll = normalizePoll(this.__raw)
    return poll
      ? [
          poll.question,
          ...poll.options.map(option => option.label),
        ].filter(Boolean).join('\n')
      : ''
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
    return vueDecorator(PollEditor, this.__key, { fields: this.__raw })
  }
}

export function $createPollNode(fields: Record<string, unknown>): PollNode {
  return $applyNodeReplacement(new PollNode(fields))
}

export function $isPollNode(node: LexicalNode | null | undefined): node is PollNode {
  return node instanceof PollNode
}
