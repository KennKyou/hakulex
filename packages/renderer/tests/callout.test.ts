import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { CALLOUT_LABELS, CALLOUT_TYPES, normalizeCalloutType, prerenderDocument, RichRenderer } from '../src'

const text = (value: string, format = 0): SerializedNode => ({ type: 'text', text: value, format })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
function ssr(node: SerializedNode) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: {
          type: 'root',
          children: [node],
        },
      },
    }),
  }))
}

describe('alert and banner (SSR)', () => {
  it.each([
    ['alert-quote', 'alertType', 'hlx-alert'],
    ['banner', 'bannerType', 'hlx-banner'],
  ])('renders %s with its type, label and content', async (type, field, className) => {
    const html = await ssr({
      type,
      [field]: 'warning',
      children: [
        paragraph(text('bold', 1), {
          type: 'link',
          url: 'https://example.com',
          children: [
            text('docs'),
          ],
        }),
      ],
    })
    expect(html).toContain(`<div class="${className}" data-type="warning"><div class="hlx-callout-label"><span class="hlx-callout-icon" aria-hidden="true"><svg`)
    expect(html).toMatch(new RegExp(`<span class="hlx-callout-title${className === 'hlx-banner'
      ? ' hlx-visually-hidden'
      : ''}">${CALLOUT_LABELS.warning}</span></div><div class="hlx-callout-body"><p`))
    expect(html).toContain('<strong class="hlx-bold">bold</strong>')
    expect(html).toContain('href="https://example.com"')
  })

  it.each(CALLOUT_TYPES)('accepts %s', async (type) => {
    const html = await ssr({ type: 'banner', bannerType: type, children: [] })
    expect(html).toContain(`data-type="${type}"`)
    expect(html).toContain(CALLOUT_LABELS[type])
  })

  it.each([
    ['an unknown type', 'evil"><script>'],
    ['a type that is not a string', 42],
    ['no type', undefined],
  ])('treats %s as note', async (_name, alertType) => {
    const html = await ssr({ type: 'alert-quote', alertType, children: [] })
    expect(html).toContain('data-type="note"')
    expect(html).not.toContain('<script>')
  })

  it('normalizes the aliases used in markdown', () => {
    expect(normalizeCalloutType('danger')).toBe('caution')
    expect(normalizeCalloutType('info')).toBe('note')
    expect(normalizeCalloutType('success')).toBe('tip')
    expect(normalizeCalloutType('warn')).toBe('warning')
    expect(normalizeCalloutType('error')).toBe('caution')
    expect(normalizeCalloutType('WARNING')).toBe('warning')
    expect(normalizeCalloutType('nope')).toBeNull()
  })
})

describe('details (SSR)', () => {
  it('uses native details, closed and with an escaped summary', async () => {
    const html = await ssr({
      type: 'details',
      summary: '<script>x</script>',
      open: false,
      children: [
        paragraph(text('inside')),
      ],
    })
    expect(html).toContain('<details class="hlx-details"><summary class="hlx-details-summary"><span class="hlx-details-chevron" aria-hidden="true"><svg')
    expect(html).toContain('<path d="m9 18 6-6-6-6"></path></svg></span><span class="hlx-details-summary-text">&lt;script&gt;x&lt;/script&gt;</span></summary><div class="hlx-details-body"><p')
    expect(html).toContain('inside')
    expect(html).not.toContain(' open')
  })

  it('stays open when stored open', async () => {
    const html = await ssr({
      type: 'details',
      summary: 's',
      open: true,
      children: [],
    })
    expect(html).toContain('<details class="hlx-details" open>')
  })

  it.each([
    [
      'a summary that is not a string',
      { summary: 42, open: false },
    ],
    [
      'a state that is not a boolean',
      { summary: '', open: 'yes' },
    ],
  ])('treats %s as not provided', async (_name, extra) => {
    const html = await ssr({ type: 'details', children: [], ...extra })
    expect(html).toContain('<span class="hlx-details-summary-text"></span></summary>')
  })
})

describe('alert and banner stored as `content`', () => {
  const doc = (...children: SerializedNode[]) => ({
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  })

  it.each([
    ['alert-quote', 'alertType', 'hlx-alert'],
    ['banner', 'bannerType', 'hlx-banner'],
  ])('shows the content of %s', async (type, field, className) => {
    const html = await ssr({
      type,
      version: 1,
      [field]: 'tip',
      content: doc(paragraph(text('in content'))),
    })
    expect(html).toContain(`<div class="${className}" data-type="tip">`)
    expect(html).toContain('in content')
  })

  it('walks into the content for headings, footnotes and unknown nodes', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: doc(
          {
            type: 'heading',
            tag: 'h2',
            children: [
              text('Same'),
            ],
          },
          {
            type: 'alert-quote',
            alertType: 'note',
            content: doc(
              {
                type: 'heading',
                tag: 'h2',
                children: [
                  text('Same'),
                ],
              },
              paragraph({ type: 'footnote', identifier: 'a' }),
              {
                type: 'hlx-unknown-block',
                version: 1,
                raw: {
                  type: 'never-registered',
                  children: [
                    paragraph(text('kept inside')),
                  ],
                },
              },
            ),
          },
          paragraph({ type: 'footnote', identifier: 'b' }),
          {
            type: 'footnote-section',
            definitions: { a: 'first', b: 'second' },
          },
        ),
      }),
    }))
    expect(html).toContain('id="same"')
    expect(html).toContain('id="same-2"')
    expect(html).toContain('kept inside')
    expect(html.indexOf('first')).toBeLessThan(html.indexOf('second'))
    expect(html).toContain('aria-label="註腳 1"')
    expect(html).toMatch(/href="#footnote-a"[^>]*註腳 1/)
    expect(html).toMatch(/href="#footnote-b"[^>]*註腳 2/)
  })

  it('prerenders the math and diagrams in the content', async () => {
    const result = await prerenderDocument(doc({
      type: 'banner',
      bannerType: 'note',
      content: doc(
        paragraph({ type: 'katex-inline', equation: 'x^2' }),
        { type: 'mermaid', diagram: 'graph TD;A-->B' },
      ),
    }) as never)
    expect(Object.keys(result.math ?? {}).length).toBe(1)
    expect(Object.keys(result.diagrams ?? {}).length).toBe(1)
  })

  it('prefers valid content and falls back to children', async () => {
    const both = await ssr({
      type: 'alert-quote',
      content: doc(paragraph(text('from content'))),
      children: [
        paragraph(text('from children')),
      ],
    })
    expect(both).toContain('from content')
    expect(both).not.toContain('from children')

    const invalid = await ssr({
      type: 'alert-quote',
      content: 'nope',
      children: [
        paragraph(text('from children')),
      ],
    })
    expect(invalid).toContain('from children')

    for (const content of [
      'nope',
      {},
      { root: {} },
      {
        root: { children: 'x' },
      },
      null,
    ]) {
      const html = await ssr({ type: 'banner', content })
      expect(html).toContain('<div class="hlx-callout-body"></div>')
    }
  })
})

describe('the type\'s icon', () => {
  it.each(CALLOUT_TYPES)('is the Lucide icon for %s, drawn with the current color', async (type) => {
    const html = await ssr({
      type: 'alert-quote',
      alertType: type,
      children: [
        paragraph(text('a')),
      ],
    })
    const icon = html.match(/<span class="hlx-callout-icon" aria-hidden="true">(<svg[^>]*>.*?<\/svg>)<\/span>/)![1]
    expect(icon).toContain('viewBox="0 0 24 24"')
    expect(icon).toContain('stroke="currentColor"')
    expect(icon).toContain('fill="none"')
    expect(icon).toContain({
      note: 'M12 16v-4',
      tip: 'M9 18h6',
      important: 'M12 7v4',
      warning: 'M12 9v4',
      caution: 'M12 8v4',
    }[type])
  })
})
