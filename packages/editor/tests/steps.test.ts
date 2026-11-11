import { flushPromises } from '@vue/test-utils'
import { $getRoot } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $createStepsNode, $isStepsNode } from '../src'
import { content, doc, mountEditor, paragraph, read, step, stepEditors, steps, text, textOf, typeInto } from './steps-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('stored data', () => {
  it('comes out as it went in, odd fields and all', async () => {
    const value = doc(steps(
      {
        ...step('a', '第一', paragraph(text('內容'))),
        note: { keep: true },
      },
      // Lexical would fill in what these leave out, or refuse them.
      {
        id: 'b',
        title: '第二',
        content: {
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
        },
      },
      { id: 'c', title: '第三', content: '<b>內容</b>' },
      { id: 'd', title: '第四' },
      {
        id: 'e',
        title: '第五',
        content: {
          root: { type: 'root', children: [] },
        },
      },
      {
        id: 'f',
        title: '第六',
        content: { root: 'x' },
      },
    ), paragraph())
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isStepsNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
  })

  it('shows invalid content as blank', async () => {
    await mountEditor(doc(steps({ id: 'c', title: '題', content: '<b>內容</b>' })))
    expect(stepEditors()).toHaveLength(1)
    expect(textOf(stepEditors()[0])).toBe('')
  })

  it('shows the content of each step', async () => {
    await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))), step('b', '乙', paragraph(text('二'))))))
    expect(stepEditors().map(textOf)).toEqual(['一', '二'])
    expect([
      ...document.querySelectorAll('.hlx-step-content [data-lexical-editor]'),
    ].map(root => root.textContent)).toEqual(['一', '二'])
  })

  it('only changes the step that was edited', async () => {
    const second = step('b', '乙', {
      type: 'paragraph',
      children: [
        { type: 'text', text: '二' },
      ],
    })
    const { wrapper, editor } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))), second)))
    await typeInto(stepEditors()[0], '字')
    const output = read(editor)[0].steps
    expect(output[0].id).toBe('a')
    expect(output[0].title).toBe('甲')
    expect(output[0].content.root.children[0].children[0].text).toBe('一字')
    expect(output[1]).toEqual(second)
    const emitted = wrapper.emitted('update:modelValue')!.at(-1)![0] as any
    expect(emitted.root.children[0].steps).toEqual(output)
  })

  it('tells the v-model once per change, and not for a caret move', async () => {
    const { wrapper } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))))))
    const before = wrapper.emitted('update:modelValue')?.length ?? 0
    stepEditors()[0].update(() => $getRoot().selectEnd(), { discrete: true })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.length ?? 0).toBe(before)
    await typeInto(stepEditors()[0], '字')
    expect(wrapper.emitted('update:modelValue')!.length).toBe(before + 1)
    expect(wrapper.emitted('change')!.length).toBe(1)
  })

  it('makes no entry in the outer editor\'s state for an edit in a step', async () => {
    const { editor } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))))))
    const state = editor.getEditorState()
    await typeInto(stepEditors()[0], '字')
    expect(editor.getEditorState()).toBe(state)
  })

  it.each([
    ['nothing', undefined],
    ['text', '步驟'],
    [
      'an object',
      { a: 1 },
    ],
  ])('has no steps when `steps` is %s', async (_name, value) => {
    const { editor } = await mountEditor(doc({ type: 'steps', version: 1, steps: value }))
    expect(stepEditors()).toHaveLength(0)
    expect(read(editor)[0].steps).toEqual([])
  })

  it('takes items that are not steps, and fields of the wrong type', async () => {
    const { editor } = await mountEditor(doc(steps(1, null, 'a', { title: 7, id: 8 }, step('', '空 id'))))
    const output = read(editor)[0].steps
    expect(output).toHaveLength(2)
    expect(output[0].title).toBe('')
    for (const item of output) {
      expect(item.id).toMatch(/^s_[a-z0-9]{8}$/)
    }
    expect(output[1].title).toBe('空 id')
  })

  it('keeps ids it made up', async () => {
    const { editor } = await mountEditor(doc(steps({ title: '甲' })))
    expect(read(editor)[0].steps[0].id).toBe(read(editor)[0].steps[0].id)
  })

  it('keeps what can\'t go in a step as a placeholder, unchanged', async () => {
    const inner = steps(step('x', '內', paragraph(text('字'))))
    const footnote = { type: 'footnote', version: 1, identifier: 'n' }
    const first = step('a', '甲', inner, paragraph(footnote, text('文')))
    const value = doc(steps(first))
    const { editor } = await mountEditor(value)
    expect(read(editor)).toEqual(value.root.children)
    expect(document.querySelectorAll('.hlx-step-content [data-unknown-type]')).toHaveLength(2)
    expect(stepEditors()).toHaveLength(1)
    await typeInto(stepEditors()[0], '更多')
    const blocks = read(editor)[0].steps[0].content.root.children
    expect(blocks[0]).toEqual(inner)
    expect(blocks[1].children[0]).toEqual(footnote)
    expect(blocks.at(-1).children.at(-1).text).toContain('更多')
  })

  it('reads as text, for copying and search', async () => {
    const { editor } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))), step('b', '乙', paragraph(text('二'))))))
    expect(textOf(editor)).toBe('甲\n一\n乙\n二')
  })

  it('makes one blank step from code', async () => {
    const { editor } = await mountEditor(doc(paragraph()))
    editor.update(() => {
      $getRoot().append($createStepsNode())
    }, { discrete: true })
    await flushPromises()
    const [created] = read(editor)[1].steps
    expect(created.title).toBe('')
    expect(created.content).toEqual(content(paragraph()))
  })

  it('follows read-only', async () => {
    const { wrapper } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('一'))))), { editable: false })
    expect(stepEditors()[0].isEditable()).toBe(false)
    await wrapper.setProps({ editable: true } as never)
    await flushPromises()
    expect(stepEditors()[0].isEditable()).toBe(true)
  })

  it('takes a new document through v-model', async () => {
    const { wrapper } = await mountEditor(doc(steps(step('a', '甲', paragraph(text('舊'))))))
    await wrapper.setProps({
      modelValue: doc(steps(step('b', '乙', paragraph(text('新'))))),
    } as never)
    await flushPromises()
    expect(stepEditors().map(textOf)).toEqual(['新'])
  })
})

describe('the same features as the outer editor', () => {
  it('registers the same nodes, without what can\'t go in a step', async () => {
    await mountEditor(doc(steps(step('a', '甲', paragraph()))))
    const nested = stepEditors()[0]
    expect(nested._nodes.has('heading')).toBe(true)
    expect(nested._nodes.has('code-block')).toBe(true)
    expect(nested._nodes.has('steps')).toBe(false)
    expect(nested._nodes.has('footnote')).toBe(false)
    expect(nested._nodes.has('footnote-section')).toBe(false)
  })

  it('has the extra nodes given to the editor', async () => {
    const { BadgeNode } = await import('./steps-badge')
    await mountEditor(doc(steps(step('a', '甲', paragraph()))), {
      nodes: [BadgeNode],
    })
    expect(stepEditors()[0]._nodes.has('test-badge')).toBe(true)
  })
})
