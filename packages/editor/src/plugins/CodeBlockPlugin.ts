import type { LexicalEditor, LexicalNode } from 'lexical'
import type { CaretPlacement } from '../code/focus'
import { useLexicalRegister } from '@hakulex/vue-lexical'
import { $insertNodeToNearestRoot, mergeRegister } from '@lexical/utils'
import {
  $getSelection,
  $isParagraphNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_LOW,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical'
import { defineComponent } from 'vue'
import { $replaceWithCodeBlock, FENCE_LINE } from '../code/fence'
import { focusCodeBlock } from '../code/focus'
import { $createCodeBlockNode, $isCodeBlockNode, INSERT_CODE_BLOCK_COMMAND } from '../nodes/CodeBlockNode'

type Direction = 'up' | 'down' | 'left' | 'right'

/** True when the DOM caret is on the first / last visual line of `block`. */
function isCaretOnEdgeLine(editor: LexicalEditor, block: LexicalNode, edge: 'first' | 'last'): boolean {
  const element = editor.getElementByKey(block.getKey())
  const range = element?.ownerDocument.getSelection()?.getRangeAt(0)
  if (!element || !range)
    return false
  const caret = range.getClientRects()[0]
  // Empty lines have no caret rect; they are a single line anyway.
  if (!caret)
    return true
  const box = element.getBoundingClientRect()
  const tolerance = caret.height * 0.75
  return edge === 'first'
    ? caret.top - box.top < tolerance
    : box.bottom - caret.bottom < tolerance
}

/**
 * When the caret sits at the edge of a block and the neighbor in `direction` is a
 * code block, focuses that block's CodeMirror instead of letting the browser
 * skip over the non-editable decorator.
 */
function $enterAdjacentCodeBlock(editor: LexicalEditor, direction: Direction, event: KeyboardEvent | null): boolean {
  const selection = $getSelection()
  if (!$isRangeSelection(selection) || !selection.isCollapsed() || event?.shiftKey)
    return false
  const block = selection.anchor.getNode().getTopLevelElement()
  if (!block)
    return false

  const backward = direction === 'up' || direction === 'left'
  const neighbor = backward
    ? block.getPreviousSibling()
    : block.getNextSibling()
  if (!$isCodeBlockNode(neighbor))
    return false

  let atEdge: boolean
  if (direction === 'up' || direction === 'down') {
    atEdge = isCaretOnEdgeLine(editor, block, direction === 'up'
      ? 'first'
      : 'last')
  }
  else {
    const anchor = selection.anchor
    const node = anchor.getNode()
    atEdge = backward
      ? anchor.offset === 0 && (node.is(block) || node.is(block.getFirstDescendant()))
      : node.is(block)
        ? anchor.offset === block.getChildrenSize()
        : node.is(block.getLastDescendant()) && anchor.offset === node.getTextContentSize()
  }
  if (!atEdge)
    return false

  event?.preventDefault()
  const placement: CaretPlacement = backward ? 'end' : 'start'
  focusCodeBlock(editor, neighbor.getKey(), placement)
  return true
}

/** True for a paragraph containing only text — nothing a code block would lose. */
function $isPlainParagraph(node: LexicalNode | null): boolean {
  return $isParagraphNode(node) && node.getChildren().every($isTextNode)
}

/**
 * Code block behavior: `INSERT_CODE_BLOCK_COMMAND`, "```lang" + Enter, and
 * arrow keys into code blocks from neighboring paragraphs. Needs `CodeBlockNode`.
 */
export const CodeBlockPlugin = defineComponent({
  name: 'CodeBlockPlugin',
  setup() {
    useLexicalRegister(editor => mergeRegister(
      editor.registerCommand(INSERT_CODE_BLOCK_COMMAND, (language) => {
        const selection = $getSelection()
        const block = $isRangeSelection(selection)
          ? selection.anchor.getNode().getTopLevelElement()
          : null
        if (block && $isPlainParagraph(block) && block.getTextContent() === '') {
          $replaceWithCodeBlock(block, language ?? 'plaintext')
          return true
        }
        const node = $insertNodeToNearestRoot($createCodeBlockNode('', language ?? 'plaintext'))
        $setSelection(null)
        focusCodeBlock(editor, node.getKey(), 'start')
        return true
      }, COMMAND_PRIORITY_EDITOR),

      // "```ts" + Enter: the space-triggered markdown shortcut has no Enter variant
      // for multi-line transformers.
      editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed() || event?.shiftKey)
          return false
        const block = selection.anchor.getNode().getTopLevelElement()
        if (!block || !$isPlainParagraph(block))
          return false
        const match = FENCE_LINE.exec(block.getTextContent())
        if (!match || selection.anchor.offset !== selection.anchor.getNode().getTextContentSize())
          return false
        event?.preventDefault()
        $replaceWithCodeBlock(block, match[1])
        return true
      }, COMMAND_PRIORITY_LOW),

      ...(['up', 'down', 'left', 'right'] as const).map(direction => editor.registerCommand(
        {
          up: KEY_ARROW_UP_COMMAND,
          down: KEY_ARROW_DOWN_COMMAND,
          left: KEY_ARROW_LEFT_COMMAND,
          right: KEY_ARROW_RIGHT_COMMAND,
        }[direction],
        event => $enterAdjacentCodeBlock(editor, direction, event),
        COMMAND_PRIORITY_LOW,
      )),
    ))
    return () => null
  },
})
