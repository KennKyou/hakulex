import type { LexicalEditor, LexicalNode } from 'lexical'

/** True when the DOM caret is on the first / last visual line of `block`. */
export function isCaretOnEdgeLine(editor: LexicalEditor, block: LexicalNode, edge: 'first' | 'last'): boolean {
  const element = editor.getElementByKey(block.getKey())
  const selection = element?.ownerDocument.getSelection()
  if (!element || !selection?.rangeCount)
    return true
  const caret = selection.getRangeAt(0).getClientRects()[0]
  // Empty lines have no caret rect; they are a single line anyway.
  if (!caret)
    return true
  const box = element.getBoundingClientRect()
  const tolerance = caret.height * 0.75
  return edge === 'first'
    ? caret.top - box.top < tolerance
    : box.bottom - caret.bottom < tolerance
}
