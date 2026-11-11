import type { SerializedDocument, SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { createSlugger, RichRenderer, slugify } from '../src'

const text = (value: string, format = 0): SerializedNode => ({ type: 'text', text: value, format })
function block(type: string, children: SerializedNode[], extra: Record<string, unknown> = {}): SerializedNode {
  return { type, children, ...extra }
}
function doc(...children: SerializedNode[]): SerializedDocument {
  return {
    root: block('root', children),
  }
}

async function ssr(value: unknown, props: Record<string, unknown> = {}) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, { value, ...props }),
  }))
}

describe('richRenderer (SSR)', () => {
  it('renders the root with theme attributes', async () => {
    const html = await ssr(doc(), { variant: 'note', colorScheme: 'dark' })
    expect(html).toBe('<div class="hlx-root hlx-content hlx-renderer" data-variant="note" data-color-scheme="dark"></div>')
  })

  it('puts a site\'s tokens on the root, and nothing without them', async () => {
    const html = await ssr(doc(), {
      theme: {
        color: { accent: '#171717', nope: '#000' },
        flow: { paragraph: '1em' },
      },
    })
    expect(html).toContain('style="--hlx-color-accent:#171717;--hlx-flow-paragraph:1em;"')
    expect(html).not.toContain('nope')
    expect(await ssr(doc(), { theme: {} })).not.toContain('style=')
  })

  it('renders paragraphs and text formats like Lexical', async () => {
    const html = await ssr(doc(block('paragraph', [
      text('plain '),
      text('bold', 1),
      text('both', 3),
      text('code', 16),
      text('u+s', 4 | 8),
    ])))
    expect(html).toContain('<p class="hlx-paragraph" dir="auto">plain ')
    expect(html).toContain('<strong class="hlx-bold">bold</strong>')
    expect(html).toContain('<strong class="hlx-bold hlx-italic">both</strong>')
    expect(html).toContain('<code><span class="hlx-code">code</span></code>')
    expect(html).toContain('<span class="hlx-underline-strikethrough">u+s</span>')
  })

  it('keeps empty paragraphs one line tall and applies alignment / indent', async () => {
    const html = await ssr(doc(
      block('paragraph', []),
      block('paragraph', [
        text('x'),
      ], { format: 'center', indent: 2, direction: 'ltr' }),
    ))
    expect(html).toContain('<p class="hlx-paragraph" dir="auto"><br></p>')
    expect(html).toContain('dir="ltr" style="text-align:center;padding-inline-start:calc(2 * var(--lexical-indent-base-value, 40px));"')
  })

  it('renders headings with unique slug ids', async () => {
    const html = await ssr(doc(
      block('heading', [
        text('Hello World'),
      ], { tag: 'h1' }),
      block('heading', [
        text('Hello World'),
      ], { tag: 'h2' }),
      block('heading', [
        text('中文 標題！'),
      ], { tag: 'h3' }),
      block('heading', [
        text('bad tag'),
      ], { tag: 'script' }),
    ))
    expect(html).toContain('<h1 class="hlx-heading hlx-h1" dir="auto" id="hello-world">')
    expect(html).toContain('<h2 class="hlx-heading hlx-h2" dir="auto" id="hello-world-2">')
    expect(html).toContain('id="中文-標題"')
    expect(html).toContain('<h2 class="hlx-heading hlx-h2" dir="auto" id="bad-tag">')
    expect(html).not.toContain('<script')
  })

  it('omits heading ids when disabled', async () => {
    const html = await ssr(doc(block('heading', [
      text('x'),
    ], { tag: 'h1' })), { headingIds: false })
    expect(html).not.toContain('id=')
  })

  it('renders lists, nesting and read-only check items', async () => {
    const html = await ssr(doc(
      block('list', [
        block('listitem', [
          text('one'),
        ], { value: 1 }),
        block('listitem', [
          block('list', [
            block('listitem', [
              text('nested'),
            ], { value: 1 }),
          ], { listType: 'bullet' }),
        ], { value: 2 }),
      ], { listType: 'bullet', tag: 'ul' }),
      block('list', [
        block('listitem', [
          text('third'),
        ], { value: 3 }),
      ], { listType: 'number', start: 3, tag: 'ol' }),
      block('list', [
        block('listitem', [
          text('todo'),
        ], { value: 1, checked: false }),
        block('listitem', [
          text('done'),
        ], { value: 2, checked: true }),
      ], { listType: 'check', tag: 'ul' }),
    ))
    expect(html).toContain('<ul class="hlx-list hlx-ul" dir="auto"><li class="hlx-listitem">one</li>')
    expect(html).toContain('<li class="hlx-listitem hlx-listitem-nested" value="2"><ul class="hlx-list hlx-ul"')
    expect(html).toContain('<ol class="hlx-list hlx-ol" dir="auto" start="3">')
    expect(html).toContain('<ul class="hlx-list hlx-ul hlx-checklist" dir="auto">')
    expect(html).toContain('<li class="hlx-listitem hlx-listitem-unchecked" role="checkbox" aria-checked="false" aria-readonly="true">todo</li>')
    expect(html).toContain('class="hlx-listitem hlx-listitem-checked" value="2" role="checkbox" aria-checked="true"')
  })

  it('renders safe links and neutralizes unsafe ones', async () => {
    const html = await ssr(doc(block('paragraph', [
      block('link', [
        text('ok'),
      ], { url: 'https://example.com', target: '_blank' }),
      block('link', [
        text('evil'),
      ], { url: 'javascript:alert(1)' }),
      block('autolink', [
        text('auto'),
      ], { url: 'mailto:a@b.co' }),
    ])))
    expect(html).toContain('<a class="hlx-link" href="https://example.com" rel="noopener noreferrer" target="_blank">ok</a>')
    expect(html).toContain('<span>evil</span>')
    expect(html).not.toContain('javascript:')
    expect(html).toContain('href="mailto:a@b.co"')
  })

  it('renders an unlinked autolink as plain text', async () => {
    const html = await ssr(doc(block('paragraph', [
      block('autolink', [
        text('https://example.com'),
      ], { url: 'https://example.com', isUnlinked: true }),
    ])))
    expect(html).toContain('https://example.com')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
  })

  it('renders an autolink without isUnlinked like a link', async () => {
    const html = await ssr(doc(block('paragraph', [
      block('autolink', [
        text('https://example.com'),
      ], { url: 'https://example.com' }),
    ])))
    expect(html).toContain('<a class="hlx-link" href="https://example.com" rel="noopener noreferrer">https://example.com</a>')
  })

  it('renders quotes, line breaks and horizontal rules', async () => {
    const html = await ssr(doc(
      block('quote', [
        text('a'),
        { type: 'linebreak' },
        text('b'),
      ]),
      { type: 'horizontalrule', version: 1 },
    ))
    expect(html).toContain('<blockquote class="hlx-quote" dir="auto">a<br>b</blockquote>')
    expect(html).toContain('<div class="hlx-hr-block"><hr class="hlx-hr"></div>')
  })

  it('accepts JSON strings and empty values', async () => {
    expect(await ssr(JSON.stringify(doc(block('paragraph', [
      text('from string'),
    ]))))).toContain('from string')
    expect(await ssr(null)).toBe('<div class="hlx-root hlx-content hlx-renderer" data-variant="article" data-color-scheme="light"></div>')
  })

  it('renders children of unknown types and lets renderers override', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = await ssr(
      doc(block('mystery', [
        block('paragraph', [
          text('inside'),
        ]),
      ]), block('callout', [
        text('hi'),
      ])),
      {
        renderers: {
          callout: (node, ctx) => h('aside', { class: 'callout' }, ctx.renderChildren(node)),
        },
      },
    )
    expect(html).toContain('<!--[--><p class="hlx-paragraph" dir="auto">inside</p><!--]-->')
    expect(html).toContain('<aside class="callout">hi</aside>')
    warn.mockRestore()
  })

  it('escapes text content', async () => {
    const html = await ssr(doc(block('paragraph', [
      text('<img src=x onerror=alert(1)>'),
    ])))
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
  })
})

describe('slugs', () => {
  it.each([
    ['Hello World', 'hello-world'],
    ['  Mixed  中文 and English ', 'mixed-中文-and-english'],
    ['Hello, World! (v2)', 'hello-world-v2'],
    ['!!!', 'section'],
  ])('%j → %j', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('de-duplicates within one slugger', () => {
    const slug = createSlugger()
    expect([
      slug('a'),
      slug('a'),
      slug('b'),
      slug('a'),
    ]).toEqual(['a', 'a-2', 'b', 'a-3'])
  })
})
