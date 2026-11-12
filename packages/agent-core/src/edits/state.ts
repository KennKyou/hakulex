import type { AgentDocument, Block, Change, DeleteChange, InsertChange, Proposal, ReplaceChange, ReviewState } from './types'
import { blocksOf, idOf, same, withId } from './blocks'

/** `closed`: accepted and edited since, nothing left to ask. `gone`: its block is no longer there. */
export type ChangeState = ReviewState | 'closed' | 'gone'

export interface View {
  blocks: Block[]
  ids: string[]
  byId: Map<string, Block>
}

export function viewOf(document: AgentDocument): View {
  const blocks = blocksOf(document)
  const ids = blocks.map(idOf)
  return {
    blocks,
    ids,
    byId: new Map(blocks.map((block, index) => [ids[index], block])),
  }
}

export function replaceState(change: ReplaceChange, view: View): ChangeState {
  const block = view.byId.get(change.id)
  if (!block)
    return 'gone'
  if (same(block, change.base))
    return 'pending'
  if (same(block, change.node))
    return 'accepted'
  return change.accepted ? 'closed' : 'conflict'
}

export function deleteState(change: DeleteChange, view: View): ChangeState {
  const block = view.byId.get(change.id)
  if (!block)
    return 'accepted'
  return same(block, change.base)
    ? 'pending'
    : 'conflict'
}

/** Where in `ids` the new blocks of a gap go, or `null` when both its neighbours are gone. */
export function placeOf(change: InsertChange, ids: string[]): number | null {
  const after = change.after === null
    ? -1
    : ids.indexOf(change.after)
  if (after >= 0)
    return after + 1
  const before = change.before === null
    ? -1
    : ids.indexOf(change.before)
  if (before >= 0)
    return before
  if (change.after === null)
    return 0
  if (change.before === null)
    return ids.length
  return null
}

export const missingOf = (change: InsertChange, view: View) => change.blocks.filter(block => !view.byId.has(block.id))

export function insertState(change: InsertChange, view: View): ChangeState {
  if (missingOf(change, view).length === 0)
    return 'accepted'
  return placeOf(change, view.ids) === null
    ? 'conflict'
    : 'pending'
}

export function stateOf(change: Change, view: View): ChangeState {
  if (change.kind === 'replace')
    return replaceState(change, view)
  return change.kind === 'delete'
    ? deleteState(change, view)
    : insertState(change, view)
}

export function itemIdOf(change: Change) {
  return change.kind === 'insert'
    ? `insert:${change.after ?? ''}>${change.before ?? ''}`
    : `${change.kind}:${change.id}`
}

/**
 * Puts a gap's blocks that aren't in `blocks` yet into it. Those already there stay where they
 * are, and each missing one follows the one before it in the gap.
 */
export function placeInserted(blocks: Block[], change: InsertChange, fallback: 'end' | null): Block[] | null {
  const ids = blocks.map(idOf)
  let at = placeOf(change, ids)
  if (at === null) {
    if (fallback === null)
      return null
    at = blocks.length
  }
  const out = [...blocks]
  for (const { id, node } of change.blocks) {
    const here = out.findIndex(block => idOf(block) === id)
    if (here >= 0) {
      at = here + 1
      continue
    }
    out.splice(at, 0, withId(node, id))
    at += 1
  }
  return out
}

/** The document's blocks as they would be with everything pending in the proposal. */
export function proposedBlocks(document: AgentDocument, proposal: Proposal): Block[] {
  const view = viewOf(document)
  const removed = new Set<string>()
  let blocks = [...view.blocks]
  for (const change of proposal.changes) {
    if (change.kind === 'insert' || stateOf(change, view) !== 'pending')
      continue
    if (change.kind === 'delete') {
      removed.add(change.id)
    }
    else {
      blocks = blocks.map(block => idOf(block) === change.id
        ? withId(change.node, change.id)
        : block)
    }
  }
  // Blocks to be deleted still say where their neighbours are, so they go last.
  for (const change of proposal.changes) {
    if (change.kind === 'insert' && insertState(change, view) === 'pending')
      blocks = placeInserted(blocks, change, null) ?? blocks
  }
  return blocks.filter(block => !removed.has(idOf(block)))
}
