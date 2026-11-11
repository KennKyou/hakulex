import type { LexicalEditor } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $createTextNode, $getRoot, $getSelection, $isRangeSelection, createEditor } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RichEditor } from '../src'
import { createEmptyContent, createNestedContent, editedContent, latestState, nestedNodes, nestedText, onNestedChange, registerNestedSync } from '../src/nested/content'
import { $leaveBlock, releaseOuterSelection } from '../src/nested/keys'
import { content, doc, paragraph, text } from './steps-helpers'

afterEach(() => {
  document.body.innerHTML = ''
})

async function outerEditor(value = doc(paragraph(text('前')), paragraph(text('後')))) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return (wrapper.vm as unknown as { editor: LexicalEditor }).editor
}

function typeIn(editor: LexicalEditor, value: string) {
  // Not on the page, so there is no element to commit to: go through a root of its own.
  editor.setRootElement(document.body.appendChild(document.createElement('div')))
  editor.update(() => {
    $getRoot().selectEnd()
    const selection = $getSelection()
    if ($isRangeSelection(selection))
      selection.insertText(value)
  }, { discrete: true })
}

describe('createNestedContent', () => {
  it('loads what is stored, before being on the page', async () => {
    const nested = createNestedContent(await outerEditor(), content(paragraph(text('字'))))
    expect(nestedText(nested.editor)).toBe('字')
    expect(latestState(nested.editor).isEmpty()).toBe(false)
  })

  it.each([
    ['HTML', '<b>內容</b>'],
    ['nothing', undefined],
    [
      'no root',
      { a: 1 },
    ],
    [
      'a bad root',
      { root: 'x' },
    ],
    [
      'no children',
      {
        root: { type: 'root', children: [] },
      },
    ],
  ])('shows %s as blank', async (_name, stored) => {
    const nested = createNestedContent(await outerEditor(), stored)
    expect(nestedText(nested.editor)).toBe('')
    expect(editedContent(nested)).toBeUndefined()
  })

  it('says nothing was edited until something is, and then gives the content', async () => {
    const nested = createNestedContent(await outerEditor(), {
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
    })
    expect(editedContent(nested)).toBeUndefined()
    typeIn(nested.editor, '多')
    const edited = editedContent(nested) as { root: { children: { children: { text: string }[] }[] } }
    expect(edited.root.children[0].children[0].text).toBe('少欄位多')
  })

  it('follows the outer editor being read-only', async () => {
    const outer = await outerEditor()
    outer.setEditable(false)
    expect(createNestedContent(outer, content(paragraph())).editor.isEditable()).toBe(false)
  })

  it('has the outer editor as its parent', async () => {
    const outer = await outerEditor()
    expect(createNestedContent(outer, content(paragraph())).editor._parentEditor).toBe(outer)
  })

  it('makes an empty document', () => {
    const editor = createEditor({ nodes: [] })
    expect(editor.parseEditorState(createEmptyContent()).isEmpty()).toBe(false)
  })
})

describe('nestedNodes', () => {
  it('leaves out what can\'t be nested', async () => {
    const types = nestedNodes(await outerEditor()).map(node => ('getType' in node
      ? node.getType()
      : ''))
    expect(types).toContain('heading')
    for (const type of [
      'steps',
      'footnote',
      'footnote-section',
      'nested-doc',
      'grid-container',
    ])
      expect(types).not.toContain(type)
  })

  it('keeps what can\'t be nested as a placeholder that comes out as it went in', async () => {
    const inner = {
      type: 'grid-container',
      version: 1,
      cols: 2,
      cells: [],
    }
    const stored = content(inner, paragraph(text('字')))
    const outer = await outerEditor()
    const nested = createNestedContent(outer, stored)
    typeIn(nested.editor, '多')
    const edited = editedContent(nested) as { root: { children: unknown[] } }
    expect(edited.root.children[0]).toEqual(inner)
  })
})

describe('telling the outer editor', () => {
  it('calls listeners for real changes only, and stops when told', async () => {
    const outer = await outerEditor()
    const nested = createNestedContent(outer, content(paragraph(text('字'))))
    const listener = vi.fn()
    const stopListening = onNestedChange(outer, listener)
    nested.editor.setRootElement(document.body.appendChild(document.createElement('div')))
    const stopSync = registerNestedSync(nested.editor, nested.baseline)
    expect(listener).not.toHaveBeenCalled()
    nested.editor.update(() => {
      $getRoot().selectEnd()
    }, { discrete: true })
    expect(listener).not.toHaveBeenCalled()
    typeIn(nested.editor, '多')
    expect(listener).toHaveBeenCalledTimes(1)
    stopListening()
    typeIn(nested.editor, '更多')
    expect(listener).toHaveBeenCalledTimes(1)
    stopSync()
  })

  it('catches a change made while it wasn\'t listening', async () => {
    const outer = await outerEditor()
    const nested = createNestedContent(outer, content(paragraph(text('字'))))
    typeIn(nested.editor, '多')
    const listener = vi.fn()
    onNestedChange(outer, listener)
    registerNestedSync(nested.editor, nested.baseline)()
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('$leaveBlock', () => {
  async function around(direction: 'up' | 'down', children: unknown[]) {
    const outer = await outerEditor(doc(...children))
    const index = children.findIndex(child => (child as { type: string }).type === 'code-snippet')
    outer.update(() => $leaveBlock($getRoot().getChildren()[index], direction), { discrete: true })
    return outer.getEditorState().read(() => {
      const selection = $getSelection()
      return {
        at: $isRangeSelection(selection)
          ? selection.anchor.getNode().getTextContent()
          : null,
        size: $getRoot().getChildrenSize(),
      }
    })
  }
  const block = { type: 'code-snippet', version: 1, files: [] }

  it('goes to the line above or below', async () => {
    expect(await around('up', [
      paragraph(text('前')),
      block,
      paragraph(text('後')),
    ])).toEqual({ at: '前', size: 3 })
    expect(await around('down', [
      paragraph(text('前')),
      block,
      paragraph(text('後')),
    ])).toEqual({ at: '後', size: 3 })
  })

  it('makes a line when there is none', async () => {
    expect((await around('down', [block])).size).toBe(2)
    expect((await around('up', [block])).size).toBe(2)
  })
})

describe('releaseOuterSelection', () => {
  it('clears the outer selection and what the DOM has, without a history entry', async () => {
    const outer = await outerEditor()
    outer.update(() => $getRoot().selectEnd(), { discrete: true })
    const tags: string[][] = []
    outer.registerUpdateListener(({ tags: current }) => tags.push([...current]))
    releaseOuterSelection(outer)
    expect(outer.getEditorState()._selection).toBeNull()
    expect(document.getSelection()?.rangeCount ?? 0).toBe(0)
    expect(tags.at(-1)).toEqual(expect.arrayContaining(['history-merge', 'skip-dom-selection']))
  })

  it('leaves an editor with nothing selected alone', async () => {
    const outer = await outerEditor()
    outer.update(() => {
      $getRoot().clear().append($createParagraphNode().append($createTextNode('字')))
    }, { discrete: true })
    const before = outer.getEditorState()
    outer.update(() => {}, { discrete: true })
    releaseOuterSelection(outer)
    expect(outer.getEditorState()).toBe(before)
  })
})
