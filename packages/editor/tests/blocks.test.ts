import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import {
  $canMoveBlock,
  $canTurnBlock,
  $deleteBlock,
  $duplicateBlocks,
  $getBlockType,
  $moveBlockAfter,
  $moveBlocks,
  $selectionBlockKeys,
  $turnBlocksInto,
  builtinTransformers,
  RichEditor,
  TURNABLE_BLOCK_TYPES,
} from '../src'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  tag?: string
  listType?: string
  url?: string
  definitions?: Record<string, string>
}

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}, slots: Record<string, () => unknown> = {}) {
  const wrapper = mount(RichEditor, { props, slots, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const lines = (editor: LexicalEditor) => rootChildren(editor).map(textOf)
const types = (editor: LexicalEditor) => rootChildren(editor).map(node => node.type)
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
  return flushPromises()
}

const keyAt = (editor: LexicalEditor, index: number) => editor.getEditorState().read(() => $getRoot().getChildAtIndex(index)!.getKey())

function run(editor: LexicalEditor, action: () => unknown) {
  let result: unknown
  editor.update(() => {
    result = action()
  }, { discrete: true })
  return result
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

async function withParagraphs(editor: LexicalEditor, ...values: string[]) {
  editor.update(() => {
    const root = $getRoot().clear()
    for (const value of values) {
      root.append($createParagraphNode().append(...(value
        ? [
            $createTextNode(value),
          ]
        : [])))
    }
  }, { discrete: true })
  await flushPromises()
}

describe('moving', () => {
  it('moves up and down, keeping formats, links and the caret, in one undo step', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '一\n\n**粗** [連結](https://example.com)\n\n三')
    editor.update(() => $getRoot().getChildAtIndex<ReturnType<typeof $createParagraphNode>>(1)!.selectEnd(), { discrete: true })
    await flushPromises()
    const key = keyAt(editor, 1)

    expect(run(editor, () => $moveBlocks([key], 'up'))).toBe(true)
    await flushPromises()
    expect(lines(editor)).toEqual(['粗 連結', '一', '三'])
    expect(find(rootChildren(editor), 'link')).toHaveLength(1)
    expect(find(rootChildren(editor), 'text')[0].format).toBe(1)
    expect(editor.getEditorState().read(() => {
      const selection = $getSelection()
      return $isRangeSelection(selection) && selection.anchor.getNode().getTopLevelElement()?.getKey()
    })).toBe(key)

    await undo(editor)
    expect(lines(editor)).toEqual(['一', '粗 連結', '三'])

    run(editor, () => $moveBlocks([key], 'down'))
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '三', '粗 連結'])
    await undo(editor)
    expect(lines(editor)).toEqual(['一', '粗 連結', '三'])
  })

  it('does nothing at the edges, taking no undo step', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二')
    run(editor, () => $moveBlocks([
      keyAt(editor, 1),
    ], 'up'))
    await flushPromises()
    expect(lines(editor)).toEqual(['二', '一'])

    expect(run(editor, () => $moveBlocks([
      keyAt(editor, 0),
    ], 'up'))).toBe(false)
    expect(run(editor, () => $moveBlocks([
      keyAt(editor, 1),
    ], 'down'))).toBe(false)
    expect(editor.getEditorState().read(() => $canMoveBlock(keyAt(editor, 0), 'up'))).toBe(false)
    expect(editor.getEditorState().read(() => $canMoveBlock(keyAt(editor, 0), 'down'))).toBe(true)
    await flushPromises()

    await undo(editor)
    expect(lines(editor)).toEqual(['一', '二'])
  })

  it('moves several together', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二', '三', '四')
    run(editor, () => $moveBlocks([
      keyAt(editor, 1),
      keyAt(editor, 2),
    ], 'up'))
    expect(lines(editor)).toEqual(['二', '三', '一', '四'])
    run(editor, () => $moveBlocks([
      keyAt(editor, 0),
      keyAt(editor, 1),
    ], 'down'))
    expect(lines(editor)).toEqual(['一', '二', '三', '四'])
  })

  it('does not go past the footnotes, whose numbers follow the new order', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '甲[^a]\n\n乙[^b]\n\n[^a]: A\n\n[^b]: B')
    expect(types(editor)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
    const numbers = () => [
      ...editor.getRootElement()!.querySelectorAll('.hlx-footnote-ref'),
    ].map(node => node.textContent)
    expect(numbers()).toEqual(['1', '2'])

    expect(run(editor, () => $moveBlocks([
      keyAt(editor, 1),
    ], 'down'))).toBe(false)
    expect(editor.getEditorState().read(() => $canMoveBlock(keyAt(editor, 1), 'down'))).toBe(false)

    run(editor, () => $moveBlocks([
      keyAt(editor, 1),
    ], 'up'))
    await flushPromises()
    expect(lines(editor).slice(0, 2)).toEqual(['乙', '甲'])
    expect(types(editor).at(-1)).toBe('footnote-section')
    expect(find(rootChildren(editor), 'footnote').map(node => (node as unknown as { identifier: string }).identifier)).toEqual(['b', 'a'])
    expect(numbers()).toEqual(['1', '2'])
  })

  it('refuses to move the footnotes themselves', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '甲[^a]\n\n[^a]: A')
    expect(run(editor, () => $moveBlocks([
      keyAt(editor, 1),
    ], 'up'))).toBe(false)
    expect(types(editor)).toEqual(['paragraph', 'footnote-section'])
  })
})

describe('which blocks a selection means', () => {
  it('is the blocks it touches, in order', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二', '三')
    editor.update(() => {
      const [a, , c] = $getRoot().getAllTextNodes()
      c.select(1, 1).anchor.set(a.getKey(), 0, 'text')
    }, { discrete: true })
    expect(editor.getEditorState().read($selectionBlockKeys)).toEqual([
      keyAt(editor, 0),
      keyAt(editor, 1),
      keyAt(editor, 2),
    ])
  })

  it('leaves out a block the selection only ends at, as a triple click leaves it', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二')
    editor.update(() => {
      const [a, b] = $getRoot().getAllTextNodes()
      a.select(0, 0).focus.set(b.getKey(), 0, 'text')
    }, { discrete: true })
    expect(editor.getEditorState().read($selectionBlockKeys)).toEqual([
      keyAt(editor, 0),
    ])
  })

  it('is the whole container from inside one', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '> [!NOTE]\n> 提示\n\n後')
    editor.update(() => $getRoot().getAllTextNodes().find(node => node.getTextContent() === '提示')!.select(), { discrete: true })
    expect(editor.getEditorState().read($selectionBlockKeys)).toEqual([
      keyAt(editor, 0),
    ])
  })
})

describe('duplicating', () => {
  it.each([
    ['a paragraph', '**粗**'],
    ['a table', '| a | b |\n| --- | --- |\n| c | d |'],
    ['an alert', '> [!NOTE]\n> 提示'],
    ['an image', '![cat](https://example.com/a.png)'],
    ['a video', '<video src="/a.webm" controls></video>'],
    ['a code block', '```ts\nconst a = 1\n```'],
  ])('copies %s right below, independently, in one undo step', async (_name, markdown) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, `${markdown}\n\n尾`)
    const before = rootChildren(editor)
    run(editor, () => $duplicateBlocks([
      keyAt(editor, 0),
    ]))
    await flushPromises()
    const after = rootChildren(editor)
    expect(after).toHaveLength(before.length + 1)
    expect(after[1]).toEqual(after[0])
    expect(keyAt(editor, 0)).not.toBe(keyAt(editor, 1))

    await undo(editor)
    expect(rootChildren(editor)).toEqual(before)
  })

  it('keeps one footnote section, with the same note referred to twice', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '甲[^a]\n\n[^a]: A')
    run(editor, () => $duplicateBlocks([
      keyAt(editor, 0),
    ]))
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph', 'paragraph', 'footnote-section'])
    expect(find(rootChildren(editor), 'footnote')).toHaveLength(2)
  })

  it('leaves the footnotes out', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '甲[^a]\n\n[^a]: A')
    expect(run(editor, () => $duplicateBlocks([
      keyAt(editor, 1),
    ]))).toBe(false)
    await flushPromises()
    expect(find(rootChildren(editor), 'footnote-section')).toHaveLength(1)
  })
})

describe('deleting', () => {
  it('removes a block and moves the caret next door, in one undo step', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二', '三')
    run(editor, () => $deleteBlock(keyAt(editor, 1)))
    await flushPromises()
    expect(lines(editor)).toEqual(['一', '三'])
    expect(editor.getEditorState().read(() => $getSelection()?.getNodes()[0].getTextContent())).toBe('三')

    await undo(editor)
    expect(lines(editor)).toEqual(['一', '二', '三'])
  })

  it('leaves an empty paragraph when it was the only block, even with footnotes', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一')
    run(editor, () => $deleteBlock(keyAt(editor, 0)))
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph'])
    expect(lines(editor)).toEqual([''])
    expect(editor.getEditorState().read(() => $isRangeSelection($getSelection()))).toBe(true)

    const notes = mountEditor().editor
    await importMarkdown(notes, '甲\n\n[^a]: A')
    run(notes, () => $deleteBlock(keyAt(notes, 0)))
    await flushPromises()
    expect(types(notes)).toEqual(['paragraph', 'footnote-section'])
    expect(lines(notes)[0]).toBe('')
  })
})

describe('turning into another type', () => {
  it('keeps formats and links through every text type, in one undo step each', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '**粗** [連結](https://example.com)')
    const check = () => {
      expect(find(rootChildren(editor), 'link')).toHaveLength(1)
      expect(find(rootChildren(editor), 'text')[0].format).toBe(1)
      expect(lines(editor)).toEqual(['粗 連結'])
    }

    for (const [type, json] of [
      ['h2', 'heading'],
      ['quote', 'quote'],
      ['bullet', 'list'],
      ['paragraph', 'paragraph'],
    ] as const) {
      const before = rootChildren(editor)
      run(editor, () => $turnBlocksInto([
        keyAt(editor, 0),
      ], type))
      await flushPromises()
      expect(types(editor)).toEqual([json])
      check()
      await undo(editor)
      expect(rootChildren(editor)).toEqual(before)
      run(editor, () => $turnBlocksInto([
        keyAt(editor, 0),
      ], type))
      await flushPromises()
    }
  })

  it('lists the types a block can become, with names', () => {
    expect(TURNABLE_BLOCK_TYPES.map(item => item.type)).toEqual([
      'paragraph',
      'h1',
      'h2',
      'h3',
      'quote',
      'bullet',
      'number',
      'check',
    ])
    expect(TURNABLE_BLOCK_TYPES.every(item => item.label)).toBe(true)
  })

  it('reports the current type', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '段\n\n## 標\n\n> 引\n\n- 項\n\n1. 序\n\n- [ ] 勾\n\n***')
    const reported = editor.getEditorState().read(() => $getRoot().getChildren().map($getBlockType))
    expect(reported).toEqual([
      'paragraph',
      'h2',
      'quote',
      'bullet',
      'number',
      'check',
      null,
    ])
  })

  it('turns several blocks into one list', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二', '三')
    run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
      keyAt(editor, 1),
      keyAt(editor, 2),
    ], 'number'))
    await flushPromises()
    expect(types(editor)).toEqual(['list'])
    expect(rootChildren(editor)[0].listType).toBe('number')
    expect(find(rootChildren(editor), 'listitem').map(textOf)).toEqual(['一', '二', '三'])
  })

  it('changes a list to another kind in place', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '- 一\n- 二')
    run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
    ], 'check'))
    await flushPromises()
    expect(types(editor)).toEqual(['list'])
    expect(rootChildren(editor)[0].listType).toBe('check')
    expect(find(rootChildren(editor), 'listitem').map(textOf)).toEqual(['一', '二'])
  })

  it('flattens a list into paragraphs, nested items included, in one undo step', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '- 一\n    - 巢\n- 二\n- **三**')
    const before = rootChildren(editor)
    run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
    ], 'paragraph'))
    await flushPromises()
    expect(types(editor)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
    ])
    expect(lines(editor)).toEqual(['一', '巢', '二', '三'])
    expect(find(rootChildren(editor), 'text').at(-1)!.format).toBe(1)

    await undo(editor)
    expect(rootChildren(editor)).toEqual(before)
  })

  it('keeps the caret when the block it was in goes away', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '- 一\n- x')
    editor.update(() => {
      const list = $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>()
      const item = list.getLastChildOrThrow<ReturnType<typeof $createParagraphNode>>()
      item.clear()
      item.select()
    }, { discrete: true })
    await flushPromises()
    run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
    ], 'quote'))
    await flushPromises()
    expect(types(editor)).toEqual(['quote', 'quote'])
    expect(editor.getEditorState().read(() => $isRangeSelection($getSelection()))).toBe(true)
  })

  it.each([
    ['a table', '| a |\n| --- |'],
    ['an alert', '> [!NOTE]\n> 提示'],
    ['an image', '![cat](https://example.com/a.png)'],
    ['a code block', '```ts\nx\n```'],
  ])('refuses %s, changing nothing', async (_name, markdown) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, markdown)
    expect(editor.getEditorState().read(() => $canTurnBlock($getRoot().getFirstChildOrThrow()))).toBe(false)
    const before = rootChildren(editor)
    expect(run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
    ], 'h1'))).toBe(false)
    await flushPromises()
    expect(rootChildren(editor)).toEqual(before)
  })

  it('takes no undo step when nothing changes', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一')
    run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
    ], 'h1'))
    await flushPromises()
    expect(run(editor, () => $turnBlocksInto([
      keyAt(editor, 0),
    ], 'h1'))).toBe(false)
    await flushPromises()
    await undo(editor)
    expect(types(editor)).toEqual(['paragraph'])
  })
})

describe('dragging target', () => {
  it('moves a block after another, or to the start, in one undo step', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二', '三')
    run(editor, () => $moveBlockAfter(keyAt(editor, 0), keyAt(editor, 2)))
    await flushPromises()
    expect(lines(editor)).toEqual(['二', '三', '一'])
    await undo(editor)
    expect(lines(editor)).toEqual(['一', '二', '三'])

    run(editor, () => $moveBlockAfter(keyAt(editor, 2), null))
    await flushPromises()
    expect(lines(editor)).toEqual(['三', '一', '二'])
  })

  it('takes no step for a drop in place', async () => {
    const { editor } = mountEditor()
    await withParagraphs(editor, '一', '二')
    expect(run(editor, () => $moveBlockAfter(keyAt(editor, 1), keyAt(editor, 0)))).toBe(false)
    expect(run(editor, () => $moveBlockAfter(keyAt(editor, 0), null))).toBe(false)
    expect(run(editor, () => $moveBlockAfter(keyAt(editor, 0), keyAt(editor, 0)))).toBe(false)
    expect(lines(editor)).toEqual(['一', '二'])
  })
})

describe('toolbar slot', () => {
  it('comes before the content, and leaves no trace when unused', async () => {
    const { wrapper } = mountEditor({}, {
      toolbar: () => h('div', { class: 'test-toolbar' }, 'x'),
    })
    await flushPromises()
    const content = wrapper.find('.hlx-content').element
    const bar = wrapper.find('.test-toolbar').element
    expect(bar.compareDocumentPosition(content) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const plain = mountEditor().wrapper
    await flushPromises()
    // Nothing from the slot: the editor starts with the document's own box, and that with the content.
    const first = plain.find('.hlx-editor').element.firstElementChild
    expect(first?.classList.contains('hlx-editor-body')).toBe(true)
    expect(first?.firstElementChild?.classList.contains('hlx-content')).toBe(true)
  })
})
