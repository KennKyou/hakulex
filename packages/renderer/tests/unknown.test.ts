import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer, unwrapUnknownNodes } from '../src'

const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
const block = (raw: unknown): SerializedNode => ({ type: 'hlx-unknown-block', version: 1, raw })
const inline = (raw: unknown): SerializedNode => ({ type: 'hlx-unknown-inline', version: 1, raw })

/** Vue marks nodes that render nothing with comments; they aren't output. */
async function ssr(...children: SerializedNode[]) {
  const value = {
    root: { type: 'root', children },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  return html.replace(/<!--.*?-->/g, '')
}

describe('wrapped nodes', () => {
  it('renders a wrapped node like the node itself', async () => {
    const heading: SerializedNode = {
      type: 'heading',
      tag: 'h2',
      children: [
        text('標題'),
      ],
    }
    expect(await ssr(block(heading))).toBe(await ssr(heading))
  })

  it('renders a wrapped node inside text like the node itself', async () => {
    const link: SerializedNode = {
      type: 'link',
      url: 'https://example.com',
      children: [
        text('連結'),
      ],
    }
    expect(await ssr(paragraph(text('前'), inline(link), text('後'))))
      .toBe(await ssr(paragraph(text('前'), link, text('後'))))
  })

  it('counts footnotes referenced inside a wrapped node', async () => {
    const reference: SerializedNode = { type: 'footnote', identifier: '1' }
    const notes: SerializedNode = {
      type: 'footnote-section',
      definitions: { 1: '內容' },
    }
    expect(await ssr(block(paragraph(reference)), notes))
      .toBe(await ssr(paragraph(reference), notes))
  })

  it('treats a wrapped node with no renderer like any unknown node', async () => {
    const poll: SerializedNode = {
      type: 'excalidraw',
      children: [
        paragraph(text('步驟')),
      ],
    }
    expect(await ssr(block(poll))).toContain('步驟')
    expect(await ssr(block({ type: 'agent-diff', url: 'https://example.com' }))).toBe(await ssr())
  })

  it.each([
    ['null', null],
    ['text', 'poll'],
    [
      'a list',
      [
        text('甲'),
      ],
    ],
    [
      'another wrapper',
      block({
        type: 'excalidraw',
        children: [
          paragraph(text('內層')),
        ],
      }),
    ],
  ])('renders nothing when raw is %s', async (_name, raw) => {
    expect(await ssr(block(raw), paragraph(text('其他')))).toBe(await ssr(paragraph(text('其他'))))
  })

  it.each(['__proto__', 'constructor', 'toString'])('does not treat %s as a renderer', async (type) => {
    expect(await ssr(block({ type }), { type }, paragraph(text('其他')))).toBe(await ssr(paragraph(text('其他'))))
  })

  it.each([
    ['text', '甲'],
    ['a number', 3],
    [
      'not nodes',
      [null, 'a', 3],
    ],
  ])('survives children that are %s', async (_name, children) => {
    expect(await ssr({ type: 'excalidraw', children } as unknown as SerializedNode, paragraph(text('其他'))))
      .toBe(await ssr(paragraph(text('其他'))))
  })
})

describe('unwrapUnknownNodes', () => {
  it('restores wrapped nodes at any depth', () => {
    const raw = { type: 'chip', handle: 'a' }
    expect(unwrapUnknownNodes(paragraph(text('前'), inline(raw)))).toEqual(paragraph(text('前'), raw))
    expect(unwrapUnknownNodes({
      type: 'root',
      children: [
        {
          type: 'alert',
          children: [
            block(raw),
          ],
        },
      ],
    }))
      .toEqual({
        type: 'root',
        children: [
          {
            type: 'alert',
            children: [raw],
          },
        ],
      })
  })

  it('leaves everything else as it is', () => {
    const document = {
      type: 'root',
      foo: 1,
      children: [
        paragraph(text('甲')),
      ],
    }
    expect(unwrapUnknownNodes(document)).toEqual(document)
  })

  it('leaves a wrapper with bad raw as it is', () => {
    for (const bad of [
      block(null),
      block('poll'),
      block([]),
      block(inline({ type: 'excalidraw' })),
    ])
      expect(unwrapUnknownNodes(bad)).toEqual(bad)
  })

  it('does not change what it was given', () => {
    const document = paragraph(inline({ type: 'chip' }))
    const copy = JSON.parse(JSON.stringify(document))
    unwrapUnknownNodes(document)
    expect(document).toEqual(copy)
  })
})
