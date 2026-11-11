import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RichEditor, serializeEditorState } from '../src'

/*
 * A link in the editor shows its site's icon before its text:
 * five places tried in order, once for each site, nothing when none loads.
 */

/** Pictures that load: the rest fail. Each try is recorded. */
const loads = new Set<string>()
const tried: string[] = []
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  private url = ''
  get src() {
    return this.url
  }

  set src(url: string) {
    this.url = url
    tried.push(url)
    setTimeout(() => (loads.has(url)
      ? this.onload
      : this.onerror)?.(), 0)
  }
}

beforeEach(() => {
  loads.clear()
  tried.length = 0
  vi.stubGlobal('Image', FakeImage)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
function text(value: string) {
  return {
    type: 'text',
    version: 1,
    text: value,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  }
}
function link(url: string, value: string) {
  return {
    ...element,
    type: 'link',
    url,
    rel: null,
    target: null,
    title: null,
    children: [
      text(value),
    ],
  }
}
function documentWith(...children: unknown[]) {
  return ({
    root: {
      ...element,
      type: 'root',
      children: [
        {
          ...element,
          type: 'paragraph',
          textFormat: 0,
          textStyle: '',
          children,
        },
      ],
    },
  }) as unknown as SerializedEditorState
}

let site = 0
/** A site no other test has asked about: each is asked once. */
const fresh = () => `site${++site}.example`

async function settle() {
  for (let i = 0; i < 8; i++) {
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()
  }
}

describe('a link\'s site icon', () => {
  it('tries the five places in order and shows the first that loads, once for each site', async () => {
    const host = fresh()
    loads.add(`https://${host}/favicon.svg`)
    const value = documentWith(link(`https://${host}/a`, '一'), text(' '), link(`https://${host}/b`, '二'))
    const before = JSON.parse(JSON.stringify(value))
    const wrapper = mount(RichEditor, {
      props: { modelValue: value } as never,
      attachTo: document.body,
    })
    await settle()
    expect(tried).toEqual([
      `https://${host}/favicon.ico`,
      `https://${host}/favicon.png`,
      `https://${host}/favicon.svg`,
    ])
    const links = [
      ...document.querySelectorAll<HTMLAnchorElement>('.hlx-content a'),
    ]
    expect(links).toHaveLength(2)
    for (const shown of links) {
      expect(shown.dataset.favicon).toBe('loaded')
      expect(shown.style.getPropertyValue('--hlx-link-favicon')).toBe(`url("https://${host}/favicon.svg")`)
      // The text is only the link's own.
      expect(shown.textContent).toMatch(/^[一二]$/)
    }
    const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    expect(serializeEditorState(editor.getEditorState())).toEqual(before)
  })

  it('shows nothing for a site with no icon, or a link that is not http(s)', async () => {
    const host = fresh()
    mount(RichEditor, {
      props: {
        modelValue: documentWith(link(`https://${host}/`, '沒有'), text(' '), link('mailto:a@example.com', '信')),
      } as never,
      attachTo: document.body,
    })
    await settle()
    expect(tried).toEqual([
      `https://${host}/favicon.ico`,
      `https://${host}/favicon.png`,
      `https://${host}/favicon.svg`,
      `https://${host}/apple-touch-icon.png`,
      `https://${host}/apple-touch-icon-precomposed.png`,
    ])
    for (const shown of document.querySelectorAll<HTMLAnchorElement>('.hlx-content a'))
      expect(shown.dataset.favicon).toBeUndefined()
  })

  it('draws it before the text, only in the editor', () => {
    const editorCss = readFileSync(`${process.cwd()}/packages/editor/src/styles/editor.css`, 'utf8')
    const rule = editorCss.match(/\.hlx-root \.hlx-link\[data-favicon='loaded'\]::before\s*\{([^}]*)\}/)
    expect(rule).not.toBeNull()
    for (const declaration of [
      'content: \'\'',
      'display: inline-block',
      'width: 1em',
      'height: 1em',
      'margin-right: 0.2em',
      'vertical-align: -0.125em',
      'background-image: var(--hlx-link-favicon)',
      'background-size: contain',
      'border-radius: 2px',
    ])
      expect(rule![1]).toContain(declaration)
    expect(readFileSync(`${process.cwd()}/packages/style-token/src/content.css`, 'utf8')).not.toContain('data-favicon')
  })
})
