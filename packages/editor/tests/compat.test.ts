import type { SerializedDocument } from '@hakulex/renderer'
import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { readFileSync } from 'node:fs'
import { RichRenderer } from '@hakulex/renderer'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichEditor, serializeEditorState } from '../src'

/* Hand-written documents with the shapes stored documents have. */
function text(value: string, format = 0) {
  return {
    detail: 0,
    format,
    mode: 'normal',
    style: '',
    text: value,
    type: 'text',
    version: 1,
  }
}
function paragraph(...children: unknown[]) {
  return {
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    type: 'paragraph',
    version: 1,
  }
}
function content(...children: unknown[]) {
  return {
    root: {
      children,
      direction: null,
      format: '',
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}
function id(blockId: string) {
  return {
    $: { blockId },
  }
}
function image(extra: Record<string, unknown> = {}) {
  return {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'alt text',
    ...extra,
  }
}
function cell(...children: unknown[]) {
  return {
    backgroundColor: null,
    children,
    colSpan: 1,
    direction: null,
    format: '',
    headerState: 0,
    indent: 0,
    rowSpan: 1,
    type: 'tablecell',
    version: 1,
  }
}
function row(...children: unknown[]) {
  return {
    children,
    direction: null,
    format: '',
    indent: 0,
    type: 'tablerow',
    version: 1,
  }
}

const storedShapes = {
  'alert and banner': content(
    {
      type: 'alert-quote',
      version: 1,
      ...id('alert1'),
      alertType: 'note',
      content: content(paragraph(text('alert body'))),
    },
    {
      type: 'banner',
      version: 1,
      ...id('banner1'),
      bannerType: 'warning',
      content: content(
        paragraph(text('banner body')),
        {
          type: 'alert-quote',
          version: 1,
          alertType: 'tip',
          content: content(paragraph(text('alert in banner'))),
        },
        {
          type: 'never-registered',
          version: 1,
          children: [
            paragraph(text('unknown in banner')),
          ],
        },
      ),
    },
  ),
  'details': content(
    {
      children: [
        paragraph(text('details body')),
      ],
      direction: 'ltr',
      format: '',
      indent: 0,
      textFormat: 1,
      type: 'details',
      version: 1,
      ...id('details1'),
      summary: 'details summary',
      open: false,
    },
  ),
  'image': content(
    image({
      ...id('image1'),
      thumbhash: 'abc=',
      accent: '#123456',
      width: 100,
      height: 50,
    }),
    image({ layout: 'float-left' }),
  ),
  'code': content(
    {
      type: 'code-block',
      version: 1,
      code: 'code body',
      language: 'typescript',
    },
    {
      type: 'code-block',
      version: 1,
      code: 'other code',
      language: 'javascript',
    },
  ),
  'math': content(
    paragraph(text('before math '), {
      type: 'katex-inline',
      version: 1,
      equation: 'x^2',
      color: null,
    }),
    {
      type: 'katex-block',
      version: 1,
      ...id('math1'),
      equation: 'y^2',
    },
  ),
  'footnote section in the middle': content(
    paragraph(text('has a note'), { type: 'footnote', version: 1, identifier: '1' }),
    {
      type: 'footnote-section',
      version: 1,
      ...id('notes1'),
      definitions: { 1: 'note body' },
    },
    { type: 'horizontalrule', version: 1 },
    paragraph(text('after the notes')),
  ),
  'image in a table cell paragraph': content(
    {
      children: [
        row(cell(paragraph(image({ altText: 'in a cell' }))), cell(image({ altText: 'directly in a cell' }))),
      ],
      direction: null,
      format: '',
      indent: 0,
      type: 'table',
      version: 1,
    },
    paragraph(image(), text('next to an image')),
  ),
  'alert inside nested content': content(
    {
      type: 'nested-doc',
      version: 1,
      content: content({
        type: 'alert-quote',
        version: 1,
        alertType: 'note',
        content: content(paragraph(text('alert in nested doc')), paragraph(image())),
      }),
    },
  ),
  'link card': content(
    {
      type: 'link-card',
      version: 1,
      ...id('card1'),
      url: 'https://example.com/a',
      title: 'card title',
      description: 'card description',
      favicon: 'https://example.com/i.png',
      image: 'https://example.com/c.png',
    },
    {
      type: 'link-card',
      version: 1,
      url: 'https://example.com/b',
      title: 'only a title',
    },
  ),
  'poll': content(
    {
      type: 'poll',
      version: 1,
      ...id('poll1'),
      pollId: 'p_demo',
      question: 'poll question',
      options: [
        { id: 'o_a', label: 'first option' },
        { id: 'o_b', label: 'second option' },
      ],
      mode: 'multiple',
      closeAt: '2026-12-31T00:00:00.000Z',
      showResults: 'after-vote',
    },
  ),
  'unregistered nodes': content(
    { type: 'excalidraw', version: 1, snapshot: 'a drawing' },
    paragraph(text('next to unknown'), { type: 'never-registered-inline', version: 1, value: 1 }),
  ),
}

afterEach(() => {
  document.body.innerHTML = ''
})

type Json = Record<string, unknown>

const UNREGISTERED = new Set([
  'never-registered',
  'never-registered-inline',
  'excalidraw',
  'agent-diff',
])

/** The text a reader should see, skipping what shows only as a placeholder. */
function textsOf(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach(child => textsOf(child, out))
  }
  else if (typeof node === 'object' && node !== null) {
    const { type, text, children, content, root } = node as Json
    if (UNREGISTERED.has(type as string))
      return out
    if (typeof text === 'string' && text.trim())
      out.push(text)
    textsOf(children, out)
    textsOf(content, out)
    textsOf(root, out)
  }
  return out
}

const EMPTY = {
  root: {
    type: 'root',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [],
  },
}

/** Both ways a document arrives: there when the editor mounts, or handed over later. */
async function check(value: SerializedEditorState, arrives: 'on mount' | 'after mount' = 'on mount') {
  const wrapper = mount(RichEditor, {
    props: {
      modelValue: arrives === 'on mount'
        ? value
        : EMPTY,
    } as never,
    attachTo: document.body,
  })
  await flushPromises()
  if (arrives === 'after mount') {
    await wrapper.setProps({ modelValue: value } as never)
    await flushPromises()
  }
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  const output = serializeEditorState(editor.getEditorState())
  const shown = wrapper.element.textContent ?? ''
  wrapper.unmount()
  const rendered = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value: value as unknown as SerializedDocument }),
  }))
  const readable = rendered.replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  return {
    output,
    missingInEditor: textsOf(value).filter(text => !shown.includes(text)),
    missingInRenderer: textsOf(value).filter(text => !readable.includes(text)),
  }
}

describe('stored document shapes', () => {
  describe.each(['on mount', 'after mount'] as const)('arriving %s', (arrives) => {
    it.each(Object.entries(storedShapes))('loads %s and outputs it unchanged', async (_name, value) => {
      const { output, missingInEditor, missingInRenderer } = await check(value as unknown as SerializedEditorState, arrives)
      expect(output).toEqual(value)
      expect(missingInEditor).toEqual([])
      expect(missingInRenderer).toEqual([])
    })
  })
})

// `HAKULEX_LOCAL_DOCS=path/to/docs.json`, a `{ name: document }` object. Real articles stay out of the repository.
const localDocs = process.env.HAKULEX_LOCAL_DOCS
describe.runIf(localDocs)('local stored documents', () => {
  it('loads each and outputs it unchanged', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const docs = JSON.parse(readFileSync(localDocs!, 'utf8')) as Record<string, SerializedEditorState>
    const failures: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(docs)) {
      for (const arrives of ['on mount', 'after mount'] as const) {
        const { output, missingInEditor, missingInRenderer } = await check(value, arrives)
        const changed = JSON.stringify(sorted(output)) !== JSON.stringify(sorted(value))
        if (changed || missingInEditor.length || missingInRenderer.length)
          failures[`${name} ${arrives}`] = { changed, missingInEditor, missingInRenderer }
        document.body.innerHTML = ''
      }
    }
    vi.restoreAllMocks()
    expect(failures).toEqual({})
  }, 560000)
})

function sorted(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(sorted)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [
        key,
        sorted(item),
      ]))
  }
  return value
}
