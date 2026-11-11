import type { BaseSelection, LexicalNode, NodeKey } from 'lexical'
import { $insertNodeToNearestRoot, $splitNode } from '@lexical/utils'
import {
  $createParagraphNode,
  $getEditor,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $hasUpdateTag,
  $isElementNode,
  $isParagraphNode,
  $isRangeSelection,
  $isRootOrShadowRoot,
  $isTextNode,
  $setSelection,
  HISTORY_MERGE_TAG,
} from 'lexical'

/** Whether a saved range still points at something, after edits made in the meantime. */
export function $isRangeUsable(saved: BaseSelection | null): boolean {
  if (!$isRangeSelection(saved))
    return false
  return [saved.anchor, saved.focus].every((point) => {
    const node = $getNodeByKey(point.key)
    if (!node?.isAttached())
      return false
    return point.offset <= ($isElementNode(node)
      ? node.getChildrenSize()
      : node.getTextContentSize())
  })
}

/** Where the caret was when a dialog opened. */
export interface SavedCaret {
  selection: BaseSelection | null
  /** Its block, which outlives the text: the slash menu's "/query" goes in the same update. */
  blockKey: NodeKey | null
}

export function $saveCaret(): SavedCaret {
  const selection = $getSelection()
  return {
    selection: selection?.clone() ?? null,
    blockKey: $isRangeSelection(selection)
      ? selection.anchor.getNode().getTopLevelElement()?.getKey() ?? null
      : null,
  }
}

/**
 * Goes back to where the caret was. Any selection there is now can't be trusted: handing
 * focus back makes Firefox put the caret at the start of the document.
 */
export function $restoreCaret(saved: SavedCaret | null): void {
  if (!saved)
    return
  const { selection, blockKey } = saved
  const block = blockKey
    ? $getNodeByKey(blockKey)
    : null
  if ($isRangeUsable(selection))
    $setSelection(selection!.clone())
  else if ($isElementNode(block) && block.isAttached())
    block.selectEnd()
  else if (selection && !$getSelection() && !$isRangeSelection(selection))
    $setSelection(selection.clone())
}

/** Inserts a block at the caret, reusing a blank line, and leaves the caret on a line after it. */
export function $insertBlock(node: LexicalNode): void {
  const selection = $getSelection()
  const block = $isRangeSelection(selection)
    ? selection.anchor.getNode().getTopLevelElement()
    : null
  const blank = $isParagraphNode(block)
    && block.getChildren().every(child => $isTextNode(child) && child.getTextContentSize() === 0)

  if (blank)
    block.insertBefore(node)
  else if (block)
    $insertNodeToNearestRoot(node)
  else
    $getRoot().append(node)

  let after = node.getNextSibling()
  if (!$isElementNode(after)) {
    after = $createParagraphNode()
    node.insertAfter(after)
  }
  after.selectStart()
}

/**
 * A block pasted inside a paragraph goes up to the top level, splitting the paragraph.
 * Transforms also run over stored documents, when they're registered and when a
 * document is handed over, both without a place in history. A block stored in a
 * paragraph stays there: only one added by an edit moves.
 */
export function $liftBlock(node: LexicalNode): void {
  const parent = node.getParent()
  if (!parent || $isRootOrShadowRoot(parent) || $hasUpdateTag(HISTORY_MERGE_TAG) || $getEditor().getEditorState()._nodeMap.has(node.getKey()))
    return
  const [left, right] = $splitNode(parent, node.getIndexWithinParent())
  right.insertBefore(node)
  for (const side of [left, right]) {
    if ($isElementNode(side) && side.isEmpty())
      side.remove()
  }
}
