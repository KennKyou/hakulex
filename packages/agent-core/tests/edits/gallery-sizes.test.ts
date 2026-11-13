import type { AgentDocument, Block } from '../../src/edits'
import { describe, expect, it } from 'vitest'
import { acceptAll, applyToolCall, createProposal } from '../../src/edits'
import { blockToXml } from '../../src/edits/xml'

type Json = Record<string, any>

/*
 * A model hands a gallery back as LiteXML, the whole of it, even to change one word. What the
 * gallery holds beside addresses and alt texts has to come back with it.
 */

const IMAGES = [
  {
    src: '/a.png',
    alt: '甲',
    width: 1200,
    height: 800,
    thumbhash: '1QcSHQRnh493V4dIh4eXh1h4kJUI',
  },
  {
    src: '/b.png',
    alt: '乙',
    width: 640,
    height: 480,
  },
]
const gallery = {
  type: 'gallery',
  version: 1,
  layout: 'grid',
  images: IMAGES,
  $: { blockId: 'g1' },
} as unknown as Block
const document = {
  root: {
    type: 'root',
    children: [gallery],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
  },
} as unknown as AgentDocument

describe('a gallery the model writes again', () => {
  it('keeps every image\'s size and thumbhash when only an alt text changed', () => {
    const xml = blockToXml(gallery).replace('alt="乙"', 'alt="第二張"')
    expect(xml).toContain('alt="第二張"')

    const result = applyToolCall(document, createProposal(), {
      name: 'replace_block',
      input: JSON.stringify({ blockId: 'g1', xml }),
    })
    expect(result.ok).toBe(true)
    const accepted = acceptAll(document, result.proposal)
    expect(accepted.ok).toBe(true)

    const [after] = (accepted.document.root as Json).children as Json[]
    expect(after.images).toEqual([
      IMAGES[0],
      { ...IMAGES[1], alt: '第二張' },
    ])
  })
})
