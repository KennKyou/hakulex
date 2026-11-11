import type { LexicalEditor, LexicalNode } from 'lexical'
import {
  $createNodeSelection,
  $createParagraphNode,
  $getSelection,
  $isDecoratorNode,
  $isElementNode,
  $isNodeSelection,
  $isRangeSelection,
  $setSelection,
} from 'lexical'

export function $selectNode(node: LexicalNode) {
  const selection = $createNodeSelection()
  selection.add(node.getKey())
  $setSelection(selection)
}

/** The node in a NodeSelection, if that is all it holds and `$matches` accepts it. */
export function $selectedBlock<T extends LexicalNode>($matches: (node: LexicalNode) => node is T): T | null {
  const selection = $getSelection()
  if (!$isNodeSelection(selection))
    return null
  const nodes = selection.getNodes()
  return nodes.length === 1 && $matches(nodes[0])
    ? nodes[0]
    : null
}

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

const isReachable = (node: LexicalNode | null): node is LexicalNode => $isElementNode(node) || ($isDecoratorNode(node) && node.isKeyboardSelectable())

/**
 * Up / Down around blocks `$matches` accepts. Browsers skip non-editable blocks, so
 * moving onto one and off it again is done here. A block at either end of the
 * document, or next to something the keyboard can't select, gets a line to go to.
 */
export function $moveAroundBlock(
  editor: LexicalEditor,
  $matches: (node: LexicalNode) => boolean,
  direction: 'up' | 'down',
  event: KeyboardEvent | null,
): boolean {
  if (event?.shiftKey)
    return false
  const backward = direction === 'up'
  const current = $selectedBlock((node): node is LexicalNode => $matches(node))
  if (current) {
    let neighbor = backward
      ? current.getPreviousSibling()
      : current.getNextSibling()
    if (!isReachable(neighbor)) {
      neighbor = $createParagraphNode()
      if (backward)
        current.insertBefore(neighbor)
      else
        current.insertAfter(neighbor)
    }
    if ($isElementNode(neighbor)) {
      if (backward)
        neighbor.selectEnd()
      else
        neighbor.selectStart()
    }
    else if (neighbor) {
      $selectNode(neighbor)
    }
    event?.preventDefault()
    return true
  }

  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed())
    return false
  const block = selection.anchor.getNode().getTopLevelElement()
  const neighbor = backward
    ? block?.getPreviousSibling()
    : block?.getNextSibling()
  if (!block || !neighbor || !$matches(neighbor) || !isCaretOnEdgeLine(editor, block, backward ? 'first' : 'last'))
    return false
  event?.preventDefault()
  $selectNode(neighbor)
  return true
}
