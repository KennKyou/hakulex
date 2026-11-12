import type { AgentDocument, Block } from './types'

type Loose = Record<string, any>

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** Eight characters out of 64, as `@hakulex/plugin-block-id` makes them. */
export function createBlockId(): string {
  let id = ''
  // 64 divides 256, so taking the low six bits of each byte favors no character.
  for (const byte of crypto.getRandomValues(new Uint8Array(8)))
    id += ALPHABET[byte & 63]
  return id
}

export const blocksOf = (document: AgentDocument): Block[] => ((document.root as Loose).children ?? []) as Block[]

export function withBlocks(document: AgentDocument, children: Block[]): AgentDocument {
  return {
    ...document,
    root: { ...document.root, children },
  } as AgentDocument
}

/** A block's ID, or an empty string. */
export function idOf(block: Block): string {
  const id = (block as Loose).$?.blockId
  return typeof id === 'string'
    ? id
    : ''
}

export function withId(block: Block, id: string): Block {
  return {
    ...block,
    $: { ...(block as Loose).$, blockId: id },
  } as Block
}

/** Gives every top-level block an ID, as the editor's plugin would. The same object comes back when none is missing. */
export function ensureBlockIds(document: AgentDocument): AgentDocument {
  const used = new Set<string>()
  let changed = false
  const children = blocksOf(document).map((block) => {
    let id = idOf(block)
    if (id && !used.has(id)) {
      used.add(id)
      return block
    }
    do id = createBlockId()
    while (used.has(id))
    used.add(id)
    changed = true
    return withId(block, id)
  })
  return changed
    ? withBlocks(document, children)
    : document
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [
      key,
      canonical((value as Loose)[key]),
    ]))
  }
  return value
}

/** Whether two blocks hold the same data, whatever order their fields are in. */
export function same(a: Block, b: Block): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}

/** The text in a block, for telling the model what a rejected change was about. */
export function plainText(node: unknown): string {
  const loose = node as Loose
  if (typeof loose?.text === 'string')
    return loose.text
  return Array.isArray(loose?.children)
    ? loose.children.map(plainText).join('')
    : ''
}
