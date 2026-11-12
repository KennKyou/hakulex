import type { LitexmlRegistry } from '@hakulex/litexml'
import type { AgentDocument, Block, Change, InsertChange, Proposal, ToolCall, ToolCallOptions, ToolCallResult, ToolDefinition } from './types'
import { checkXml, deserializeNodesFromXml } from '@hakulex/litexml'
import { createBlockId, same, withId } from './blocks'
import { stateOf, viewOf } from './state'
import { blockToXml, registryOf } from './xml'

const XML_PARAMETER = {
  type: 'string',
  description: 'One or more block elements as LiteXML, for example <p>, <h2>, <ul>, <blockquote>, <codeblock>. Not a whole <doc>, and no Markdown.',
}

/** The tools a model proposes edits with. `parameters` is a JSON Schema; nothing here belongs to one provider. */
export const agentTools: ToolDefinition[] = [
  {
    name: 'insert_blocks',
    description: 'Propose new blocks for the document: after or before a block, or at the start or end of the document.',
    parameters: {
      type: 'object',
      properties: {
        position: {
          type: 'string',
          enum: ['after', 'before', 'start', 'end'],
        },
        blockId: { type: 'string', description: 'The id of the block to put them after or before. Leave out for start and end.' },
        xml: XML_PARAMETER,
      },
      required: ['position', 'xml'],
    },
  },
  {
    name: 'replace_block',
    description: 'Propose new content for one block. The first element takes the place of the block and keeps its id; any further elements become new blocks right after it.',
    parameters: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The id of the block to replace.' },
        xml: XML_PARAMETER,
      },
      required: ['blockId', 'xml'],
    },
  },
  {
    name: 'delete_block',
    description: 'Propose removing one block from the document.',
    parameters: {
      type: 'object',
      properties: {
        blockId: { type: 'string', description: 'The id of the block to remove.' },
      },
      required: ['blockId'],
    },
  },
]

const STAGED = 'It is staged for the user to review: the document changes only once they accept it, so don\'t send this edit again.'

/** Kinds of node that only make sense inside a block. */
const INLINE_TYPES = new Set([
  'text',
  'linebreak',
  'tab',
  'link',
  'autolink',
])

class Refused extends Error {}

function argumentsOf(input: unknown): Record<string, unknown> {
  let value = input
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    }
    catch {
      throw new Refused('The arguments are not valid JSON.')
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Refused('The arguments have to be a JSON object.')
  return value as Record<string, unknown>
}

function text(args: Record<string, unknown>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || !value)
    throw new Refused(`"${name}" is missing: it has to be a string.`)
  return value
}

/** The blocks in a piece of LiteXML from the model, without any IDs it wrote. */
function blocksFrom(xml: string, registry: LitexmlRegistry): Block[] {
  const problems = checkXml(xml, registry)
  if (problems.length > 0) {
    const first = problems[0].kind === 'empty'
      ? 'The xml is empty: it has to hold at least one block element.'
      : `The xml is not valid LiteXML. ${problems.map(problem => problem.message).join(' ')}`
    throw new Refused(first)
  }
  if (/<node[\s/>]/i.test(xml.replaceAll(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')))
    throw new Refused('<node> can\'t be written: it stands for a block whose content you can\'t see. Use the other elements.')
  const nodes = deserializeNodesFromXml(xml, registry)
  if (nodes.length === 0)
    throw new Refused('The xml is empty: it has to hold at least one block element.')
  if (nodes.some(node => INLINE_TYPES.has(node.type)))
    throw new Refused('The xml has text or inline elements at the top. Every top-level element has to be a block, such as <p>…</p>.')
  return nodes.map((node) => {
    const { blockId: _ignored, ...state } = ((node as Record<string, any>).$ ?? {}) as Record<string, unknown>
    const { $: _state, ...rest } = node as Record<string, any>
    return (Object.keys(state).length > 0
      ? { ...rest, $: state }
      : rest) as Block
  })
}

const sameXml = (a: Block, b: Block, registry: LitexmlRegistry) => blockToXml(a, registry) === blockToXml(b, registry)

function staged(proposal: Proposal, id: string): { change: InsertChange, index: number } | null {
  for (const change of proposal.changes) {
    if (change.kind !== 'insert')
      continue
    const index = change.blocks.findIndex(block => block.id === id)
    if (index >= 0)
      return { change, index }
  }
  return null
}

function replaceChange(proposal: Proposal, old: Change, next: Change | null): Proposal {
  return {
    ...proposal,
    changes: proposal.changes.flatMap(change => change === old
      ? (next
          ? [next]
          : [])
      : [change]),
  }
}

/**
 * Carries out one tool call from the model against a proposal. Nothing is written to the
 * document; a call that fails leaves the proposal as it was and says what was wrong.
 */
export function applyToolCall(document: AgentDocument, proposal: Proposal, call: ToolCall, options: ToolCallOptions = {}): ToolCallResult {
  const registry = registryOf(options.registry)
  const turn = options.turn ?? 0
  const view = viewOf(document)
  const seen = options.seen
    ? viewOf(options.seen)
    : null

  /** A block of the document the model may change: there, not staged for deletion, and as the model saw it. */
  function target(id: string): Block {
    const block = view.byId.get(id)
    if (!block)
      throw new Refused(`There is no block with the id "${id}".`)
    if (proposal.changes.some(change => change.kind === 'delete' && change.id === id && stateOf(change, view) === 'pending'))
      throw new Refused(`The block "${id}" is already staged for deletion.`)
    const before = seen?.byId.get(id)
    if (before && !same(before, block))
      throw new Refused(`The user has edited the block "${id}" since you last saw it. It is now:\n${blockToXml(block, registry)}\nBase your change on that.`)
    return block
  }

  function add(blocks: Block[], where: { after: string } | { before: string } | 'start' | 'end', from: Proposal): { proposal: Proposal, ids: string[] } {
    const entries = blocks.map(node => ({
      id: createBlockId(),
      node,
      turn,
    }))
    const ids = entries.map(entry => entry.id)
    const anchor = typeof where === 'string'
      ? null
      : 'after' in where
        ? where.after
        : where.before
    const inGap = anchor === null
      ? null
      : staged(from, anchor)
    if (inGap) {
      // Next to a block that is itself staged: into the same gap.
      const at = inGap.index + (typeof where !== 'string' && 'after' in where
        ? 1
        : 0)
      const next = {
        ...inGap.change,
        blocks: [
          ...inGap.change.blocks.slice(0, at),
          ...entries,
          ...inGap.change.blocks.slice(at),
        ],
      }
      return {
        proposal: replaceChange(from, inGap.change, next),
        ids,
      }
    }
    if (anchor !== null && !view.byId.has(anchor))
      throw new Refused(`There is no block with the id "${anchor}".`)

    const index = anchor === null
      ? -1
      : view.ids.indexOf(anchor)
    const leading = where === 'start' || (typeof where !== 'string' && 'after' in where)
    const after = where === 'start'
      ? null
      : where === 'end'
        ? (view.ids.at(-1) ?? null)
        : 'after' in where
          ? anchor
          : (view.ids[index - 1] ?? null)
    const before = where === 'end'
      ? null
      : where === 'start'
        ? (view.ids[0] ?? null)
        : 'before' in where
          ? anchor
          : (view.ids[index + 1] ?? null)
    const gap = from.changes.find((change): change is InsertChange => change.kind === 'insert' && change.after === after && change.before === before)
    if (gap) {
      const next = {
        ...gap,
        blocks: leading
          ? [
              ...entries,
              ...gap.blocks,
            ]
          : [
              ...gap.blocks,
              ...entries,
            ],
      }
      return {
        proposal: replaceChange(from, gap, next),
        ids,
      }
    }
    return {
      proposal: {
        ...from,
        changes: [
          ...from.changes,
          {
            kind: 'insert',
            after,
            before,
            blocks: entries,
          },
        ],
      },
      ids,
    }
  }

  try {
    const args = argumentsOf(call.input)

    if (call.name === 'insert_blocks') {
      const position = args.position
      if (position !== 'after' && position !== 'before' && position !== 'start' && position !== 'end')
        throw new Refused('"position" has to be one of: after, before, start, end.')
      const blocks = blocksFrom(text(args, 'xml'), registry)
      const where = position === 'start' || position === 'end'
        ? position
        : position === 'after'
          ? {
              after: text(args, 'blockId'),
            }
          : {
              before: text(args, 'blockId'),
            }
      const result = add(blocks, where, proposal)
      return { ok: true, proposal: result.proposal, content: `Proposed ${blocks.length} new block(s) with the ids ${result.ids.join(', ')}. ${STAGED}` }
    }

    if (call.name === 'replace_block') {
      const id = text(args, 'blockId')
      const [first, ...rest] = blocksFrom(text(args, 'xml'), registry)
      const inGap = staged(proposal, id)
      let next: Proposal
      if (inGap) {
        const blocks = inGap.change.blocks.map((block, index) => index === inGap.index
          ? { ...block, node: first, turn }
          : block)
        next = replaceChange(proposal, inGap.change, { ...inGap.change, blocks })
      }
      else {
        const current = target(id)
        const node = withId(first, id)
        const others = proposal.changes.filter(change => change.kind === 'insert' || change.id !== id)
        next = {
          ...proposal,
          changes: sameXml(node, current, registry)
            ? others
            : [
                ...others,
                {
                  kind: 'replace',
                  id,
                  base: current,
                  node,
                  turn,
                },
              ],
        }
      }
      const extra = rest.length > 0
        ? add(rest, { after: id }, next)
        : null
      return {
        ok: true,
        proposal: extra?.proposal ?? next,
        content: `Proposed new content for the block "${id}"${extra
          ? `, and ${rest.length} new block(s) after it with the ids ${extra.ids.join(', ')}`
          : ''}. ${STAGED}`,
      }
    }

    if (call.name === 'delete_block') {
      const id = text(args, 'blockId')
      const inGap = staged(proposal, id)
      if (inGap) {
        const blocks = inGap.change.blocks.filter(block => block.id !== id)
        return {
          ok: true,
          proposal: replaceChange(proposal, inGap.change, blocks.length > 0
            ? { ...inGap.change, blocks }
            : null),
          content: `Took back the proposed block "${id}".`,
        }
      }
      const current = target(id)
      const others = proposal.changes.filter(change => change.kind === 'insert' || change.id !== id)
      return {
        ok: true,
        proposal: {
          ...proposal,
          changes: [
            ...others,
            {
              kind: 'delete',
              id,
              base: current,
              turn,
            },
          ],
        },
        content: `Proposed removing the block "${id}". ${STAGED}`,
      }
    }

    throw new Refused(`There is no tool called "${call.name}". The tools are: ${agentTools.map(tool => tool.name).join(', ')}.`)
  }
  catch (error) {
    if (error instanceof Refused)
      return { ok: false, proposal, content: error.message }
    throw error
  }
}
