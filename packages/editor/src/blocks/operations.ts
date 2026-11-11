import type { HeadingTagType } from '@lexical/rich-text'
import type { ElementNode, LexicalNode, NodeKey, SerializedLexicalNode } from 'lexical'
import { $createListItemNode, $createListNode, $isListItemNode, $isListNode } from '@lexical/list'
import { $createHeadingNode, $createQuoteNode, $isHeadingNode, $isQuoteNode } from '@lexical/rich-text'
import {
  $addUpdateTag,
  $createParagraphNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isRootNode,
  $parseSerializedNode,
  HISTORY_PUSH_TAG,
} from 'lexical'
import { $selectNode } from '../media/block-navigation'
import { $isFootnoteSectionNode } from '../nodes/FootnoteNodes'

export type BlockType = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'quote' | 'bullet' | 'number' | 'check'
type ListKind = 'bullet' | 'number' | 'check'

/** What the menus offer, in order. */
export const TURNABLE_BLOCK_TYPES: { type: BlockType, label: string }[] = [
  { type: 'paragraph', label: '段落' },
  { type: 'h1', label: '標題 1' },
  { type: 'h2', label: '標題 2' },
  { type: 'h3', label: '標題 3' },
  { type: 'quote', label: '引用' },
  { type: 'bullet', label: '項目清單' },
  { type: 'number', label: '編號清單' },
  { type: 'check', label: '待辦清單' },
]

const isListKind = (type: BlockType): type is ListKind => type === 'bullet' || type === 'number' || type === 'check'

/** The child of the root holding `node`. Containers move as a whole, whatever is inside. */
function $rootChildOf(node: LexicalNode): LexicalNode | null {
  let current: LexicalNode | null = node
  while (current) {
    const parent: ElementNode | null = current.getParent()
    if ($isRootNode(parent))
      return current
    current = parent
  }
  return null
}

/** The blocks that can be moved and copied, in document order. Footnotes keep to themselves. */
function $blocksFor(keys: NodeKey[]): LexicalNode[] {
  const wanted = new Set(keys)
  return $getRoot().getChildren().filter(child => wanted.has(child.getKey()) && !$isFootnoteSectionNode(child))
}

/** The top-level blocks a selection touches. Ending at the very start of one isn't touching it. */
export function $selectionBlockKeys(): NodeKey[] {
  const selection = $getSelection()
  const touched = new Set<NodeKey>()
  if ($isRangeSelection(selection)) {
    const [start, end] = selection.isBackward()
      ? [selection.focus, selection.anchor]
      : [selection.anchor, selection.focus]
    const startBlock = $rootChildOf(start.getNode())
    const endBlock = $rootChildOf(end.getNode())
    for (const node of [
      start.getNode(),
      end.getNode(),
      ...selection.getNodes(),
    ]) {
      const block = $rootChildOf(node)
      if (block)
        touched.add(block.getKey())
    }
    if (endBlock && !endBlock.is(startBlock) && end.offset === 0)
      touched.delete(endBlock.getKey())
  }
  else if ($isNodeSelection(selection)) {
    for (const node of selection.getNodes()) {
      const block = $rootChildOf(node)
      if (block)
        touched.add(block.getKey())
    }
  }
  return $getRoot().getChildren().map(child => child.getKey()).filter(key => touched.has(key))
}

function $neighbor(block: LexicalNode, direction: 'up' | 'down') {
  return direction === 'up'
    ? block.getPreviousSibling()
    : block.getNextSibling()
}

export function $canMoveBlock(key: NodeKey, direction: 'up' | 'down'): boolean {
  const [block] = $blocksFor([key])
  if (!block)
    return false
  const neighbor = $neighbor(block, direction)
  return !!neighbor && !$isFootnoteSectionNode(neighbor)
}

/**
 * Moves the blocks past their neighbor. It is the neighbor that travels, so the
 * selection, which is in the blocks, stays as it is.
 */
export function $moveBlocks(keys: NodeKey[], direction: 'up' | 'down'): boolean {
  const blocks = $blocksFor(keys)
  if (!blocks.length)
    return false
  const first = blocks[0]
  const last = blocks[blocks.length - 1]
  const neighbor = $neighbor(direction === 'up'
    ? first
    : last, direction)
  if (!neighbor || $isFootnoteSectionNode(neighbor))
    return false
  $addUpdateTag(HISTORY_PUSH_TAG)
  if (direction === 'up')
    last.insertAfter(neighbor, false)
  else
    first.insertBefore(neighbor, false)
  return true
}

/** Moves one block to right after `after`, or to the very start with null. */
export function $moveBlockAfter(key: NodeKey, after: NodeKey | null): boolean {
  const [block] = $blocksFor([key])
  if (!block || after === key)
    return false
  const target = after
    ? $getNodeByKey(after)
    : null
  if (after && !target)
    return false
  const previous = block.getPreviousSibling()
  if (target
    ? target.is(previous)
    : previous === null) {
    return false
  }
  $addUpdateTag(HISTORY_PUSH_TAG)
  if (target) {
    target.insertAfter(block, false)
  }
  else {
    $getRoot().getFirstChildOrThrow().insertBefore(block, false)
  }
  return true
}

function $toJSON(node: LexicalNode): SerializedLexicalNode {
  const json = node.exportJSON() as SerializedLexicalNode & { children?: SerializedLexicalNode[] }
  if ($isElementNode(node))
    json.children = node.getChildren().map($toJSON)
  return json
}

/** Puts copies right after the last block, through JSON so every kind of node just works. */
export function $duplicateBlocks(keys: NodeKey[]): boolean {
  const blocks = $blocksFor(keys)
  if (!blocks.length)
    return false
  $addUpdateTag(HISTORY_PUSH_TAG)
  let after = blocks[blocks.length - 1]
  for (const block of blocks) {
    const copy = $parseSerializedNode($toJSON(block))
    after.insertAfter(copy, false)
    after = copy
  }
  return true
}

/** Removes a block, leaving the caret next door, or on a new line if nothing else is left. */
export function $deleteBlock(key: NodeKey): boolean {
  const [block] = $blocksFor([key])
  if (!block)
    return false
  $addUpdateTag(HISTORY_PUSH_TAG)
  const next = block.getNextSibling()
  const previous = block.getPreviousSibling()
  block.remove()
  const neighbor = next && !$isFootnoteSectionNode(next)
    ? next
    : previous
  if ($isElementNode(neighbor)) {
    if (neighbor.is(next))
      neighbor.selectStart()
    else
      neighbor.selectEnd()
  }
  else if (neighbor) {
    $selectNode(neighbor)
  }
  else {
    const line = $createParagraphNode()
    const first = $getRoot().getFirstChild()
    if (first)
      first.insertBefore(line)
    else
      $getRoot().append(line)
    line.select()
  }
  return true
}

/** The block's type, or null for what has no such thing: tables, callouts, images and so on. */
export function $getBlockType(block: LexicalNode): BlockType | null {
  if ($isParagraphNode(block))
    return 'paragraph'
  if ($isHeadingNode(block))
    return block.getTag()
  if ($isQuoteNode(block))
    return 'quote'
  return $isListNode(block)
    ? block.getListType()
    : null
}

export const $canTurnBlock = (block: LexicalNode) => $getBlockType(block) !== null

function $createTextBlock(type: Exclude<BlockType, ListKind>): ElementNode {
  if (type === 'paragraph')
    return $createParagraphNode()
  if (type === 'quote')
    return $createQuoteNode()
  return $createHeadingNode(type as HeadingTagType)
}

/** One block per item, nested ones included. Depth has nowhere to go, but the text stays. */
function $flattenList(list: ElementNode, type: Exclude<BlockType, ListKind>): ElementNode[] {
  return list.getChildren().flatMap((item) => {
    if (!$isListItemNode(item))
      return []
    const nested = item.getFirstChild()
    if ($isListNode(nested))
      return $flattenList(nested, type)
    return [
      $createTextBlock(type).append(...item.getChildren()),
    ]
  })
}

/** Points on elements that are gone, as an empty list item would be, go to where the block is now. */
function $keepSelection(fallback: ElementNode | undefined) {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !fallback)
    return
  const lost = [selection.anchor, selection.focus].some(point => !$getNodeByKey(point.key)?.isAttached())
  if (lost)
    fallback.selectEnd()
}

/**
 * Changes the type of the blocks that have one. Children move as they are, so formats
 * and links stay. Blocks in a row become one list. False when nothing changed.
 */
export function $turnBlocksInto(keys: NodeKey[], type: BlockType): boolean {
  const blocks = $blocksFor(keys).filter($canTurnBlock).filter(block => $getBlockType(block) !== type)
  if (!blocks.length)
    return false
  $addUpdateTag(HISTORY_PUSH_TAG)
  let last: ElementNode | undefined

  if (isListKind(type)) {
    let list: ElementNode | null = null
    for (const block of blocks as ElementNode[]) {
      if ($isListNode(block)) {
        block.setListType(type)
        list = block
        last = block
        continue
      }
      const item = $createListItemNode().append(...block.getChildren())
      if (list?.is(block.getPreviousSibling())) {
        list.append(item)
        block.remove()
      }
      else {
        list = $createListNode(type).append(item)
        block.replace(list)
      }
      last = item
    }
  }
  else {
    for (const block of blocks as ElementNode[]) {
      if ($isListNode(block)) {
        for (const line of $flattenList(block, type)) {
          block.insertBefore(line)
          last = line
        }
        block.remove()
      }
      else {
        last = block.replace($createTextBlock(type), true)
      }
    }
  }
  $keepSelection(last)
  return true
}
