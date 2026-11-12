import type { AcceptOptions, AcceptResult, AgentDocument, Change, Proposal, Rejection, ReviewItem } from './types'
import { blocksOf, idOf, plainText, withBlocks, withId } from './blocks'
import { itemIdOf, missingOf, placeInserted, placeOf, stateOf, viewOf } from './state'

export function createProposal(): Proposal {
  return { version: 1, changes: [], rejected: [] }
}

function turnOf(change: Change) {
  return change.kind === 'insert'
    ? Math.max(...change.blocks.map(block => block.turn))
    : change.turn
}

/**
 * What there is to accept or reject, in the order of the document. An item's state comes from
 * the document as it is now, so it follows undo and redo by itself.
 */
export function reviewItems(document: AgentDocument, proposal: Proposal): ReviewItem[] {
  const view = viewOf(document)
  const found: { item: ReviewItem, at: number }[] = []
  for (const change of proposal.changes) {
    const state = stateOf(change, view)
    if (state === 'gone' || state === 'closed')
      continue
    const base = {
      id: itemIdOf(change),
      kind: change.kind,
      state,
      turn: turnOf(change),
    }
    if (change.kind === 'insert') {
      const first = change.blocks.map(block => view.ids.indexOf(block.id)).find(index => index >= 0)
      found.push({
        item: {
          ...base,
          blockIds: change.blocks.map(block => block.id),
          before: [],
          after: change.blocks.map(block => withId(block.node, block.id)),
        },
        // Ahead of the block they go in front of.
        at: (first ?? placeOf(change, view.ids) ?? view.ids.length) - 0.5,
      })
      continue
    }
    const index = view.ids.indexOf(change.id)
    const current = view.byId.get(change.id)
    found.push({
      item: {
        ...base,
        blockIds: [change.id],
        before: [
          state === 'accepted' || !current
            ? change.base
            : current,
        ],
        after: change.kind === 'replace'
          ? [change.node]
          : [],
      },
      at: index < 0
        ? Number.POSITIVE_INFINITY
        : index,
    })
  }
  // Array.prototype.sort is stable: items with no place left keep the order they were proposed in.
  return found.sort((a, b) => a.at - b.at).map(entry => entry.item)
}

function refuse(document: AgentDocument, proposal: Proposal, reason: string): AcceptResult {
  return {
    document,
    proposal,
    ok: false,
    reason,
  }
}

/** Applies one item. Hands back a new document and a proposal that remembers the item was accepted. */
export function acceptItem(document: AgentDocument, proposal: Proposal, itemId: string, options: AcceptOptions = {}): AcceptResult {
  const change = proposal.changes.find(candidate => itemIdOf(candidate) === itemId)
  if (!change)
    return refuse(document, proposal, `There is no item "${itemId}".`)
  const view = viewOf(document)
  const state = stateOf(change, view)
  if (state === 'accepted' || state === 'closed')
    return refuse(document, proposal, `The item "${itemId}" is already accepted.`)
  if (state === 'gone')
    return refuse(document, proposal, `The block of the item "${itemId}" is no longer in the document.`)
  if (state === 'conflict' && !options.overwrite)
    return refuse(document, proposal, `The item "${itemId}" is in conflict with what the user changed. Pass { overwrite: true } to apply it anyway.`)

  const blocks = blocksOf(document)
  if (change.kind === 'insert') {
    const placed = placeInserted(blocks, change, 'end')!
    return {
      document: withBlocks(document, placed),
      proposal: {
        ...proposal,
        changes: [...proposal.changes],
      },
      ok: true,
    }
  }
  const next = change.kind === 'replace'
    ? blocks.map(block => idOf(block) === change.id
        ? withId(change.node, change.id)
        : block)
    : blocks.filter(block => idOf(block) !== change.id)
  return {
    document: withBlocks(document, next),
    proposal: {
      ...proposal,
      changes: proposal.changes.map(candidate => candidate === change
        ? { ...change, accepted: true as const }
        : candidate),
    },
    ok: true,
  }
}

/** Applies every pending item. Items in conflict are left for the user to decide one by one. */
export function acceptAll(document: AgentDocument, proposal: Proposal): AcceptResult {
  let result: AcceptResult = { document, proposal, ok: false }
  for (const item of reviewItems(document, proposal)) {
    if (item.state !== 'pending')
      continue
    const next = acceptItem(result.document, result.proposal, item.id)
    if (next.ok)
      result = next
  }
  return result.ok
    ? result
    : refuse(document, proposal, 'There is nothing pending to accept.')
}

function rejectionOf(change: Change): Rejection {
  const nodes = change.kind === 'insert'
    ? change.blocks.map(block => block.node)
    : [
        change.kind === 'replace'
          ? change.node
          : change.base,
      ]
  const text = nodes.map(plainText).join(' ').trim()
  return {
    kind: change.kind,
    blockIds: change.kind === 'insert'
      ? change.blocks.map(block => block.id)
      : [change.id],
    turn: turnOf(change),
    text: text.length > 80
      ? `${text.slice(0, 80)}…`
      : text,
  }
}

/** Drops one item and notes it for the model. The same proposal comes back when there is no such item. */
export function rejectItem(proposal: Proposal, itemId: string): Proposal {
  const change = proposal.changes.find(candidate => itemIdOf(candidate) === itemId)
  if (!change)
    return proposal
  return {
    ...proposal,
    changes: proposal.changes.filter(candidate => candidate !== change),
    rejected: [
      ...proposal.rejected,
      rejectionOf(change),
    ],
  }
}

/**
 * Drops everything that hasn't been accepted, conflicts included. It can't see the document, so
 * call `settleProposal` first when accepted items may still be on record.
 */
export function rejectAll(proposal: Proposal): Proposal {
  const open = proposal.changes.filter(change => change.kind === 'insert' || !change.accepted)
  if (open.length === 0)
    return proposal
  return {
    ...proposal,
    changes: proposal.changes.filter(change => !open.includes(change)),
    rejected: [
      ...proposal.rejected,
      ...open.map(rejectionOf),
    ],
  }
}

/** The rejections not yet told to the model, and the proposal without them. */
export function takeRejected(proposal: Proposal): { rejected: Rejection[], proposal: Proposal } {
  if (proposal.rejected.length === 0)
    return { rejected: [], proposal }
  return {
    rejected: proposal.rejected,
    proposal: { ...proposal, rejected: [] },
  }
}

/**
 * Forgets what is finished: accepted changes, and those whose block has moved on. After this,
 * undoing in the editor no longer brings them back as pending.
 */
export function settleProposal(document: AgentDocument, proposal: Proposal): Proposal {
  const view = viewOf(document)
  let changed = false
  const changes = proposal.changes.flatMap((change): Change[] => {
    const state = stateOf(change, view)
    if (state !== 'pending' && state !== 'conflict') {
      changed = true
      return []
    }
    if (change.kind !== 'insert')
      return [change]
    const missing = missingOf(change, view)
    if (missing.length === change.blocks.length)
      return [change]
    changed = true
    return [
      { ...change, blocks: missing },
    ]
  })
  return changed
    ? { ...proposal, changes }
    : proposal
}
