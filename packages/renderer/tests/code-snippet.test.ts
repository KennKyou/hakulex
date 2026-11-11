import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { normalizeSnippetFiles, RichRenderer, snippetLanguage } from '../src'
import CodeSnippetView from '../src/views/CodeSnippetView.vue'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const snippet = (files: unknown): SerializedNode => ({ type: 'code-snippet', version: 1, files })
const file = (filename: unknown, code: unknown, extra: Record<string, unknown> = {}) => ({ filename, code, ...extra })

async function ssr(node: SerializedNode) {
  const value = {
    root: {
      type: 'root',
      children: [node],
    },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

function mounted(files: unknown[]) {
  return mount(CodeSnippetView, {
    props: {
      files: normalizeSnippetFiles(files),
    },
    attachTo: document.body,
  })
}

describe('reading files', () => {
  it.each([undefined, 'a', 7, {}, null])('has none for %s', (value) => {
    expect(normalizeSnippetFiles(value)).toEqual([])
  })

  it('skips what isn\'t a file', () => {
    const files = normalizeSnippetFiles([
      1,
      null,
      'a',
      file(1, 'x'),
      file('a.ts', 2),
      file('b.ts', 'x'),
    ])
    expect(files.map(item => item.filename)).toEqual(['b.ts'])
  })

  it.each([
    [
      { language: 'python' },
      'a.ts',
      'python',
    ],
    [{}, 'a.ts', 'ts'],
    [{}, 'A.PY', 'python'],
    [
      { language: 7 },
      'a.ts',
      'ts',
    ],
    [{}, 'noext', 'plaintext'],
    [
      { language: 'made-up' },
      'a.ts',
      'plaintext',
    ],
  ])('works out the language from %o and %s', (extra, filename, id) => {
    expect(snippetLanguage(normalizeSnippetFiles([
      file(filename, '', extra),
    ])[0])).toBe(id)
  })

  it('keeps only whole positive line numbers', () => {
    const [item] = normalizeSnippetFiles([
      file('a', 'x', {
        highlightLines: [1, 0, -1, 2.5, '3', 4],
      }),
    ])
    expect([...item.highlightLines]).toEqual([1, 4])
    expect([
      ...normalizeSnippetFiles([
        file('a', 'x', { highlightLines: 'nope' }),
      ])[0].highlightLines,
    ]).toEqual([])
  })
})

describe('server output', () => {
  it('shows one file with its name and escaped code', async () => {
    const html = await ssr(snippet([
      file('a.html', '<script>alert(1)</script>'),
    ]))
    expect(html.querySelector('.hlx-snippet-title')!.textContent).toBe('a.html')
    expect(html.querySelector('[role="tablist"]')).toBeNull()
    expect(html.querySelector('script')).toBeNull()
    expect(html.querySelector('code')!.textContent).toContain('<script>alert(1)</script>')
    expect(html.querySelector('.hlx-code-copy')).not.toBeNull()
  })

  it('has every file in the output, showing the first', async () => {
    const html = await ssr(snippet([
      file('a.ts', '甲'),
      file('b.ts', '乙'),
    ]))
    const panels = [
      ...html.querySelectorAll<HTMLElement>('[role="tabpanel"]'),
    ]
    expect(panels.map(panel => panel.textContent!.trim())).toEqual(['甲', '乙'])
    expect(panels.map(panel => panel.hidden)).toEqual([false, true])
    const tabs = [
      ...html.querySelectorAll('[role="tab"]'),
    ]
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false'])
    expect(tabs.map(tab => tab.textContent)).toEqual(['a.ts', 'b.ts'])
    expect(tabs[0].getAttribute('aria-controls')).toBe(panels[0].id)
  })

  it('marks highlighted lines and ignores ones out of range', async () => {
    const html = await ssr(snippet([
      file('a', '一\n二\n三', {
        highlightLines: [2, 9],
      }),
    ]))
    const lines = [
      ...html.querySelectorAll('.hlx-code-line'),
    ]
    expect(lines.map(line => line.hasAttribute('data-highlight'))).toEqual([false, true, false])
    expect(html.querySelector('.hlx-snippet-line')).toBeNull()
  })

  it.each([
    undefined,
    [],
    [1],
    'x',
  ])('outputs nothing for %o', async (files) => {
    expect((await ssr(snippet(files))).querySelector('.hlx-snippet')).toBeNull()
  })
})

describe('switching files', () => {
  it('goes by position, so files with the same name stay apart', async () => {
    const wrapper = mounted([
      file('a.ts', '甲'),
      file('a.ts', '乙'),
    ])
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    const panels = wrapper.findAll<HTMLElement>('[role="tabpanel"]')
    expect(panels.map(panel => panel.element.hidden)).toEqual([true, false])
    expect(wrapper.findAll('[role="tab"]')[1].attributes('aria-selected')).toBe('true')
  })

  it('moves with the arrow keys, around the ends, and takes focus along', async () => {
    const wrapper = mounted([
      file('a', '甲'),
      file('b', '乙'),
      file('c', '丙'),
    ])
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map(tab => tab.attributes('tabindex'))).toEqual(['0', '-1', '-1'])
    ;(tabs[0].element as HTMLElement).focus()
    await tabs[0].trigger('keydown', { key: 'ArrowLeft' })
    expect(tabs[2].attributes('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[2].element)
    await tabs[2].trigger('keydown', { key: 'ArrowRight' })
    expect(tabs[0].attributes('aria-selected')).toBe('true')
  })

  it('keeps the arrow keys from reaching anything around it', async () => {
    const wrapper = mounted([
      file('a', '甲'),
      file('b', '乙'),
    ])
    const outer = vi.fn()
    document.body.addEventListener('keydown', outer)
    await wrapper.find('[role="tab"]').trigger('keydown', { key: 'ArrowRight' })
    document.body.removeEventListener('keydown', outer)
    expect(outer).not.toHaveBeenCalled()
  })

  it('copies the file on show', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    })
    const wrapper = mounted([
      file('a', '甲'),
      file('b', '乙'),
    ])
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.find('.hlx-code-copy').trigger('click')
    expect(writeText).toHaveBeenCalledWith('乙')
    await flushPromises()
    vi.unstubAllGlobals()
  })

  it('goes back to a file that still exists when the files change', async () => {
    const wrapper = mounted([
      file('a', '甲'),
      file('b', '乙'),
    ])
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.setProps({
      files: normalizeSnippetFiles([
        file('a', '甲'),
      ]),
    })
    expect(wrapper.find('code').text()).toContain('甲')
  })
})

describe('the header', () => {
  it('picks Material Icon Theme icons by language, then by extension', async () => {
    const { fileIconName } = await import('../src/code-snippet/file-kind')
    expect([
      ['App.vue'],
      ['a.tsx'],
      ['main.py'],
      ['main.ts'],
      ['style.scss'],
      ['package.json'],
      ['Dockerfile'],
      ['README'],
      ['x.txt', 'vue'],
      ['notes.md', 'plaintext'],
    ].map(([name, language]) => fileIconName(name, language))).toEqual([
      'vue',
      'react-ts',
      'python',
      'typescript',
      'sass',
      'json',
      'docker',
      'file',
      'vue',
      'markdown',
    ])
  })

  it('draws them in their own colors, from data kept in the code, with the license', async () => {
    const { fileIcon } = await import('../src/code-snippet/file-kind')
    const html = await renderToString(createSSRApp({
      render: () => fileIcon('App.vue'),
    }))
    const holder = document.createElement('div')
    holder.innerHTML = html
    const svg = holder.querySelector('svg.hlx-code-file-icon')!
    expect(svg.getAttribute('data-icon')).toBe('vue')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect([
      ...svg.querySelectorAll('[fill]'),
    ].some(part => part.getAttribute('fill')!.startsWith('#'))).toBe(true)
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(`${process.cwd()}/packages/renderer/src/code-snippet/material-icons.ts`, 'utf8')
    expect(source.slice(0, 600)).toMatch(/material-icon-theme/)
    expect(source.slice(0, 600)).toMatch(/MIT/)
  })

  it('draws each icon in its own box, offset ones included', async () => {
    const { fileIcon } = await import('../src/code-snippet/file-kind')
    const box = async (name: string) => {
      const holder = document.createElement('div')
      holder.innerHTML = await renderToString(createSSRApp({
        render: () => fileIcon(name),
      }))
      return holder.querySelector('svg')!.getAttribute('viewBox')
    }
    expect(await box('a.json')).toBe('0 -960 960 960')
    expect(await box('a.ts')).toBe('0 0 16 16')
    expect(await box('a.css')).toBe('0 0 32 32')
  })

  it('keeps clear of the file block\'s icon style, which outlines its own icons', async () => {
    const { fileIcon } = await import('../src/code-snippet/file-kind')
    const holder = document.createElement('div')
    holder.innerHTML = await renderToString(createSSRApp({
      render: () => fileIcon('a.ts'),
    }))
    const svg = holder.querySelector('svg')!
    expect(svg.classList.contains('hlx-file-icon')).toBe(false)
    expect(svg.classList.contains('hlx-code-file-icon')).toBe(true)
  })

  it('shows an icon by each tab\'s name, and by the name of a single file', async () => {
    const many = await ssr(snippet([
      file('a.ts', '甲'),
      file('b.css', '乙'),
      file('c.json', '丙'),
    ]))
    expect([
      ...many.querySelectorAll('[role="tab"]'),
    ].map(tab => tab.querySelector('svg.hlx-code-file-icon')?.getAttribute('data-icon'))).toEqual(['typescript', 'css', 'json'])
    const one = await ssr(snippet([
      file('README.md', '說明'),
    ]))
    const title = one.querySelector('.hlx-snippet-title')!
    expect(title.querySelector('svg.hlx-code-file-icon')!.getAttribute('data-icon')).toBe('markdown')
    expect(title.textContent!.trim()).toBe('README.md')
  })

  it('marks a highlighted line with a bar of the accent color as well as a shade, number included', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8')
    const rule = css.match(/\.hlx-code-line\[data-highlight\] \{([^}]*)\}/)![1]
    expect(rule).toMatch(/background:/)
    expect(rule).toMatch(/box-shadow: inset 2px 0 0 var\(--hlx-color-accent\)/)
    expect(css).toMatch(/\.hlx-code-lined \.hlx-code-line\[data-highlight\]::before \{[^}]*background:/)
  })

  it('hydrates the new header without warnings', async () => {
    const value = {
      root: {
        type: 'root',
        children: [
          snippet([
            file('a.ts', 'let a = 1'),
            file('b.css', 'a {}'),
          ]),
        ],
      },
    }
    const app = () => createSSRApp({
      render: () => h(RichRenderer, { value }),
    })
    const html = await renderToString(app())
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const warn = vi.spyOn(console, 'warn')
    app().mount(container)
    await flushPromises()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('what it shares with code blocks', () => {
  const lines = (count: number) => Array.from({ length: count }, (_, i) => `line ${i + 1}`).join('\n')

  it('numbers its lines, and is a named region', async () => {
    const html = await ssr(snippet([
      file('a.ts', lines(120)),
    ]))
    const pre = html.querySelector('pre.hlx-code-body')!
    expect(pre.classList.contains('hlx-code-lined')).toBe(true)
    expect(pre.getAttribute('style')).toBe('--hlx-line-digits:3;')
    const region = html.querySelector('.hlx-snippet')!
    expect(region.getAttribute('role')).toBe('region')
    expect(region.getAttribute('aria-label')).toBe('程式碼片段')
  })

  it('has the code block\'s copy button, which says when it copied for two seconds', async () => {
    vi.useFakeTimers()
    try {
      vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
      const wrapper = mounted([
        file('a', '甲'),
      ])
      const copy = () => wrapper.find('.hlx-code-copy')
      expect(copy().text()).toBe('複製')
      expect(copy().classes()).not.toContain('hlx-snippet-copy')
      await copy().trigger('click')
      await flushPromises()
      expect(copy().text()).toBe('已複製')
      expect(copy().find('svg path').attributes('d')).toBe('M20 6 9 17l-5-5')
      vi.advanceTimersByTime(1900)
      await flushPromises()
      expect(copy().text()).toBe('已複製')
      vi.advanceTimersByTime(200)
      await flushPromises()
      expect(copy().text()).toBe('複製')
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('collapses the shown file past 20 lines, judged per file, and copies all of it', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const wrapper = mounted([
      file('long.ts', lines(30)),
      file('short.ts', lines(5)),
    ])
    const card = () => wrapper.find('.hlx-code-card')
    const toggle = () => wrapper.find('.hlx-code-toggle')
    expect(card().attributes('data-collapsed')).toBeDefined()
    expect(toggle().text()).toBe('展開')
    expect(wrapper.find('code').text()).toContain('line 30')
    await toggle().trigger('click')
    expect(card().attributes('data-collapsed')).toBeUndefined()
    expect(toggle().text()).toBe('收合')
    await toggle().trigger('click')
    expect(card().attributes('data-collapsed')).toBeDefined()
    await wrapper.find('.hlx-code-copy').trigger('click')
    expect(writeText).toHaveBeenCalledWith(lines(30))

    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(card().attributes('data-collapsed')).toBeUndefined()
    expect(toggle().exists()).toBe(false)
  })
})
