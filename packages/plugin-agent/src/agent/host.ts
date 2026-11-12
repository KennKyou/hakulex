import type { AgentDocument, AgentSelection, ReviewItem } from '@hakulex/agent-core'
import type { LexicalEditor, LexicalNode, SerializedLexicalNode } from 'lexical'
import type { AgentHost } from './types'
import { $prepareStoredNodes, serializeEditorState } from '@hakulex/editor'
import { $getBlockById, $getBlockId } from '@hakulex/plugin-block-id'
import {
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $isRangeSelection,
  $parseSerializedNode,
  HISTORY_PUSH_TAG,
} from 'lexical'

type Stored = SerializedLexicalNode & { $?: { blockId?: string } }

const storedBlocks = (document: AgentDocument) => ((document.root as unknown as { children?: Stored[] }).children ?? [])

/** The block of the document a node is in. */
function $topLevel(node: LexicalNode): LexicalNode {
  let current = node
  for (let parent = current.getParent(); parent && parent.getKey() !== 'root'; parent = current.getParent())
    current = parent
  return current
}

function $selection(): AgentSelection | undefined {
  const selection = $getSelection()
  const blocks = $getRoot().getChildren()
  const idsBetween = (first: LexicalNode, last: LexicalNode) => {
    const from = blocks.findIndex(block => block.is(first))
    const to = blocks.findIndex(block => block.is(last))
    if (from < 0 || to < 0)
      return []
    return blocks.slice(Math.min(from, to), Math.max(from, to) + 1).map($getBlockId).filter(Boolean)
  }

  if ($isRangeSelection(selection)) {
    if (selection.isCollapsed())
      return undefined
    const anchor = $topLevel(selection.anchor.getNode())
    const focus = $topLevel(selection.focus.getNode())
    if (anchor.is(focus)) {
      const blockId = $getBlockId(anchor)
      const text = selection.getTextContent()
      return blockId && text
        ? { blockId, text }
        : undefined
    }
    const blockIds = idsBetween(anchor, focus)
    return blockIds.length > 0
      ? { blockIds }
      : undefined
  }
  if ($isNodeSelection(selection)) {
    const picked = selection.getNodes().map($topLevel)
    const blockIds = blocks.filter(block => picked.some(node => node.is(block))).map($getBlockId).filter(Boolean)
    return blockIds.length > 0
      ? { blockIds }
      : undefined
  }
  return undefined
}

function $holdsSelection(block: LexicalNode): boolean {
  const selection = $getSelection()
  if ($isRangeSelection(selection))
    return [selection.anchor, selection.focus].some(point => $topLevel(point.getNode()).is(block))
  return $isNodeSelection(selection) && selection.getNodes().some(node => $topLevel(node).is(block))
}

/**
 * Makes the editor's blocks what `target` has for the given items. Only those blocks are
 * touched, so the rest of the document keeps its nodes, its selection and its history.
 */
function $apply(items: ReviewItem[], target: AgentDocument) {
  const wanted = storedBlocks(target)
  const order = wanted.map(block => block.$?.blockId ?? '')
  const $parse = (id: string) => {
    const stored = wanted[order.indexOf(id)]
    return stored
      ? $parseSerializedNode($prepareStoredNodes([stored])[0])
      : null
  }

  for (const item of items) {
    for (const id of item.blockIds) {
      const current = $getBlockById(id)
      if (item.kind === 'delete') {
        current?.remove()
        continue
      }
      const node = $parse(id)
      if (!node)
        continue
      if (item.kind === 'replace') {
        if (current) {
          // A caret in the block that goes away has to go somewhere, or the editor complains.
          const held = $holdsSelection(current)
          current.replace(node)
          if (held)
            node.selectEnd()
        }
        continue
      }
      if (current)
        continue
      // A new block goes after the block that comes before it in the target.
      const before = order[order.indexOf(id) - 1]
      const anchor = before
        ? $getBlockById(before)
        : null
      if (anchor) {
        anchor.insertAfter(node)
      }
      else {
        const first = $getRoot().getFirstChild()
        if (first)
          first.insertBefore(node)
        else $getRoot().append(node)
      }
    }
  }
}

/** What an agent needs from one editor. */
export function hostFor(editor: LexicalEditor): AgentHost {
  return {
    getDocument: () => serializeEditorState(editor.getEditorState()) as AgentDocument,
    editable: () => editor.isEditable(),
    apply: (items, document) => {
      // One update of its own in the history, so that one undo takes back exactly this.
      editor.update(() => $apply(items, document), { discrete: true, tag: HISTORY_PUSH_TAG })
    },
    selection: () => editor.getEditorState().read($selection),
  }
}
