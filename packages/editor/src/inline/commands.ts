import type { ElementNode, LexicalNode, RangeSelection, TextNode } from 'lexical'
import { $findMatchingParent, $unwrapNode } from '@lexical/utils'
import { $isDecoratorNode, $isElementNode, $isLineBreakNode, $isTextNode } from 'lexical'
import { $createRubyNode, $createSpoilerNode, $isRubyNode, $isSpoilerNode } from '../nodes/InlineNodes'

const $spoilerOf = (node: LexicalNode) => $findMatchingParent(node, $isSpoilerNode)
const $rubyOf = (node: LexicalNode) => $findMatchingParent(node, $isRubyNode)
const $blockOf = (node: LexicalNode) => $findMatchingParent(node, parent => $isElementNode(parent) && !parent.isInline())

/** The child of a block that holds `node`, so a link stays whole when part of it is selected. */
function $topInline(node: LexicalNode): LexicalNode {
  let current = node
  let parent = current.getParent()
  while (parent?.isInline()) {
    current = parent
    parent = current.getParent()
  }
  return current
}

const $isInlineLeaf = (node: LexicalNode) => $isTextNode(node) || $isLineBreakNode(node) || ($isDecoratorNode(node) && node.isInline())

/** Selected inline content, split at the selection's edges. */
const $extractLeaves = (selection: RangeSelection) => selection.extract().filter($isInlineLeaf)

/** Text nodes with selected characters; reads without splitting anything. */
function $selectedText(selection: RangeSelection): TextNode[] {
  const [start, end] = selection.isBackward()
    ? [selection.focus, selection.anchor]
    : [selection.anchor, selection.focus]
  return selection.getNodes().filter($isTextNode).filter((node) => {
    if (selection.isCollapsed())
      return true
    if (node.is(start.getNode()) && start.offset === node.getTextContentSize())
      return false
    return !(node.is(end.getNode()) && end.offset === 0)
  })
}

/** Everything from the first selected text node to the last, so nothing past them counts. */
function $selectedBetween(selection: RangeSelection, texts: TextNode[]): LexicalNode[] {
  const nodes = selection.getNodes()
  const start = nodes.findIndex(node => node.is(texts[0]))
  const end = nodes.findIndex(node => node.is(texts[texts.length - 1]))
  return nodes.slice(start, end + 1)
}

/** Keeps the same text selected once nodes have moved around it. */
function $restoreSelection(selection: RangeSelection, leaves: LexicalNode[]) {
  const texts = leaves.filter($isTextNode)
  if (!texts.length)
    return
  const first = texts[0]
  const last = texts[texts.length - 1]
  if (selection.isBackward())
    selection.setTextNodeRange(last, last.getTextContentSize(), first, 0)
  else
    selection.setTextNodeRange(first, 0, last, last.getTextContentSize())
}

function $unwrapInside(parent: ElementNode, $matches: (node: LexicalNode) => boolean) {
  for (const child of parent.getChildren()) {
    if (!$isElementNode(child))
      continue
    $unwrapInside(child, $matches)
    if ($matches(child))
      $unwrapNode(child)
  }
}

export function $isSelectionInSpoiler(selection: RangeSelection): boolean {
  const texts = $selectedText(selection)
  return texts.length > 0 && texts.every(node => $spoilerOf(node) !== null)
}

export function $toggleSpoiler(selection: RangeSelection): boolean {
  if (selection.isCollapsed())
    return false
  const inSpoiler = $isSelectionInSpoiler(selection)
  const leaves = $extractLeaves(selection)
  if (!leaves.length)
    return false

  if (inSpoiler) {
    for (const spoiler of new Set(leaves.map($spoilerOf))) {
      if (spoiler)
        $unwrapNode(spoiler)
    }
  }
  else {
    // A spoiler stays within its block, and a block's content stays in one spoiler.
    const groups = new Map<string, LexicalNode[]>()
    for (const top of new Set(leaves.map(leaf => $topInline(leaf).getLatest()))) {
      const key = top.getParentOrThrow().getKey()
      groups.set(key, [
        ...(groups.get(key) ?? []),
        top,
      ])
    }
    for (const tops of groups.values()) {
      if (!tops.some(top => top.getTextContent().trim()))
        continue
      const spoiler = $createSpoilerNode()
      tops[0].insertBefore(spoiler)
      spoiler.append(...tops)
      $unwrapInside(spoiler, $isSpoilerNode)
    }
  }

  $restoreSelection(selection, leaves)
  return true
}

/** The ruby holding the whole selection. */
export function $rubyOfSelection(selection: RangeSelection) {
  const [first, ...rest] = $selectedText(selection)
  const ruby = first
    ? $rubyOf(first)
    : null
  return ruby && rest.every(node => ruby.is($rubyOf(node)))
    ? ruby
    : null
}

/** A reading annotates one run of text, so it can't cross blocks or lines. */
export function $canApplyRuby(selection: RangeSelection): boolean {
  if ($rubyOfSelection(selection))
    return true
  if (selection.isCollapsed())
    return false
  const texts = $selectedText(selection)
  const block = texts.length
    ? $blockOf(texts[0])
    : null
  return block !== null
    && texts.every(node => block.is($blockOf(node)))
    && !$selectedBetween(selection, texts).some($isLineBreakNode)
}

export function $setRuby(selection: RangeSelection, reading: string): boolean {
  const value = reading.trim()
  const current = $rubyOfSelection(selection)
  if (current) {
    if (value)
      current.setReading(value)
    else
      $unwrapNode(current)
    return true
  }
  if (!value || !$canApplyRuby(selection))
    return false

  const leaves = $extractLeaves(selection)
  const tops = [
    ...new Set(leaves.map(leaf => $topInline(leaf).getLatest())),
  ]
  if (!tops.length)
    return false
  const ruby = $createRubyNode(value)
  tops[0].insertBefore(ruby)
  ruby.append(...tops)
  $unwrapInside(ruby, $isRubyNode)
  $restoreSelection(selection, leaves)
  return true
}

/** The length of the last or first character, whole: emoji and combining marks are several units. */
function characterLength(text: string, backward: boolean): number {
  const characters = [
    ...new Intl.Segmenter().segment(text),
  ]
  return (backward
    ? characters[characters.length - 1]
    : characters[0])?.segment.length ?? 0
}

/**
 * Deletes a character at a caret in a ruby. Lexical deletes by asking the browser to extend
 * the selection, and Firefox can't move through ruby layout, so nothing would happen.
 * True when it dealt with the key.
 */
export function $deleteCharacterInRuby(selection: RangeSelection, backward: boolean): boolean {
  if (!selection.isCollapsed() || selection.anchor.type !== 'text')
    return false
  let node = selection.anchor.getNode() as TextNode
  let offset = selection.anchor.offset
  // Right next to a ruby, deleting toward it reaches in. The caret never rests at its edge.
  const neighbor = backward
    ? node.getPreviousSibling()
    : node.getNextSibling()
  if ($isRubyNode(neighbor) && offset === (backward
    ? 0
    : node.getTextContentSize())) {
    const inner = backward
      ? neighbor.getLastDescendant()
      : neighbor.getFirstDescendant()
    if (!$isTextNode(inner))
      return false
    node = inner
    offset = backward
      ? inner.getTextContentSize()
      : 0
  }
  if (!$rubyOf(node))
    return false
  const text = node.getTextContent()
  const length = backward
    ? characterLength(text.slice(0, offset), true)
    : characterLength(text.slice(offset), false)
  // At the edge of the ruby's text, with nothing to take from it, the usual handling applies.
  if (!length)
    return false
  const start = backward
    ? offset - length
    : offset
  const rest = text.slice(0, start) + text.slice(start + length)
  if (rest) {
    node.setTextContent(rest)
    node.select(start, start)
    return true
  }
  // That was all of it, and an empty text node would only leave a ruby with nothing to annotate.
  const ruby = $rubyOf(node)
  const onlyChild = ruby?.getChildrenSize() === 1
  if (ruby && onlyChild) {
    const next = ruby.getNextSibling()
    const before = ruby.getPreviousSibling()
    ruby.remove()
    if ($isTextNode(next))
      next.select(0, 0)
    else if ($isTextNode(before))
      before.selectEnd()
    return true
  }
  node.remove()
  return true
}

const $wrapperOf = (node: LexicalNode) => $findMatchingParent(node, parent => $isRubyNode(parent) || $isSpoilerNode(parent))

/**
 * A caret at the very edge of a ruby or spoiler moves just outside it, to the same spot on
 * screen. Text typed there belongs outside, and getting it there from inside goes wrong in
 * Firefox: on an element point the text stays in, and while composing it comes out twice.
 */
export function $moveCaretOutOfWrapper(selection: RangeSelection) {
  if (!selection.isCollapsed())
    return
  const { anchor } = selection
  const node = anchor.getNode()
  const wrapper = $wrapperOf(node)
  if (!wrapper || !$isElementNode(wrapper))
    return
  const size = $isTextNode(node)
    ? node.getTextContentSize()
    : (node as ElementNode).getChildrenSize()
  const atEnd = anchor.offset === size && (node.is(wrapper) || node.is(wrapper.getLastDescendant()))
  const atStart = anchor.offset === 0 && (node.is(wrapper) || node.is(wrapper.getFirstDescendant()))
  // A wrapper emptied a moment ago is on its way out; nothing to step out of.
  if (!wrapper.getTextContentSize() || (!atEnd && !atStart))
    return
  const sibling = atEnd
    ? wrapper.getNextSibling()
    : wrapper.getPreviousSibling()
  if ($isTextNode(sibling)) {
    if (atEnd)
      sibling.select(0, 0)
    else
      sibling.selectEnd()
    return
  }
  const parent = wrapper.getParentOrThrow()
  const index = wrapper.getIndexWithinParent() + (atEnd ? 1 : 0)
  parent.select(index, index)
}
