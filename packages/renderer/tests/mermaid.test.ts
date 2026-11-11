import type { SerializedDocument } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { estimateDiagramHeight, MermaidView, prerenderDocument, renderDiagram, RichRenderer } from '../src'

const FLOW = 'flowchart LR\n  A[Write] --> B{Review}\n  B -->|ok| C[Ship]'

const doc: SerializedDocument = {
  root: {
    type: 'root',
    children: [
      { type: 'mermaid', diagram: FLOW, version: 1 },
    ],
  },
}

function app(props: Record<string, unknown> = {}) {
  return createSSRApp({
    render: () => h(RichRenderer, { value: doc, ...props }),
  })
}

describe('renderDiagram', () => {
  it('renders SVG deterministically', async () => {
    const first = await renderDiagram(FLOW)
    expect('svg' in first && first.svg).toMatch(/^<svg/)
    expect(await renderDiagram(FLOW)).toEqual(first)
  })

  it('scopes pele\'s ids per diagram, so two diagrams on a page don\'t collide', async () => {
    const titleId = async (source: string) => {
      const result = await renderDiagram(source)
      return 'svg' in result
        ? /<title id="([^"]+)"/.exec(result.svg)?.[1]
        : undefined
    }
    const a = await titleId('flowchart LR\n  accTitle: First\n  A --> B')
    const b = await titleId('flowchart LR\n  accTitle: Second\n  A --> B')
    expect(a).toMatch(/^hlx-mmd-/)
    expect(a).not.toBe(b)
  })

  it('reports invalid source instead of throwing', async () => {
    const result = await renderDiagram('flowchart LR\n  A -->')
    expect(result).toHaveProperty('error')
  })

  it('drops links from diagrams', async () => {
    const result = await renderDiagram('flowchart LR\n  A[Go]\n  click A "javascript:alert(1)"')
    expect('svg' in result && result.svg).not.toContain('javascript:')
  })
})

describe('mermaid SSR', () => {
  it('reserves space with a loading placeholder and keeps the source for readers', async () => {
    const html = await renderToString(app())
    expect(html).toContain('<div class="hlx-mermaid-block"><figure class="hlx-mermaid">')
    expect(html).toContain(`class="hlx-mermaid-loading" style="min-height:${estimateDiagramHeight(FLOW)}px;"`)
    expect(html).toContain('<pre class="hlx-visually-hidden">flowchart LR')
    expect(html).not.toContain('<svg')
  })

  it('outputs the diagram with prerenderDocument() and hydrates cleanly', async () => {
    const prerendered = await prerenderDocument(doc)
    expect(Object.keys(prerendered.diagrams!)).toEqual([FLOW])

    const html = await renderToString(app({ prerendered }))
    expect(html).toContain('class="hlx-mermaid-svg" role="img" aria-label="Mermaid 圖表"><svg')

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
    expect(container.querySelector('.hlx-mermaid-svg svg')).not.toBeNull()
  })
})

describe('mermaidView (client)', () => {
  it('renders after mount', async () => {
    const wrapper = mount(MermaidView, {
      props: { source: FLOW },
    })
    expect(wrapper.find('.hlx-mermaid-loading').exists()).toBe(true)
    await expect.poll(async () => {
      await flushPromises()
      return wrapper.find('.hlx-mermaid-svg svg').exists()
    }, { timeout: 5000 }).toBe(true)
  })

  it('shows an error with the source for invalid diagrams', async () => {
    const wrapper = mount(MermaidView, {
      props: { source: 'flowchart LR\n  A -->' },
    })
    await expect.poll(async () => {
      await flushPromises()
      return wrapper.find('.hlx-mermaid-error').exists()
    }, { timeout: 5000 }).toBe(true)
    expect(wrapper.find('.hlx-mermaid-error pre').text()).toContain('A -->')
  })
})

describe('estimateDiagramHeight', () => {
  it('stays within bounds and grows with the source', () => {
    const small = estimateDiagramHeight('flowchart TD\n A')
    const large = estimateDiagramHeight(`flowchart TD\n${' A --> B\n'.repeat(30)}`)
    expect(small).toBeGreaterThanOrEqual(160)
    expect(large).toBeLessThanOrEqual(720)
    expect(large).toBeGreaterThan(small)
  })
})
