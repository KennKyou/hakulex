import type { LexicalEditor } from 'lexical'
import { flushPromises } from '@vue/test-utils'
import { $addUpdateTag, $getRoot, CAN_REDO_COMMAND, CAN_UNDO_COMMAND, COMMAND_PRIORITY_LOW, HISTORY_PUSH_TAG, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { doc, mountEditor, paragraph, read, step, stepEditors, steps, text, textOf, typeInto } from './steps-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

function two() {
  return doc(
    paragraph(text('外')),
    steps(step('a', '甲', paragraph(text('一'))), step('b', '乙', paragraph(text('二')))),
  )
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}
async function redo(editor: LexicalEditor) {
  editor.dispatchCommand(REDO_COMMAND, undefined)
  await flushPromises()
}
function snapshot(outer: LexicalEditor) {
  const [first, second] = stepEditors()
  return [
    outer.getEditorState().read(() => $getRoot().getFirstChild()!.getTextContent()),
    textOf(first),
    textOf(second),
  ]
}

describe('shared history', () => {
  it('undoes and redoes across editors in the order things happened', async () => {
    const { editor } = await mountEditor(two())
    const [first, second] = stepEditors()
    await typeInto(editor, 'A')
    await typeInto(first, 'B')
    await typeInto(second, 'C')
    await typeInto(editor, 'D')
    await typeInto(second, 'E')
    // `typeInto` on the outer editor adds to its last block, so check the steps by themselves.
    expect(textOf(second)).toBe('二CE')
    await undo(editor)
    expect(textOf(second)).toBe('二C')
    await undo(editor)
    expect(textOf(editor)).not.toContain('D')
    await undo(second)
    expect(textOf(second)).toBe('二')
    await undo(first)
    expect(textOf(first)).toBe('一')
    await undo(editor)
    expect(textOf(editor)).not.toContain('A')
    await redo(editor)
    expect(textOf(editor)).toContain('A')
    await redo(first)
    expect(textOf(first)).toBe('一B')
    await redo(second)
    expect(textOf(second)).toBe('二C')
    await redo(editor)
    expect(textOf(editor)).toContain('D')
    await redo(editor)
    expect(textOf(second)).toBe('二CE')
  })

  it('doesn\'t need the step to be where the keys are pressed', async () => {
    const { editor } = await mountEditor(two())
    const [first] = stepEditors()
    await typeInto(first, 'B')
    await undo(editor)
    expect(textOf(first)).toBe('一')
    await redo(editor)
    expect(textOf(first)).toBe('一B')
  })

  it('doesn\'t lose the outer change to a caret moving in a step', async () => {
    const { editor } = await mountEditor(two())
    const [first] = stepEditors()
    await typeInto(editor, 'A')
    first.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    await typeInto(first, 'B')
    await undo(editor)
    await undo(editor)
    expect(snapshot(editor)[1]).toBe('一')
    expect(textOf(editor)).not.toContain('A')
    await redo(editor)
    await redo(editor)
    expect(textOf(editor)).toContain('A')
    expect(textOf(first)).toBe('一B')
  })

  it('merges typing in a step, as it does outside', async () => {
    const { editor } = await mountEditor(two())
    const [first] = stepEditors()
    first.update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    for (const char of 'abc') {
      first.update(() => {
        ($getRoot().getLastDescendant() as any).selectEnd().insertText(char)
      }, { discrete: true })
      await flushPromises()
    }
    expect(textOf(first)).toBe('一abc')
    await undo(editor)
    expect(textOf(first)).toBe('一')
  })

  it('tells the outer editor when undo and redo are possible', async () => {
    const { editor } = await mountEditor(two())
    const seen: [string, boolean][] = []
    editor.registerCommand(CAN_UNDO_COMMAND, (value) => {
      seen.push(['undo', value])
      return false
    }, COMMAND_PRIORITY_LOW)
    editor.registerCommand(CAN_REDO_COMMAND, (value) => {
      seen.push(['redo', value])
      return false
    }, COMMAND_PRIORITY_LOW)
    await typeInto(stepEditors()[0], 'B')
    expect(seen).toContainEqual(['undo', true])
    await undo(editor)
    expect(seen).toContainEqual(['undo', false])
    expect(seen).toContainEqual(['redo', true])
  })

  it('updates the v-model on undo in a step', async () => {
    const { editor, wrapper } = await mountEditor(two())
    await typeInto(stepEditors()[0], 'B')
    await undo(editor)
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as any
    const texts = last.root.children[1].steps[0].content.root.children[0].children[0].text
    expect(texts).toBe('一')
    // Back to what was loaded means back to exactly what was loaded.
    expect(read(editor)[1]).toEqual(two().root.children[1])
  })
})

describe('bringing things back', () => {
  async function removeBlock(editor: LexicalEditor) {
    editor.update(() => {
      $addUpdateTag(HISTORY_PUSH_TAG)
      $getRoot().getChildren()[1].remove()
    }, { discrete: true })
    await flushPromises()
  }

  it('restores a deleted block with its content, and edits still reach it', async () => {
    const { editor } = await mountEditor(two())
    const [first] = stepEditors()
    await typeInto(first, 'B')
    await removeBlock(editor)
    expect(stepEditors()).toHaveLength(0)
    await undo(editor)
    expect(stepEditors().map(textOf)).toEqual(['一B', '二'])
    await typeInto(stepEditors()[0], 'C')
    expect(read(editor)[1].steps[0].content.root.children[0].children[0].text).toBe('一BC')
    await undo(editor)
    expect(textOf(stepEditors()[0])).toBe('一B')
    await undo(editor)
    expect(textOf(stepEditors()[0])).toBe('一')
  })

  it('redoes through a block coming and going', async () => {
    const { editor } = await mountEditor(two())
    await typeInto(stepEditors()[0], 'B')
    await removeBlock(editor)
    await undo(editor)
    await undo(editor)
    expect(textOf(stepEditors()[0])).toBe('一')
    await redo(editor)
    expect(textOf(stepEditors()[0])).toBe('一B')
    await redo(editor)
    expect(stepEditors()).toHaveLength(0)
    await undo(editor)
    expect(textOf(stepEditors()[0])).toBe('一B')
  })
})
