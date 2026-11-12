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

/** Less of the longer text than this in common, and a rewritten block is shown apart. */
const SHARED_AT_LEAST = 0.2

/** One letter of the comparison. `old` is the node it had in the old version, where it was in both. */
interface Step { kind: Kind, node: TextNode, old: TextNode, letter: string }
/** A stretch of steps that are all the same, or all changes. */
interface Stretch { same: boolean, steps: Step[] }

function stretches(steps: Step[]): Stretch[] {
  const out: Stretch[] = []
  for (const step of steps) {
    const same = step.kind === 'equal'
    const last = out.at(-1)
    if (last && last.same === same) {
      last.steps.push(step)
    }
    else {
      out.push({
        same,
        steps: [step],
      })
    }
  }
  return out
}

const count = (steps: Step[], kind: Kind) => steps.filter(step => step.kind === kind).length
/** How much a change is: the longer of what it takes out and what it puts in. */
const weight = (steps: Step[]) => Math.max(count(steps, 'delete'), count(steps, 'insert'))

/**
 * Letter by letter, two sentences share letters by chance, most of all in Chinese, and each one
 * cuts the change around it in two. A shared piece shorter than the change on either side of it
 * is taken into the change, so that it reads as these words for those. Only where the two sides
 * between them both take out and put in: between two cuts, or two additions, the piece stays,
 * or it would show as struck and put back.
 */
function tidy(steps: Step[]): Step[] {
  let parts = stretches(steps)
  for (let at = 1; at < parts.length - 1; at++) {
    const piece = parts[at]
    if (!piece.same)
      continue
    const before = parts[at - 1].steps
    const after = parts[at + 1].steps
    const around = [
      ...before,
      ...after,
    ]
    if (piece.steps.length >= weight(before) || piece.steps.length >= weight(after))
      continue
    if (count(around, 'delete') === 0 || count(around, 'insert') === 0)
      continue
    const joined: Step[] = [
      ...before,
      ...piece.steps.map(step => ({ ...step, kind: 'delete' as const, node: step.old })),
      ...piece.steps.map(step => ({ ...step, kind: 'insert' as const })),
      ...after,
    ]
    parts = [
      ...parts.slice(0, at - 1),
      { same: false, steps: joined },
      ...parts.slice(at + 2),
    ]
    // The change is larger now, and may take in the piece before it too.
    at = Math.max(0, at - 2)
  }
  // Within a change, what went comes first, as one reads a correction: the old words, then the new.
  return parts.flatMap(part => part.same
    ? part.steps
    : [
        ...part.steps.filter(step => step.kind === 'delete'),
        ...part.steps.filter(step => step.kind === 'insert'),
      ])
}

/**
 * One block that reads as both versions of a text block: what the two share once, what only
 * the old one has struck through, what only the new one has marked. Compared letter by letter
 * across the whole block, so that a word made bold shows as that word changing, not as the
 * sentence around it being rewritten.
 *
 * `null` when the blocks hold more than plain text runs. `'apart'` when the block was rewritten
 * so much that merged it would be harder to read than the two versions one under the other.
 */
export function mergeText(before: SerializedLexicalNode, after: SerializedLexicalNode): SerializedLexicalNode | null | 'apart' {
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

  const found: Step[] = []
  let i = 0
  let j = 0
  while (i < old.length || j < now.length) {
    if (i < old.length && j < now.length && old[i].letter === now[j].letter) {
      // The same letter in another format is a change too: it shows as the new one, marked.
      found.push({
        kind: old[i].node.format === now[j].node.format
          ? 'equal'
          : 'insert',
        node: now[j].node,
        old: old[i].node,
        letter: now[j].letter,
      })
      i += 1
      j += 1
    }
    else if (j < now.length && (i >= old.length || table[i * width + j + 1] > table[(i + 1) * width + j])) {
      found.push({
        kind: 'insert',
        node: now[j].node,
        old: now[j].node,
        letter: now[j].letter,
      })
      j += 1
    }
    else {
      found.push({
        kind: 'delete',
        node: old[i].node,
        old: old[i].node,
        letter: old[i].letter,
      })
      i += 1
    }
  }
  const steps = tidy(found)

  // Cutting a lot, or adding a lot, still reads as one block. Rewriting most of it does not.
  const shared = count(steps, 'equal')
  const rewritten = count(steps, 'delete') > 0 && count(steps, 'insert') > 0
  if (rewritten && shared < Math.max(old.length, now.length) * SHARED_AT_LEAST)
    return 'apart'

  const runs: { kind: Kind, node: TextNode, text: string }[] = []
  for (const { kind, node, letter } of steps) {
    const last = runs.at(-1)
    if (last && last.kind === kind && last.node === node)
      last.text += letter
    else runs.push({ kind, node, text: letter })
  }

  const mark = { equal: '', insert: INSERT_MARK_STYLE, delete: DELETE_MARK_STYLE }
  const children = runs.map(({ kind, node, text }) => ({
    ...node,
    text,
    style: [node.style, mark[kind]].filter(Boolean).join(' '),
  }))
  return { ...after, children } as SerializedLexicalNode
}
