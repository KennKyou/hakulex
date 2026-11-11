import type { VueDecorator } from '@hakulex/vue-lexical'
import type { DOMExportOutput, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { chatParticipantName, normalizeChat } from '@hakulex/renderer'
import { vueDecorator } from '@hakulex/vue-lexical'
import { $applyNodeReplacement, DecoratorNode } from 'lexical'
import ChatEditor from '../components/ChatEditor.vue'

export type SerializedChatNode = SerializedLexicalNode & Record<string, unknown>

/**
 * A conversation. Holds the JSON as loaded, and reads it when showing it: a document nobody
 * edited has to come out the same, with whatever fields it has or doesn't have.
 */
export class ChatNode extends DecoratorNode<VueDecorator> {
  __raw: Record<string, unknown>

  static getType(): string {
    return 'chat'
  }

  static clone(node: ChatNode): ChatNode {
    return new ChatNode(node.__raw, node.__key)
  }

  static importJSON(json: SerializedChatNode): ChatNode {
    return $applyNodeReplacement(new ChatNode(json)).updateFromJSON(json)
  }

  constructor(raw: Record<string, unknown> = {}, key?: NodeKey) {
    super(key)
    this.__raw = raw
  }

  exportJSON(): SerializedChatNode {
    return {
      ...super.exportJSON(),
      ...this.getLatest().__raw,
    }
  }

  /** For pasting somewhere else. Pasting here goes through JSON, and stays a chat. */
  exportDOM(): DOMExportOutput {
    const element = document.createElement('div')
    const { participants, messages } = normalizeChat(this.__raw)
    for (const { participantId, content } of messages) {
      const line = document.createElement('p')
      const name = document.createElement('strong')
      name.textContent = `${chatParticipantName(participants.find(item => item.id === participantId))}：`
      line.append(name, content)
      element.append(line)
    }
    return { element }
  }

  createDOM(): HTMLElement {
    const element = document.createElement('div')
    element.className = 'hlx-chat-block'
    return element
  }

  updateDOM(): false {
    return false
  }

  isInline(): boolean {
    return false
  }

  getTextContent(): string {
    return normalizeChat(this.__raw).messages.map(message => message.content).join('\n')
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
    return vueDecorator(ChatEditor, this.__key, { fields: this.__raw })
  }
}

export function $createChatNode(fields: Record<string, unknown>): ChatNode {
  return $applyNodeReplacement(new ChatNode(fields))
}

export function $isChatNode(node: LexicalNode | null | undefined): node is ChatNode {
  return node instanceof ChatNode
}
