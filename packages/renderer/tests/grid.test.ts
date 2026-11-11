import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { collectFootnotes, nestedRoots, normalizeGrid, prerenderDocument, RichRenderer } from '../src'

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
function grid(cells: unknown, extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'grid-container',
    version: 1,
    cols: 2,
    gap: '16px',
    cells,
    ...extra,
  }
}
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

describe('reading stored data', () => {
  it.each([1, 2, 4, 12])('takes %s columns', (cols) => {
    expect(normalizeGrid({ cols }).cols).toBe(cols)
  })

  it.each([
    0,
    13,
    -1,
    2.5,
    '2',
    '2;color:red',
    null,
    undefined,
  ])('uses two columns for %s', (cols) => {
    expect(normalizeGrid({ cols }).cols).toBe(2)
  })

  it.each([
    ['16px', '16px'],
    ['1.5rem', '1.5rem'],
    ['2em', '2em'],
    [8, '8px'],
    [0, '0px'],
  ])('takes the gap %s', (gap, expected) => {
    expect(normalizeGrid({ gap }).gap).toBe(expected)
  })

  it.each([
    '1px;background:url(x)',
    'calc(1px)',
    '10%',
    '-1px',
    -1,
    Number.NaN,
    null,
    undefined,
    '',
    'red',
  ])('uses the default gap for %s', (gap) => {
    expect(normalizeGrid({ gap }).gap).toBe('16px')
  })

  it('reads cells, leaving invalid ones blank', () => {
    const { cells } = normalizeGrid({
      cells: [
        content(paragraph()),
        'x',
        { root: 'x' },
        null,
      ],
    })
    expect(cells.map(cell => cell?.type ?? null)).toEqual(['root', null, null, null])
  })

  it.each([undefined, 'x', 7, {}])('has no cells for %s', (cells) => {
    expect(normalizeGrid({ cells }).cells).toEqual([])
  })

  it('reads the old form, with a cell for each child', () => {
    const { cells } = normalizeGrid({
      children: [
        paragraph(text('甲')),
        paragraph(text('乙')),
        7,
      ],
    })
    expect(cells).toHaveLength(2)
    expect(cells[1]!.children![0].children![0].text).toBe('乙')
  })

  it('prefers cells to the old form', () => {
    const { cells } = normalizeGrid({
      cells: [
        content(paragraph(text('新'))),
      ],
      children: [
        paragraph(text('舊')),
      ],
    })
    expect(cells).toHaveLength(1)
    expect(cells[0]!.children![0].children![0].text).toBe('新')
  })
})

describe('output', () => {
  it('lays cells out by columns and gap', async () => {
    const html = await ssr(grid([
      content(paragraph(text('甲'))),
      content(paragraph(text('乙'))),
    ], { cols: 3, gap: '8px' }))
    const element = html.querySelector<HTMLElement>('.hlx-grid')!
    expect(element.style.getPropertyValue('--hlx-grid-cols')).toBe('3')
    expect(element.style.gap).toBe('8px')
    expect([
      ...element.querySelectorAll('.hlx-grid-cell'),
    ].map(cell => cell.textContent)).toEqual(['甲', '乙'])
  })

  it('shows the old form', async () => {
    const html = await ssr({
      type: 'grid-container',
      version: 1,
      cols: 2,
      children: [
        paragraph(text('甲')),
      ],
    })
    expect(html.querySelector('.hlx-grid-cell')!.textContent).toBe('甲')
  })

  it('keeps a blank cell for what isn\'t valid', async () => {
    const html = await ssr(grid([
      'x',
      content(paragraph(text('乙'))),
    ]))
    expect([
      ...html.querySelectorAll('.hlx-grid-cell'),
    ].map(cell => cell.textContent)).toEqual(['', '乙'])
  })

  it('doesn\'t let stored values become styles', async () => {
    const html = await ssr(grid([
      content(paragraph(text('甲'))),
    ], { cols: '2;color:red', gap: '1px;background:url(x)' }))
    expect(html.innerHTML).not.toContain('color:red')
    expect(html.innerHTML).not.toContain('url(x)')
    expect(html.querySelector<HTMLElement>('.hlx-grid')!.style.gap).toBe('16px')
  })

  it.each([
    [undefined],
    [[]],
    ['x'],
  ])('outputs nothing with no cells: %o', async (cells) => {
    expect((await ssr(grid(cells))).querySelector('.hlx-grid')).toBeNull()
  })
})

describe('sharing with the document', () => {
  it('keeps heading ids apart, in document order', async () => {
    const html = await ssr(heading('同名'), grid([
      content(heading('同名')),
      content(heading('同名')),
    ]))
    expect([
      ...html.querySelectorAll('h2'),
    ].map(element => element.id)).toEqual(['同名', '同名-2', '同名-3'])
  })

  it('numbers footnotes by where they appear', () => {
    const footnote = (identifier: string): SerializedNode => ({ type: 'footnote', identifier })
    const document = documentOf(grid([
      content(paragraph(footnote('a'))),
      content(paragraph(footnote('b'))),
    ]), paragraph(footnote('c')))
    expect([
      ...collectFootnotes(document.root).numbers,
    ]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('prerenders what is inside, in the old form too', async () => {
    const result = await prerenderDocument(documentOf(
      grid([
        content({ type: 'katex-block', equation: 'x' }),
      ]),
      {
        type: 'grid-container',
        children: [
          { type: 'katex-block', equation: 'y' },
        ],
      },
    ))
    expect(Object.keys(result.math!)).toHaveLength(2)
  })

  it('treats unknown nodes as elsewhere', async () => {
    const html = await ssr(grid([
      content({
        type: 'hlx-unknown-block',
        raw: {
          type: 'made-up',
          children: [
            paragraph(text('包住')),
          ],
        },
      }),
    ]))
    expect(html.querySelector('.hlx-grid-cell')!.textContent).toBe('包住')
  })

  it('reads every cell for walks over the document', () => {
    expect(nestedRoots(grid([
      content(paragraph()),
      'x',
      content(paragraph()),
    ]))).toHaveLength(2)
  })
})
