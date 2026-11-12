import type { SerializedLexicalNode } from 'lexical'
import { DELETE_MARK_STYLE, INSERT_MARK_STYLE } from '@hakulex/diff-core'

interface TextNode extends SerializedLexicalNode {
  type: 'text'
  text: string
  format: number
  style: string
}
type Kind = 'equal' | 'insert' | 'delete'

/** Longer blocks than this are not compared letter by letter: the table for it grows with both lengths. */
const LIMIT = 4000

function isText(node: SerializedLexicalNode): node is TextNode {
  return node.type === 'text' && typeof (node as Partial<TextNode>).text === 'string'
}

const childrenOf = (block: SerializedLexicalNode) => ((block as { children?: SerializedLexicalNode[] }).children ?? [])

/** Every letter of a block's text, with the text node it is in. */
function letters(nodes: TextNode[]) {
  return nodes.flatMap(node => Array.from(node.text, letter => ({ letter, node })))
}

/**
 * One block that reads as both versions of a text block: what the two share once, what only
 * the old one has struck through, what only the new one has marked. Compared letter by letter
 * across the whole block, so that a word made bold shows as that word changing, not as the
 * sentence around it being rewritten. `null` when the blocks hold more than plain text runs.
 */
export function mergeText(before: SerializedLexicalNode, after: SerializedLexicalNode): SerializedLexicalNode | null {
  const oldNodes = childrenOf(before)
  const newNodes = childrenOf(after)
  if (!oldNodes.every(isText) || !newNodes.every(isText))
    return null
  const old = letters(oldNodes)
  const now = letters(newNodes)
  if (old.length > LIMIT || now.length > LIMIT)
    return null

  // Longest common subsequence, filled from the end so that it can be read from the start.
  const width = now.length + 1
  const table = new Uint16Array((old.length + 1) * width)
  for (let i = old.length - 1; i >= 0; i--) {
    for (let j = now.length - 1; j >= 0; j--) {
      table[i * width + j] = old[i].letter === now[j].letter
        ? table[(i + 1) * width + j + 1] + 1
        : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
    }
  }

  const runs: { kind: Kind, node: TextNode, text: string }[] = []
  const push = (kind: Kind, node: TextNode, letter: string) => {
    const last = runs.at(-1)
    if (last && last.kind === kind && last.node === node)
      last.text += letter
    else runs.push({ kind, node, text: letter })
  }
  let i = 0
  let j = 0
  while (i < old.length || j < now.length) {
    if (i < old.length && j < now.length && old[i].letter === now[j].letter) {
      // The same letter in another format is a change too: it shows as the new one, marked.
      push(old[i].node.format === now[j].node.format
        ? 'equal'
        : 'insert', now[j].node, now[j].letter)
      i += 1
      j += 1
    }
    // On a tie what went comes first, as one reads a correction: the old words, then the new.
    else if (j < now.length && (i >= old.length || table[i * width + j + 1] > table[(i + 1) * width + j])) {
      push('insert', now[j].node, now[j].letter)
      j += 1
    }
    else {
      push('delete', old[i].node, old[i].letter)
      i += 1
    }
  }

  const mark = { equal: '', insert: INSERT_MARK_STYLE, delete: DELETE_MARK_STYLE }
  const children = runs.map(({ kind, node, text }) => ({
    ...node,
    text,
    style: [node.style, mark[kind]].filter(Boolean).join(' '),
  }))
  return { ...after, children } as SerializedLexicalNode
}
