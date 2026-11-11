import type { LexicalEditor } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { $createAutoLinkNode, $createLinkNode, $isAutoLinkNode, $isLinkNode } from '@lexical/link'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $selectAll,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { FloatingToolbarPlugin, normalizeUrl } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

async function mountWithToolbar() {
  const wrapper = mount(RichEditor, {
    attachTo: document.body,
    slots: {
      default: () => h(FloatingToolbarPlugin, { validateUrl }),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.update(() => {
    $getRoot().clear().append($createParagraphNode().append($createTextNode('hello world')))
  }, { discrete: true })
  return { wrapper, editor }
}

async function selectAll(editor: LexicalEditor) {
  editor.getRootElement()!.focus()
  editor.update(() => $selectAll(), { discrete: true })
  await flushPromises()
}

const toolbar = () => document.querySelector<HTMLElement>('.hlx-floating-toolbar')
const button = (label: string) => toolbar()!.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!

describe('floatingToolbarPlugin', () => {
  it('stays hidden for a collapsed selection', async () => {
    const { editor } = await mountWithToolbar()
    editor.getRootElement()!.focus()
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    expect(toolbar()).toBeNull()
  })

  it('shows for a text selection and reflects formats', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    expect(toolbar()).not.toBeNull()
    expect(button('粗體').getAttribute('aria-pressed')).toBe('false')

    button('粗體').click()
    await flushPromises()
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.hasFormat('bold')).toBe(true)
    })
    expect(button('粗體').getAttribute('aria-pressed')).toBe('true')
  })

  it('hides when the editor is read-only', async () => {
    const { wrapper, editor } = await mountWithToolbar()
    await selectAll(editor)
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(toolbar()).toBeNull()
  })

  it('adds a link through the inline input', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    button('連結').click()
    await flushPromises()

    const input = toolbar()!.querySelector<HTMLInputElement>('input')!
    input.value = 'example.com'
    input.dispatchEvent(new Event('input'))
    toolbar()!.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    const href = editor.getEditorState().read(() => {
      const parent = $getRoot().getAllTextNodes()[0].getParent()
      return $isLinkNode(parent)
        ? parent.getURL()
        : null
    })
    expect(href).toBe('https://example.com')
  })

  it('rejects URLs that fail validateUrl', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    button('連結').click()
    await flushPromises()

    const input = toolbar()!.querySelector<HTMLInputElement>('input')!
    input.value = 'javascript:alert(1)'
    input.dispatchEvent(new Event('input'))
    toolbar()!.querySelector('form')!.dispatchEvent(new Event('submit'))
    await flushPromises()

    expect(toolbar()!.querySelector('[role="alert"]')).not.toBeNull()
    const hasLink = editor.getEditorState().read(() =>
      $getRoot().getAllTextNodes().some(node => $isLinkNode(node.getParent())))
    expect(hasLink).toBe(false)
  })
})

describe('inline syntax', () => {
  const rootJson = (editor: LexicalEditor) => editor.getEditorState().toJSON().root
  interface Json { type: string, text?: string, reading?: string, children?: Json[] }
  const nodesOfType = (node: Json, type: string): Json[] => [
    ...(node.type === type
      ? [node]
      : []),
    ...(node.children ?? []).flatMap(child => nodesOfType(child, type)),
  ]
  const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
  const found = (editor: LexicalEditor, type: string) => nodesOfType(rootJson(editor) as unknown as Json, type)
  const documentText = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent())

  async function undo(editor: LexicalEditor) {
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
  }

  async function click(label: string) {
    button(label).click()
    await flushPromises()
  }

  const readingInput = () => toolbar()!.querySelector<HTMLInputElement>('input[aria-label="讀音"]')!

  async function submitReading(value: string) {
    const input = readingInput()
    input.value = value
    input.dispatchEvent(new Event('input'))
    toolbar()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
  }

  it('switches between superscript and subscript, and undoes one step', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)

    await click('上標')
    expect(button('上標').getAttribute('aria-pressed')).toBe('true')
    expect(button('下標').getAttribute('aria-pressed')).toBe('false')
    expect(document.querySelector('.hlx-content sup')).not.toBeNull()

    await click('下標')
    expect(button('上標').getAttribute('aria-pressed')).toBe('false')
    expect(button('下標').getAttribute('aria-pressed')).toBe('true')
    expect(document.querySelector('.hlx-content sup')).toBeNull()
    expect(document.querySelector('.hlx-content sub')).not.toBeNull()

    await undo(editor)
    expect(document.querySelector('.hlx-content sup')).not.toBeNull()
    expect(document.querySelector('.hlx-content sub')).toBeNull()
    expect(button('上標').getAttribute('aria-pressed')).toBe('true')
  })

  it('wraps each paragraph as a spoiler and unwraps them, keeping links and text', async () => {
    const { editor } = await mountWithToolbar()
    editor.update(() => {
      $getRoot().clear().append(
        $createParagraphNode().append($createTextNode('one ')).append($createLinkNode('https://example.com').append($createTextNode('link'))),
        $createParagraphNode().append($createTextNode('two')),
      )
    }, { discrete: true })
    await selectAll(editor)
    const before = documentText(editor)

    expect(button('Spoiler').getAttribute('aria-pressed')).toBe('false')
    await click('Spoiler')
    expect(found(editor, 'spoiler').map(textOf)).toEqual(['one link', 'two'])
    expect(found(editor, 'link')).toHaveLength(1)
    expect(found(editor, 'paragraph')).toHaveLength(2)
    expect(button('Spoiler').getAttribute('aria-pressed')).toBe('true')

    await click('Spoiler')
    expect(found(editor, 'spoiler')).toHaveLength(0)
    expect(found(editor, 'link')).toHaveLength(1)
    expect(found(editor, 'paragraph')).toHaveLength(2)
    expect(documentText(editor)).toBe(before)
    expect(button('Spoiler').getAttribute('aria-pressed')).toBe('false')
  })

  it('adds, changes and clears a reading, one undo step each', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)

    await click('Ruby 注音')
    expect(readingInput().value).toBe('')
    await submitReading('hàn')
    expect(found(editor, 'ruby').map(node => node.reading)).toEqual(['hàn'])
    expect(button('Ruby 注音').getAttribute('aria-pressed')).toBe('true')

    await click('Ruby 注音')
    expect(readingInput().value).toBe('hàn')
    await submitReading('kan')
    expect(found(editor, 'ruby').map(node => node.reading)).toEqual(['kan'])

    await click('Ruby 注音')
    await submitReading('')
    expect(found(editor, 'ruby')).toHaveLength(0)
    expect(documentText(editor)).toBe('hello world')

    await undo(editor)
    expect(found(editor, 'ruby').map(node => node.reading)).toEqual(['kan'])
    await undo(editor)
    expect(found(editor, 'ruby').map(node => node.reading)).toEqual(['hàn'])
    await undo(editor)
    expect(found(editor, 'ruby')).toHaveLength(0)
  })

  it('removes a reading with its own button', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    await click('Ruby 注音')
    await submitReading('hàn')

    await click('Ruby 注音')
    await click('移除讀音')
    expect(found(editor, 'ruby')).toHaveLength(0)
    expect(documentText(editor)).toBe('hello world')
  })

  it('leaves the document alone when cancelled, and returns focus', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    const before = rootJson(editor)

    await click('Ruby 注音')
    const input = readingInput()
    input.focus()
    input.value = 'hàn'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

    expect(toolbar()?.querySelector('input') ?? null).toBeNull()
    expect(rootJson(editor)).toEqual(before)
    expect(document.activeElement).toBe(editor.getRootElement())
  })

  it('leaves the document alone when a blank reading is entered on plain text', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    const before = rootJson(editor)
    await click('Ruby 注音')
    await submitReading('   ')
    expect(rootJson(editor)).toEqual(before)
  })

  it('cancels when clicking outside', async () => {
    const { editor } = await mountWithToolbar()
    await selectAll(editor)
    await click('Ruby 注音')
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    expect(toolbar()?.querySelector('input[aria-label="讀音"]') ?? null).toBeNull()
    expect(found(editor, 'ruby')).toHaveLength(0)
  })

  it('disables ruby across paragraphs', async () => {
    const { editor } = await mountWithToolbar()
    editor.update(() => {
      $getRoot().clear().append(
        $createParagraphNode().append($createTextNode('one')),
        $createParagraphNode().append($createTextNode('two')),
      )
    }, { discrete: true })
    await selectAll(editor)
    expect(button('Ruby 注音').disabled).toBe(true)
    expect(button('Spoiler').disabled).toBe(false)
  })

  it('has no toolbar while read-only', async () => {
    const { wrapper, editor } = await mountWithToolbar()
    await selectAll(editor)
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(toolbar()).toBeNull()
  })
})

describe('normalizeUrl', () => {
  it.each([
    ['example.com', 'https://example.com'],
    ['  https://a.b/c  ', 'https://a.b/c'],
    ['mailto:x@y.z', 'mailto:x@y.z'],
    ['someone@example.com', 'mailto:someone@example.com'],
    ['//cdn.example.com', 'https://cdn.example.com'],
    ['javascript:alert(1)', 'javascript:alert(1)'],
    ['   ', ''],
  ])('%j → %j', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected)
  })
})

describe('clearing formats', () => {
  const FORMATTED = [
    ['bold', 'bold'],
    ['italic', 'italic'],
    ['code', 'code'],
  ] as const

  async function mountFormatted() {
    const setup = await mountWithToolbar()
    setup.editor.update(() => {
      const paragraph = $createParagraphNode()
      for (const [text, format] of FORMATTED)
        paragraph.append($createTextNode(text).toggleFormat(format))
      paragraph.append($createLinkNode('https://example.com').append($createTextNode('link').toggleFormat('bold')))
      $getRoot().clear().append(paragraph)
    }, { discrete: true })
    await flushPromises()
    return setup
  }

  const textNodes = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getAllTextNodes().map(node => [
    node.getTextContent(),
    node.getFormat(),
  ]))

  it('removes formats but keeps the text and links, and undoes in one step', async () => {
    const { editor } = await mountFormatted()
    const before = textNodes(editor)
    await selectAll(editor)
    expect(button('清除格式')).not.toBeNull()

    button('清除格式').click()
    await flushPromises()

    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('bolditaliccodelink')
    expect(textNodes(editor).every(([, format]) => format === 0)).toBe(true)
    expect(editor.getEditorState().read(() => $getRoot().getAllTextNodes().some(node => $isLinkNode(node.getParent())))).toBe(true)
    expect(button('粗體').getAttribute('aria-pressed')).toBe('false')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(textNodes(editor)).toEqual(before)
  })
})

describe('removing an autolink', () => {
  async function mountAutoLink() {
    const setup = await mountWithToolbar()
    setup.editor.update(() => {
      $getRoot().clear().append($createParagraphNode().append(
        $createAutoLinkNode('https://example.com').append($createTextNode('https://example.com')),
      ))
    }, { discrete: true })
    await flushPromises()
    await selectAll(setup.editor)
    return setup
  }
  const autoLink = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getAllTextNodes().map(node => node.getParent()).find($isAutoLinkNode) ?? null)
  const unlinked = (editor: LexicalEditor) => editor.getEditorState().read(() => autoLink(editor)?.getIsUnlinked())

  async function removeLink() {
    button('連結').click()
    await flushPromises()
    button('移除連結').click()
    await flushPromises()
  }

  it('unlinks it, reports no link, and stays unlinked while editing', async () => {
    const { editor } = await mountAutoLink()
    expect(button('連結').getAttribute('aria-pressed')).toBe('true')
    await removeLink()

    expect(unlinked(editor)).toBe(true)
    await selectAll(editor)
    expect(button('連結').getAttribute('aria-pressed')).toBe('false')

    editor.update(() => {
      const text = $getRoot().getAllTextNodes()[0]
      text.setTextContent(`${text.getTextContent()}/more`)
    }, { discrete: true })
    await flushPromises()
    expect(unlinked(editor)).toBe(true)
    expect(document.querySelector('.hlx-content a')).toBeNull()
  })

  it('does not relink when an empty URL is submitted on unlinked text', async () => {
    const { editor } = await mountAutoLink()
    await removeLink()
    await selectAll(editor)

    button('連結').click()
    await flushPromises()
    const input = toolbar()!.querySelector('input')!
    input.value = ''
    input.dispatchEvent(new Event('input'))
    toolbar()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(unlinked(editor)).toBe(true)
  })
})
