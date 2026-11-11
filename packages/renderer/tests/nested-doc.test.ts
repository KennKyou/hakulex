import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { collectFootnotes, nestedRoots, prerenderDocument, RichRenderer } from '../src'
import NestedDocView from '../src/views/NestedDocView.vue'

afterEach(() => {
  document.body.innerHTML = ''
})

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
const nested = (value: unknown): SerializedNode => ({ type: 'nested-doc', version: 1, content: value })
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
const blocks = (count: number) => Array.from({ length: count }, (_, i) => paragraph(text(`段落${i + 1}`)))

describe('output', () => {
  it('shows the content, escaped', async () => {
    const html = await ssr(nested(content(paragraph(text('<script>alert(1)</script>')))))
    expect(html.querySelector('.hlx-nested-doc p')!.textContent).toBe('<script>alert(1)</script>')
    expect(html.querySelector('script')).toBeNull()
  })

  it('has everything in the output when collapsed', async () => {
    const html = await ssr(nested(content(...blocks(7))))
    expect(html.querySelectorAll('.hlx-nested-doc p')).toHaveLength(7)
    expect(html.querySelector('.hlx-nested-doc')!.hasAttribute('data-collapsed')).toBe(true)
    expect(html.querySelector('.hlx-nested-doc-toggle')!.textContent!.trim()).toBe('展開全文')
    expect(html.querySelector('.hlx-nested-doc-toggle')!.getAttribute('aria-expanded')).toBe('false')
    // The foot fades out over the cut, inside the card, out of the way of the text.
    const fade = html.querySelector('.hlx-nested-doc-body > .hlx-nested-doc-fade')!
    expect(fade).not.toBeNull()
    expect(fade.getAttribute('aria-hidden')).toBe('true')
    expect(fade.textContent).toBe('')
    expect(html.querySelector('.hlx-nested-doc > .hlx-nested-doc-toggle')).not.toBeNull()
  })

  it('doesn\'t collapse six blocks or fewer', async () => {
    const html = await ssr(nested(content(...blocks(6))))
    expect(html.querySelector('.hlx-nested-doc')!.hasAttribute('data-collapsed')).toBe(false)
    expect(html.querySelector('.hlx-nested-doc-toggle')).toBeNull()
    expect(html.querySelector('.hlx-nested-doc-fade')).toBeNull()
  })

  it.each([
    ['nothing', undefined],
    ['HTML', '<b>內容</b>'],
    [
      'no root',
      { a: 1 },
    ],
    [
      'a bad root',
      { root: 'x' },
    ],
    [
      'no children',
      content(),
    ],
    [
      'one blank paragraph',
      content(paragraph()),
    ],
    [
      'one paragraph of spaces',
      content(paragraph(text('  '))),
    ],
  ])('outputs nothing for %s', async (_name, value) => {
    expect((await ssr(nested(value))).querySelector('.hlx-nested-doc')).toBeNull()
  })

  it('shows a single block that isn\'t a paragraph', async () => {
    const html = await ssr(nested(content({ type: 'horizontalrule' })))
    expect(html.querySelector('.hlx-nested-doc')).not.toBeNull()
  })
})

describe('sharing with the document', () => {
  it('keeps heading ids apart, in document order', async () => {
    const html = await ssr(heading('同名'), nested(content(heading('同名'))), heading('同名'))
    expect([
      ...html.querySelectorAll('h2'),
    ].map(element => element.id)).toEqual(['同名', '同名-2', '同名-3'])
    expect(html.querySelector('.hlx-nested-doc h2')!.id).toBe('同名-2')
  })

  it('numbers footnotes by where they appear', () => {
    const footnote = (identifier: string): SerializedNode => ({ type: 'footnote', identifier })
    const document = documentOf(paragraph(footnote('a')), nested(content(paragraph(footnote('b')))), paragraph(footnote('c')))
    expect([
      ...collectFootnotes(document.root).numbers,
    ]).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ])
  })

  it('prerenders what is inside', async () => {
    const result = await prerenderDocument(documentOf(nested(content({ type: 'katex-block', equation: 'x^2' }))))
    expect(Object.keys(result.math!)).toHaveLength(1)
  })

  it('treats unknown nodes as elsewhere', async () => {
    const html = await ssr(nested(content(
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
    expect(html.querySelector('.hlx-nested-doc')!.textContent).toContain('內層')
    expect(html.querySelector('.hlx-nested-doc')!.textContent).toContain('包住')
  })

  it('reads the content for walks over the document', () => {
    expect(nestedRoots(nested(content(paragraph())))[0].type).toBe('root')
    expect(nestedRoots(nested('x'))).toEqual([])
  })
})

describe('collapsing', () => {
  it('expands and collapses again', async () => {
    const wrapper = mount(NestedDocView, {
      props: { collapsible: true },
      slots: {
        default: () => 'x',
      },
      attachTo: document.body,
    })
    const toggle = wrapper.find('.hlx-nested-doc-toggle')
    await toggle.trigger('click')
    expect(wrapper.attributes('data-collapsed')).toBeUndefined()
    expect(toggle.text()).toBe('收合')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(wrapper.find('.hlx-nested-doc-fade').exists()).toBe(false)
    await toggle.trigger('click')
    expect(wrapper.attributes('data-collapsed')).toBeDefined()
  })
})
