import type { LexicalEditor, LexicalNode } from 'lexical'
import { RichEditor, validateUrl } from '@hakulex/editor'
import { $createAutoLinkNode, $createLinkNode, $isAutoLinkNode, $isLinkNode } from '@lexical/link'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isNodeSelection,
  $isTextNode,
  KEY_MODIFIER_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { LinkEditPlugin } from '../src'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

const LONG = 'https://example.com/a/very/long/path/that/goes/on/and/on/and/on/index.html'

async function mountWithPanel() {
  const wrapper = mount(RichEditor, {
    attachTo: document.body,
    slots: {
      default: () => h(LinkEditPlugin, { validateUrl }),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.update(() => {
    const unlinked = $createAutoLinkNode('https://off.example').append($createTextNode('https://off.example'))
    unlinked.setIsUnlinked(true)
    $getRoot().clear().append(
      $createParagraphNode().append(
        $createTextNode('前 '),
        $createLinkNode(LONG).append($createTextNode('範例').toggleFormat('bold')),
        $createTextNode(' 中 '),
        $createAutoLinkNode('https://auto.example/').append($createTextNode('https://auto.example/')),
        $createTextNode(' '),
        unlinked,
        $createTextNode(' 後'),
      ),
    )
  }, { discrete: true })
  await flushPromises()
  return { wrapper, editor }
}

/** All the nodes in the document, in order. */
function $all(): LexicalNode[] {
  const out: LexicalNode[] = []
  const walk = (node: LexicalNode) => {
    out.push(node)
    if ($isElementNode(node))
      node.getChildren().forEach(walk)
  }
  walk($getRoot())
  return out
}

/** The caret one character into the text that reads `text`, with focus in the editor. */
async function caretIn(editor: LexicalEditor, text: string, offset = 1) {
  editor.getRootElement()!.focus()
  editor.update(() => {
    const node = $all().find(node => $isTextNode(node) && node.getTextContent() === text)!
    ;(node as ReturnType<typeof $createTextNode>).select(offset, offset)
  }, { discrete: true })
  await flushPromises()
}

const panel = () => document.querySelector<HTMLElement>('.hlx-link-panel')
const action = (label: string) => panel()!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
function links(editor: LexicalEditor) {
  return editor.getEditorState().read(() => $all().filter($isLinkNode).map(node => ({
    url: node.getURL(),
    text: node.getTextContent(),
    unlinked: $isAutoLinkNode(node) && node.getIsUnlinked(),
  })))
}
const plain = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent())

describe('showing the panel', () => {
  it('shows the link under the caret: its text, and its address without the scheme, cut short', async () => {
    const { editor } = await mountWithPanel()
    expect(panel()).toBeNull()
    await caretIn(editor, '範例')
    expect(panel()).not.toBeNull()
    expect(panel()!.querySelector('.hlx-link-panel-title')!.textContent!.trim()).toBe('範例')
    const shown = panel()!.querySelector('.hlx-link-panel-url')!
    expect(shown.textContent!.trim()).not.toContain('https://')
    expect(shown.textContent!.trim().startsWith('example.com/a/')).toBe(true)
    expect(shown.getAttribute('title')).toBe(LONG)
    // On the page's theme, like the other floating panels.
    expect(panel()!.classList.contains('hlx-root')).toBe(true)
    expect(panel()!.getAttribute('role')).toBe('dialog')
    expect([
      ...panel()!.querySelectorAll('button'),
    ].map(button => button.getAttribute('aria-label'))).toEqual(['開啟連結', '複製網址', '編輯連結', '移除連結'])
  })

  it('shows an autolink by its address, and nothing for one that was unlinked', async () => {
    const { editor } = await mountWithPanel()
    await caretIn(editor, 'https://auto.example/', 3)
    expect(panel()!.querySelector('.hlx-link-panel-title')!.textContent!.trim()).toBe('https://auto.example/')
    expect(panel()!.querySelector('.hlx-link-panel-url')!.textContent!.trim()).toBe('auto.example')
    await caretIn(editor, 'https://off.example', 3)
    expect(panel()).toBeNull()
  })

  it('goes away outside a link, for a selection, when focus leaves, and while read-only', async () => {
    const { wrapper, editor } = await mountWithPanel()
    await caretIn(editor, '範例')
    await caretIn(editor, ' 中 ')
    expect(panel()).toBeNull()

    await caretIn(editor, '範例')
    editor.update(() => {
      const node = $all().find(node => $isTextNode(node) && node.getTextContent() === '範例')!
      ;(node as ReturnType<typeof $createTextNode>).select(0, 2)
    }, { discrete: true })
    await flushPromises()
    expect(panel()).toBeNull()

    await caretIn(editor, '範例')
    const outside = document.body.appendChild(document.createElement('button'))
    outside.focus()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()
    expect(panel()).toBeNull()

    await caretIn(editor, '範例')
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(panel()).toBeNull()
  })

  it('stays while its own buttons are pressed', async () => {
    const { editor } = await mountWithPanel()
    await caretIn(editor, '範例')
    const pressed = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    action('複製網址').dispatchEvent(pressed)
    // Pressing a button doesn't take focus from the editor, so the caret stays in the link.
    expect(pressed.defaultPrevented).toBe(true)
  })
})

describe('its actions', () => {
  it('opens the link in a new tab, without a way back to this page', async () => {
    const { editor } = await mountWithPanel()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await caretIn(editor, '範例')
    action('開啟連結').click()
    expect(open).toHaveBeenCalledWith(LONG, '_blank', 'noopener,noreferrer')
  })

  it('copies the address, saying so for a moment', async () => {
    const { editor } = await mountWithPanel()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await caretIn(editor, '範例')
    vi.useFakeTimers()
    action('複製網址').click()
    await vi.advanceTimersByTimeAsync(0)
    expect(write).toHaveBeenCalledWith(LONG)
    expect(panel()!.querySelector('button[aria-label="已複製"]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(2000)
    expect(panel()!.querySelector('button[aria-label="複製網址"]')).not.toBeNull()
  })

  it('removes a link, keeping its text and format, in one undo step', async () => {
    const { editor } = await mountWithPanel()
    await caretIn(editor, '範例')
    action('移除連結').click()
    await flushPromises()
    expect(links(editor).map(link => link.url)).toEqual(['https://auto.example/', 'https://off.example'])
    expect(plain(editor)).toContain('前 範例 中')
    expect(editor.getEditorState().read(() => $all().some(node => $isTextNode(node) && node.getTextContent() === '範例' && node.hasFormat('bold')))).toBe(true)
    expect(panel()).toBeNull()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(links(editor)[0]).toEqual({ url: LONG, text: '範例', unlinked: false })
  })

  it('marks an autolink unlinked instead of removing it', async () => {
    const { editor } = await mountWithPanel()
    await caretIn(editor, 'https://auto.example/', 3)
    action('移除連結').click()
    await flushPromises()
    expect(links(editor).find(link => link.url === 'https://auto.example/')).toEqual({ url: 'https://auto.example/', text: 'https://auto.example/', unlinked: true })
  })
})

describe('a modifier click', () => {
  it('opens a link in a new tab, and shows a hand while the key is held', async () => {
    const { wrapper, editor } = await mountWithPanel()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const root = editor.getRootElement()!
    const anchor = root.querySelector('a')!
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).not.toHaveBeenCalled()

    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', bubbles: true }))
    expect(root.classList.contains('hlx-link-mod')).toBe(true)
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true })
    anchor.dispatchEvent(click)
    expect(open).toHaveBeenCalledWith(LONG, '_blank', 'noopener,noreferrer')
    expect(click.defaultPrevented).toBe(true)
    root.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true }))
    expect(root.classList.contains('hlx-link-mod')).toBe(false)

    // Ctrl too, and while read-only.
    await wrapper.setProps({ editable: false })
    await flushPromises()
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))
    expect(open).toHaveBeenCalledTimes(2)
  })
})

describe('editing', () => {
  const field = (label: string) => panel()!.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!
  async function type(input: HTMLInputElement, value: string) {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
  }
  async function press(input: HTMLInputElement, key: string) {
    input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await flushPromises()
  }
  async function startEditing(editor: LexicalEditor) {
    await caretIn(editor, '範例')
    action('編輯連結').click()
    await flushPromises()
  }

  it('changes the text and the address together, keeping the text\'s format, in one undo step', async () => {
    const { editor } = await mountWithPanel()
    await startEditing(editor)
    expect(field('連結文字').value).toBe('範例')
    expect(field('網址').value).toBe(LONG)
    expect(document.activeElement).toBe(field('網址'))
    await type(field('連結文字'), '新的名字')
    await type(field('網址'), 'example.org/new')
    await press(field('網址'), 'Enter')
    expect(links(editor)[0]).toEqual({ url: 'https://example.org/new', text: '新的名字', unlinked: false })
    expect(editor.getEditorState().read(() => $all().some(node => $isTextNode(node) && node.getTextContent() === '新的名字' && node.hasFormat('bold')))).toBe(true)
    // Back to the link, as it now is, with the caret in the editor.
    expect(document.activeElement).toBe(editor.getRootElement())
    expect(field('網址')).toBeNull()
    expect(panel()!.querySelector('.hlx-link-panel-title')!.textContent!.trim()).toBe('新的名字')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(links(editor)[0]).toEqual({ url: LONG, text: '範例', unlinked: false })
  })

  it('saves from its button, and leaves the text alone when it is cleared', async () => {
    const { editor } = await mountWithPanel()
    await startEditing(editor)
    await type(field('連結文字'), '  ')
    await type(field('網址'), 'https://example.net')
    panel()!.querySelector<HTMLButtonElement>('button[aria-label="儲存"]')!.click()
    await flushPromises()
    expect(links(editor)[0]).toEqual({ url: 'https://example.net', text: '範例', unlinked: false })
  })

  it('can\'t save without an address, and shows why for one that isn\'t allowed', async () => {
    const { editor } = await mountWithPanel()
    await startEditing(editor)
    const save = () => panel()!.querySelector<HTMLButtonElement>('button[aria-label="儲存"]')!
    await type(field('網址'), '   ')
    expect(save().disabled).toBe(true)
    await press(field('網址'), 'Enter')
    expect(links(editor)[0].url).toBe(LONG)
    await type(field('網址'), 'javascript:alert(1)')
    expect(save().disabled).toBe(false)
    await press(field('網址'), 'Enter')
    expect(links(editor)[0].url).toBe(LONG)
    expect(field('網址').getAttribute('aria-invalid')).toBe('true')
    expect(panel()!.querySelector('[role="alert"]')!.textContent!.trim()).not.toBe('')
    // Typing again clears it.
    await type(field('網址'), 'https://ok.example')
    expect(field('網址').getAttribute('aria-invalid')).toBe('false')
  })

  it('goes back to the link as it was on Esc or Cancel', async () => {
    const { editor } = await mountWithPanel()
    await startEditing(editor)
    await type(field('網址'), 'https://changed.example')
    await press(field('網址'), 'Escape')
    expect(field('網址')).toBeNull()
    expect(links(editor)[0].url).toBe(LONG)
    expect(panel()!.querySelector<HTMLButtonElement>('button[aria-label="編輯連結"]')).toBe(document.activeElement)

    action('編輯連結').click()
    await flushPromises()
    await type(field('網址'), 'https://changed.example')
    panel()!.querySelector<HTMLButtonElement>('button[aria-label="取消"]')!.click()
    await flushPromises()
    expect(links(editor)[0].url).toBe(LONG)
  })

  it('keeps what was typed when focus leaves it for elsewhere, if the address is allowed', async () => {
    const { editor } = await mountWithPanel()
    await startEditing(editor)
    await type(field('網址'), 'https://left.example')
    const outside = document.body.appendChild(document.createElement('button'))
    outside.focus()
    await flushPromises()
    await new Promise(resolve => setTimeout(resolve, 0))
    await flushPromises()
    expect(links(editor)[0].url).toBe('https://left.example')
    expect(panel()).toBeNull()
  })

  it('opens straight into editing for a link with no address yet', async () => {
    const { editor } = await mountWithPanel()
    editor.update(() => {
      $getRoot().append($createParagraphNode().append($createLinkNode('https://').append($createTextNode('空連結'))))
    }, { discrete: true })
    await caretIn(editor, '空連結')
    expect(field('網址')).not.toBeNull()
    expect(document.activeElement).toBe(field('網址'))
  })

  it('opens editing from ⌘K with the caret in a link, and leaves ⌘K alone elsewhere', async () => {
    const { editor } = await mountWithPanel()
    await caretIn(editor, ' 中 ')
    const elsewhere = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
    expect(editor.dispatchCommand(KEY_MODIFIER_COMMAND, elsewhere)).toBe(false)
    await caretIn(editor, '範例')
    const inLink = new KeyboardEvent('keydown', { key: 'k', metaKey: true, cancelable: true })
    expect(editor.dispatchCommand(KEY_MODIFIER_COMMAND, inLink)).toBe(true)
    await flushPromises()
    expect(inLink.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(field('網址'))
  })
})

describe('switching a link to a card', () => {
  const PR = 'https://github.com/KennKyou/hakulex/pull/1'
  async function mountLines() {
    const wrapper = mount(RichEditor, {
      attachTo: document.body,
      slots: {
        default: () => h(LinkEditPlugin, { validateUrl }),
      },
    })
    const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    editor.update(() => {
      $getRoot().clear().append(
        $createParagraphNode().append($createLinkNode(PR).append($createTextNode('獨佔'))),
        $createParagraphNode().append($createTextNode('旁邊 '), $createLinkNode('https://github.com/KennKyou/hakulex').append($createTextNode('有字'))),
        $createParagraphNode().append($createLinkNode('https://example.com/a').append($createTextNode('不認得'))),
      )
    }, { discrete: true })
    await flushPromises()
    return { wrapper, editor }
  }
  const kinds = () => panel()?.querySelector('[role="group"][aria-label="連結或卡片"]') ?? null
  const types = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children.map(node => node.type)

  it('offers it for a link alone on its line to an address a source knows, and makes the line a selected card', async () => {
    const { editor } = await mountLines()
    await caretIn(editor, '獨佔')
    const group = kinds()!
    expect([
      ...group.querySelectorAll('button'),
    ].map(button => [
      button.textContent!.trim(),
      button.getAttribute('aria-pressed'),
    ])).toEqual([
      ['連結', 'true'],
      ['卡片', 'false'],
    ])
    ;[
      ...group.querySelectorAll('button'),
    ][1]!.click()
    await flushPromises()
    expect(types(editor)).toEqual(['link-card', 'paragraph', 'paragraph'])
    expect(editor.getEditorState().toJSON().root.children[0]).toEqual({ type: 'link-card', version: 1, url: PR })
    expect(editor.getEditorState().read(() => {
      const selection = $getSelection()
      return $isNodeSelection(selection) && selection.getNodes()[0]?.getType()
    })).toBe('link-card')
    expect(panel()).toBeNull()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(links(editor)[0]).toMatchObject({ url: PR, text: '獨佔' })
  })

  it.each([
    ['a link with text beside it', '有字'],
    ['an address no source knows', '不認得'],
  ])('is not offered for %s', async (_name, text) => {
    const { editor } = await mountLines()
    await caretIn(editor, text)
    expect(panel()).not.toBeNull()
    expect(kinds()).toBeNull()
  })
})
