import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { CodeBlockView, normalizeLanguage, RichRenderer } from '../src'
import { highlightCode } from '../src/code/highlight'

function codeDoc(code: string, language: string) {
  return {
    root: {
      type: 'root',
      children: [
        {
          type: 'code-block',
          code,
          language,
          version: 1,
        },
      ],
    },
  }
}

describe('normalizeLanguage', () => {
  it.each([
    ['ts', 'ts'],
    ['TypeScript', 'ts'],
    ['sh', 'bash'],
    ['c++', 'cpp'],
    ['', 'plaintext'],
    [undefined, 'plaintext'],
    ['brainfuck', 'plaintext'],
  ])('%j → %j', (input, expected) => {
    expect(normalizeLanguage(input).id).toBe(expected)
  })
})

describe('code block (SSR)', () => {
  it('renders escaped plain code with the language label, no highlighting', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: codeDoc('if (a < b) {\n  go()\n}', 'typescript'),
      }),
    }))
    expect(html).toContain('<div class="hlx-code-block"><div class="hlx-code-card" role="region" aria-label="程式碼區塊" data-language="ts">')
    expect(html).toContain('<span class="hlx-code-language">TypeScript</span>')
    expect(html).toContain('<span class="hlx-code-line">if (a &lt; b) {\n</span>')
    // The language's icon before its name, and a copy button with an icon.
    expect(html).toMatch(/<span class="hlx-code-lang"><span class="hlx-code-lang-icon" aria-hidden="true"><svg[^>]*class="hlx-code-file-icon"/)
    expect(html).toMatch(/<button type="button" class="hlx-code-copy"[^>]*><svg[^>]*>.*?<\/svg><span>複製<\/span><\/button>/)
    // Numbered lines: three of them, so one digit wide.
    expect(html).toContain('<pre class="hlx-code-body hlx-code-lined" style="--hlx-line-digits:1;">')
    expect(html).toContain('<span class="hlx-code-line">}</span>')
    expect(html).not.toContain('data-highlighted')
    expect(html).not.toContain('--shiki')
  })
})

describe('highlightCode', () => {
  it('tokenizes with both theme colors as CSS variables', async () => {
    const lines = await highlightCode('const a = 1\nreturn a', 'ts')
    expect(lines).toHaveLength(2)
    const keyword = lines![0].find(token => token.content === 'const')!
    expect(keyword.style).toMatchObject({
      '--shiki-light': expect.any(String),
      '--shiki-dark': expect.any(String),
    })
    expect(lines!.map(line => line.map(t => t.content).join(''))).toEqual(['const a = 1', 'return a'])
  })

  it('returns null for languages without a grammar', async () => {
    expect(await highlightCode('plain', 'plaintext')).toBeNull()
  })
})

describe('codeBlockView (client)', () => {
  it('upgrades to highlighted tokens after mount', async () => {
    const wrapper = mount(CodeBlockView, {
      props: { code: 'let x = 1', language: 'js' },
    })
    expect(wrapper.find('pre').attributes('data-highlighted')).toBeUndefined()

    await expect.poll(async () => {
      await flushPromises()
      return wrapper.find('pre').attributes('data-highlighted')
    }, { timeout: 5000 }).toBe('')
    expect(wrapper.find('pre').text()).toBe('let x = 1')
    expect(wrapper.find('[style*="--shiki-light"]').exists()).toBe(true)
  })

  it('keeps the slot body when highlight is off', () => {
    const wrapper = mount(CodeBlockView, {
      props: { code: 'x', language: 'js', highlight: false },
      slots: {
        default: () => h('div', { class: 'custom-body' }),
      },
    })
    expect(wrapper.find('.custom-body').exists()).toBe(true)
    expect(wrapper.find('pre').exists()).toBe(false)
  })
})

describe('code block collapsing', () => {
  const codeOf = (lines: number) => Array.from({ length: lines }, (_, i) => `line ${i + 1}`).join('\n')
  const mountView = (lines: number, props: Record<string, unknown> = {}) => mount(CodeBlockView, {
    props: {
      code: codeOf(lines),
      highlight: false,
      ...props,
    },
  })

  it('keeps every line in the SSR HTML of a collapsed block', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: codeDoc(codeOf(21), 'plaintext'),
      }),
    }))
    expect(html).toContain('data-collapsed')
    expect(html).toContain('line 1\n')
    expect(html).toContain('line 21')
  })

  it('hydrates a collapsed block without mismatches', async () => {
    const app = () => createSSRApp({
      render: () => h(RichRenderer, {
        value: codeDoc(codeOf(21), 'plaintext'),
      }),
    })
    const container = document.createElement('div')
    container.innerHTML = await renderToString(app())
    document.body.append(container)

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const instance = app()
    instance.mount(container)
    await flushPromises()
    const messages = [
      ...warn.mock.calls,
      ...error.mock.calls,
    ].flat().join('\n')
    warn.mockRestore()
    error.mockRestore()

    expect(messages).not.toMatch(/hydration/i)
    expect(container.querySelector('.hlx-code-toggle')).not.toBeNull()
    instance.unmount()
    container.remove()
  })

  it('collapses 21 lines and toggles with the button', async () => {
    const wrapper = mountView(21)
    const card = wrapper.find('.hlx-code-card')
    const toggle = wrapper.find('.hlx-code-toggle')
    expect(card.attributes('data-collapsed')).toBeDefined()
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toBe('展開')

    await toggle.trigger('click')
    expect(card.attributes('data-collapsed')).toBeUndefined()
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(toggle.text()).toBe('收合')

    await toggle.trigger('click')
    expect(card.attributes('data-collapsed')).toBeDefined()
  })

  it('copies the full code while collapsed', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const wrapper = mountView(21)
    await wrapper.find('.hlx-code-copy').trigger('click')
    expect(writeText).toHaveBeenCalledWith(codeOf(21))
    writeText.mockRestore()
  })

  it('does not collapse 20 lines', () => {
    const wrapper = mountView(20)
    expect(wrapper.find('.hlx-code-card').attributes('data-collapsed')).toBeUndefined()
    expect(wrapper.find('.hlx-code-toggle').exists()).toBe(false)
  })

  it('does not collapse when collapsible is false', () => {
    const wrapper = mountView(21, { collapsible: false })
    expect(wrapper.find('.hlx-code-card').attributes('data-collapsed')).toBeUndefined()
    expect(wrapper.find('.hlx-code-toggle').exists()).toBe(false)
  })
})

describe('line numbers', () => {
  it('make room for as many digits as the last line has', async () => {
    const code = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n')
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: codeDoc(code, 'ts'),
      }),
    }))
    expect(html).toContain('style="--hlx-line-digits:3;"')
  })

  it('stay numbered once highlighted, and the copy button says when it copied', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const wrapper = mount(CodeBlockView, {
      props: { code: 'a\nb', language: 'ts' },
    })
    await vi.dynamicImportSettled()
    await flushPromises()
    expect(wrapper.find('pre.hlx-code-body').classes()).toContain('hlx-code-lined')
    await wrapper.find('.hlx-code-copy').trigger('click')
    await flushPromises()
    expect(wrapper.find('.hlx-code-copy').text()).toBe('已複製')
    expect(wrapper.find('.hlx-code-copy svg path').attributes('d')).toBe('M20 6 9 17l-5-5')
  })
})

describe('what it shares with code snippets', () => {
  it('is a named region', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: codeDoc('a', 'ts'),
      }),
    }))
    expect(html).toMatch(/<div class="hlx-code-card" role="region" aria-label="程式碼區塊"/)
  })

  it('says it copied for two seconds, as a snippet does', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
      const wrapper = mount(CodeBlockView, {
        props: { code: 'a', language: 'ts', highlight: false },
      })
      await wrapper.find('.hlx-code-copy').trigger('click')
      await flushPromises()
      vi.advanceTimersByTime(1900)
      await flushPromises()
      expect(wrapper.find('.hlx-code-copy').text()).toBe('已複製')
      vi.advanceTimersByTime(200)
      await flushPromises()
      expect(wrapper.find('.hlx-code-copy').text()).toBe('複製')
    }
    finally {
      vi.useRealTimers()
    }
  })
})
