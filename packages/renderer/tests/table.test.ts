import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

const text = (value: string, format = 0): SerializedNode => ({ type: 'text', text: value, format })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
function cell(children: SerializedNode[], extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'tablecell',
    headerState: 0,
    colSpan: 1,
    rowSpan: 1,
    children,
    ...extra,
  }
}
const row = (...children: SerializedNode[]): SerializedNode => ({ type: 'tablerow', children })
function table(rows: SerializedNode[], extra: Record<string, unknown> = {}) {
  return {
    root: {
      type: 'root',
      children: [
        { type: 'table', children: rows, ...extra },
      ],
    },
  }
}
function ssr(value: unknown) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
}

describe('table (SSR)', () => {
  it('renders the wrapper, header cells and body cells', async () => {
    const html = await ssr(table([
      row(cell([
        paragraph(text('Name')),
      ], { headerState: 1 }), cell([
        paragraph(text('Role')),
      ], { headerState: 1 })),
      row(cell([
        paragraph(text('Ada')),
      ]), cell([
        paragraph(text('Dev')),
      ])),
    ]))
    expect(html).toContain('<div class="hlx-table-wrap"><table class="hlx-table"><tbody><tr>')
    expect(html).toContain('<th class="hlx-table-cell hlx-table-cell-header"><p class="hlx-paragraph" dir="auto">Name</p></th>')
    expect(html).toContain('<td class="hlx-table-cell"><p class="hlx-paragraph" dir="auto">Ada</p></td>')
  })

  it('keeps inline formats and links in cells', async () => {
    const html = await ssr(table([
      row(cell([
        paragraph(
          text('bold', 1),
          {
            type: 'link',
            url: 'https://example.com',
            children: [
              text('docs'),
            ],
          },
        ),
      ])),
    ]))
    expect(html).toContain('<strong class="hlx-bold">bold</strong>')
    expect(html).toContain('href="https://example.com"')
  })

  it('treats a column header cell as a header too', async () => {
    const html = await ssr(table([
      row(cell([
        paragraph(text('a')),
      ], { headerState: 2 }), cell([
        paragraph(text('b')),
      ])),
    ]))
    expect(html).toContain('<th class="hlx-table-cell hlx-table-cell-header">')
    expect(html).toContain('<td class="hlx-table-cell">')
  })

  it('renders valid spans and column widths', async () => {
    const html = await ssr(table([
      row(cell([
        paragraph(text('wide')),
      ], { colSpan: 2, rowSpan: 3, width: 120 })),
    ], {
      colWidths: [120, 80],
    }))
    expect(html).toContain('colspan="2"')
    expect(html).toContain('rowspan="3"')
    expect(html).toContain('<colgroup><col style="width:120px;"><col style="width:80px;"></colgroup><tbody>')
  })

  it('treats invalid spans and widths as not provided', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = await ssr(table([
      row(cell([
        paragraph(text('x')),
      ], {
        colSpan: -1,
        rowSpan: 'x',
        width: 'javascript:alert(1)',
        headerState: 'evil',
      })),
    ], {
      colWidths: [-5, 'x'],
    }))
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
    expect(html).not.toContain('colspan')
    expect(html).not.toContain('rowspan')
    expect(html).not.toContain('colgroup')
    expect(html).not.toContain('style=')
    expect(html).not.toContain('javascript')
    expect(html).toContain('<td class="hlx-table-cell">')
  })

  it('does not output backgroundColor', async () => {
    const html = await ssr(table([
      row(cell([
        paragraph(text('x')),
      ], { backgroundColor: 'red;background:url(https://evil.example)' })),
    ]))
    expect(html).not.toContain('background')
    expect(html).not.toContain('evil.example')
  })

  it('renders an empty cell', async () => {
    const html = await ssr(table([
      row(cell([])),
    ]))
    expect(html).toContain('<td class="hlx-table-cell"></td>')
  })
})
