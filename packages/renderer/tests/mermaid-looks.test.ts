import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { MermaidView, renderDiagram } from '../src'

const calls = vi.hoisted(() => [] as { source: string, options: Record<string, any> }[])
vi.mock('pele/lazy', async (original) => {
  const pele = await original<typeof import('pele/lazy')>()
  return {
    ...pele,
    renderAsync: (source: string, options: Record<string, any>) => {
      calls.push({ source, options })
      return pele.renderAsync(source, options)
    },
  }
})

afterEach(() => {
  calls.length = 0
  document.body.innerHTML = ''
})

describe('measuring text', () => {
  it('gives pele the fonts themselves, which a canvas can measure, not CSS variables', async () => {
    // The tokens as a page's stylesheet sets them (happy-dom doesn't inherit custom properties).
    const sheet = document.createElement('style')
    sheet.textContent = '.hlx-mermaid { --hlx-font-sans: "Foo Sans", sans-serif; --hlx-font-mono: "Foo Mono", monospace; }'
    document.head.append(sheet)
    const wrapper = mount({
      render: () => h('div', [
        h(MermaidView, { source: 'flowchart LR\n  A[開始] --> B[結束]' }),
      ]),
    }, { attachTo: document.body })
    await expect.poll(async () => {
      await flushPromises()
      return wrapper.find('.hlx-mermaid-svg svg').exists()
    }, { timeout: 5000 }).toBe(true)
    sheet.remove()
    const { options } = calls.at(-1)!
    expect(options.fontFamily).toBe('"Foo Sans", sans-serif')
    expect(options.fontFamilyMono).toBe('"Foo Mono", monospace')
  })

  it('never passes a CSS variable, with or without fonts given', async () => {
    await renderDiagram('flowchart LR\n  A --> B')
    await renderDiagram('flowchart LR\n  A --> B', { sans: 'Bar', mono: 'Baz' })
    for (const { options } of calls) {
      expect(String(options.fontFamily)).not.toContain('var(')
      expect(String(options.fontFamilyMono)).not.toContain('var(')
    }
    expect(calls[1].options.fontFamily).toBe('Bar')
  })
})

describe('class diagrams', () => {
  it('draw a class with no members as just its name', async () => {
    const result = await renderDiagram('classDiagram\n  class 段落')
    expect('svg' in result && result.svg).toBeTruthy()
    expect((result as { svg: string }).svg).not.toContain('pele-divider')
  })
})

describe('colors behind text', () => {
  it('give edge labels and pie labels a solid background, not a transparent one', () => {
    const css = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8')
    const rule = css.match(/\.hlx-root \.hlx-mermaid \{([^}]*)\}/)![1]
    const bg = rule.match(/--pele-bg: ([^;]+);/)![1].trim()
    expect(bg).not.toBe('transparent')
    expect(bg).toMatch(/^var\(--hlx-color-bg/)
  })
})
