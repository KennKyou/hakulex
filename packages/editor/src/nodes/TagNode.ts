import type { DOMConversionMap, DOMExportOutput, EditorConfig, LexicalEditor, LexicalNode, NodeKey, SerializedTextNode } from 'lexical'
import { tagHue } from '@hakulex/renderer'
import { contentTheme } from '@hakulex/style-token'
import { $applyNodeReplacement, $getEditor, TextNode } from 'lexical'

export type SerializedTagNode = SerializedTextNode

/** Stored content can make `text` anything, and TextNode expects a string. */
export function withTextString<T extends SerializedTextNode>(json: T): T {
  return typeof json.text === 'string'
    ? json
    : { ...json, text: '' }
}

const typedOver = new WeakMap<LexicalEditor, NodeKey>()

/** Says which tag or comment `editor` is having its selected text typed over, if any. */
export function setTypedOver(editor: LexicalEditor, key: NodeKey | null) {
  if (key)
    typedOver.set(editor, key)
  else
    typedOver.delete(editor)
}

export function getTypedOver(editor: LexicalEditor): NodeKey | null {
  return typedOver.get(editor) ?? null
}

export function $isBeingTypedOver(node: LexicalNode): boolean {
  return typedOver.get($getEditor()) === node.getKey()
}

export class TagNode extends TextNode {
  static getType(): string {
    return 'tag'
  }

  static clone(node: TagNode): TagNode {
    return new TagNode(node.__text, node.__key)
  }

  static importJSON(json: SerializedTagNode): TagNode {
    return $createTagNode().updateFromJSON(withTextString(json))
  }

  static importDOM(): DOMConversionMap {
    return {
      span: element => (element.dataset.hlxTag !== undefined || element.classList.contains(contentTheme.tag)
        ? {
            conversion: () => ({
              node: $createTagNode(element.textContent ?? ''),
            }),
            priority: 2,
          }
        : null),
    }
  }

  constructor(text = '', key?: NodeKey) {
    super(text, key)
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add(contentTheme.tag)
    dom.style.setProperty('--hlx-tag-hue', String(tagHue(this.__text)))
    return dom
  }

  updateDOM(previous: this, dom: HTMLElement, config: EditorConfig): boolean {
    const replace = super.updateDOM(previous, dom, config)
    if (previous.__text !== this.__text)
      dom.style.setProperty('--hlx-tag-hue', String(tagHue(this.__text)))
    return replace
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement('span')
    element.className = contentTheme.tag
    element.dataset.hlxTag = ''
    element.style.setProperty('--hlx-tag-hue', String(tagHue(this.getTextContent())))
    element.textContent = this.getTextContent()
    return { element }
  }

  canInsertTextBefore(): false {
    return false
  }

  // Text typed at the end goes outside, unless this node is being typed over.
  canInsertTextAfter(): boolean {
    return $isBeingTypedOver(this)
  }

  isTextEntity(): true {
    return true
  }
}

export function $createTagNode(text = ''): TagNode {
  return $applyNodeReplacement(new TagNode(text))
}

export function $isTagNode(node: LexicalNode | null | undefined): node is TagNode {
  return node instanceof TagNode
}
