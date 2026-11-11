import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
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
import { afterEach, describe, expect, it } from 'vitest'
import { $isPollNode, builtinTransformers, OPEN_BLOCK_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

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
function poll(extra: Record<string, unknown> = {}) {
  return {
    type: 'poll',
    version: 1,
    pollId: 'p_stored',
    question: 'Which one?',
    options: [
      { id: 'o_a', label: 'Apple' },
      { id: 'o_b', label: 'Banana' },
    ],
    mode: 'single',
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
const polls = (editor: LexicalEditor) => output(editor).root.children.filter(node => node.type === 'poll')
const dialog = () => document.querySelector<HTMLElement>('.hlx-block-dialog')
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="投票"]')
const field = (name: string) => panel()!.querySelector<HTMLInputElement & HTMLSelectElement>(`[data-field="${name}"]`)!
function optionInputs() {
  return [
    ...panel()!.querySelectorAll<HTMLInputElement>('[data-field="option"]'),
  ]
}
async function set(input: HTMLInputElement | HTMLSelectElement, value: string) {
  input.focus()
  input.value = value
  // A choice is a change; a date sends input and change, as browsers do; text sends input.
  if (input.tagName !== 'SELECT')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  if (input.tagName === 'SELECT' || input.type === 'datetime-local')
    input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}
async function leave(input: HTMLElement) {
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await flushPromises()
}
const alertText = () => panel()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null
const statusText = () => panel()?.querySelector('[role="status"]')?.textContent?.trim() ?? ''
async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}
async function press(name: string, within: Element = panel()!) {
  const button = [
    ...within.querySelectorAll('button'),
  ].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)!
  button.click()
  await flushPromises()
}
function selectPoll(editor: LexicalEditor, index = 0) {
  editor.update(() => {
    const node = $getRoot().getChildren().filter($isPollNode)[index]
    const selection = $createNodeSelection()
    selection.add(node.getKey())
    $setSelection(selection)
  }, { discrete: true })
}
async function openNew(editor: LexicalEditor) {
  editor.update(() => $getRoot().selectEnd(), { discrete: true })
  editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'poll' })
  await flushPromises()
}
async function openFirst(editor: LexicalEditor) {
  selectPoll(editor)
  editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
  await flushPromises()
}

describe('stored polls', () => {
  it.each([
    [
      'all the fields',
      {
        closeAt: '2026-12-31T00:00:00.000Z',
        showResults: 'after-vote',
        $: { blockId: 'abc' },
        extra: { x: 1 },
      },
    ],
    [
      'invalid options and mode',
      { options: 'nope', mode: 'ranked' },
    ],
    [
      'no pollId',
      { pollId: undefined },
    ],
  ])('outputs one with %s as it was', async (_name, extra) => {
    const value = documentWith(poll(extra))
    const { editor } = await mountEditor(value)
    expect(JSON.parse(JSON.stringify(output(editor)))).toEqual(JSON.parse(JSON.stringify(value)))
  })

  it('leaves two polls with the same id as they are', async () => {
    const value = documentWith(poll(), poll())
    const { editor } = await mountEditor(value)
    expect(output(editor)).toEqual(value)
  })

  it('shows the question and options, with nothing to vote with', async () => {
    const { wrapper } = await mountEditor(documentWith(poll()))
    expect(wrapper.text()).toContain('Which one?')
    expect(wrapper.text()).toContain('Banana')
    expect(wrapper.find('.hlx-poll input').exists()).toBe(false)
    await wrapper.find('.hlx-poll').trigger('click')
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).not.toBeNull()
  })

  it('has no toolbar when read-only', async () => {
    const { wrapper } = await mountEditor(documentWith(poll()), { editable: false })
    expect(wrapper.text()).toContain('Which one?')
    await wrapper.find('.hlx-poll').trigger('click')
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).toBeNull()
  })
})

describe('the poll panel', () => {
  it('inserts an example poll with fresh ids and opens its panel, the question ready to replace', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), paragraph()))
    await openNew(editor)
    expect(dialog()).toBeNull()
    expect(panel()).not.toBeNull()
    const [node] = polls(editor)
    expect(node).toMatchObject({
      question: '你比較喜歡哪一個？',
      mode: 'single',
      options: [
        { label: '選項 1' },
        { label: '選項 2' },
      ],
    })
    expect(node.pollId).toMatch(/^p_[\w-]{8,}$/)
    expect(node.options[0].id).toMatch(/^o_[\w-]+$/)
    expect(node.options[0].id).not.toBe(node.options[1].id)
    expect(node).not.toHaveProperty('showResults')
    expect(node).not.toHaveProperty('closeAt')
    const question = field('question')
    expect(document.activeElement).toBe(question)
    expect([question.selectionStart, question.selectionEnd]).toEqual([0, question.value.length])
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    await undo(editor)
    expect(polls(editor)).toHaveLength(0)
  })

  it('gives each new poll its own id', async () => {
    const { editor } = await mountEditor(documentWith(paragraph()))
    for (let i = 0; i < 2; i++) {
      await openNew(editor)
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      await flushPromises()
    }
    const [first, second] = polls(editor)
    expect(first.pollId).not.toBe(second.pollId)
  })

  it.each([
    [
      'no question',
      async () => set(field('question'), '  '),
      '請輸入題目',
    ],
    [
      'fewer than two options',
      async () => set(optionInputs()[1], ''),
      '至少要有兩個選項',
    ],
  ])('refuses %s, keeping the last poll that was whole', async (_name, change, message) => {
    const { editor } = await mountEditor(documentWith(poll(), paragraph()))
    await openFirst(editor)
    await change()
    expect(alertText()).toBe(message)
    expect(polls(editor)[0]).toMatchObject({
      question: 'Which one?',
      options: [
        { label: 'Apple' },
        { label: 'Banana' },
      ],
    })
  })

  it('edits a poll as it changes, keeping its ids and fields it does not manage, a step for each change', async () => {
    const { editor } = await mountEditor(documentWith(poll({
      $: { blockId: 'abc' },
      extra: 1,
    }), paragraph()))
    await openFirst(editor)
    expect(dialog()).toBeNull()
    expect(field('question').value).toBe('Which one?')
    await set(field('question'), 'Which f')
    await set(field('question'), 'Which fruit?')
    expect(polls(editor)[0].question).toBe('Which fruit?')
    await leave(field('question'))
    await set(optionInputs()[1], 'Blueberry')
    await leave(optionInputs()[1])
    await press('新增選項')
    await set(optionInputs()[2], 'Cherry')
    await leave(optionInputs()[2])
    await press('上移', panel()!.querySelectorAll('.hlx-poll-option-row')[2])
    await set(field('mode'), 'multiple')
    await set(field('closeAt'), '2026-12-31T23:30')
    await set(field('showResults'), 'after-close')
    const [node] = polls(editor)
    expect(node).toMatchObject({
      pollId: 'p_stored',
      question: 'Which fruit?',
      mode: 'multiple',
      showResults: 'after-close',
      $: { blockId: 'abc' },
      extra: 1,
    })
    expect(node.options.map((option: Json) => option.label)).toEqual(['Apple', 'Cherry', 'Blueberry'])
    expect(node.options[0].id).toBe('o_a')
    expect(node.options[2].id).toBe('o_b')
    expect(node.options[1].id).toMatch(/^o_/)
    expect(new Date(node.closeAt).getTime()).toBe(new Date('2026-12-31T23:30').getTime())
    await undo(editor)
    expect(polls(editor)[0]).not.toHaveProperty('showResults')
    expect(polls(editor)[0].mode).toBe('multiple')
  })

  it('puts the poll back as it was on Esc', async () => {
    const { editor } = await mountEditor(documentWith(poll(), paragraph()))
    const before = output(editor)
    await openFirst(editor)
    await set(field('question'), 'Changed')
    await leave(field('question'))
    await set(field('mode'), 'multiple')
    await new Promise(resolve => setTimeout(resolve, 5))
    field('mode').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    expect(output(editor)).toEqual(before)
    expect(document.activeElement).toBe(editor.getRootElement())
  })

  it.each([
    [
      'removing an option',
      async () => press('刪除選項', panel()!.querySelectorAll('.hlx-poll-option-row')[0]),
      ['B', 'C'],
    ],
    [
      'switching the mode',
      async () => set(field('mode'), 'multiple'),
      ['A', 'B', 'C'],
    ],
  ])('warns when %s, and still writes it', async (_name, change, labels) => {
    const { editor } = await mountEditor(documentWith(poll({
      options: [
        { id: 'o_a', label: 'A' },
        { id: 'o_b', label: 'B' },
        { id: 'o_c', label: 'C' },
      ],
    })))
    await openFirst(editor)
    expect(statusText()).not.toContain('票數')
    await change()
    expect(statusText()).toContain('票數')
    expect(polls(editor)[0].options.map((option: Json) => option.label)).toEqual(labels)
  })

  it('does not warn about a new poll', async () => {
    const { editor } = await mountEditor(documentWith(paragraph()))
    await openNew(editor)
    await set(field('mode'), 'multiple')
    expect(statusText()).not.toContain('票數')
  })
})

describe('polls as blocks', () => {
  it('can be selected by keyboard, deleted and restored', async () => {
    const { editor } = await mountEditor(documentWith(paragraph(text('前')), poll(), paragraph(text('後'))))
    editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(editor.read(() => $isNodeSelection($getSelection()))).toBe(true)
    editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown', { key: 'Delete' }))
    await flushPromises()
    expect(polls(editor)).toHaveLength(0)
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(polls(editor)).toHaveLength(1)
  })

  it('can be inserted in nested content', async () => {
    const value = documentWith({
      type: 'nested-doc',
      version: 1,
      content: documentWith(paragraph()),
    })
    const { editor } = await mountEditor(value)
    const inner = (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
    inner.update(() => $getRoot().selectEnd(), { discrete: true })
    inner.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'poll' })
    await flushPromises()
    await set(field('question'), 'Nested?')
    await flushPromises()
    expect(JSON.stringify(output(editor))).toContain('Nested?')
  })
})

describe('poll ids when copying', () => {
  /** What copying the selected poll puts on the clipboard; cutting also removes it. */
  function clipboardOf(editor: LexicalEditor, cut = false) {
    const clipboard = new DataTransfer()
    editor.update(() => {
      const node = $getRoot().getChildren().find($isPollNode)!
      clipboard.setData('application/x-lexical-editor', JSON.stringify({
        namespace: 'hakulex',
        nodes: [
          node.exportJSON(),
        ],
      }))
      if (cut)
        node.remove()
    }, { discrete: true })
    return clipboard
  }
  async function paste(editor: LexicalEditor, clipboard: DataTransfer) {
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
  }

  it('gives a copy pasted into the same document a new pollId, and keeps option ids', async () => {
    const { editor } = await mountEditor(documentWith(poll(), paragraph()))
    selectPoll(editor)
    const clipboard = clipboardOf(editor)
    await paste(editor, clipboard)
    const [first, second] = polls(editor)
    expect(first.pollId).toBe('p_stored')
    expect(second.pollId).toMatch(/^p_/)
    expect(second.pollId).not.toBe('p_stored')
    expect(second.options).toEqual(first.options)
  })

  it('keeps the pollId when cut and pasted', async () => {
    const { editor } = await mountEditor(documentWith(poll(), paragraph(text('後'))))
    selectPoll(editor)
    const clipboard = clipboardOf(editor, true)
    await flushPromises()
    expect(polls(editor)).toHaveLength(0)
    await paste(editor, clipboard)
    expect(polls(editor).map(node => node.pollId)).toEqual(['p_stored'])
  })

  it('keeps the pollId when pasted into another editor', async () => {
    const source = await mountEditor(documentWith(poll(), paragraph()))
    selectPoll(source.editor)
    const clipboard = clipboardOf(source.editor)
    const target = await mountEditor(documentWith(paragraph()))
    await paste(target.editor, clipboard)
    expect(polls(target.editor).map(node => node.pollId)).toEqual(['p_stored'])
  })
})

describe('exporting a poll', () => {
  it('goes to markdown as the question and a list', async () => {
    const { editor } = await mountEditor(documentWith(poll()))
    expect(editor.read(() => $convertToMarkdownString(builtinTransformers))).toBe('Which one?\n\n- Apple\n- Banana')
  })

  it('goes to HTML as the question and a list, without results', async () => {
    const { editor } = await mountEditor(documentWith(poll({ question: '<b>q</b>' })))
    const html = editor.read(() => $generateHtmlFromNodes(editor))
    expect(html).toContain('&lt;b&gt;q&lt;/b&gt;')
    expect(html).toMatch(/<ul[^>]*><li[^>]*>Apple<\/li><li[^>]*>Banana<\/li><\/ul>/)
  })
})
