import type { AgentDocument, Block, Proposal } from './types'

type Json = Record<string, unknown>

/*
 * An image may carry `fileId`, the application's own name for the stored file, and a gallery one
 * for each of its images. It belongs to that picture: the editor drops it when the address
 * changes. What a model writes has no such moment, so here an id is kept only on the address it
 * is already known with.
 */

/** Calls `visit` with every picture in a piece of a document, however deep: an image, or one image of a gallery. */
function eachPicture(value: unknown, visit: (picture: Json) => void): void {
  if (Array.isArray(value)) {
    for (const item of value)
      eachPicture(item, visit)
    return
  }
  if (!value || typeof value !== 'object')
    return
  const node = value as Json
  if (node.type === 'image')
    visit(node)
  if (node.type === 'gallery' && Array.isArray(node.images)) {
    for (const item of node.images) {
      if (item && typeof item === 'object')
        visit(item as Json)
    }
  }
  for (const [name, inner] of Object.entries(node)) {
    // A gallery's images were just visited: they are not blocks to look into.
    if (!(node.type === 'gallery' && name === 'images'))
      eachPicture(inner, visit)
  }
}

const hasFileId = (picture: Json) => typeof picture.fileId === 'string' && picture.fileId !== ''
const pairOf = (picture: Json) => JSON.stringify([picture.fileId, picture.src])

/**
 * The ids the model can have read, each with the address it is on: those in the document, and
 * those in what is proposed so far, which the model is shown as part of it.
 */
export function knownFileIds(document: AgentDocument, proposal: Proposal): Set<string> {
  const known = new Set<string>()
  const note = (picture: Json) => {
    if (hasFileId(picture))
      known.add(pairOf(picture))
  }
  eachPicture(document.root, note)
  for (const change of proposal.changes) {
    if (change.kind === 'insert')
      eachPicture(change.blocks.map(block => block.node), note)
    else if (change.kind === 'replace')
      eachPicture(change.node, note)
  }
  return known
}

/**
 * The blocks with every file id taken off that is not known on that address, and how many were.
 * Nothing else about a picture changes, and the blocks passed in are left as they were.
 */
export function withKnownFileIds(blocks: Block[], known: Set<string>): { blocks: Block[], dropped: number } {
  let dropped = 0
  const copies = structuredClone(blocks)
  eachPicture(copies, (picture) => {
    if (!('fileId' in picture))
      return
    if (hasFileId(picture) && known.has(pairOf(picture)))
      return
    delete picture.fileId
    dropped++
  })
  return {
    blocks: dropped > 0
      ? copies
      : blocks,
    dropped,
  }
}
