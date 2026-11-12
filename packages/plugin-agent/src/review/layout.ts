import type { Proposal, ReviewItem } from '@hakulex/agent-core'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { computeInlineDiff } from '@hakulex/diff-core'
import { mergeText } from './merge'

/**
 * How an item is drawn.
 * `inline`: old and new merged into one block, drawn where the block is, which is covered.
 * `stack`: the new block under the old one, which stays as it is.
 * `insert`: new blocks where they would go.
 * `delete`: only the answers, on the block that would go.
 */
export type Mode = 'inline' | 'stack' | 'insert' | 'delete'

export interface Placed {
  item: ReviewItem
  mode: Mode
  /** The ID of the block the card belongs to, or `start` for the top of the document. */
  anchor: string
  /** What the card shows as content; nothing for a deletion. */
  content: SerializedEditorState | null
}

export const START = 'start'

/** Blocks whose old and new text can be read as one: the rest are compared one under the other. */
const TEXT_BLOCKS = new Set(['paragraph', 'heading', 'quote'])

function documentOf(children: SerializedLexicalNode[]) {
  return ({
    root: {
      type: 'root',
      version: 1,
      direction: null,
      format: '',
      indent: 0,
      children,
    },
  }) as unknown as SerializedEditorState
}

/** A block holding both versions, what went struck through and what came marked; `null` when they don't merge. */
function merged(before: SerializedLexicalNode, after: SerializedLexicalNode): SerializedLexicalNode | null {
  if (before.type !== after.type || !TEXT_BLOCKS.has(before.type))
    return null
  // Plain runs of text are compared letter by letter over the whole block. With links and the
  // like inside, the comparison goes node by node, and gives up when it can't mark the change.
  // A block rewritten so much that it would not read as one is not merged at all.
  const letters = mergeText(before, after)
  if (letters === 'apart')
    return null
  if (letters)
    return letters
  const blocks = computeInlineDiff(documentOf([before]), documentOf([after]))
  return blocks.length === 1 && blocks[0].type === 'modify'
    ? blocks[0].node
    : null
}

/**
 * Says for each item how it is drawn and which block its card belongs to. A replacement or a
 * deletion belongs to its own block. New blocks belong where they would go: under the block
 * before them, and when that one is gone, above the block after them.
 */
export function place(items: ReviewItem[], proposal: Proposal, blockIds: string[]): Placed[] {
  const under = (index: number) => index > 0
    ? blockIds[index - 1]
    : START
  return items.map((item): Placed => {
    if (item.kind === 'delete') {
      return {
        item,
        mode: 'delete',
        anchor: item.blockIds[0],
        content: null,
      }
    }
    if (item.kind === 'replace') {
      // A block the user has edited since is theirs to see and to go on editing.
      const both = item.state === 'pending' && item.before[0]
        ? merged(item.before[0], item.after[0])
        : null
      return both
        ? {
            item,
            mode: 'inline',
            anchor: item.blockIds[0],
            content: documentOf([both]),
          }
        : {
            item,
            mode: 'stack',
            anchor: item.blockIds[0],
            content: documentOf(item.after),
          }
    }
    const content = documentOf(item.after)
    const gap = proposal.changes.find(change => change.kind === 'insert' && change.blocks.some(block => block.id === item.blockIds[0]))
    const after = gap?.kind === 'insert'
      ? gap.after
      : null
    const before = gap?.kind === 'insert'
      ? gap.before
      : null
    if (after !== null && blockIds.includes(after)) {
      return {
        item,
        mode: 'insert',
        anchor: after,
        content,
      }
    }
    if (before !== null && blockIds.includes(before)) {
      return {
        item,
        mode: 'insert',
        anchor: under(blockIds.indexOf(before)),
        content,
      }
    }
    // The start when it was meant for the start; otherwise, with both neighbours gone, the end.
    return {
      item,
      mode: 'insert',
      anchor: after === null
        ? START
        : (blockIds.at(-1) ?? START),
      content,
    }
  })
}
