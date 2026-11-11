import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createNodeSelection,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { $isLinkCardNode, builtinTransformers, OPEN_BLOCK_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

afterEach(() => {
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
function paragraph(...children: unknown[]) {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children,
  }
}
function documentWith(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}
function card(extra: Record<string, unknown> = {}) {
  return {
    type: 'link-card',
    version: 1,
    url: 'https://example.com/a',
    title: 'A title',
    ...extra,
  }
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const output = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()) as unknown as { root: { children: Json[] } }
const dialog = () => document.querySelector<HTMLElement>('.hlx-block-dialog')
const field = (name: string) => dialog()!.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!
function fill(name: string, value: string) {
  const input = field(name)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
async function press(name: string) {
  const button = [
    ...dialog()!.querySelectorAll('button'),
  ].find(item => item.textContent?.trim() === name)!
  button.click()
  await flushPromises()
}
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="連結卡片"]')
const panelField = (name: string) => panel()!.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!
const panelError = () => panel()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null
async function typeIn(name: string, value: string) {
  const input = panelField(name)
  input.focus()
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
/** Types, then as a browser does on Enter. */
async function enter(name: string, value: string) {
  await typeIn(name, value)
  panelField(name).dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}
async function leave(name: string) {
  panelField(name).dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await flushPromises()
}
function selectCard(editor: LexicalEditor) {
  editor.update(() => {
    const node = $getRoot().getChildren().find($isLinkCardNode)!
    const selection = $createNodeSelection()
    selection.add(node.getKey())
    $setSelection(selection)
  }, { discrete: true })
}

describe('stored link cards', () => {
  it.each([
    [
      'all the fields',
      {
        description: 'D',
        favicon: 'https://example.com/i.png',
        image: 'https://example.com/c.png',
        $: { blockId: 'abc' },
      },
    ],
    ['only a URL and a title', {}],
    [
      'fields nothing here reads',
      {
        source: 'github',
        id: 'a/b',
        extra: { x: 1 },
      },
    ],
    [
      'values of the wrong type',
      { title: 42, description: null, image: {} },
    ],
    [
      'an unsafe URL',
      { url: 'javascript:alert(1)' },
    ],
    [
      'no URL at all',
      { url: undefined },
    ],
  ])('outputs one with %s as it was', async (_name, extra) => {
    const value = documentWith(card(extra))
    const { editor } = await mountEditor(value)
    expect(JSON.parse(JSON.stringify(output(editor)))).toEqual(JSON.parse(JSON.stringify(value)))
  })

  it('shows the stored data, and no link to an unsafe URL', async () => {
    const { wrapper } = await mountEditor(documentWith(card({ description: 'D' }), card({ url: 'javascript:alert(1)', title: 'Unsafe' })), { editable: false })
    expect(wrapper.text()).toContain('A title')
    expect(wrapper.text()).toContain('D')
    expect(wrapper.text()).toContain('Unsafe')
    expect(wrapper.findAll('a.hlx-link-card').map(link => link.attributes('href'))).toEqual(['https://example.com/a'])
  })
})

describe('editing a link card', () => {
  it('inserts one from the dialog, as one undo step', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), paragraph()))
    editor.update(() => $getRoot().getLastChildOrThrow().selectEnd(), { discrete: true })
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'link-card' })
    await flushPromises()
    fill('url', ' https://example.com/new ')
    fill('title', '新卡片')
    await press('儲存')
    expect(dialog()).toBeNull()
    const { children } = output(editor).root
    expect(children.map(node => node.type)).toEqual(['paragraph', 'link-card', 'paragraph'])
    expect(children[1]).toMatchObject({ url: 'https://example.com/new', title: '新卡片' })
    expect(children[1]).not.toHaveProperty('description')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(output(editor).root.children.map(node => node.type)).not.toContain('link-card')
  })

  it.each([
    ['', '請輸入'],
    ['javascript:alert(1)', 'http'],
    ['not a url', 'http'],
  ])('refuses the URL %j, staying open', async (url, message) => {
    const { editor } = await mountEditor(documentWith(paragraph()))
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'link-card' })
    await flushPromises()
    fill('url', url)
    await press('儲存')
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('[role="alert"]')!.textContent).toContain(message)
  })

  it('refuses an unsafe picture', async () => {
    const { editor } = await mountEditor(documentWith(paragraph()))
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'link-card' })
    await flushPromises()
    fill('url', 'https://example.com')
    fill('image', 'javascript:alert(1)')
    await press('儲存')
    expect(dialog()).not.toBeNull()
  })

  it('leaves no empty card when cancelled', async () => {
    const value = documentWith(paragraph(text('前')))
    const { editor } = await mountEditor(value)
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'link-card' })
    await flushPromises()
    await press('取消')
    expect(dialog()).toBeNull()
    expect(output(editor)).toEqual(value)
    expect(document.activeElement).toBe(editor.getRootElement())
  })

  it('changes what the panel shows, as it is typed, and only that', async () => {
    const { editor } = await mountEditor(documentWith(card({
      description: 'old',
      source: 'github',
      $: { blockId: 'abc' },
    })))
    selectCard(editor)
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(panelField('title').value).toBe('A title')
    await typeIn('title', 'Ne')
    await typeIn('title', 'New')
    await leave('title')
    await typeIn('description', '')
    const [node] = output(editor).root.children
    expect(node).toMatchObject({
      title: 'New',
      source: 'github',
      url: 'https://example.com/a',
      $: { blockId: 'abc' },
    })
    expect(node).not.toHaveProperty('description')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(output(editor).root.children[0]).toMatchObject({ title: 'New', description: 'old' })
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(output(editor).root.children[0]).toMatchObject({ title: 'A title', description: 'old' })
  })

  it('selects on click while editing, without being a link', async () => {
    const { editor, wrapper } = await mountEditor(documentWith(card(), paragraph()))
    expect(wrapper.find('a.hlx-link-card').exists()).toBe(false)
    await wrapper.find('.hlx-link-card').trigger('click')
    await flushPromises()
    expect(editor.read(() => $isNodeSelection($getSelection()))).toBe(true)
    expect(dialog()).toBeNull()
  })

  it('is a link when read-only, with nothing to edit', async () => {
    const { wrapper } = await mountEditor(documentWith(card()), { editable: false })
    expect(wrapper.find('a.hlx-link-card').attributes('href')).toBe('https://example.com/a')
    await wrapper.find('.hlx-link-card').trigger('click')
    expect(document.querySelector('.hlx-block-toolbar')).toBeNull()
  })

  it('opens its panel from its toolbar once picked, or a double click', async () => {
    const { wrapper } = await mountEditor(documentWith(card()))
    await wrapper.find('.hlx-link-card').trigger('click')
    await flushPromises()
    document.querySelector<HTMLElement>('.hlx-block-toolbar button')!.click()
    await flushPromises()
    expect(panel()).not.toBeNull()
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(panelField('url'))
    document.querySelector<HTMLElement>('.hlx-block-toolbar button')!.click()
    await flushPromises()
    expect(panel()).toBeNull()
    await wrapper.find('.hlx-link-card').trigger('dblclick')
    await flushPromises()
    expect(panel()).not.toBeNull()
  })

  it('can be selected by keyboard, deleted and restored', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), card(), paragraph(text('後'))))
    editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(editor.read(() => $isNodeSelection($getSelection()))).toBe(true)
    editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown', { key: 'Delete' }))
    await flushPromises()
    expect(output(editor).root.children.map(node => node.type)).toEqual(['paragraph', 'paragraph'])
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(output(editor).root.children[1]).toMatchObject({ type: 'link-card', title: 'A title' })
  })

  it('pastes a copy with the same content', async () => {
    const source = card({ description: 'D', source: 'github' })
    const { editor } = await mountEditor(documentWith(source, paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-lexical-editor', JSON.stringify({
      namespace: 'hakulex',
      nodes: [source],
    }))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    const cards = output(editor).root.children.filter(node => node.type === 'link-card')
    expect(cards).toHaveLength(2)
    expect(cards[1]).toMatchObject({ description: 'D', source: 'github' })
  })

  it('can be inserted in nested content', async () => {
    const empty = documentWith(paragraph())
    const value = documentWith({ type: 'nested-doc', version: 1, content: empty })
    const { editor } = await mountEditor(value)
    const inner = (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
    inner.update(() => $getRoot().selectEnd(), { discrete: true })
    inner.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'link-card' })
    await flushPromises()
    fill('url', 'https://example.com')
    await press('儲存')
    await flushPromises()
    expect(JSON.stringify(output(editor))).toContain('"link-card"')
  })
})

describe('the link card panel', () => {
  async function opened(extra: Record<string, unknown> = {}) {
    const result = await mountEditor(documentWith(card(extra), paragraph()))
    selectCard(result.editor)
    result.editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    return result
  }

  it('takes a new address once entered, refusing a blank or non-http one', async () => {
    const { editor } = await opened()
    await typeIn('url', 'https://example.com/b')
    expect(output(editor).root.children[0].url).toBe('https://example.com/a')
    panelField('url').dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(output(editor).root.children[0].url).toBe('https://example.com/b')
    await enter('url', '')
    expect(panelError()).toBe('請輸入網址')
    await enter('url', 'ftp://example.com')
    expect(panelError()).toBe('網址要以 http 或 https 開頭')
    expect(panelField('url').getAttribute('aria-invalid')).toBe('true')
    expect(output(editor).root.children[0].url).toBe('https://example.com/b')
  })

  it('refuses an unsafe picture, and removes a cleared one', async () => {
    const { editor } = await opened({ image: 'https://example.com/i.png' })
    await enter('image', 'javascript:alert(1)')
    expect(panelError()).toBe('圖片網址無法使用')
    expect(output(editor).root.children[0].image).toBe('https://example.com/i.png')
    await enter('image', '')
    expect(panelError()).toBeNull()
    expect(output(editor).root.children[0]).not.toHaveProperty('image')
    await enter('favicon', 'https://example.com/f.ico')
    expect(output(editor).root.children[0].favicon).toBe('https://example.com/f.ico')
  })

  it('puts the card back as it was on Esc, a field it added included', async () => {
    const { editor } = await opened({ description: 'old' })
    const before = output(editor)
    await typeIn('title', 'New')
    await leave('title')
    await enter('favicon', 'https://example.com/f.ico')
    panelField('favicon').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    expect(output(editor)).toEqual(before)
  })

  it('opens from an empty card\'s 編輯', async () => {
    await mountEditor(documentWith({ type: 'link-card', version: 1 }))
    document.querySelector<HTMLButtonElement>('.hlx-block-empty button')!.click()
    await flushPromises()
    expect(panel()).not.toBeNull()
    expect(dialog()).toBeNull()
  })
})

describe('exporting a link card', () => {
  const markdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

  it('goes to markdown as a link', async () => {
    const { editor } = await mountEditor(documentWith(card(), card({ title: undefined, url: 'https://example.com/b' }), card({ title: 'with [brackets]', url: 'https://example.com/c' }), card({ url: 'javascript:alert(1)', title: 'Unsafe' })))
    const lines = markdown(editor).split(/\n+/)
    expect(lines).toEqual([
      '[A title](https://example.com/a)',
      '<https://example.com/b>',
      '[with \\[brackets\\]](https://example.com/c)',
      'Unsafe',
    ])
  })

  it('goes to HTML and comes back', async () => {
    const fields = { description: 'D', favicon: 'https://example.com/i.png', image: 'https://example.com/c.png' }
    const { editor } = await mountEditor(documentWith(card(fields), paragraph()))
    const html = editor.read(() => $generateHtmlFromNodes(editor))
    expect(html).toContain('href="https://example.com/a"')
    const dom = new DOMParser().parseFromString(html, 'text/html')
    editor.update(() => {
      $getRoot().clear().append(...$generateNodesFromDOM(editor, dom).filter($isLinkCardNode))
    }, { discrete: true })
    expect(output(editor).root.children[0]).toMatchObject({
      type: 'link-card',
      url: 'https://example.com/a',
      title: 'A title',
      ...fields,
    })
  })

  it('leaves no link in HTML for an unsafe URL', async () => {
    const { editor } = await mountEditor(documentWith(card({ url: 'javascript:alert(1)', title: 'Unsafe' })))
    const html = editor.read(() => $generateHtmlFromNodes(editor))
    expect(html).not.toContain('javascript:')
    expect(html).toContain('Unsafe')
  })
})

describe('fetched card data', () => {
  // Every card is near the screen at once.
  class NearObserver {
    constructor(private callback: IntersectionObserverCallback) {}
    observe(target: Element) {
      this.callback([
        { isIntersecting: true, target } as IntersectionObserverEntry,
      ], this as never)
    }

    disconnect() {}
    unobserve() {}
  }
  afterEach(() => vi.unstubAllGlobals())

  it('shows in the editor and in nested content, with the site\'s settings, and stays out of the document', async () => {
    vi.stubGlobal('IntersectionObserver', NearObserver)
    const fetchJson = vi.fn(async (url: string) => ({
      name: url.split('/').pop(),
      description: 'Fetched',
      owner: { avatar_url: 'https://avatars.example.com/a.png' },
    }))
    const outer = { type: 'link-card', version: 1, url: 'https://github.com/editor/outer' }
    const inner = { type: 'link-card', version: 1, url: 'https://github.com/editor/inner' }
    const value = documentWith(outer, {
      type: 'nested-doc',
      version: 1,
      content: documentWith(inner),
    })
    const before = JSON.parse(JSON.stringify(value))
    const { editor } = await mountEditor(value, {
      linkCards: { fetchJson },
    })
    await flushPromises()
    await flushPromises()
    const titles = [
      ...document.querySelectorAll('.hlx-link-card-title-text'),
    ].map(title => title.textContent)
    expect(titles).toEqual(['outer', 'inner'])
    expect(fetchJson).toHaveBeenCalledTimes(2)
    expect(output(editor).root.children[0]).toEqual(before.root.children[0])
    expect(JSON.stringify(output(editor))).not.toContain('Fetched')
  })
})
