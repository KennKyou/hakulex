import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { collectFootnotes, linkifyFootnote, normalizeFootnoteDefinitions, RichRenderer } from '../src'

const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
const ref = (identifier: unknown): SerializedNode => ({ type: 'footnote', identifier })
const section = (definitions: unknown): SerializedNode => ({ type: 'footnote-section', definitions })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
function documentOf(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}

function ssr(...children: SerializedNode[]) {
  const value = documentOf(...children)
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
}

const count = (html: string, part: string) => html.split(part).length - 1

afterEach(() => {
  document.body.innerHTML = ''
})

describe('numbering', () => {
  it('follows the first appearance, whatever the identifier is', () => {
    const index = collectFootnotes(documentOf(paragraph(ref('b'), ref('a'), ref('b'))).root)
    expect(index.numbers.get('b')).toBe(1)
    expect(index.numbers.get('a')).toBe(2)
    expect(index.numbers.size).toBe(2)
  })

  it('walks into nested blocks in document order', () => {
    const index = collectFootnotes(documentOf(
      {
        type: 'alert-quote',
        children: [
          paragraph(ref('in-alert')),
        ],
      },
      {
        type: 'list',
        children: [
          {
            type: 'listitem',
            children: [
              ref('in-list'),
            ],
          },
        ],
      },
      paragraph({
        type: 'spoiler',
        children: [
          ref('in-spoiler'),
        ],
      }),
    ).root)
    expect([
      ...index.numbers.keys(),
    ]).toEqual(['in-alert', 'in-list', 'in-spoiler'])
  })

  it('renders numbers in order and sorts the section by them', async () => {
    const html = await ssr(
      paragraph(ref('b'), text(' '), ref('a'), text(' '), ref('b')),
      section({ a: '內容 A', b: '內容 B' }),
    )
    expect(html.indexOf('內容 B')).toBeLessThan(html.indexOf('內容 A'))
    expect(html).toContain('value="1"')
    expect(html).toContain('value="2"')
    expect([
      ...html.matchAll(/doc-noteref[^>]*>(\d+)</g),
    ].map(match => match[1])).toEqual(['1', '2', '1'])
  })
})

describe('untrusted values', () => {
  it.each([
    ['a number', 42],
    ['an empty string', ''],
    ['missing', undefined],
  ])('skips a reference whose identifier is %s', async (_name, identifier) => {
    const html = await ssr(paragraph(text('前'), ref(identifier), text('後')), section({ 1: 'x' }))
    expect(html).toContain('前')
    expect(html).toContain('後')
    expect(html).not.toContain('doc-noteref')
    expect(html).not.toContain('hlx-footnote-ref')
  })

  it.each([
    ['a string', 'nope'],
    [
      'an array',
      ['x'],
    ],
    ['null', null],
    ['missing', undefined],
  ])('treats definitions that are %s as none', async (_name, definitions) => {
    const html = await ssr(paragraph(ref('1')), section(definitions))
    expect(html).toContain('hlx-footnote-ref')
    expect(html).not.toContain('doc-noteref')
    expect(html).not.toContain('doc-endnotes')
  })

  it('drops definitions that are not text', () => {
    expect(normalizeFootnoteDefinitions({
      a: 'yes',
      b: 42,
      c: null,
      d: { x: 1 },
    })).toEqual({ a: 'yes' })
  })

  it.each(['constructor', 'toString', '__proto__'])('does not read the built-in %s', async (identifier) => {
    const html = await ssr(paragraph(ref(identifier)), section({}))
    expect(html).not.toContain('doc-noteref')
    expect(html).not.toContain('native code')
    expect(html).not.toContain('doc-endnotes')
  })

  it('keeps a definition really named __proto__', () => {
    const definitions = normalizeFootnoteDefinitions(JSON.parse('{"__proto__":"內容"}'))
    expect(Object.hasOwn(definitions, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(definitions)).toBe(Object.prototype)
  })
})

describe('output', () => {
  it('links both ways with plain anchors and landmark roles', async () => {
    const html = await ssr(paragraph(ref('1')), section({ 1: '內容' }))
    expect(html).toContain('<sup class="hlx-footnote-ref"')
    expect(html).toContain('href="#footnote-1"')
    expect(html).toContain('id="footnote-ref-1"')
    expect(html).toContain('role="doc-noteref"')
    expect(html).toContain('title="內容"')
    expect(html).toContain('role="doc-endnotes"')
    expect(html).toContain('id="footnote-1"')
    expect(html).toContain('href="#footnote-ref-1"')
    expect(html).toContain('role="doc-backlink"')
  })

  it('draws the way back as an icon in the text color, not a character that shows as an emoji', async () => {
    const container = document.createElement('div')
    container.innerHTML = await ssr(paragraph(ref('1')), section({ 1: '內容' }))
    const back = container.querySelector('.hlx-footnote-back')!
    expect(back.textContent).toBe('')
    expect(back.getAttribute('aria-label')).toBe('回到引用 1')
    const icon = back.querySelector('svg')!
    expect(icon.getAttribute('aria-hidden')).toBe('true')
    expect(icon.getAttribute('stroke')).toBe('currentColor')
  })

  it('encodes identifiers in links', async () => {
    const html = await ssr(paragraph(ref('註一')), section({ 註一: '內容' }))
    expect(html).toContain(`href="#footnote-${encodeURIComponent('註一')}"`)
    expect(html).toContain('id="footnote-註一"')
  })

  it('escapes content, and links safe URLs only', async () => {
    const html = await ssr(paragraph(ref('1')), section({
      1: '<script>alert(1)</script> 見 https://example.com/a?b=1&c=2。 javascript:alert(1)',
    }))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('href="https://example.com/a?b=1&amp;c=2"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('href="javascript')
    expect(html).toContain('javascript:alert(1)')
  })

  it('leaves the punctuation after a URL out of the link', () => {
    const parts = linkifyFootnote('見（https://example.com/a）。')
    expect(parts[0]).toBe('見（')
    expect((parts[1] as { props: { href: string } }).props.href).toBe('https://example.com/a')
    expect(parts[2]).toBe('）。')
  })

  it('gives only the first of several references an id', async () => {
    const html = await ssr(paragraph(ref('1'), ref('1')), section({ 1: '內容' }))
    expect(count(html, 'id="footnote-ref-1"')).toBe(1)
    expect(count(html, 'role="doc-noteref"')).toBe(2)
    expect(count(html, 'role="doc-backlink"')).toBe(1)
  })

  it('shows only a number for a reference without content', async () => {
    const html = await ssr(paragraph(ref('1'), ref('2')), section({ 1: '內容', 2: '   ' }))
    expect(count(html, 'role="doc-noteref"')).toBe(1)
    expect(html).toContain('>2</sup>')
    expect(count(html, '<li')).toBe(1)
  })

  it('leaves out content nothing refers to, and an empty section', async () => {
    const orphan = await ssr(paragraph(ref('1')), section({ 1: '內容', 2: '沒人引用' }))
    expect(orphan).not.toContain('沒人引用')
    const empty = await ssr(paragraph(text('x')), section({ 2: '沒人引用' }))
    expect(empty).not.toContain('doc-endnotes')
    expect(empty).not.toContain('<hr')
  })

  it('merges several sections into the first', async () => {
    const html = await ssr(paragraph(ref('1'), ref('2')), section({ 1: '甲' }), section({ 1: '覆蓋', 2: '乙' }))
    expect(count(html, 'role="doc-endnotes"')).toBe(1)
    expect(html).toContain('甲')
    expect(html).toContain('乙')
    expect(html).not.toContain('覆蓋')
  })

  it('hydrates server output without warnings', async () => {
    const value = documentOf(paragraph(ref('1'), ref('1')), section({ 1: '內容 https://example.com' }))
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, { value }),
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    createSSRApp({
      render: () => h(RichRenderer, { value }),
    }).mount(host)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    warn.mockRestore()
    error.mockRestore()
  })
})
