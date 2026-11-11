import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { collectFootnotes, prerenderDocument, RichRenderer, stepContentRoot } from '../src'

const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
function heading(value: string): SerializedNode {
  return {
    type: 'heading',
    tag: 'h2',
    children: [
      text(value),
    ],
  }
}
function content(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}
function step(title: unknown, ...children: SerializedNode[]) {
  return {
    id: String(title),
    title,
    content: content(...children),
  }
}
const steps = (...items: unknown[]): SerializedNode => ({ type: 'steps', version: 1, steps: items })

function documentOf(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}

async function ssr(...children: SerializedNode[]) {
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: documentOf(...children),
    }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('steps', () => {
  it('outputs a numbered list with titles and content', async () => {
    const html = await ssr(steps(step('甲', paragraph(text('內容一'))), step('乙', paragraph(text('內容二')))))
    const items = [
      ...html.querySelectorAll('ol.hlx-steps > li.hlx-step'),
    ]
    expect(items).toHaveLength(2)
    expect(items.map(item => item.querySelector('.hlx-step-number')!.textContent)).toEqual(['1', '2'])
    expect(items[0].querySelector('.hlx-step-number')!.getAttribute('aria-hidden')).toBe('true')
    expect(items.map(item => item.querySelector('.hlx-step-title')!.textContent)).toEqual(['甲', '乙'])
    expect(items[1].querySelector('.hlx-step-content p')!.textContent).toBe('內容二')
  })

  it('escapes titles and text', async () => {
    const html = await ssr(steps(step('<img src=x onerror=alert(1)>', paragraph(text('<script>alert(1)</script>')))))
    expect(html.querySelector('img,script')).toBeNull()
    expect(html.querySelector('.hlx-step-title')!.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it.each(['', '   ', 7, null])('has no title element for %s', async (title) => {
    const html = await ssr(steps({
      id: 'a',
      title,
      content: content(paragraph(text('字'))),
    }))
    expect(html.querySelector('.hlx-step-title')).toBeNull()
    expect(html.querySelector('.hlx-step-content')!.textContent).toBe('字')
  })

  it.each([
    ['nothing', undefined],
    ['an empty list', []],
    ['a string', '步驟'],
    [
      'an object',
      { a: 1 },
    ],
    [
      'non-objects',
      [1, 'a', null],
    ],
  ])('outputs nothing for %s', async (_name, value) => {
    const html = await ssr({ type: 'steps', steps: value } as SerializedNode)
    expect(html.querySelector('.hlx-steps')).toBeNull()
  })

  it.each([
    ['HTML', '<b>內容</b>'],
    ['nothing', undefined],
    ['a number', 7],
    [
      'no root',
      { a: 1 },
    ],
    [
      'a bad root',
      { root: 'x' },
    ],
    [
      'bad children',
      {
        root: { type: 'root', children: 'x' },
      },
    ],
    [
      'children that are not nodes',
      {
        root: {
          type: 'root',
          children: [1, null],
        },
      },
    ],
  ])('leaves the content blank when it is %s', async (_name, value) => {
    const html = await ssr(steps({ id: 'a', title: '題', content: value }))
    expect(html.querySelector('.hlx-step-title')!.textContent).toBe('題')
    expect(html.querySelector('.hlx-step-content')!.textContent).toBe('')
  })

  it('shares heading ids with the rest of the document', async () => {
    const html = await ssr(heading('同名'), steps(step('甲', heading('同名')), step('乙', heading('同名'))))
    expect([
      ...html.querySelectorAll('h2'),
    ].map(element => element.id)).toEqual(['同名', '同名-2', '同名-3'])
  })

  it('numbers footnotes by where they appear, inside steps too', async () => {
    const footnote = (identifier: string): SerializedNode => ({ type: 'footnote', identifier })
    const document = documentOf(
      paragraph(footnote('a')),
      steps(step('甲', paragraph(footnote('b')))),
      paragraph(footnote('c')),
    )
    expect([
      ...collectFootnotes(document.root).numbers,
    ]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
    const html = await ssr(...document.root.children)
    expect(html.querySelectorAll('.hlx-footnote-ref')).toHaveLength(3)
    expect(html.querySelector('.hlx-step-content .hlx-footnote-ref')!.textContent).toContain('2')
  })

  it('finds a section of definitions inside a step', () => {
    const document = documentOf(steps(step('甲', {
      type: 'footnote-section',
      definitions: { a: '定義' },
    })))
    expect(collectFootnotes(document.root).definitions.get('a')).toBe('定義')
  })

  it('prerenders what is inside', async () => {
    const result = await prerenderDocument(documentOf(steps(step('甲', { type: 'katex-block', equation: 'x^2' })), { type: 'katex-inline', equation: 'y' }))
    expect(Object.keys(result.math!)).toHaveLength(2)
    expect(Object.values(result.math!).join('')).toContain('katex')
  })

  it('treats unknown nodes as elsewhere, wrapped or not', async () => {
    const html = await ssr(steps(step(
      '甲',
      {
        type: 'made-up',
        children: [
          paragraph(text('內層')),
        ],
      },
      {
        type: 'hlx-unknown-block',
        raw: {
          type: 'made-up',
          children: [
            paragraph(text('包住')),
          ],
        },
      },
    )))
    expect(html.querySelector('.hlx-step-content')!.textContent).toContain('內層')
    expect(html.querySelector('.hlx-step-content')!.textContent).toContain('包住')
  })

  it('renders steps inside a step', async () => {
    const html = await ssr(steps(step('外', steps(step('內', paragraph(text('字')))))))
    expect(html.querySelector('.hlx-step .hlx-step .hlx-step-title')!.textContent).toBe('內')
  })

  it('reads a step\'s content safely', () => {
    expect(stepContentRoot({
      content: {
        root: { type: 'root', children: [] },
      },
    })?.type).toBe('root')
    expect(stepContentRoot({ content: 'x' })).toBeNull()
    expect(stepContentRoot(null)).toBeNull()
  })
})
