import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { EditorView } from '@codemirror/view'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, $getSelection, $isNodeSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_DELETE_COMMAND, KEY_ENTER_COMMAND, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { builtinTransformers, OPEN_BLOCK_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'

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
const snippet = (...files: unknown[]) => ({ type: 'code-snippet', version: 1, files })
const file = (filename: string, code: string, extra: Record<string, unknown> = {}) => ({ filename, code, ...extra })

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
function button(name: string) {
  return [
    ...dialog()!.querySelectorAll('button'),
  ].find(item => item.textContent!.trim() === name || item.getAttribute('aria-label') === name)!
}
/** The files, as the list on the left of the dialog shows them. */
function items() {
  return [
    ...dialog()!.querySelectorAll<HTMLElement>('.hlx-snippet-file-list [role="option"]'),
  ]
}
const names = () => items().map(item => item.querySelector('.hlx-snippet-file-name')?.textContent?.trim() ?? item.querySelector('input')?.value)
const renameInput = () => dialog()!.querySelector<HTMLInputElement>('.hlx-snippet-rename')
function key(target: Element, name: string, extra: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key: name,
    bubbles: true,
    cancelable: true,
    ...extra,
  }))
  return flushPromises()
}
const view = () => EditorView.findFromDOM(dialog()!.querySelector('.cm-editor') as HTMLElement)!
const code = () => view().state.doc.toString()

async function press(name: string) {
  button(name).click()
  await flushPromises()
}

async function type(value: string) {
  view().dispatch({
    changes: { from: view().state.doc.length, insert: value },
  })
  await flushPromises()
}

/** Renames the file shown, as by a double click on it in the list, typing, and Enter. */
async function rename(value: string) {
  const item = items().find(option => option.getAttribute('aria-selected') === 'true')!
  item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
  await flushPromises()
  const input = renameInput()!
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await key(input, 'Enter')
}

async function escape() {
  document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
}

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
  it('a click picks the block, and shows its toolbar', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', 'x')), paragraph()))
    document.querySelector<HTMLElement>('.hlx-code-body')!.click()
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).not.toBeNull()
    expect(selectedType(editor)).toBe('code-snippet')
    expect(document.querySelector('.hlx-block-editor')!.hasAttribute('data-selected')).toBe(true)
    expect(dialog()).toBeNull()
  })

  it('opens with Enter once picked', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', 'x')), paragraph()))
    document.querySelector<HTMLElement>('.hlx-code-body')!.click()
    await flushPromises()
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(dialog()).not.toBeNull()
    expect(code()).toBe('x')
  })

  it('switching tabs doesn\'t pick the block', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', 'x'), file('b.ts', 'y')), paragraph()))
    document.querySelectorAll<HTMLElement>('[role="tab"]')[1].click()
    await flushPromises()
    expect(selectedType(editor)).toBeNull()
    expect(document.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1].hidden).toBe(false)
  })

  it('read-only: no way to edit, but tabs and copying work', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', 'x'), file('b.ts', 'y'))), { editable: false })
    document.querySelector<HTMLElement>('.hlx-code-body')!.click()
    await flushPromises()
    expect(document.querySelector('.hlx-block-toolbar')).toBeNull()
    expect(document.querySelector('.hlx-code-copy')).not.toBeNull()
    document.querySelectorAll<HTMLElement>('[role="tab"]')[1].click()
    await flushPromises()
    expect(document.querySelectorAll<HTMLElement>('[role="tabpanel"]')[1].hidden).toBe(false)
    expect(editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'code-snippet' })).toBe(false)
  })

  it('says so when there is nothing to show', async () => {
    await mountEditor(doc(snippet()))
    expect(document.querySelector('.hlx-block-empty')).not.toBeNull()
  })
})

describe('saving', () => {
  it('writes code and language as one undo step, and picks the block', async () => {
    const stored = file('a.ts', 'x', {
      highlightLines: [1],
      extra: { keep: true },
    })
    const { editor } = await mountEditor(doc(snippet(stored), paragraph()))
    await openFirst()
    await type('y')
    await press('儲存')
    expect(dialog()).toBeNull()
    expect(read(editor)[0].files).toEqual([
      { ...stored, code: 'xy' },
    ])
    expect(selectedType(editor)).toBe('code-snippet')
    await undo(editor)
    expect(read(editor)[0].files).toEqual([stored])
  })

  it('keeps fields of the block', async () => {
    const { editor } = await mountEditor(doc({
      ...snippet(file('a', 'x')),
      theme: 'dark',
    }, paragraph()))
    await openFirst()
    await type('y')
    await press('儲存')
    expect(read(editor)[0].theme).toBe('dark')
  })

  it('saves with Cmd+Enter', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', 'x')), paragraph()))
    await openFirst()
    await type('y')
    dialog()!.querySelector('.cm-content')!.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    }))
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(read(editor)[0].files[0].code).toBe('xy')
  })

  it('makes no undo step when nothing changed', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前')), snippet(file('a', 'x'))))
    const before = read(editor)
    await openFirst()
    await press('儲存')
    expect(read(editor)).toEqual(before)
    await undo(editor)
    expect(read(editor)).toEqual(before)
  })

  it('updates the v-model', async () => {
    const { wrapper } = await mountEditor(doc(snippet(file('a', 'x')), paragraph()))
    await openFirst()
    await type('y')
    await press('儲存')
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as any
    expect(last.root.children[0].files[0].code).toBe('xy')
  })
})

describe('files', () => {
  it('adds from the list\'s +, with a name nobody has, and switches to it', async () => {
    const { editor } = await mountEditor(doc(snippet(file('untitled.ts', 'x')), paragraph()))
    await openFirst()
    await press('新增檔案')
    expect(names()).toEqual(['untitled.ts', 'untitled-2.ts'])
    expect(items()[1].getAttribute('aria-selected')).toBe('true')
    expect(code()).toBe('')
    await type('新')
    await press('儲存')
    expect(read(editor)[0].files[1]).toEqual(file('untitled-2.ts', '新'))
  })

  it('keeps what was typed when switching files, by click or arrow key', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', '甲'), file('b', '乙')), paragraph()))
    await openFirst()
    await type('一')
    items()[1].click()
    await flushPromises()
    expect(code()).toBe('乙')
    await key(items()[1], 'ArrowUp')
    expect(code()).toBe('甲一')
    expect(document.activeElement).toBe(items()[0])
    await press('儲存')
    expect(read(editor)[0].files.map((item: Json) => item.code)).toEqual(['甲一', '乙'])
  })

  it('renames on a double click or F2, with the language following the new name', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', 'x', { language: 'ts', extra: 1 })), paragraph()))
    await openFirst()
    await key(items()[0], 'F2')
    expect(document.activeElement).toBe(renameInput())
    await key(renameInput()!, 'Escape')
    expect(renameInput()).toBeNull()
    expect(dialog()).not.toBeNull()
    await rename('a.py')
    expect(names()).toEqual(['a.py'])
    expect(dialog()!.querySelector('.hlx-snippet-current-name')!.textContent).toBe('a.py')
    await press('儲存')
    expect(read(editor)[0].files).toEqual([
      file('a.py', 'x', { extra: 1 }),
    ])
  })

  it.each([
    ['blank', '  '],
    ['taken', 'b.ts'],
  ])('won\'t take a name that is %s', async (_name, value) => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', 'x'), file('b.ts', 'y')), paragraph()))
    await openFirst()
    await rename(value)
    expect(dialog()!.querySelector('[role="alert"]')).not.toBeNull()
    expect(renameInput()).not.toBeNull()
    await key(renameInput()!, 'Escape')
    expect(names()).toEqual(['a.ts', 'b.ts'])
    await press('儲存')
    expect(read(editor)[0].files[0].filename).toBe('a.ts')
  })

  it('moves with Alt and the arrow keys, removes, and can\'t remove the last one', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', '甲'), file('b', '乙')), paragraph()))
    await openFirst()
    await key(items()[0], 'ArrowDown', { altKey: true })
    expect(names()).toEqual(['b', 'a'])
    expect(items()[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(items()[1])
    expect(code()).toBe('甲')
    await press('刪除 a')
    expect(names()).toEqual(['b'])
    expect(code()).toBe('乙')
    expect(button('刪除 b').disabled).toBe(true)
    await key(items()[0], 'Delete')
    expect(names()).toEqual(['b'])
    await press('儲存')
    expect(read(editor)[0].files).toEqual([
      file('b', '乙'),
    ])
  })

  it('removes the picked file with Delete', async () => {
    await mountEditor(doc(snippet(file('a', '甲'), file('b', '乙')), paragraph()))
    await openFirst()
    await key(items()[0], 'Delete')
    expect(names()).toEqual(['b'])
  })

  it('drops what isn\'t a file on saving', async () => {
    const { editor } = await mountEditor(doc(snippet(1, file('a', 'x'), { filename: 2 }), paragraph()))
    await openFirst()
    await type('y')
    await press('儲存')
    expect(read(editor)[0].files).toEqual([
      file('a', 'xy'),
    ])
  })

  it('keeps Tab from the focus trap', async () => {
    await mountEditor(doc(snippet(file('a', 'x')), paragraph()))
    await openFirst()
    const seen: string[] = []
    const listener = (event: KeyboardEvent) => seen.push(event.key)
    document.body.addEventListener('keydown', listener)
    view().contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    document.body.removeEventListener('keydown', listener)
    expect(seen).toEqual([])
  })
})

describe('cancelling', () => {
  it('closes straight away with nothing changed', async () => {
    await mountEditor(doc(snippet(file('a', 'x')), paragraph()))
    await openFirst()
    await press('取消')
    expect(dialog()).toBeNull()
  })

  it.each([
    ['取消'],
    ['Esc'],
  ])('asks first with changes, by %s, and can go back to them', async (how) => {
    const { editor } = await mountEditor(doc(snippet(file('a', 'x')), paragraph()))
    await openFirst()
    await type('y')
    const leave = () => (how === 'Esc'
      ? escape()
      : press('取消'))
    await leave()
    expect(dialog()).not.toBeNull()
    expect(dialog()!.querySelector('.hlx-block-dialog-confirm')).not.toBeNull()
    await press('繼續編輯')
    expect(dialog()!.querySelector('.hlx-block-dialog-confirm')).toBeNull()
    expect(code()).toBe('xy')
    await leave()
    await press('放棄')
    expect(dialog()).toBeNull()
    expect(read(editor)[0].files[0].code).toBe('x')
  })
})

describe('inserting', () => {
  const open = (editor: LexicalEditor) => {
    editor.dispatchCommand(OPEN_BLOCK_DIALOG_COMMAND, { type: 'code-snippet' })
    return flushPromises()
  }

  it('starts with one empty file and inserts on saving, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await open(editor)
    expect(types(editor)).toEqual(['paragraph'])
    expect(code()).toBe('')
    await type('x')
    await press('儲存')
    expect(types(editor)).toEqual(['paragraph', 'code-snippet', 'paragraph'])
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
    const { editor } = await mountEditor(doc(paragraph(text('前')), snippet(file('a', 'x'))))
    editor.update(() => $getRoot().getFirstChildOrThrow<any>().selectEnd(), { discrete: true })
    await flushPromises()
    editor.update(() => editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown')), { discrete: true })
    await flushPromises()
    expect(selectedType(editor)).toBe('code-snippet')
    editor.update(() => editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown')), { discrete: true })
    await flushPromises()
    expect(types(editor)).not.toContain('code-snippet')
    await undo(editor)
    expect(types(editor)).toContain('code-snippet')
  })

  it('a pasted copy has the same data', async () => {
    const stored = snippet(file('a', 'x', { extra: 1 }))
    const { editor } = await mountEditor(doc(stored, paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-lexical-editor', JSON.stringify({
      namespace: 'hakulex',
      nodes: [stored],
    }))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    expect(read(editor).filter(node => node.type === 'code-snippet')).toEqual([stored, stored])
  })

  it('works inside a step, as a change in that step', async () => {
    const value = doc({
      type: 'steps',
      version: 1,
      steps: [
        {
          id: 'a',
          title: '甲',
          content: content(snippet(file('a', 'x')), paragraph()),
        },
      ],
    })
    const { editor } = await mountEditor(value)
    await openFirst()
    await type('y')
    await press('儲存')
    expect(read(editor)[0].steps[0].content.root.children[0].files[0].code).toBe('xy')
    await undo(editor)
    expect(read(editor)[0].steps[0].content.root.children[0].files[0].code).toBe('x')
  })
})

describe('markdown', () => {
  it('comes back as text when pasted, with nothing lost', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a.ts', '甲'), file('b.ts', '乙')), paragraph()))
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    const { editor: other } = await mountEditor(doc(paragraph()))
    other.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', markdown)
    other.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    const json = JSON.stringify(read(other))
    for (const part of ['a.ts', '甲', 'b.ts', '乙'])
      expect(json).toContain(part)
    expect(types(other)).not.toContain('code-snippet')
  })
})

describe('laid out', () => {
  it('lists the files on the left, and shows the current one with its name, language and line numbers', async () => {
    await mountEditor(doc(snippet(file('a.ts', 'x\ny'), file('style.css', 'a {}')), paragraph()))
    await openFirst()
    const list = dialog()!.querySelector('.hlx-snippet-files')!
    expect(list.querySelector('[role="listbox"]')!.getAttribute('aria-label')).toBe('檔案')
    expect(items().map(item => item.querySelector('svg.hlx-code-file-icon')?.getAttribute('data-icon'))).toEqual(['typescript', 'css'])
    expect(button('新增檔案').closest('.hlx-snippet-files')).toBe(list)
    const head = dialog()!.querySelector('.hlx-snippet-current-head')!
    expect(head.querySelector('.hlx-snippet-current-name')!.textContent).toBe('a.ts')
    expect(head.querySelector('svg.hlx-code-file-icon')).not.toBeNull()
    expect(head.querySelector('[aria-label="程式語言"]')).not.toBeNull()
    expect(dialog()!.querySelectorAll('.cm-lineNumbers .cm-gutterElement').length).toBeGreaterThan(0)
    expect(dialog()!.querySelector('[role="tab"]')).toBeNull()
  })

  it('saves with Cmd+S', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', 'x')), paragraph()))
    await openFirst()
    await type('y')
    await key(view().contentDOM, 's', { metaKey: true })
    expect(dialog()).toBeNull()
    expect(read(editor)[0].files[0].code).toBe('xy')
  })

  it('has no edit button on the code or in the header: editing starts from the toolbar', async () => {
    await mountEditor(doc(snippet(file('a.ts', 'x'), file('b.ts', 'y')), paragraph()))
    expect(document.querySelector('.hlx-block-editor .hlx-block-edit')).toBeNull()
    expect(document.querySelector('.hlx-code-header button.hlx-block-edit')).toBeNull()
  })
})

describe('icons and marked lines', () => {
  const marked = () => [
    ...dialog()!.querySelectorAll('.cm-line'),
  ].flatMap((line, index) => line.classList.contains('hlx-snippet-mark')
    ? [index + 1]
    : [])
  const gutter = (n: number) => [
    ...dialog()!.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement'),
  ].find(element => element.textContent === String(n))!
  function cursorTo(line: number) {
    view().dispatch({
      selection: { anchor: view().state.doc.line(line).from },
    })
  }
  const toggleKey = () => key(view().contentDOM, 'h', { altKey: true, code: 'KeyH' })

  it('shows each file\'s language icon in the list and the head', async () => {
    await mountEditor(doc(snippet(file('x.txt', 'a', { language: 'vue' }), file('App.tsx', 'b')), paragraph()))
    await openFirst()
    expect(items().map(item => item.querySelector('svg.hlx-code-file-icon')?.getAttribute('data-icon'))).toEqual(['vue', 'react-ts'])
    expect(dialog()!.querySelector('.hlx-snippet-current-head svg.hlx-code-file-icon')!.getAttribute('data-icon')).toBe('vue')
  })

  it('shows the stored marks, and toggles one from its line number', async () => {
    await mountEditor(doc(snippet(file('a', '1\n2\n3', {
      highlightLines: [3],
    })), paragraph()))
    await openFirst()
    expect(marked()).toEqual([3])
    gutter(1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(marked()).toEqual([1, 3])
  })

  it('toggles the line under the cursor with Alt+H, and undoes it', async () => {
    await mountEditor(doc(snippet(file('a', '1\n2\n3')), paragraph()))
    await openFirst()
    cursorTo(2)
    await toggleKey()
    expect(marked()).toEqual([2])
    await toggleKey()
    expect(marked()).toEqual([])
    await toggleKey()
    expect(marked()).toEqual([2])
    const { undo: undoCommand } = await import('@codemirror/commands')
    undoCommand(view())
    await flushPromises()
    expect(marked()).toEqual([])
  })

  it('moves marks with the lines they are on, and saves them sorted', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', '1\n2\n3', {
      highlightLines: [3, 1],
    })), paragraph()))
    await openFirst()
    view().dispatch({
      changes: { from: 0, insert: '0\n' },
    })
    await flushPromises()
    expect(marked()).toEqual([2, 4])
    await press('儲存')
    expect(read(editor)[0].files[0].highlightLines).toEqual([2, 4])
  })

  it('drops a mark with its line, not onto the next one, and keeps it when the line is only edited', async () => {
    await mountEditor(doc(snippet(file('a', 'one\ntwo\nthree', {
      highlightLines: [2],
    })), paragraph()))
    await openFirst()
    // Edit the marked line: the mark stays.
    view().dispatch({
      changes: { from: view().state.doc.line(2).from, to: view().state.doc.line(2).from + 1, insert: 'T' },
    })
    await flushPromises()
    expect(marked()).toEqual([2])
    // Delete it whole, with its line break: the mark goes, and three is not marked.
    const line = view().state.doc.line(2)
    view().dispatch({
      changes: { from: line.from, to: line.to + 1 },
    })
    await flushPromises()
    expect(view().state.doc.toString()).toBe('one\nthree')
    expect(marked()).toEqual([])
  })

  it('removes the field once nothing is marked', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', '1\n2', {
      highlightLines: [1],
    })), paragraph()))
    await openFirst()
    cursorTo(1)
    await toggleKey()
    await press('儲存')
    expect(read(editor)[0].files[0]).not.toHaveProperty('highlightLines')
  })

  it('leaves the stored marks alone, out of range ones too, when they weren\'t touched', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', '1\n2\n3', {
      highlightLines: [3, 99],
    })), paragraph()))
    await openFirst()
    await type('x')
    await press('儲存')
    expect(read(editor)[0].files[0].highlightLines).toEqual([3, 99])
  })

  it('keeps each file\'s marks when switching files', async () => {
    const { editor } = await mountEditor(doc(snippet(file('a', '1\n2'), file('b', '1\n2')), paragraph()))
    await openFirst()
    cursorTo(2)
    await toggleKey()
    items()[1].click()
    await flushPromises()
    expect(marked()).toEqual([])
    items()[0].click()
    await flushPromises()
    expect(marked()).toEqual([2])
    await press('儲存')
    expect(read(editor)[0].files.map((item: Json) => item.highlightLines)).toEqual([
      [2],
      undefined,
    ])
  })
})
