import type { LexicalNode } from 'lexical'
import { $getRoot, $getState, createState } from 'lexical'

/** Where a block's ID is kept on the node. Saved with the document as `$.blockId`. */
export const blockIdState = createState('blockId', {
  parse: (value: unknown) => typeof value === 'string'
    ? value
    : '',
})

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-'

/** Eight characters out of 64: letters, digits, `_` and `-`. */
export function createBlockId(): string {
  let id = ''
  // 64 divides 256, so taking the low six bits of each byte favors no character.
  for (const byte of crypto.getRandomValues(new Uint8Array(8)))
    id += ALPHABET[byte & 63]
  return id
}

/** The node's block ID, or an empty string when it has none. */
export function $getBlockId(node: LexicalNode): string {
  return $getState(node, blockIdState)
}

/** The top-level block with this ID, or `null`. */
export function $getBlockById(id: string): LexicalNode | null {
  if (!id)
    return null
  return $getRoot().getChildren().find(child => $getState(child, blockIdState) === id) ?? null
}
