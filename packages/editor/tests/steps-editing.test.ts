import type { LexicalEditor } from 'lexical'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises } from '@vue/test-utils'
import { $createNodeSelection, $getRoot, $getSelection, $isNodeSelection, $isRangeSelection, $setSelection, KEY_ARROW_DOWN_COMMAND, KEY_ARROW_UP_COMMAND, KEY_ENTER_COMMAND, KEY_ESCAPE_COMMAND, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { builtinTransformers, INSERT_STEPS_COMMAND } from '../src'
import { doc, mountEditor, paragraph, read, step, stepEditors, steps, text, textOf } from './steps-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

function three() {
  return doc(
    paragraph(text('前')),
    steps(step('a', '甲', paragraph(text('一'))), step('b', '乙', paragraph(text('二'))), step('c', '丙', paragraph(text('三')))),
    paragraph(text('後')),
  )
}
function titles() {
  return [
    ...document.querySelectorAll<HTMLInputElement>('.hlx-step-title-input'),
  ]
}
const titleValues = () => titles().map(input => input.value)
const stored = (editor: LexicalEditor) => read(editor).find(node => node.type === 'steps')!.steps as Record<string, any>[]
const action = (index: number, name: string) => document.querySelectorAll('.hlx-step')[index].querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!

async function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  }))
  await flushPromises()
}

async function setTitle(input: HTMLInputElement, value: string) {
  input.focus()
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

async function caretAt(editor: LexicalEditor, where: 'start' | 'end') {
  editor.update(() => {
    if (where === 'start')
      $getRoot().selectStart()
    else
      $getRoot().selectEnd()
  }, { discrete: true })
  editor.getRootElement()?.focus()
  await flushPromises()
}

const rootOf = (editor: LexicalEditor) => editor.getRootElement()!
function selectedBlock(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection)
      ? selection.getNodes()[0]?.getType()
      : null
  })
}
function caretText(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isRangeSelection(selection)
      ? selection.anchor.getNode().getTextContent()
      : null
  })
}

describe('titles', () => {
  it('saves on Enter as one undo step, and moves on to the content', async () => {
    const { editor } = await mountEditor(three())
    const [first] = titles()
    await setTitle(first, ' 新標題 ')
    await press(first, 'Enter')
    expect(stored(editor)[0].title).toBe('新標題')
    expect(document.activeElement).toBe(rootOf(stepEditors()[0]))
    await undo(editor)
    expect(stored(editor)[0].title).toBe('甲')
    expect(titleValues()[0]).toBe('甲')
  })

  it('saves on leaving without pulling the caret back', async () => {
    const { editor } = await mountEditor(three())
    const [first] = titles()
    await setTitle(first, '新')
    const tags: string[][] = []
    const stop = editor.registerUpdateListener(({ tags: current }) => tags.push([...current]))
    first.blur()
    await flushPromises()
    stop()
    expect(stored(editor)[0].title).toBe('新')
    expect(tags.some(current => current.includes('skip-dom-selection'))).toBe(true)
  })

  it('saves Enter then leaving only once', async () => {
    const { editor } = await mountEditor(three())
    const [first] = titles()
    await setTitle(first, '新')
    await press(first, 'Enter')
    first.blur()
    await flushPromises()
    await undo(editor)
    expect(stored(editor)[0].title).toBe('甲')
  })

  it('esc throws the change away', async () => {
    const { editor } = await mountEditor(three())
    const [first] = titles()
    await setTitle(first, '新')
    await press(first, 'Escape')
    expect(first.value).toBe('甲')
    first.blur()
    await flushPromises()
    expect(stored(editor)[0].title).toBe('甲')
  })

  it('leaves the Enter that picks a word alone', async () => {
    const { editor } = await mountEditor(three())
    const [first] = titles()
    await setTitle(first, '新')
    await press(first, 'Enter', { isComposing: true })
    expect(document.activeElement).toBe(first)
    expect(stored(editor)[0].title).toBe('甲')
  })

  it('doesn\'t touch content or other steps', async () => {
    const value = three()
    const { editor } = await mountEditor(value)
    const before = stored(editor)
    await setTitle(titles()[0], '新')
    titles()[0].blur()
    await flushPromises()
    const after = stored(editor)
    expect(after[0].content).toEqual(before[0].content)
    expect(after[1]).toEqual(before[1])
  })
})

describe('actions', () => {
  it('adds a step after this one, with focus on its title, as one undo step', async () => {
    const { editor } = await mountEditor(three())
    action(0, 'add').click()
    await flushPromises()
    expect(titleValues()).toEqual(['甲', '', '乙', '丙'])
    expect(document.activeElement).toBe(titles()[1])
    expect([
      ...document.querySelectorAll('.hlx-step-number'),
    ].map(el => el.textContent)).toEqual(['1', '2', '3', '4'])
    await undo(editor)
    expect(titleValues()).toEqual(['甲', '乙', '丙'])
  })

  it('removes a step as one undo step, which brings its content back', async () => {
    const { editor } = await mountEditor(three())
    action(1, 'remove').click()
    await flushPromises()
    expect(titleValues()).toEqual(['甲', '丙'])
    expect(stepEditors().map(textOf)).toEqual(['一', '三'])
    await undo(editor)
    expect(titleValues()).toEqual(['甲', '乙', '丙'])
    expect(stepEditors().map(textOf)).toEqual(['一', '二', '三'])
  })

  it('moves steps with their content, as one undo step', async () => {
    const { editor } = await mountEditor(three())
    action(0, 'down').click()
    await flushPromises()
    expect(titleValues()).toEqual(['乙', '甲', '丙'])
    expect(stepEditors().map(textOf)).toEqual(['二', '一', '三'])
    action(2, 'up').click()
    await flushPromises()
    expect(titleValues()).toEqual(['乙', '丙', '甲'])
    await undo(editor)
    await undo(editor)
    expect(titleValues()).toEqual(['甲', '乙', '丙'])
    expect(stored(editor).map(item => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('can\'t move the ends further', async () => {
    await mountEditor(three())
    expect(action(0, 'up').disabled).toBe(true)
    expect(action(2, 'down').disabled).toBe(true)
    expect(action(1, 'up').disabled).toBe(false)
  })

  it('leaves a blank step when the last one is removed', async () => {
    const { editor } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))))))
    action(0, 'remove').click()
    await flushPromises()
    expect(titleValues()).toEqual([''])
    expect(stepEditors().map(textOf)).toEqual([''])
    await undo(editor)
    expect(titleValues()).toEqual(['甲'])
    expect(stepEditors().map(textOf)).toEqual(['一'])
  })

  it('has none of this when read-only, and follows a change to that', async () => {
    const { wrapper } = await mountEditor(three(), { editable: false })
    expect(document.querySelector('[data-action]')).toBeNull()
    expect(titles()[0].readOnly).toBe(true)
    expect(stepEditors().every(editor => !editor.isEditable())).toBe(true)
    await wrapper.setProps({ editable: true } as never)
    await flushPromises()
    expect(document.querySelector('[data-action]')).not.toBeNull()
    expect(titles()[0].readOnly).toBe(false)
    expect(stepEditors().every(editor => editor.isEditable())).toBe(true)
  })
})

describe('keyboard', () => {
  it('down from the line before goes to the first title', async () => {
    const { editor } = await mountEditor(three())
    await caretAt(editor, 'start')
    editor.update(() => $getRoot().getFirstChildOrThrow<any>().selectEnd(), { discrete: true })
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(titles()[0])
  })

  it('up from the line after goes to the end of the last step', async () => {
    const { editor } = await mountEditor(three())
    await caretAt(editor, 'end')
    editor.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    const last = stepEditors()[2]
    expect(document.activeElement).toBe(rootOf(last))
    expect(caretText(last)).toBe('三')
  })

  it('down from a title goes to its content', async () => {
    await mountEditor(three())
    titles()[1].focus()
    await press(titles()[1], 'ArrowDown')
    expect(document.activeElement).toBe(rootOf(stepEditors()[1]))
  })

  it('up from a content\'s first line goes to its title', async () => {
    await mountEditor(three())
    const [, second] = stepEditors()
    await caretAt(second, 'start')
    second.dispatchCommand(KEY_ARROW_UP_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(titles()[1])
  })

  it('down from a content\'s last line goes to the next title', async () => {
    await mountEditor(three())
    const [first] = stepEditors()
    await caretAt(first, 'end')
    first.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(titles()[1])
  })

  it('up from a title goes to the previous step\'s content', async () => {
    await mountEditor(three())
    titles()[1].focus()
    await press(titles()[1], 'ArrowUp')
    expect(document.activeElement).toBe(rootOf(stepEditors()[0]))
  })

  it('down from the last step leaves the block', async () => {
    const { editor } = await mountEditor(three())
    const last = stepEditors()[2]
    await caretAt(last, 'end')
    last.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(rootOf(editor))
    expect(caretText(editor)).toBe('後')
  })

  it('up from the first title leaves the block', async () => {
    const { editor } = await mountEditor(three())
    titles()[0].focus()
    await press(titles()[0], 'ArrowUp')
    expect(document.activeElement).toBe(rootOf(editor))
    expect(caretText(editor)).toBe('前')
  })

  it('makes a line to leave to when there is none', async () => {
    const { editor } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))))))
    const [only] = stepEditors()
    await caretAt(only, 'end')
    only.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(read(editor).map(node => node.type)).toEqual(['steps', 'paragraph'])
  })

  it('esc in the content selects the block, and Delete removes it, which can be undone', async () => {
    const { editor } = await mountEditor(three())
    const [first] = stepEditors()
    await caretAt(first, 'end')
    first.dispatchCommand(KEY_ESCAPE_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(selectedBlock(editor)).toBe('steps')
    expect(document.activeElement).toBe(rootOf(editor))
    expect(document.querySelector('.hlx-steps-editor')!.hasAttribute('data-selected')).toBe(true)
    await press(rootOf(editor), 'Delete')
    expect(read(editor).map(node => node.type)).not.toContain('steps')
    await undo(editor)
    expect(stepEditors().map(textOf)).toEqual(['一', '二', '三'])
  })

  it('esc in an unchanged title selects the block', async () => {
    const { editor } = await mountEditor(three())
    titles()[0].focus()
    await press(titles()[0], 'Escape')
    expect(selectedBlock(editor)).toBe('steps')
  })

  it('enter on the selected block goes to the first title, and arrows leave it', async () => {
    const { editor } = await mountEditor(three())
    const select = () => editor.update(() => {
      const selection = $createNodeSelection()
      selection.add($getRoot().getChildren()[1].getKey())
      $setSelection(selection)
    }, { discrete: true })
    select()
    await flushPromises()
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(document.activeElement).toBe(titles()[0])
    select()
    await flushPromises()
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown'))
    await flushPromises()
    expect(caretText(editor)).toBe('後')
  })

  it('a click on the number selects the block', async () => {
    const { editor } = await mountEditor(three())
    ;(document.querySelector('.hlx-step-number') as HTMLElement).click()
    await flushPromises()
    expect(selectedBlock(editor)).toBe('steps')
  })

  it('keeps keys in a title away from the editor', async () => {
    const { editor } = await mountEditor(three())
    const before = editor.getEditorState()
    titles()[0].focus()
    await press(titles()[0], 'Backspace')
    expect(editor.getEditorState()).toBe(before)
  })
})

describe('copying', () => {
  it('a pasted copy has the same content, and can be edited apart', async () => {
    const { editor } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一')))), paragraph()))
    const json = read(editor)[0]
    editor.update(() => {
      $getRoot().selectEnd()
    }, { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-lexical-editor', JSON.stringify({
      namespace: 'hakulex',
      nodes: [json],
    }))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    await flushPromises()
    const [first, second] = stepEditors()
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
    expect(textOf(second)).toBe('一')
    second.update(() => ($getRoot().getLastDescendant() as any).selectEnd().insertText('複本'), { discrete: true })
    await flushPromises()
    expect(textOf(first)).toBe('一')
    expect(textOf(second)).toBe('一複本')
  })
})

describe('inserting', () => {
  it('adds one blank step with focus on its title, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    editor.dispatchCommand(INSERT_STEPS_COMMAND, undefined)
    await flushPromises()
    expect(titleValues()).toEqual([''])
    expect(document.activeElement).toBe(titles()[0])
    await undo(editor)
    expect(read(editor).map(node => node.type)).toEqual(['paragraph'])
  })
})

describe('markdown', () => {
  const toMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

  it('exports with the content as markdown, and quotes escaped', async () => {
    const bold = {
      ...text('粗'),
      format: 1,
    }
    const { editor } = await mountEditor(doc(steps(step('a', '說"明\\', paragraph(bold, text('細'))), step('b', '', paragraph(text('二'))))))
    expect(toMarkdown(editor)).toBe([
      '::: steps',
      '::: step{title="說\\"明\\\\"}',
      '**粗**細',
      ':::',
      '::: step{title=""}',
      '二',
      ':::',
      ':::',
    ].join('\n'))
  })

  it('comes back as plain text when pasted, with nothing lost', async () => {
    const { editor } = await mountEditor(doc(steps(step('a', '標題', paragraph(text('內容一'))), step('b', '第二', paragraph(text('內容二'))))))
    const markdown = toMarkdown(editor)
    const { editor: other } = await mountEditor(doc(paragraph()))
    other.update(() => $getRoot().selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', markdown)
    other.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    const pasted = textOf(other)
    for (const part of ['標題', '內容一', '第二', '內容二'])
      expect(pasted).toContain(part)
    expect(read(other).map(node => node.type)).not.toContain('steps')
  })
})

describe('the nested slot', () => {
  it('mounts inside each step, with that step\'s editor', async () => {
    const { h, defineComponent } = await import('vue')
    const { useLexicalComposer } = await import('@hakulex/vue-lexical')
    const seen: LexicalEditor[] = []
    const Probe = defineComponent({
      setup() {
        seen.push(useLexicalComposer())
        return () => null
      },
    })
    await mountEditor(three(), {}, {
      nested: () => h(Probe),
    })
    expect(seen).toEqual(stepEditors())
  })
})
