// @vitest-environment node
import type { Json } from './fixtures'
import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot } from 'lexical'
import { describe, expect, it } from 'vitest'
import { allHeadlessNodes, builtinNodes, customHeadlessNodes } from '../src'
import { doc, everyNode, paragraph, text } from './fixtures'

/*
 * Reading documents with the headless nodes, in Node with no DOM: what comes out is what went
 * in.
 */

function load(state: Json) {
  const editor = createHeadlessEditor({
    nodes: allHeadlessNodes,
    onError: (error) => {
      throw error
    },
  })
  editor.setEditorState(editor.parseEditorState(JSON.stringify(state)))
  return editor
}

/** The document as JSON again, without fields left undefined. */
function roundTrip(state: Json): Json {
  return JSON.parse(JSON.stringify(load(state).getEditorState().toJSON()))
}

describe('reading documents', () => {
  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined')
  })

  it('gives back a document with every kind of node as it was', () => {
    expect(roundTrip(everyNode)).toEqual(everyNode)
  })

  it('doesn\'t add the defaults to fields a node doesn\'t have', () => {
    const state = doc(
      {
        type: 'image',
        version: 1,
        src: 'https://x.test/a.png',
        altText: 'a',
      },
      {
        type: 'file',
        version: 1,
        src: 'https://x.test/f.pdf',
        name: 'f.pdf',
      },
      {
        type: 'poll',
        version: 1,
        pollId: 'p_1',
        question: '哪個？',
        options: [
          { id: 'o_a', label: 'A' },
        ],
      },
      {
        type: 'chat',
        version: 1,
        participants: [],
        messages: [],
      },
    )
    expect(roundTrip(state)).toEqual(state)
  })

  it('lists the Lexical nodes and the custom ones', () => {
    expect(allHeadlessNodes).toEqual([
      ...builtinNodes,
      ...customHeadlessNodes,
    ])
  })
})

describe('block ids', () => {
  const element = (type: string, extra: Json = {}) => ({
    type,
    version: 1,
    direction: null,
    format: '',
    indent: 0,
    children: [
      text('x'),
    ],
    ...extra,
  })
  const blocks: Json[] = [
    { type: 'chart', version: 1, spec: '{"type":"bar"}' },
    { type: 'excalidraw', version: 1, snapshot: 'ref:abc' },
    { type: 'mermaid', version: 1, diagram: 'graph TD; A-->B' },
    {
      type: 'image',
      version: 1,
      src: 'https://example.com/a.png',
      altText: 'a',
    },
    {
      type: 'banner',
      version: 1,
      bannerType: 'tip',
      content: null,
    },
    {
      type: 'alert-quote',
      version: 1,
      alertType: 'warning',
      content: null,
    },
    { type: 'nested-doc', version: 1, content: null },
    {
      type: 'grid-container',
      version: 1,
      cols: 2,
      gap: '16px',
      cells: [],
    },
    element('details', {
      summary: 'More',
      open: true,
      children: [
        paragraph(text('inside')),
      ],
    }),
    element('rich-quote', {
      attribution: 'Lu Xun',
      children: [
        paragraph(text('quote')),
      ],
    }),
  ]
  const inline = [
    element('ruby', { reading: 'かん' }),
    element('spoiler'),
  ]
  const children = blocks.map((block, index) => ({
    ...block,
    $: { blockId: `b${index}` },
  }))
  children.push({
    ...paragraph(...inline.map((node, index) => ({
      ...node,
      $: { blockId: `i${index}` },
    }))),
    $: { blockId: 'p0' },
  })
  const out = load(doc(...children)).getEditorState().toJSON().root.children as Json[]

  it.each(blocks.map((block, index) => [block.type as string, index] as const))('keeps $.blockId on %s', (type, index) => {
    expect(out[index].type).toBe(type)
    expect(out[index].$).toEqual({ blockId: `b${index}` })
  })

  it.each(inline.map((node, index) => [node.type as string, index] as const))('keeps $.blockId on inline %s', (type, index) => {
    const node = out.at(-1)!.children[index]
    expect(node.type).toBe(type)
    expect(node.$).toEqual({ blockId: `i${index}` })
  })

  it('keeps node-specific fields alongside the block id', () => {
    expect(out[0].spec).toBe('{"type":"bar"}')
    expect(out[4].bannerType).toBe('tip')
    expect(out[7].cols).toBe(2)
    expect(out[8].summary).toBe('More')
    expect(out[8].open).toBe(true)
    expect(out[9].attribution).toBe('Lu Xun')
    expect(out.at(-1)!.children[0].reading).toBe('かん')
  })
})

describe('image node', () => {
  it('round-trips sizing and float layout', () => {
    const image = {
      type: 'image',
      version: 1,
      src: 'a.jpg',
      altText: 'a',
      width: 1800,
      height: 2400,
      displayWidth: 40,
      layout: 'float-right',
    }
    expect(roundTrip(doc(image)).root.children[0]).toEqual(image)
  })
})

describe('steps and rich quote', () => {
  const content = (value: string) => doc(paragraph(text(value)))
  const steps = {
    type: 'steps',
    version: 1,
    steps: [
      {
        id: 's_a',
        title: 'Install "it"',
        content: content('Download the app'),
      },
      {
        id: 's_b',
        title: 'Configure',
        content: content('Add the key'),
      },
    ],
    $: { blockId: 'b1' },
  }

  it('round-trips steps and the block id', () => {
    const out = roundTrip(doc(steps)).root.children[0]
    expect(out.type).toBe('steps')
    expect(out.$).toEqual({ blockId: 'b1' })
    expect(out.steps).toEqual(steps.steps)
  })

  it('includes step titles and content in the text content', () => {
    const value = load(doc(steps)).getEditorState().read(() => $getRoot().getTextContent())
    expect(value).toContain('Configure')
    expect(value).toContain('Add the key')
  })

  it('keeps the attribution of a rich quote', () => {
    const quote = {
      type: 'rich-quote',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      attribution: 'Lu Xun',
      children: [
        paragraph(text('Hello quote')),
      ],
    }
    const out = roundTrip(doc(quote)).root.children[0]
    expect(out.type).toBe('rich-quote')
    expect(out.attribution).toBe('Lu Xun')
  })
})
