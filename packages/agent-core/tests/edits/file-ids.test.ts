import type { AgentDocument, Block, Proposal } from '../../src/edits'
import { describe, expect, it } from 'vitest'
import { acceptAll, applyToolCall, createProposal } from '../../src/edits'
import { blockToXml } from '../../src/edits/xml'

type Json = Record<string, any>

/*
 * An image's file id is the application's own name for the stored file. It goes with that
 * picture, so a model may carry it along with the address it came with and nothing else:
 * not onto another address, and not made up.
 */

function paragraph(id: string, value: string) {
  return ({
    type: 'paragraph',
    children: [
      {
        type: 'text',
        text: value,
        format: 0,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
      },
    ],
    direction: null,
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    version: 1,
    $: { blockId: id },
  }) as unknown as Block
}
function image(id: string, src: string, fileId?: string, more: Json = {}) {
  return ({
    type: 'image',
    version: 1,
    src,
    altText: '',
    ...(fileId
      ? { fileId }
      : {}),
    ...more,
    $: { blockId: id },
  }) as unknown as Block
}
function gallery(id: string, images: Json[]) {
  return ({
    type: 'gallery',
    version: 1,
    layout: 'grid',
    images,
    $: { blockId: id },
  }) as unknown as Block
}
function nested(id: string, ...children: Block[]) {
  return ({
    type: 'nested-doc',
    version: 1,
    content: {
      root: {
        type: 'root',
        children,
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    },
    $: { blockId: id },
  }) as unknown as Block
}
function doc(...children: Block[]): AgentDocument {
  return {
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as AgentDocument
}

const CAT = 'https://files.example/cat.png'
const DOG = 'https://files.example/dog.png'
const BIRD = 'https://files.example/bird.png'
const OTHER = 'https://elsewhere.example/other.png'

function start() {
  return doc(
    paragraph('p1', '開頭'),
    image('cat', CAT, 'file-cat'),
    image('plain', BIRD),
    gallery('g1', [
      { src: DOG, alt: '狗', fileId: 'file-dog' },
      { src: BIRD, alt: '鳥', fileId: 'file-bird' },
    ]),
    nested('n1', image('inner', DOG, 'file-dog')),
  )
}

function call(document: AgentDocument, proposal: Proposal, name: string, input: Json) {
  return applyToolCall(document, proposal, {
    name,
    input: JSON.stringify(input),
  })
}
/** Every picture in what a proposal would put in, with its address and its id. */
function proposed(proposal: Proposal) {
  const found: { src: string, fileId?: unknown }[] = []
  const walk = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (!value || typeof value !== 'object')
      return
    const node = value as Json
    if (node.type === 'image') {
      found.push({
        src: node.src,
        ...('fileId' in node
          ? { fileId: node.fileId }
          : {}),
      })
    }
    if (node.type === 'gallery') {
      for (const item of node.images ?? []) {
        found.push({
          src: item.src,
          ...('fileId' in item
            ? { fileId: item.fileId }
            : {}),
        })
      }
    }
    Object.values(node).forEach(walk)
  }
  for (const change of proposal.changes) {
    if (change.kind === 'replace')
      walk(change.node)
    if (change.kind === 'insert')
      walk(change.blocks.map(block => block.node))
  }
  return found
}
function xmlOf(document: AgentDocument, id: string) {
  return blockToXml(((document.root as Json).children as Block[]).find(block => (block as Json).$.blockId === id)!)
}

describe('a file id in what the model writes', () => {
  it('reaches the model as file-id, so that there is something to carry along', () => {
    expect(xmlOf(start(), 'cat')).toContain('file-id="file-cat"')
    expect(xmlOf(start(), 'g1')).toContain('file-id="file-dog"')
  })

  it('stays when the address it came with stays: a new caption, or the picture moved', () => {
    const document = start()
    const captioned = call(document, createProposal(), 'replace_block', {
      blockId: 'cat',
      xml: xmlOf(document, 'cat').replace('<img ', '<img caption="一隻貓" '),
    })
    expect(captioned.ok).toBe(true)
    expect(proposed(captioned.proposal)).toEqual([
      { src: CAT, fileId: 'file-cat' },
    ])
    expect(captioned.content).not.toMatch(/file-id/)

    // Moved: taken out where it was, and written again at the end.
    const removed = call(document, createProposal(), 'delete_block', { blockId: 'cat' })
    const moved = call(document, removed.proposal, 'insert_blocks', {
      position: 'end',
      xml: xmlOf(document, 'cat'),
    })
    expect(moved.ok).toBe(true)
    expect(proposed(moved.proposal)).toEqual([
      { src: CAT, fileId: 'file-cat' },
    ])
  })

  it('goes when the address is changed under it', () => {
    const document = start()
    const result = call(document, createProposal(), 'replace_block', {
      blockId: 'cat',
      xml: xmlOf(document, 'cat').replace(CAT, OTHER),
    })
    expect(result.ok).toBe(true)
    expect(proposed(result.proposal)).toEqual([
      { src: OTHER },
    ])
    // The model is told, so that it does not take the id for written.
    expect(result.content).toMatch(/file-id/)
  })

  it('goes when the model wrote it itself', () => {
    const document = start()
    // On a picture that has none: without the id it is the block as it was, so nothing is proposed.
    const onPlain = call(document, createProposal(), 'replace_block', {
      blockId: 'plain',
      xml: xmlOf(document, 'plain').replace('<img ', '<img file-id="made-up" '),
    })
    expect(onPlain.ok).toBe(true)
    expect(onPlain.proposal.changes).toEqual([])
    expect(onPlain.content).toMatch(/file-id/)
    // With something else changed too, the change is proposed, without the id.
    const captioned = call(document, createProposal(), 'replace_block', {
      blockId: 'plain',
      xml: xmlOf(document, 'plain').replace('<img ', '<img file-id="made-up" caption="一隻鳥" '),
    })
    expect(proposed(captioned.proposal)).toEqual([
      { src: BIRD },
    ])

    const brandNew = call(document, createProposal(), 'insert_blocks', {
      position: 'start',
      xml: `<img src="${OTHER}" alt="" file-id="made-up" />`,
    })
    expect(brandNew.ok).toBe(true)
    expect(proposed(brandNew.proposal)).toEqual([
      { src: OTHER },
    ])
    expect(brandNew.content).toMatch(/file-id/)
  })

  it('goes when it is another picture\'s id', () => {
    const document = start()
    // The cat's id on the bird: both are in the document, but not as one picture.
    const result = call(document, createProposal(), 'replace_block', {
      blockId: 'plain',
      xml: xmlOf(document, 'plain').replace('<img ', '<img file-id="file-cat" caption="一隻鳥" '),
    })
    expect(result.ok).toBe(true)
    expect(proposed(result.proposal)).toEqual([
      { src: BIRD },
    ])
    expect(result.content).toMatch(/file-id/)
  })

  it('is judged picture by picture in a gallery', () => {
    const document = start()
    const result = call(document, createProposal(), 'replace_block', {
      blockId: 'g1',
      xml: xmlOf(document, 'g1').replace(BIRD, OTHER),
    })
    expect(result.ok).toBe(true)
    expect(proposed(result.proposal)).toEqual([
      { src: DOG, fileId: 'file-dog' },
      { src: OTHER },
    ])
  })

  it('is judged inside blocks that hold other blocks too', () => {
    const document = start()
    const kept = call(document, createProposal(), 'replace_block', {
      blockId: 'n1',
      xml: xmlOf(document, 'n1'),
    })
    // Nothing changed, so nothing is proposed; write it again with one more picture in it.
    expect(kept.proposal.changes).toEqual([])
    const result = call(document, createProposal(), 'replace_block', {
      blockId: 'n1',
      xml: xmlOf(document, 'n1').replace('</nested-doc>', `<img src="${OTHER}" alt="" file-id="file-dog" /></nested-doc>`),
    })
    expect(result.ok).toBe(true)
    expect(proposed(result.proposal)).toEqual([
      { src: DOG, fileId: 'file-dog' },
      { src: OTHER },
    ])
  })

  it('counts what is already proposed as part of what the model sees', () => {
    const document = start()
    // A picture the model moved in an earlier call can be written again in a later one.
    const first = call(document, createProposal(), 'insert_blocks', {
      position: 'end',
      xml: xmlOf(document, 'cat'),
    })
    const again = call(document, first.proposal, 'insert_blocks', {
      position: 'start',
      xml: xmlOf(document, 'cat'),
    })
    expect(proposed(again.proposal).every(picture => picture.fileId === 'file-cat')).toBe(true)
  })

  it('leaves the document alone, and accepting writes what was proposed', () => {
    const document = start()
    const before = JSON.stringify(document)
    const result = call(document, createProposal(), 'replace_block', {
      blockId: 'cat',
      xml: xmlOf(document, 'cat').replace(CAT, OTHER),
    })
    expect(JSON.stringify(document)).toBe(before)
    const accepted = acceptAll(document, result.proposal)
    const cat = ((accepted.document.root as Json).children as Json[]).find(block => block.$.blockId === 'cat')!
    expect(cat.src).toBe(OTHER)
    expect('fileId' in cat).toBe(false)
  })
})
