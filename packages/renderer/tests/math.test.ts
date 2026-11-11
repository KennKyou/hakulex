import type { SerializedDocument } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { loadKatex, MathView, prerenderDocument, renderMathToString, RichRenderer } from '../src'

const doc: SerializedDocument = {
  root: {
    type: 'root',
    children: [
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Energy ', format: 0 },
          { type: 'katex-inline', equation: 'E=mc^2' },
        ],
      },
      { type: 'katex-block', equation: '\\frac{a}{b}' },
    ],
  },
}

function app(props: Record<string, unknown> = {}) {
  return createSSRApp({
    render: () => h(RichRenderer, { value: doc, ...props }),
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('math SSR', () => {
  it('falls back to the TeX source without prerendering', async () => {
    const html = await renderToString(app())
    expect(html).toContain('<span class="hlx-math-inline"><span class="hlx-math" data-display="inline"><code class="hlx-math-source">E=mc^2</code></span></span>')
    expect(html).toContain('<div class="hlx-math-block"><div class="hlx-math" data-display="block"><code class="hlx-math-source">\\frac{a}{b}</code></div></div>')
    expect(html).not.toContain('katex')
  })

  it('typesets math with prerenderDocument()', async () => {
    const prerendered = await prerenderDocument(doc)
    expect(Object.keys(prerendered.math!).sort()).toEqual(['block:\\frac{a}{b}', 'inline:E=mc^2'])

    const html = await renderToString(app({ prerendered }))
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('<math')
    expect(html).not.toContain('hlx-math-source')
  })

  it('hydrates prerendered math without mismatches', async () => {
    const prerendered = await prerenderDocument(doc)
    const html = await renderToString(app({ prerendered }))
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    app({ prerendered }).mount(container)
    await flushPromises()
    const messages = [
      ...warn.mock.calls,
      ...error.mock.calls,
    ].flat().join('\n')
    warn.mockRestore()
    error.mockRestore()

    expect(messages).not.toMatch(/hydration/i)
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('returns nothing to prerender for documents without math', async () => {
    expect(await prerenderDocument({
      root: { type: 'root', children: [] },
    })).toEqual({})
  })
})

describe('mathView (client)', () => {
  it('replaces the source with KaTeX output after mount', async () => {
    const wrapper = mount(MathView, {
      props: { equation: 'x^2', displayMode: false },
    })
    expect(wrapper.find('.hlx-math-source').text()).toBe('x^2')
    await expect.poll(async () => {
      await flushPromises()
      return wrapper.find('.katex').exists()
    }, { timeout: 5000 }).toBe(true)
  })
})

describe('katex options', () => {
  it('renders invalid TeX as an inline error instead of throwing', async () => {
    const katex = await loadKatex()
    expect(renderMathToString(katex, '\\frac{', false)).toContain('katex-error')
  })

  it('does not trust links or HTML extensions', async () => {
    const katex = await loadKatex()
    const html = renderMathToString(katex, '\\href{javascript:alert(1)}{x} \\htmlClass{evil}{y}', false)
    // The TeX source (with "javascript:") survives only as escaped annotation text.
    expect(html).not.toMatch(/<a[\s>]/)
    expect(html).not.toContain('href=')
    expect(html).not.toContain('class="evil')
  })
})
