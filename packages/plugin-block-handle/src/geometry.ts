export interface BlockBox {
  key: string
  top: number
  bottom: number
}

/** The gap between blocks nearest `y`: the block it comes after (null for the very top) and where it is. */
export function gapAfter(blocks: BlockBox[], y: number): { after: string | null, y: number } {
  let after: string | null = null
  let at = blocks[0]?.top ?? 0
  for (const block of blocks) {
    if (y < (block.top + block.bottom) / 2)
      break
    after = block.key
    at = block.bottom
  }
  return { after, y: at }
}
