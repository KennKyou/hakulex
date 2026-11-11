import type { SerializedNode } from '../src'
import { readFileSync } from 'node:fs'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

/*
 * A heading with an id links to itself from its left
 * (rich-compose/src/static-renderer/engine/renderBuiltinNode.tsx: headingAnchor).
 */

const text = (value: string): SerializedNode => ({ type: 'text', text: value, format: 0 })
function heading(tag: string, value: string): SerializedNode {
  return {
    type: 'heading',
    tag,
    children: [
      text(value),
    ],
  }
}

async function ssr(children: SerializedNode[], props: Record<string, unknown> = {}) {
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: {
        root: { type: 'root', children },
      },
      ...props,
    }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('heading anchors', () => {
  it('lead each heading with a link to its id, an icon with a name for screen readers', async () => {
    const html = await ssr([
      heading('h1', 'Hello World'),
      heading('h2', 'Hello World'),
      heading('h3', '中文 標題'),
    ])
    const headings = [
      ...html.querySelectorAll('h1, h2, h3'),
    ]
    expect(headings.map(element => element.firstElementChild?.getAttribute('href'))).toEqual(['#hello-world', '#hello-world-2', '#中文-標題'])
    for (const element of headings) {
      const anchor = element.firstElementChild!
      expect(anchor.tagName).toBe('A')
      expect(anchor.classList.contains('hlx-heading-anchor')).toBe(true)
      expect(anchor.getAttribute('aria-label')).toBe('連結到這個標題')
      expect(anchor.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true')
      // No words of its own: the heading reads, and copies, as just its text.
      expect(anchor.textContent).toBe('')
    }
    expect(headings[0].textContent).toBe('Hello World')
  })

  it('are left out when headings have no ids', async () => {
    const html = await ssr([
      heading('h1', 'x'),
    ], { headingIds: false })
    expect(html.querySelector('.hlx-heading-anchor')).toBeNull()
  })
})

describe('their look', () => {
  const CONTENT = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = [
    ...CONTENT.matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ].map(([, selector, body]) => ({
    selectors: selector.trim().replace(/\s+/g, ' ').split(/,(?![^(]*\))\s*/).map(item => item.trim()),
    declarations: new Map([
      ...body.matchAll(/([\w-]+)\s*:([^;]+);/g),
    ].map(([, name, value]) => [
      name.trim(),
      value.trim(),
    ])),
  }))
  const value = (selector: string, name: string) => rules.findLast(rule => rule.selectors.includes(selector) && rule.declarations.has(name))?.declarations.get(name)

  it('sit 1.25rem to the left of the heading, hidden until it is pointed at', () => {
    const anchor = '.hlx-renderer .hlx-heading-anchor'
    expect(value('.hlx-renderer .hlx-heading', 'position')).toBe('relative')
    expect(value(anchor, 'position')).toBe('absolute')
    expect(value(anchor, 'left')).toBe('-1.25rem')
    expect(value(anchor, 'top')).toBe('0')
    expect(value(anchor, 'bottom')).toBe('0')
    expect(value(anchor, 'display')).toBe('flex')
    expect(value(anchor, 'align-items')).toBe('center')
    // In the heading's color.
    expect(value(anchor, 'color')).toBe('inherit')
    expect(value(anchor, 'text-decoration')).toBe('none')
    expect(value(anchor, 'opacity')).toBe('0')
    expect(value(anchor, 'transition')).toBe('opacity 0.15s ease')
  })

  it('show faintly on the heading\'s hover, and fully on their own or on focus', () => {
    expect(value('.hlx-renderer .hlx-heading:hover .hlx-heading-anchor', 'opacity')).toBe('0.5')
    expect(value('.hlx-renderer .hlx-heading .hlx-heading-anchor:hover', 'opacity')).toBe('1')
    expect(value('.hlx-renderer .hlx-heading .hlx-heading-anchor:focus-visible', 'opacity')).toBe('1')
  })
})
