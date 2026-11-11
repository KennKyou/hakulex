import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, $getSelection, $isNodeSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_DELETE_COMMAND, KEY_ENTER_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { OPEN_BLOCK_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

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
function paragraph(...children: unknown[]) {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children,
  }
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
function content(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  }
}
const doc = (...children: unknown[]) => content(...children) as unknown as SerializedEditorState
const user = {
  id: 'u',
  kind: 'user',
  name: '小明',
  extra: 1,
}
const agent = { id: 'a', kind: 'agent' }
const m1 = {
  id: '1',
  participantId: 'u',
  content: '問',
  extra: 2,
}
const m2 = { id: '2', participantId: 'a', content: '答' }
function chat(extra: Record<string, unknown> = {}) {
  return {
    type: 'chat',
    version: 1,
    variant: 'user-agent',
    participants: [user, agent],
    messages: [m1, m2],
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
const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]
const types = (editor: LexicalEditor) => read(editor).map(node => node.type)
const dialog = () => document.querySelector<HTMLElement>('.hlx-block-dialog')
function button(name: string, within: Element = dialog()!) {
  return [
    ...within.querySelectorAll('button'),
  ].find(item => item.textContent!.trim() === name || item.getAttribute('aria-label') === name)!
}
function messages() {
  return [
    ...dialog()!.querySelectorAll<HTMLElement>('.hlx-chat-edit-message'),
  ]
}
function people() {
  return [
    ...dialog()!.querySelectorAll<HTMLElement>('.hlx-chat-edit-person'),
  ]
}

async function press(name: string, within?: Element) {
  button(name, within).click()
  await flushPromises()
}

async function fill(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

const area = (row: Element) => row.querySelector('textarea')!
const author = (row: Element) => row.querySelector('select')!
const field = (row: Element, name: string) => row.querySelector<HTMLInputElement>(`[data-field="${name}"]`)!
const variant = () => dialog()!.querySelector<HTMLSelectElement>('[data-field="variant"]')!

async function openFirst() {
  // A double click on the block opens its editing, as its toolbar's 編輯 does.
  document.querySelector<HTMLElement>('.hlx-block-editor')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await flushPromises()
  await flushPromises()
  expect(dialog()).not.toBeNull()
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

function selectedType(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection)
      ? selection.getNodes()[0]?.getType()
      : null
  })
}

describe('on the page', () => {
  it('a click picks it and shows its toolbar, and Enter opens the dialog', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    document.querySelector<HTMLElement>('.hlx-chat-row')!.click()
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).not.toBeNull()
    expect(selectedType(editor)).toBe('chat')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(dialog()).not.toBeNull()
    expect(messages().map(row => area(row).value)).toEqual(['問', '答'])
  })

  it('leaves links in messages to work', async () => {
    const { editor } = await mountEditor(doc(chat({
      messages: [
        { id: '1', participantId: 'u', content: '[連結](https://example.com)' },
      ],
    }), paragraph()))
    const link = document.querySelector<HTMLElement>('.hlx-chat-markdown a')!
    link.addEventListener('click', event => event.preventDefault())
    link.click()
    await flushPromises()
    expect(selectedType(editor)).toBeNull()
  })

  it('read-only: no way to edit', async () => {
    await mountEditor(doc(chat()), { editable: false })
    document.querySelector<HTMLElement>('.hlx-chat-row')!.click()
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).toBeNull()
    expect(document.querySelector('.hlx-chat-row')).not.toBeNull()
  })

  it('says so when there is nothing to show', async () => {
    await mountEditor(doc(chat({ messages: [] })))
    expect(document.querySelector('.hlx-block-empty')).not.toBeNull()
  })
})

describe('messages', () => {
  it('saves as one undo step, keeping fields, and picks the block', async () => {
    const stored = chat({ other: 3 })
    const { editor } = await mountEditor(doc(stored, paragraph()))
    await openFirst()
    await fill(area(messages()[0]), '新問題')
    await press('儲存')
    expect(dialog()).toBeNull()
    expect(read(editor)[0]).toEqual({
      ...stored,
      messages: [
        { ...m1, content: '新問題' },
        m2,
      ],
    })
    expect(selectedType(editor)).toBe('chat')
    await undo(editor)
    expect(read(editor)[0]).toEqual(stored)
  })

  it('adds with the same author as the last one', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    await press('新增訊息')
    expect(author(messages()[2]).value).toBe('a')
    await fill(area(messages()[2]), '再答')
    await press('儲存')
    const added = read(editor)[0].messages[2]
    expect(added).toMatchObject({ participantId: 'a', content: '再答' })
    expect(added.id).toMatch(/^m_[a-z0-9]{8}$/)
  })

  it('moves and removes, and changes who said it', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    expect(button('上移', messages()[0]).disabled).toBe(true)
    expect(button('下移', messages()[1]).disabled).toBe(true)
    await press('下移', messages()[0])
    expect(messages().map(row => area(row).value)).toEqual(['答', '問'])
    await choose(author(messages()[0]), 'u')
    await press('刪除訊息', messages()[1])
    await press('儲存')
    expect(read(editor)[0].messages).toEqual([
      { ...m2, participantId: 'u' },
    ])
  })

  it('keeps an author that isn\'t among the participants', async () => {
    const { editor } = await mountEditor(doc(chat({
      messages: [
        { id: '1', participantId: 'nobody', content: '誰' },
      ],
    }), paragraph()))
    await openFirst()
    expect(author(messages()[0]).value).toBe('nobody')
    await fill(area(messages()[0]), '誰呢')
    await press('儲存')
    expect(read(editor)[0].messages[0].participantId).toBe('nobody')
  })

  it('makes no change when nothing changed', async () => {
    const stored = chat()
    const { editor } = await mountEditor(doc(stored, paragraph()))
    await openFirst()
    await press('儲存')
    expect(read(editor)[0]).toEqual(stored)
  })

  it('drops items that aren\'t valid on saving a change', async () => {
    const { editor } = await mountEditor(doc(chat({
      participants: [1, user, agent],
      messages: [null, m1],
    }), paragraph()))
    await openFirst()
    await fill(area(messages()[0]), '新')
    await press('儲存')
    expect(read(editor)[0].participants).toEqual([user, agent])
    expect(read(editor)[0].messages).toEqual([
      { ...m1, content: '新' },
    ])
  })
})

describe('participants and the variant', () => {
  it('changes names and avatars, and clears them', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    await fill(field(people()[0], 'name'), ' ')
    await fill(field(people()[1], 'name'), 'Claude')
    await fill(field(people()[1], 'avatar'), 'https://example.com/a.png')
    await press('儲存')
    expect(read(editor)[0].participants).toEqual([
      { id: 'u', kind: 'user', extra: 1 },
      {
        id: 'a',
        kind: 'agent',
        name: 'Claude',
        avatar: 'https://example.com/a.png',
      },
    ])
  })

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg/>'])('won\'t save the avatar %s', async (url) => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    await fill(field(people()[0], 'avatar'), url)
    await press('儲存')
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull()
    expect(field(people()[0], 'avatar').getAttribute('aria-invalid')).toBe('true')
    expect(read(editor)[0].participants).toEqual([user, agent])
  })

  it('switching the variant changes the second participant and leaves messages', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    await choose(variant(), 'user-user')
    await press('儲存')
    expect(read(editor)[0].variant).toBe('user-user')
    expect(read(editor)[0].participants.map((item: Json) => item.kind)).toEqual(['user', 'user'])
    expect(read(editor)[0].messages).toEqual([m1, m2])
    await openFirst()
    await choose(variant(), 'user-agent')
    await press('儲存')
    expect(read(editor)[0].participants.map((item: Json) => item.kind)).toEqual(['user', 'agent'])
  })
})

describe('keys', () => {
  it('enter stays in the message, and Cmd+Enter saves', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    await fill(area(messages()[0]), '新')
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    area(messages()[0]).dispatchEvent(enter)
    await flushPromises()
    expect(enter.defaultPrevented).toBe(false)
    expect(dialog()).not.toBeNull()
    area(messages()[0]).dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }))
    await flushPromises()
    expect(dialog()).not.toBeNull()
    area(messages()[0]).dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(read(editor)[0].messages[0].content).toBe('新')
  })

  it('esc asks first with changes, and leaves the Esc of a word alone', async () => {
    const { editor } = await mountEditor(doc(chat(), paragraph()))
    await openFirst()
    await fill(area(messages()[0]), '新')
    area(messages()[0]).focus()
    area(messages()[0]).dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Escape',
      isComposing: true,
      bubbles: true,
      cancelable: true,
    }))
    await flushPromises()
    expect(dialog()!.querySelector('.hlx-block-dialog-confirm')).toBeNull()
    area(messages()[0]).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(dialog()!.querySelector('.hlx-block-dialog-confirm')).not.toBeNull()
    await press('繼續編輯')
    expect(area(messages()[0]).value).toBe('新')
    await press('取消')
    await press('放棄')
    expect(dialog()).toBeNull()
    expect(read(editor)[0].messages[0].content).toBe('問')
  })
})

describe('inserting', () => {
  const open = (editor: LexicalEditor) => {
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'chat' })
    return flushPromises()
  }

  it('starts with two people and inserts on saving, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await open(editor)
    expect(people()).toHaveLength(2)
    expect(types(editor)).toEqual(['paragraph'])
    await press('新增訊息')
    await fill(area(messages()[0]), '嗨')
    await press('儲存')
    expect(types(editor)).toEqual(['paragraph', 'chat', 'paragraph'])
    const [, block] = read(editor)
    expect(block.variant).toBe('user-agent')
    expect(block.participants.map((item: Json) => item.kind)).toEqual(['user', 'agent'])
    expect(block.participants[0].id).toMatch(/^p_[a-z0-9]{6}$/)
    expect(block.messages[0].participantId).toBe(block.participants[0].id)
    await undo(editor)
    expect(types(editor)).toEqual(['paragraph'])
  })

  it('leaves the document alone on cancel, with the caret back', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    const before = read(editor)
    await open(editor)
    await press('取消')
    expect(read(editor)).toEqual(before)
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('字')
    })
  })
})

describe('as a block', () => {
  it('arrow keys reach it, Delete removes it, undo brings it back', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前')), chat()))
    editor.update(() => $getRoot().getFirstChildOrThrow<any>().selectEnd(), { discrete: true })
    await flushPromises()
    editor.update(() => editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown')), { discrete: true })
    await flushPromises()
    expect(selectedType(editor)).toBe('chat')
    editor.update(() => editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown')), { discrete: true })
    await flushPromises()
    expect(types(editor)).not.toContain('chat')
    await undo(editor)
    expect(types(editor)).toContain('chat')
  })

  it('works inside a step', async () => {
    const { editor } = await mountEditor(doc({
      type: 'steps',
      version: 1,
      steps: [
        {
          id: 'a',
          title: '甲',
          content: content(chat(), paragraph()),
        },
      ],
    }))
    await openFirst()
    await fill(area(messages()[0]), '新')
    await press('儲存')
    expect(read(editor)[0].steps[0].content.root.children[0].messages[0].content).toBe('新')
    await undo(editor)
    expect(read(editor)[0].steps[0].content.root.children[0].messages[0].content).toBe('問')
  })
})
