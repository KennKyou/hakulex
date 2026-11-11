import type { LexicalNode } from 'lexical'
import { $getEditor, $setSelection } from 'lexical'
import { $createCodeBlockNode } from '../nodes/CodeBlockNode'
import { focusCodeBlock } from './focus'

/** Opening fence: indentation + three or more backticks + optional language. */
export const FENCE_START = /^[ \t]*(`{3,})([\w+#-]*)[ \t]?/
/** A whole paragraph that is only a fence, as typed before pressing Enter. */
export const FENCE_LINE = /^[ \t]*`{3,}([\w+#-]*)$/

/**
 * Replaces `block` with an empty (or `code`-filled) code block and moves the
 * caret into it. Used by the markdown shortcut and the Enter handler.
 */
export function $replaceWithCodeBlock(block: LexicalNode, language: string, code = ''): void {
  const node = $createCodeBlockNode(code, language)
  block.replace(node)
  // CodeMirror takes over the caret; Lexical's selection would point at a removed node.
  $setSelection(null)
  focusCodeBlock($getEditor(), node.getKey(), 'start')
}
