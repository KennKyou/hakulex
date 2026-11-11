import type { SerializedNode } from '../src'
import { readFileSync } from 'node:fs'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

function value(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}
function ssr(...children: SerializedNode[]) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: value(...children),
    }),
  }))
}
function card(extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'link-card',
    version: 1,
    url: 'https://example.com/docs/page',
    ...extra,
  }
}
const full = {
  title: 'A title',
  description: 'A description',
  favicon: 'https://example.com/icon.png',
  image: 'https://example.com/cover.png',
}

describe('link card (SSR)', () => {
  it('shows what the document stores, as a link', async () => {
    const html = await ssr(card(full))
    expect(html).toContain('href="https://example.com/docs/page"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('A title')
    expect(html).toContain('A description')
    // The picture, then the title and description beside it: no line for the address.
    expect(html).toMatch(/hlx-link-card"[^>]*>(?:<!--.*?-->)*<img class="hlx-link-card-image"[^>]*src="https:\/\/example\.com\/cover\.png"/)
    expect(html).toMatch(/<span class="hlx-link-card-content"><span class="hlx-link-card-title"><span class="hlx-link-card-title-text">A title<\/span>/)
    expect(html).not.toContain('hlx-link-card-host')
    // With a picture, the site's icon has no place.
    expect(html).not.toContain('icon.png')
  })

  it('puts the site\'s icon in a tile when there is no picture, or a globe', async () => {
    const withIcon = await ssr(card({ title: 'T', favicon: full.favicon }))
    expect(withIcon).toMatch(/<span class="hlx-link-card-icon"><img[^>]*src="https:\/\/example\.com\/icon\.png"/)
    const bare = await ssr(card({ title: 'T' }))
    expect(bare).toMatch(/<span class="hlx-link-card-icon"><svg[^>]*aria-hidden="true"/)
    expect(bare).not.toContain('<img')
  })

  it('centers what has no description, and one short enough once measured', async () => {
    expect(await ssr(card({ title: 'T' }))).toContain('data-centered')
    expect(await ssr(card(full))).not.toContain('data-centered')
    const wrapper = mount(RichRenderer, {
      props: {
        value: value(card(full)),
      } as never,
    })
    await flushPromises()
    // Nothing is laid out here, so the description measures as one line.
    expect(wrapper.find('.hlx-link-card').attributes('data-centered')).toBeDefined()
  })

  it('loads its pictures lazily and without saying where from', async () => {
    const html = await ssr(card(full))
    const images = [
      ...html.match(/<img[^>]*>/g)!,
      ...(await ssr(card({ title: 'T', favicon: full.favicon }))).match(/<img[^>]*>/g)!,
    ]
    expect(images).toHaveLength(2)
    for (const image of images) {
      expect(image).toContain('loading="lazy"')
      expect(image).toContain('referrerpolicy="no-referrer"')
      expect(image).toMatch(/\salt(?:="")?[\s>]/)
    }
  })

  it.each([
    ['no title', {}],
    [
      'an empty title',
      { title: '   ' },
    ],
    [
      'a title that is not a string',
      { title: 42 },
    ],
  ])('uses the URL with %s, and leaves out what is missing', async (_name, extra) => {
    const html = await ssr(card(extra))
    expect(html).toMatch(/hlx-link-card-title-text">https:\/\/example\.com\/docs\/page</)
    expect(html).not.toContain('hlx-link-card-description')
    expect(html).not.toContain('<img')
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['not a url'],
  ])('shows %s as text, not a link', async (url) => {
    const html = await ssr(card({ url, title: 'T' }))
    expect(html).not.toContain('<a')
    expect(html).not.toContain('href')
    expect(html).toContain('class="hlx-link-card"')
    expect(html).not.toContain('<script>')
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:image/svg+xml,<svg onload=alert(1)>'],
    [42],
  ])('leaves out the unsafe picture %s', async (src) => {
    const html = await ssr(card({ title: 'T', image: src, favicon: src }))
    expect(html).not.toContain('<img')
    expect(html).toContain('T')
  })

  it.each([
    [
      'no URL',
      { url: undefined },
    ],
    [
      'a URL that is not a string',
      { url: 42 },
    ],
    [
      'a blank URL',
      { url: '  ' },
    ],
  ])('shows nothing without a title and with %s', async (_name, extra) => {
    expect(await ssr(card(extra))).not.toContain('hlx-link-card')
  })

  it('keeps a paragraph holding a card out of a p', async () => {
    const html = await ssr({
      type: 'paragraph',
      children: [
        card({ title: 'T' }),
      ],
    })
    expect(html).not.toMatch(/<p[\s>]/)
    expect(html).toContain('hlx-link-card')
  })

  it('falls back to the icon when the picture fails, and to the globe when the icon does', async () => {
    const wrapper = mount(RichRenderer, {
      props: {
        value: value(card(full)),
      } as never,
    })
    await flushPromises()
    expect(wrapper.findAll('img')).toHaveLength(1)
    await wrapper.find('img.hlx-link-card-image').trigger('error')
    expect(wrapper.find('img.hlx-link-card-image').exists()).toBe(false)
    await wrapper.find('.hlx-link-card-icon img').trigger('error')
    expect(wrapper.findAll('img')).toHaveLength(0)
    expect(wrapper.find('.hlx-link-card-icon svg').exists()).toBe(true)
    expect(wrapper.text()).toContain('A title')
  })
})

describe('link card look', () => {
  const css = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  /** The declarations a selector's own rules give, the last one winning. */
  function rule(selector: string) {
    const found: Record<string, string> = {}
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selectors!.split(',').map(part => part.trim().replace(/\s+/g, ' ')).includes(selector))
        continue
      for (const [, name, value] of body!.matchAll(/([\w-]+)\s*:([^;]+);/g))
        found[name!] = value!.trim()
    }
    return found
  }

  it('lays a card out', () => {
    expect(rule('.hlx-root .hlx-link-card')).toMatchObject({
      'display': 'flex',
      'align-items': 'flex-start',
      'gap': '0.75rem',
      'width': '32rem',
      'max-width': '100%',
      'margin-inline': 'auto',
      'padding': '0.875rem 1rem',
      'border-radius': '0.625rem',
      'border': '1px solid var(--hlx-color-border)',
      'background-color': 'color-mix(in srgb, var(--hlx-color-bg-secondary) 60%, transparent)',
    })
    expect(rule('.hlx-root .hlx-link-card[data-centered]')).toMatchObject({ 'align-items': 'center' })
    expect(rule('.hlx-root a.hlx-link-card:hover')).toMatchObject({
      'border-color': 'color-mix(in srgb, var(--hlx-color-border), var(--hlx-color-text) 25%)',
      'background-color': 'var(--hlx-color-fill-tertiary)',
    })
    for (const tile of ['.hlx-root .hlx-link-card-image', '.hlx-root .hlx-link-card-icon'])
      expect(rule(tile)).toMatchObject({ 'width': '2.5rem', 'height': '2.5rem', 'background-color': 'var(--hlx-color-bg-tertiary)' })
    expect(rule('.hlx-root .hlx-link-card-title-text')).toMatchObject({
      'font-size': 'var(--hlx-font-size-md)',
      'font-weight': '500',
      'line-height': '1.25rem',
      '-webkit-line-clamp': '1',
    })
    expect(rule('.hlx-root .hlx-link-card-description')).toMatchObject({
      'margin-top': '0.375rem',
      'color': 'var(--hlx-color-text-tertiary)',
      '-webkit-line-clamp': '2',
      'line-height': '1.5',
    })
  })
})
