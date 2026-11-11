import type { LexicalNode, TextNode } from 'lexical'
import { $findMatchingParent } from '@lexical/utils'
import { $isLineBreakNode, $isTextNode } from 'lexical'
import { $createSpoilerNode, $isSpoilerNode } from '../nodes/InlineNodes'

const MARKER = '||'
const WORD_OR_PIPE = /[\w|\\]/

/** Plain text for the marker search. Code is literal, so it holds no markers. */
const isSearchable = (node: LexicalNode): node is TextNode => $isTextNode(node) && !node.hasFormat('code')

function textBefore(node: TextNode): string {
  const previous = node.getPreviousSibling()
  return $isTextNode(previous)
    ? previous.getTextContent().slice(-1)
    : ''
}

/** The nearest `||` that can open a spoiler in `node`, at or before `end`. */
function findOpener(node: TextNode, end: number): number {
  if (end < MARKER.length)
    return -1
  const text = node.getTextContent()
  for (let index = text.lastIndexOf(MARKER, end - MARKER.length); index >= 0; index = text.lastIndexOf(MARKER, index - 1)) {
    const before = index > 0
      ? text[index - 1]
      : textBefore(node)
    const after = index + MARKER.length < end
      ? text[index + MARKER.length]
      : ''
    if (!WORD_OR_PIPE.test(before) && after !== '|' && !/\s/.test(after))
      return index
    if (index === 0)
      break
  }
  return -1
}

/** Walks back through this line for the opening marker. Spoilers don't nest. */
function $findOpening(closing: TextNode, closeStart: number): { node: TextNode, index: number } | null {
  let node: LexicalNode | null = closing
  let end = closeStart
  while (node) {
    if ($isSpoilerNode(node) || $isLineBreakNode(node))
      return null
    if (isSearchable(node)) {
      const index = findOpener(node, end)
      if (index >= 0)
        return { node, index }
    }
    node = node.getPreviousSibling()
    if ($isTextNode(node))
      end = node.getTextContentSize()
  }
  return null
}

/**
 * Turns `||text||` into a spoiler when its closing marker has just been typed at
 * `offset` in `closing`. What is between may be several nodes, as `||a **b**||` is by now.
 */
export function $convertTypedSpoiler(closing: TextNode, offset: number): boolean {
  const closeStart = offset - MARKER.length
  const text = closing.getTextContent()
  if (closeStart < 0 || text.slice(closeStart, offset) !== MARKER || !isSearchable(closing))
    return false
  if ($findMatchingParent(closing, $isSpoilerNode))
    return false

  const previous = closing.getPreviousSibling()
  const charBefore = closeStart > 0
    ? text[closeStart - 1]
    : $isTextNode(previous)
      ? previous.getTextContent().slice(-1)
      : ''
  if (charBefore === '|' || charBefore === '\\' || /\s/.test(charBefore))
    return false

  const opening = $findOpening(closing, closeStart)
  if (!opening)
    return false
  if (opening.node.is(closing) && opening.index + MARKER.length >= closeStart)
    return false

  // The closing marker and what follows it.
  const [head] = offset < text.length
    ? closing.splitText(offset)
    : [closing]
  let last: LexicalNode | null
  if (closeStart > 0) {
    head.setTextContent(text.slice(0, closeStart))
    last = head
  }
  else {
    last = head.getPreviousSibling()
    head.remove()
  }

  // The opening marker and what precedes it.
  const openingNode = opening.node.getLatest()
  const openingText = openingNode.getTextContent()
  const contentStart = opening.index + MARKER.length
  let first: LexicalNode | null
  if (contentStart < openingText.length) {
    const [markerPart, content] = openingNode.splitText(contentStart)
    first = content
    if (last?.is(openingNode))
      last = content
    markerPart.setTextContent(openingText.slice(0, opening.index))
    if (opening.index === 0)
      markerPart.remove()
  }
  else {
    first = openingNode.getNextSibling()
    openingNode.setTextContent(openingText.slice(0, opening.index))
    if (opening.index === 0)
      openingNode.remove()
  }
  if (!first || !last)
    return false

  const nodes: LexicalNode[] = []
  for (let node: LexicalNode | null = first; node; node = node.getNextSibling()) {
    nodes.push(node)
    if (node.is(last))
      break
  }
  const spoiler = $createSpoilerNode()
  first.insertBefore(spoiler)
  spoiler.append(...nodes)
  spoiler.selectNext(0, 0)
  return true
}
