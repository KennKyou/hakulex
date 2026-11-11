import type { LexicalEditor } from 'lexical'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises } from '@vue/test-utils'
import { $getRoot, $getSelection, $isNodeSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, PASTE_COMMAND, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isNestedDocNode, builtinTransformers, INSERT_NESTED_DOC_COMMAND } from '../src'
import { content, doc, mountEditor, paragraph, read, text, textOf, typeInto } from './steps-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

function nestedDoc(value: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: 'nested-doc',
    version: 1,
    content: value,
    ...extra,
  }
}
const sample = () => doc(paragraph(text('前')), nestedDoc(content(paragraph(text('內')))), paragraph(text('後')))
const inner = () => (document.querySelector('.hlx-nested-doc [data-lexical-editor]') as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor
const stored = (editor: LexicalEditor) => read(editor).find(node => node.type === 'nested-doc')!
const collapsed = () => document.querySelector('.hlx-nested-doc')!.hasAttribute('data-collapsed')
const toggle = () => document.querySelector<HTMLButtonElement>('.hlx-nested-doc-toggle')

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}
async function caretAt(editor: LexicalEditor, where: 'start' | 'end') {
  editor.update(() => (where === 'start'
    ? $getRoot().selectStart()
    : $getRoot().selectEnd()), { discrete: true })
  editor.getRootElement()?.focus()
  await flushPromises()
}
function caretText(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isRangeSelection(selection)
      ? selection.anchor.getNode().getTextContent()
      : null
  })
}
function selectedType(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection)
      ? selection.getNodes()[0]?.getType()
      : null
  })
}

describe('stored data', () => {
  it('comes out as it went in, odd fields and all', async () => {
    const value = doc(nestedDoc({
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: '少欄位' },
            ],
          },
        ],
      },
    }, { other: 1 }), paragraph())
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isNestedDocNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
  })

  it.each([
    ['HTML', '<b>內容</b>'],
    ['nothing', undefined],
    [
      'a bad root',
      { root: 'x' },
    ],
    [
      'no children',
      content(),
    ],
  ])('shows %s as blank, and leaves it as it is', async (_name, value) => {
    const source = doc(nestedDoc(value), paragraph())
    const { editor } = await mountEditor(source)
    expect(textOf(inner())).toBe('')
    expect(read(editor)).toEqual(source.root.children)
  })

  it('gives the v-model new content, with the outer state as it was', async () => {
    const { wrapper, editor } = await mountEditor(sample())
    const state = editor.getEditorState()
    await typeInto(inner(), '字')
    expect(editor.getEditorState()).toBe(state)
    expect(stored(editor).content.root.children[0].children[0].text).toBe('內字')
    const emitted = wrapper.emitted('update:modelValue')!.at(-1)![0] as any
    expect(emitted.root.children[1].content.root.children[0].children[0].text).toBe('內字')
  })

  it('keeps fields on the node when edited', async () => {
    const { editor } = await mountEditor(doc(nestedDoc(content(paragraph(text('內'))), { other: 1 }), paragraph()))
    await typeInto(inner(), '字')
    expect(stored(editor).other).toBe(1)
  })

  it('keeps what can\'t be nested as a placeholder, unchanged', async () => {
    const steps = { type: 'steps', version: 1, steps: [] }
    const grid = {
      type: 'grid-container',
      version: 1,
      cols: 2,
      cells: [],
    }
    const self = nestedDoc(content(paragraph()))
    const footnote = { type: 'footnote', version: 1, identifier: 'n' }
    const { editor } = await mountEditor(doc(nestedDoc(content(steps, grid, self, paragraph(footnote, text('文')))), paragraph()))
    expect(document.querySelectorAll('.hlx-nested-doc [data-unknown-type]')).toHaveLength(4)
    await typeInto(inner(), '字')
    const blocks = stored(editor).content.root.children
    expect(blocks.slice(0, 3)).toEqual([steps, grid, self])
    expect(blocks[3].children[0]).toEqual(footnote)
  })

  it('reads as its content, for copying and search', async () => {
    const { editor } = await mountEditor(doc(nestedDoc(content(paragraph(text('內'))))))
    expect(textOf(editor)).toBe('內')
  })
})

describe('history', () => {
  it('goes through edits in order across editors, and back', async () => {
    const { editor } = await mountEditor(sample())
    const nested = inner()
    await typeInto(editor, 'A')
    await typeInto(nested, 'B')
    await typeInto(editor, 'C')
    await undo(editor)
    expect(textOf(editor)).not.toContain('C')
    await undo(nested)
    expect(textOf(nested)).toBe('內')
    await undo(editor)
    expect(textOf(editor)).not.toContain('A')
    editor.dispatchCommand(REDO_COMMAND, undefined)
    await flushPromises()
    expect(textOf(editor)).toContain('A')
    editor.dispatchCommand(REDO_COMMAND, undefined)
    await flushPromises()
    expect(textOf(nested)).toBe('內B')
  })

  it('brings back a deleted block with its content, and edits still reach it', async () => {
    const { editor } = await mountEditor(sample())
    await typeInto(inner(), 'B')
    editor.update(() => {
      $getRoot().getChildren()[1].remove()
    }, { discrete: true })
    await flushPromises()
    expect(document.querySelector('.hlx-nested-doc')).toBeNull()
    await undo(editor)
    expect(textOf(inner())).toBe('內B')
    await typeInto(inner(), 'C')
    expect(stored(editor).content.root.children[0].children[0].text).toBe('內BC')
  })
})

describe('read-only', () => {
  const long = () => doc(nestedDoc(content(...Array.from({ length: 7 }, (_, i) => paragraph(text(`段${i}`))))), paragraph())

  it('can\'t be edited, and is cut short like the preview', async () => {
    await mountEditor(long(), { editable: false })
    expect(inner().isEditable()).toBe(false)
    expect(document.querySelector('.hlx-nested-doc')!.hasAttribute('data-collapsed')).toBe(true)
    expect(document.querySelector('.hlx-nested-doc-toggle')).not.toBeNull()
  })

  it('stays as it was on becoming editable, and can then be edited', async () => {
    const { wrapper } = await mountEditor(long(), { editable: false })
    await wrapper.setProps({ editable: true } as never)
    await flushPromises()
    expect(collapsed()).toBe(true)
    expect(inner().isEditable()).toBe(true)
  })
})

describe('a long one while editing', () => {
  const long = () => doc(paragraph(text('前')), nestedDoc(content(...Array.from({ length: 7 }, (_, i) => paragraph(text(`段${i}`))))), paragraph(text('後')))

  it('starts cut short like the preview, and opens once the caret goes in', async () => {
    await mountEditor(long())
    expect(collapsed()).toBe(true)
    expect(document.querySelector('.hlx-nested-doc-fade')).not.toBeNull()
    await caretAt(inner(), 'start')
    expect(collapsed()).toBe(false)
    expect(document.querySelector('.hlx-nested-doc-fade')).toBeNull()
    expect(toggle()!.textContent!.trim()).toBe('收合')
  })

  it('stays open when the caret leaves, and closes only from its button, with nothing changed', async () => {
    const { editor } = await mountEditor(long())
    const before = stored(editor)
    await caretAt(inner(), 'end')
    await caretAt(editor, 'start')
    expect(collapsed()).toBe(false)
    toggle()!.click()
    await flushPromises()
    expect(collapsed()).toBe(true)
    expect(stored(editor)).toEqual(before)
    // Its button opens it again without going in.
    toggle()!.click()
    await flushPromises()
    expect(collapsed()).toBe(false)
  })

  it('opens when entered from the line after, with the caret at the end', async () => {
    const { editor } = await mountEditor(long())
    await caretAt(editor, 'end')
    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(inner().getRootElement())
    expect(caretText(inner())).toBe('段6')
    expect(collapsed()).toBe(false)
  })

  it('opens when undo goes back into it', async () => {
    const { editor } = await mountEditor(long())
    await caretAt(inner(), 'end')
    await typeInto(inner(), 'X')
    toggle()!.click()
    await caretAt(editor, 'start')
    await flushPromises()
    expect(collapsed()).toBe(true)
    await undo(editor)
    expect(textOf(inner())).not.toContain('X')
    expect(collapsed()).toBe(false)
  })
})

describe('keyboard', () => {
  it('down from the line before goes to the start of the content', async () => {
    const { editor } = await mountEditor(sample())
    await caretAt(editor, 'start')
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(inner().getRootElement())
  })

  it('up from the line after goes to the end of the content', async () => {
    const { editor } = await mountEditor(sample())
    await caretAt(editor, 'end')
    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(inner().getRootElement())
    expect(caretText(inner())).toBe('內')
  })

  it('leaves from the first and last lines', async () => {
    const { editor } = await mountEditor(sample())
    await caretAt(inner(), 'end')
    inner().dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(editor.getRootElement())
    expect(caretText(editor)).toBe('後')
    await caretAt(inner(), 'start')
    inner().dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(caretText(editor)).toBe('前')
  })

  it('esc selects the block, Enter goes back in, and arrows leave', async () => {
    const { editor } = await mountEditor(sample())
    await caretAt(inner(), 'end')
    inner().dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(selectedType(editor)).toBe('nested-doc')
    expect(document.querySelector('.hlx-nested-doc-editor')!.hasAttribute('data-selected')).toBe(true)
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(inner().getRootElement())
    inner().dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(caretText(editor)).toBe('後')
  })

  it('a click outside the content selects the block', async () => {
    const { editor } = await mountEditor(sample())
    ;(document.querySelector('.hlx-nested-doc') as HTMLElement).click()
    await flushPromises()
    expect(selectedType(editor)).toBe('nested-doc')
  })
})

describe('copying and inserting', () => {
  it('a pasted copy has the same content, and can be edited apart', async () => {
    const source = nestedDoc(content(paragraph(text('內'))))
    const { editor } = await mountEditor(doc(source, paragraph()))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-lexical-editor', JSON.stringify({
      namespace: 'hakulex',
      nodes: [source],
    }))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    const roots = [
      ...document.querySelectorAll<HTMLElement & { __lexicalEditor: LexicalEditor }>('.hlx-nested-doc [data-lexical-editor]'),
    ]
    expect(roots).toHaveLength(2)
    await typeInto(roots[1].__lexicalEditor, '字')
    expect(textOf(roots[0].__lexicalEditor)).toBe('內')
    expect(textOf(roots[1].__lexicalEditor)).toBe('內字')
  })

  it('inserts a blank one with focus inside, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    editor.dispatchCommand(INSERT_NESTED_DOC_COMMAND, undefined)
    await flushPromises()
    expect(document.activeElement).toBe(inner().getRootElement())
    expect(stored(editor).content).toEqual(content(paragraph()))
    await undo(editor)
    expect(read(editor).map(node => node.type)).toEqual(['paragraph'])
  })
})

describe('markdown', () => {
  it('exports the content as markdown, and comes back as text with nothing lost', async () => {
    const bold = {
      ...text('粗'),
      format: 1,
    }
    const { editor } = await mountEditor(doc(nestedDoc(content(paragraph(bold, text('細'))))))
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown).toBe('<nested-doc>\n**粗**細\n</nested-doc>')
    const { editor: other } = await mountEditor(doc(paragraph()))
    other.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', markdown)
    other.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    expect(JSON.stringify(read(other))).toContain('粗')
    expect(JSON.stringify(read(other))).toContain('細')
    expect(read(other).map(node => node.type)).not.toContain('nested-doc')
  })
})
