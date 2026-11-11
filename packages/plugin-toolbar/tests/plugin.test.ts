import type { LexicalEditor, RangeSelection, SerializedLexicalNode, TextNode } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { $isLinkNode } from '@lexical/link'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $selectAll,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { ToolbarPlugin } from '../src'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  tag?: string
}

afterEach(() => {
  document.body.innerHTML = ''
})

function mountWithToolbar(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props,
    attachTo: document.body,
    slots: {
      toolbar: () => h(ToolbarPlugin, { validateUrl }),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const types = (editor: LexicalEditor) => rootChildren(editor).map(node => node.type)
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const dom = (editor: LexicalEditor) => editor.getRootElement()!
const bar = () => document.querySelector<HTMLElement>('.hlx-fixed-toolbar')
const button = (name: string) => bar()!.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
const pressed = (name: string) => button(name).getAttribute('aria-pressed') === 'true'
function option(name: string) {
  return [
    ...document.querySelectorAll<HTMLElement>('.hlx-fixed-toolbar-menu [role^="menuitem"]'),
  ].find(el => el.textContent?.trim() === name)
}

async function withParagraphs(editor: LexicalEditor, ...values: string[]) {
  editor.update(() => {
    const root = $getRoot().clear()
    for (const value of values) {
      root.append($createParagraphNode().append(...(value
        ? [
            $createTextNode(value),
          ]
        : [])))
    }
  }, { discrete: true })
  await flushPromises()
}

async function selectAll(editor: LexicalEditor) {
  dom(editor).focus()
  editor.update(() => $selectAll(), { discrete: true })
  await flushPromises()
}

async function click(name: string) {
  button(name).click()
  await flushPromises()
}

async function openMenu(name: string) {
  button(name).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await flushPromises()
}

async function choose(name: string) {
  option(name)!.click()
  await flushPromises()
}

describe('placement', () => {
  it('comes before the content, and is gone while read-only', async () => {
    const { wrapper, editor } = mountWithToolbar()
    await flushPromises()
    expect(bar()!.getAttribute('role')).toBe('toolbar')
    expect(bar()!.compareDocumentPosition(dom(editor)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(bar()).toBeNull()
    await wrapper.setProps({ editable: true })
    await flushPromises()
    expect(bar()).not.toBeNull()
  })
})

describe('formats', () => {
  it('applies, keeps the selection, and follows it', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, 'hello', 'world')
    editor.update(() => $getRoot().getAllTextNodes()[0].select(0, 5), { discrete: true })
    dom(editor).focus()
    await flushPromises()
    expect(pressed('粗體')).toBe(false)

    await click('粗體')
    expect(pressed('粗體')).toBe(true)
    expect(editor.getEditorState().read(() => $getSelection()?.getTextContent())).toBe('hello')

    editor.update(() => $getRoot().getAllTextNodes()[1].select(0, 5), { discrete: true })
    await flushPromises()
    expect(pressed('粗體')).toBe(false)
  })

  it('keeps superscript and subscript apart', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, 'x')
    await selectAll(editor)
    await click('上標')
    expect(pressed('上標')).toBe(true)
    await click('下標')
    expect(pressed('上標')).toBe(false)
    expect(pressed('下標')).toBe(true)
  })

  it('keeps the mouse press from taking the selection away', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, 'x')
    await flushPromises()
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    button('粗體').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('disables text controls without a text selection, leaving history and insert', async () => {
    const { editor } = mountWithToolbar({
      modelValue: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'image',
              version: 1,
              src: 'https://example.com/a.png',
              altText: '',
            },
            {
              type: 'paragraph',
              version: 1,
              format: '',
              indent: 0,
              direction: null,
              textFormat: 0,
              textStyle: '',
              children: [],
            },
          ],
        },
      } as never,
    })
    await flushPromises()
    dom(editor).querySelector<HTMLElement>('.hlx-image-editor')!.click()
    await flushPromises()
    expect(button('粗體').disabled).toBe(true)
    expect(button('區塊類型').disabled).toBe(true)
    expect(button('插入').disabled).toBe(false)
    expect(button('復原')).not.toBeNull()
  })
})

describe('block type', () => {
  it('shows the current type and changes every selected block, in one undo step', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '一', '二')
    await selectAll(editor)
    expect(button('區塊類型').textContent).toContain('段落')

    await openMenu('區塊類型')
    await choose('標題 2')
    expect(types(editor)).toEqual(['heading', 'heading'])
    expect(rootChildren(editor).map(node => node.tag)).toEqual(['h2', 'h2'])
    expect(button('區塊類型').textContent).toContain('標題 2')

    await click('復原')
    expect(types(editor)).toEqual(['paragraph', 'paragraph'])
  })

  it('says so when blocks differ', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '一', '二')
    editor.update(() => $getRoot().getAllTextNodes()[0].select(), { discrete: true })
    await flushPromises()
    dom(editor).focus()
    await openMenu('區塊類型')
    await choose('引用')
    await selectAll(editor)
    expect(button('區塊類型').textContent).toContain('多種')
  })
})

describe('history', () => {
  it('follows what can be undone, and does it', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '')
    await flushPromises()
    editor.update(() => {
      $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().select()
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText('字')
    }, { discrete: true })
    await flushPromises()
    expect(button('復原').disabled).toBe(false)
    expect(button('重做').disabled).toBe(true)

    await click('復原')
    expect(textOf(rootChildren(editor)[0])).toBe('')
    expect(button('重做').disabled).toBe(false)

    await click('重做')
    expect(textOf(rootChildren(editor)[0])).toBe('字')
  })
})

describe('link', () => {
  const linked = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getAllTextNodes().some(node => $isLinkNode(node.getParent())))
  const input = () => bar()!.querySelector<HTMLInputElement>('input[aria-label="網址"]')!

  async function submit(value: string) {
    input().value = value
    input().dispatchEvent(new Event('input', { bubbles: true }))
    bar()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }

  it('is disabled with nothing selected', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, 'x')
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    expect(button('連結').disabled).toBe(true)
  })

  it('adds and removes a link', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, 'x')
    await selectAll(editor)
    await click('連結')
    await submit('example.com')
    expect(linked(editor)).toBe(true)

    await selectAll(editor)
    expect(pressed('連結')).toBe(true)
    await click('連結')
    expect(input().value).toBe('https://example.com')
    await click('移除連結')
    expect(linked(editor)).toBe(false)
  })

  it('refuses an unsafe address, and cancels with Escape', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, 'x')
    await selectAll(editor)
    await click('連結')
    await submit('javascript:alert(1)')
    expect(bar()!.querySelector('[role="alert"]')).not.toBeNull()
    expect(linked(editor)).toBe(false)

    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(bar()!.querySelector('form')).toBeNull()
    expect(linked(editor)).toBe(false)
    expect(document.activeElement).toBe(dom(editor))
  })
})

describe('insert', () => {
  it.each([
    ['標籤', 'tag'],
    ['HTML 註解', 'comment'],
  ])('offers %s, as the slash menu does', async (label, type) => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '一')
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    await openMenu('插入')
    await choose(label)
    await flushPromises()
    const nodes = (editor.getEditorState().toJSON().root.children[0] as unknown as { children: { type: string }[] }).children
    expect(nodes.map(node => node.type)).toContain(type)
  })

  it('inserts at the caret', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '一')
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    await openMenu('插入')
    await choose('分隔線')
    expect(types(editor)).toContain('horizontalrule')
  })

  it('goes to the end of the document with no caret yet', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '一')
    // Nobody has clicked in the editor, so there is no selection.
    await openMenu('插入')
    await choose('分隔線')
    expect(types(editor).indexOf('horizontalrule')).toBeGreaterThan(0)
  })

  it('opens the dialogs, and leaves out what the type menu already has', async () => {
    const { editor } = mountWithToolbar()
    await withParagraphs(editor, '一')
    await openMenu('插入')
    expect(option('標題 1')).toBeUndefined()
    expect(option('表格')).not.toBeUndefined()
    expect(option('影片')).not.toBeUndefined()
    await choose('影片')
    expect(document.querySelector('.hlx-media-dialog')).not.toBeNull()
  })
})

describe('inside other editors', () => {
  const content = (...children: unknown[]) => ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  })
  const paragraph = (...children: unknown[]) => ({
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children,
  })
  const text = (value: string) => ({
    type: 'text',
    version: 1,
    text: value,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  })
  const steps = () => ({
    type: 'steps',
    version: 1,
    steps: [
      {
        id: 'a',
        title: '甲',
        content: content(paragraph(text('步驟內'))),
      },
    ],
  })
  const nestedRoot = () => document.querySelector<HTMLElement & { __lexicalEditor: LexicalEditor }>('.hlx-step-content [data-lexical-editor]')!

  async function mounted() {
    const { editor } = mountWithToolbar({
      modelValue: content(paragraph(text('外層')), steps()),
    })
    await flushPromises()
    return { outer: editor, nested: nestedRoot().__lexicalEditor }
  }

  async function select(editor: LexicalEditor) {
    editor.getRootElement()!.focus()
    editor.update(() => {
      const node = $getRoot().getFirstDescendant() as TextNode
      node.select(0, node.getTextContentSize())
    }, { discrete: true })
    await flushPromises()
  }

  const firstBlock = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children[0] as Json

  it('applies formats there, and leaves the outer editor alone', async () => {
    const { outer, nested } = await mounted()
    await select(nested)
    expect(button('粗體').disabled).toBe(false)
    button('粗體').click()
    await flushPromises()
    expect(firstBlock(nested).children![0].format).toBe(1)
    expect(firstBlock(outer).children![0].format).toBe(0)
    expect(pressed('粗體')).toBe(true)
  })

  it('shows the state of where the caret is, following it back and forth', async () => {
    const { outer, nested } = await mounted()
    await select(nested)
    button('粗體').click()
    await flushPromises()
    expect(pressed('粗體')).toBe(true)
    await select(outer)
    expect(pressed('粗體')).toBe(false)
    await select(nested)
    expect(pressed('粗體')).toBe(true)
  })

  it('turns blocks into other types there', async () => {
    const { outer, nested } = await mounted()
    await select(nested)
    await openMenu('區塊類型')
    await choose('標題 1')
    expect(firstBlock(nested).type).toBe('heading')
    expect(firstBlock(outer).type).toBe('paragraph')
  })

  it('makes links there', async () => {
    const { nested } = await mounted()
    await select(nested)
    button('連結').click()
    await flushPromises()
    const input = bar()!.querySelector<HTMLInputElement>('.hlx-fixed-toolbar-input')!
    input.focus()
    input.value = 'https://example.com'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    await flushPromises()
    expect(firstBlock(nested).children![0].type).toBe('link')
  })

  it('offers only what can go there, and inserts there', async () => {
    const { outer, nested } = await mounted()
    const openInsert = () => openMenu('插入')
    await select(outer)
    await openInsert()
    expect(option('步驟')).toBeDefined()
    expect(option('格狀版面')).toBeDefined()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushPromises()
    await select(nested)
    await openInsert()
    expect(option('步驟')).toBeUndefined()
    expect(option('註腳')).toBeUndefined()
    expect(option('格狀版面')).toBeUndefined()
    expect(option('巢狀文件')).toBeUndefined()
    option('分隔線')!.click()
    await flushPromises()
    await flushPromises()
    const types = nested.getEditorState().toJSON().root.children.map(node => node.type)
    expect(types).toContain('horizontalrule')
    expect(outer.getEditorState().toJSON().root.children.map(node => node.type)).toEqual(['paragraph', 'steps'])
  })

  it('only leaves history on in a step\'s title', async () => {
    const { nested } = await mounted()
    await select(nested)
    nested.update(() => {
      ($getRoot().getLastDescendant() as TextNode).selectEnd().insertText('字')
    }, { discrete: true })
    await flushPromises()
    document.querySelector<HTMLElement>('.hlx-step-title-input')!.focus()
    await flushPromises()
    for (const name of ['粗體', '連結', '插入', '區塊類型'])
      expect(button(name).disabled).toBe(true)
    expect(button('復原').disabled).toBe(false)
  })

  it('undoes what was done inside', async () => {
    const { nested } = await mounted()
    nested.update(() => {
      $getRoot().selectEnd()
      ;($getSelection() as RangeSelection).insertText('字')
    }, { discrete: true })
    await flushPromises()
    expect(button('復原').disabled).toBe(false)
    button('復原').click()
    await flushPromises()
    expect(nested.getEditorState().read(() => $getRoot().getTextContent())).toBe('步驟內')
    expect(button('重做').disabled).toBe(false)
  })

  it('goes back to the outer editor once the inner one is gone', async () => {
    const { outer, nested } = await mounted()
    await select(nested)
    outer.update(() => {
      $getRoot().getLastChildOrThrow().remove()
    }, { discrete: true })
    await flushPromises()
    await select(outer)
    button('粗體').click()
    await flushPromises()
    expect(firstBlock(outer).children![0].format).toBe(1)
  })
})
