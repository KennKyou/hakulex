import type { DOMExportOutput, EditorConfig, LexicalNode, NodeKey, SerializedTextNode } from 'lexical'
import { safeCommentText } from '@hakulex/renderer'
import { $applyNodeReplacement, TextNode } from 'lexical'
import { $isBeingTypedOver, withTextString } from './TagNode'

export type SerializedCommentNode = SerializedTextNode

/**
 * An HTML comment: the author sees and edits it, readers don't. HTML import skips
 * comments on purpose, as browsers and Word add plenty of their own to the clipboard.
 */
export class CommentNode extends TextNode {
  static getType(): string {
    return 'comment'
  }

  static clone(node: CommentNode): CommentNode {
    return new CommentNode(node.__text, node.__key)
  }

  static importJSON(json: SerializedCommentNode): CommentNode {
    return $createCommentNode().updateFromJSON(withTextString(json))
  }

  static importDOM(): null {
    return null
  }

  constructor(text = '', key?: NodeKey) {
    super(text, key)
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add('hlx-comment')
    return dom
  }

  exportDOM(): DOMExportOutput {
    return {
      element: document.createComment(safeCommentText(this.getTextContent())) as unknown as HTMLElement,
    }
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

export function $createCommentNode(text = ''): CommentNode {
  return $applyNodeReplacement(new CommentNode(text))
}

export function $isCommentNode(node: LexicalNode | null | undefined): node is CommentNode {
  return node instanceof CommentNode
}
