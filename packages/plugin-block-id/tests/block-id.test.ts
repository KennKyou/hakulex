import type { LexicalEditor, SerializedEditorState } from 'lexical'
import {
  $deleteBlock,
  $duplicateBlocks,
  $moveBlocks,
  $turnBlocksInto,
  RichEditor,
  serializeEditorState,
} from '@hakulex/editor'
import { createDefaultRegistry, serializeToXml } from '@hakulex/litexml'
import { $createHeadingNode } from '@lexical/rich-text'
import { $setBlocksType } from '@lexical/selection'
import { $insertNodeToNearestRoot } from '@lexical/utils'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  INSERT_PARAGRAPH_COMMAND,
  PASTE_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { $getBlockById, $getBlockId, BlockIdPlugin, blockIdState, createBlockId } from '../src'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
})

const ID = /^[\w-]{8}$/

function text(value: string): Json {
  return {
    type: 'text',
    text: value,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}
function block(type: string, value: string, id?: string, more: Json = {}): Json {
  return {
    type,
    children: value
      ? [
          text(value),
        ]
      : [],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
    ...(type === 'paragraph'
      ? { textFormat: 0, textStyle: '' }
      : {}),
    ...more,
    ...(id === undefined
      ? {}
      : {
          $: { blockId: id },
        }),
  }
}
const paragraph = (value: string, id?: string) => block('paragraph', value, id)
function content(...children: Json[]) {
  return {
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as SerializedEditorState
}

async function mountEditor(options: { modelValue?: unknown, plugin?: boolean, editable?: boolean } = {}) {
  const saved: Json[] = []
  let changes = 0
  const wrapper = mount(RichEditor, {
    props: {
      'modelValue': options.modelValue,
      'editable': options.editable ?? true,
      'onUpdate:modelValue': (value: SerializedEditorState) => saved.push(JSON.parse(JSON.stringify(value))),
      'onChange': () => { changes++ },
    } as never,
    attachTo: document.body,
    slots: options.plugin === false
      ? {}
      : {
          default: () => h(BlockIdPlugin),
        },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  await flushPromises()
  return {
    wrapper,
    editor,
    saved,
    changes: () => changes,
  }
}

/** The document as it would be saved now. */
const stored = (editor: LexicalEditor) => JSON.parse(JSON.stringify(serializeEditorState(editor.getEditorState()))) as Json
const blocks = (editor: LexicalEditor) => stored(editor).root.children as Json[]
const idsOf = (children: Json[]) => children.map(child => child.$?.blockId as string | undefined)
const ids = (editor: LexicalEditor) => idsOf(blocks(editor))
const keys = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getChildrenKeys())
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')

function expectAllDistinct(list: (string | undefined)[]) {
  for (const id of list)
    expect(id).toMatch(ID)
  expect(new Set(list).size).toBe(list.length)
}

/** Puts the caret at the end of the block at `index`. */
function caretAtEnd(editor: LexicalEditor, index: number) {
  editor.update(() => {
    $getRoot().getChildAtIndex(index)!.selectEnd()
  }, { discrete: true })
}
async function type(editor: LexicalEditor, value: string) {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection))
      selection.insertText(value)
  }, { discrete: true })
  await flushPromises()
}
async function run(editor: LexicalEditor, fn: () => void) {
  editor.update(fn, { discrete: true })
  await flushPromises()
}
async function command<T>(editor: LexicalEditor, name: Parameters<LexicalEditor['dispatchCommand']>[0], payload?: T) {
  editor.dispatchCommand(name, payload as never)
  await flushPromises()
}
async function paste(editor: LexicalEditor, entries: Record<string, string>) {
  const data = new DataTransfer()
  for (const [kind, value] of Object.entries(entries))
    data.setData(kind, value)
  await command(editor, PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data, cancelable: true }))
}

const three = () => content(paragraph('一'), paragraph('二'), paragraph('三'))

describe('a document without IDs', () => {
  it('has one on every block once loaded, without counting as a change', async () => {
    const { editor, saved, changes } = await mountEditor({
      modelValue: three(),
    })

    expectAllDistinct(ids(editor))
    expect(saved).toEqual([])
    expect(changes()).toBe(0)

    // Nothing to undo: the IDs are still there afterwards.
    const before = ids(editor)
    await command(editor, UNDO_COMMAND)
    expect(ids(editor)).toEqual(before)
  })

  it('sends them out with the first edit, and undo takes back only the edit', async () => {
    const { editor, saved } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    caretAtEnd(editor, 0)
    await type(editor, '字')

    expect(saved.length).toBeGreaterThan(0)
    expect(idsOf(saved.at(-1)!.root.children)).toEqual(loaded)
    expect(textOf(saved.at(-1)!.root.children[0])).toBe('一字')

    await command(editor, UNDO_COMMAND)
    expect(blocks(editor).map(textOf)).toEqual(['一', '二', '三'])
    expect(ids(editor)).toEqual(loaded)
  })

  it('gets them when the document is swapped from outside, again without a change', async () => {
    const { editor, saved, changes, wrapper } = await mountEditor({
      modelValue: three(),
    })
    const first = ids(editor)

    await wrapper.setProps({
      modelValue: content(paragraph('甲'), paragraph('乙')),
    })
    await flushPromises()

    expect(blocks(editor).map(textOf)).toEqual(['甲', '乙'])
    expectAllDistinct(ids(editor))
    expect(ids(editor).some(id => first.includes(id))).toBe(false)
    expect(saved).toEqual([])
    expect(changes()).toBe(0)
  })
})

describe('a document that already has IDs', () => {
  it('keeps every one of them, whatever they look like and whatever the block is', async () => {
    const given = [
      'b1',
      'Abc_-123',
      'a-much-longer-id-than-eight',
      'mystery1',
    ]
    const { editor, saved } = await mountEditor({
      modelValue: content(
        paragraph('一', given[0]),
        block('heading', '二', given[1], { tag: 'h2' }),
        paragraph('三', given[2]),
        {
          type: 'mystery-block',
          version: 1,
          anything: 1,
          $: { blockId: given[3] },
        },
      ),
    })
    expect(ids(editor)).toEqual(given)

    caretAtEnd(editor, 0)
    await type(editor, '字')
    expect(idsOf(saved.at(-1)!.root.children)).toEqual(given)
    expect(saved.at(-1)!.root.children[3]).toMatchObject({ type: 'mystery-block', anything: 1 })
  })

  it('gives the later of two blocks with the same ID a new one', async () => {
    const { editor } = await mountEditor({
      modelValue: content(paragraph('一', 'same0001'), paragraph('二', 'other002'), paragraph('三', 'same0001')),
    })
    const now = ids(editor)
    expect(now.slice(0, 2)).toEqual(['same0001', 'other002'])
    expect(now[2]).not.toBe('same0001')
    expectAllDistinct(now)
  })
})

describe('new blocks', () => {
  it('get an ID in the same change as the Enter that made them, and one undo takes it back', async () => {
    const { editor, saved } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    caretAtEnd(editor, 0)
    const from = saved.length
    await command(editor, INSERT_PARAGRAPH_COMMAND)

    const now = ids(editor)
    expect(now).toHaveLength(4)
    expect([now[0], now[2], now[3]]).toEqual(loaded)
    expectAllDistinct(now)
    // Nothing went out with a block that had no ID yet.
    expect(saved.length).toBeGreaterThan(from)
    for (const value of saved.slice(from))
      expectAllDistinct(idsOf(value.root.children))
    expect(idsOf(saved.at(-1)!.root.children)).toEqual(now)

    await command(editor, UNDO_COMMAND)
    expect(ids(editor)).toEqual(loaded)
  })

  it('get one when a block is inserted, as the slash menu does', async () => {
    const { editor, saved } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    caretAtEnd(editor, 1)
    await run(editor, () => {
      $insertNodeToNearestRoot($createHeadingNode('h2').append($createTextNode('新')))
    })

    const now = ids(editor)
    expect(now.length).toBeGreaterThan(3)
    expectAllDistinct(now)
    for (const id of loaded)
      expect(now).toContain(id)
    expect(idsOf(saved.at(-1)!.root.children)).toEqual(now)
  })

  it('each get their own when several are pasted at once', async () => {
    const { editor, saved } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    caretAtEnd(editor, 2)
    const from = saved.length
    await paste(editor, { 'text/plain': '四\n\n五\n\n六' })

    const now = ids(editor)
    expect(now.length).toBeGreaterThanOrEqual(5)
    expect(now.slice(0, 3)).toEqual(loaded)
    expectAllDistinct(now)
    for (const value of saved.slice(from))
      expectAllDistinct(idsOf(value.root.children))

    await command(editor, UNDO_COMMAND)
    expect(ids(editor)).toEqual(loaded)
  })
})

describe('copies', () => {
  it('a duplicated block gets a new ID and the original keeps its own', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    await run(editor, () => {
      $duplicateBlocks([keys(editor)[0]])
    })

    const now = ids(editor)
    expect(now).toHaveLength(4)
    expect(now[0]).toBe(loaded[0])
    expect(blocks(editor).map(textOf)).toEqual(['一', '一', '二', '三'])
    expectAllDistinct(now)
  })

  it('blocks pasted with the IDs they were copied with do not keep them', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor) as string[]
    expectAllDistinct(loaded)

    caretAtEnd(editor, 2)
    await run(editor, () => {
      $getSelection()!.insertNodes([
        $createParagraphNode(),
      ])
    })
    const withEmpty = ids(editor)
    await paste(editor, {
      'application/x-lexical-editor': JSON.stringify({
        namespace: (editor as unknown as { _config: { namespace: string } })._config.namespace,
        nodes: [
          paragraph('一', loaded[0]),
          paragraph('二', loaded[1]),
        ],
      }),
    })

    const now = ids(editor)
    expect(blocks(editor).map(textOf).filter(value => value === '一')).toHaveLength(2)
    expect(now.slice(0, 3)).toEqual(loaded)
    expect(now.length).toBeGreaterThanOrEqual(withEmpty.length)
    expectAllDistinct(now)
  })
})

describe('a block replaced where it stands', () => {
  it('keeps its ID when a paragraph is turned into a heading', async () => {
    const { editor, saved } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    await run(editor, () => {
      $turnBlocksInto([keys(editor)[1]], 'h1')
    })

    expect(blocks(editor).map(node => node.type)).toEqual(['paragraph', 'heading', 'paragraph'])
    expect(ids(editor)).toEqual(loaded)
    expect(idsOf(saved.at(-1)!.root.children)).toEqual(loaded)
  })

  it('keeps it when the slash menu changes the block the caret is in', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    caretAtEnd(editor, 0)
    await run(editor, () => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        $setBlocksType(selection, () => $createHeadingNode('h2'))
    })

    expect(blocks(editor)[0].type).toBe('heading')
    expect(ids(editor)).toEqual(loaded)
  })

  it('keeps it when another block is put in its place', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    await run(editor, () => {
      $getRoot().getChildAtIndex(1)!.replace($createHeadingNode('h3').append($createTextNode('換')))
    })

    expect(blocks(editor).map(textOf)).toEqual(['一', '換', '三'])
    expect(ids(editor)).toEqual(loaded)
  })

  it('keeps it when that block is the whole document', async () => {
    const { editor } = await mountEditor({
      modelValue: content(paragraph('只有一段')),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    await run(editor, () => {
      $turnBlocksInto([keys(editor)[0]], 'h1')
    })
    expect(blocks(editor)[0].type).toBe('heading')
    expect(ids(editor)).toEqual(loaded)
  })

  it('keeps it when that block is the whole document and is empty', async () => {
    const { editor } = await mountEditor({
      modelValue: content(paragraph('')),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    await run(editor, () => {
      $turnBlocksInto([keys(editor)[0]], 'h1')
    })
    expect(blocks(editor)[0].type).toBe('heading')
    expect(ids(editor)).toEqual(loaded)
  })

  it('does not hand the ID of a removed block to a new one somewhere else', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const loaded = ids(editor)
    expectAllDistinct(loaded)

    await run(editor, () => {
      $getRoot().getChildAtIndex(0)!.remove()
      $getRoot().append($createParagraphNode().append($createTextNode('尾')))
    })

    const now = ids(editor)
    expect(now.slice(0, 2)).toEqual(loaded.slice(1))
    expect(now[2]).not.toBe(loaded[0])
    expectAllDistinct(now)
  })
})

describe('editing, moving, undo and redo', () => {
  it('leave the IDs as they are', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const [a, b, c] = ids(editor)
    expectAllDistinct([a, b, c])

    caretAtEnd(editor, 1)
    await type(editor, '改')
    expect(ids(editor)).toEqual([a, b, c])

    await run(editor, () => {
      $moveBlocks([keys(editor)[2]], 'up')
    })
    expect(blocks(editor).map(textOf)).toEqual(['一', '三', '二改'])
    expect(ids(editor)).toEqual([a, c, b])

    await run(editor, () => {
      $deleteBlock(keys(editor)[0])
    })
    expect(ids(editor)).toEqual([c, b])

    await command(editor, UNDO_COMMAND)
    expect(ids(editor)).toEqual([a, c, b])

    await command(editor, REDO_COMMAND)
    expect(ids(editor)).toEqual([c, b])
  })
})

describe('where it does not write', () => {
  it('an editor without the plugin leaves documents as they are', async () => {
    const bare = await mountEditor({
      modelValue: three(),
      plugin: false,
    })
    caretAtEnd(bare.editor, 0)
    await type(bare.editor, '字')
    await command(bare.editor, INSERT_PARAGRAPH_COMMAND)
    expect(JSON.stringify(bare.saved.at(-1))).not.toContain('blockId')
    document.body.innerHTML = ''

    const given = ['keep0001', 'keep0002']
    const kept = await mountEditor({
      modelValue: content(paragraph('一', given[0]), paragraph('二', given[1])),
      plugin: false,
    })
    caretAtEnd(kept.editor, 1)
    await command(kept.editor, INSERT_PARAGRAPH_COMMAND)
    await type(kept.editor, '新')
    const out = kept.saved.at(-1)!.root.children as Json[]
    expect(idsOf(out).slice(0, 2)).toEqual(given)
    expect(out.find(node => textOf(node) === '新')?.$?.blockId).toBeUndefined()
  })

  it('a read-only editor is left alone until it can be edited', async () => {
    const { editor, saved, changes, wrapper } = await mountEditor({
      modelValue: three(),
      editable: false,
    })

    expect(ids(editor)).toEqual([undefined, undefined, undefined])
    expect(saved).toEqual([])
    expect(changes()).toBe(0)

    await wrapper.setProps({ editable: true })
    await flushPromises()
    expectAllDistinct(ids(editor))
    expect(saved).toEqual([])
  })

  it('only the top-level blocks of the outer document get one', async () => {
    const inner = () => content(paragraph('裡面'))
    const list = {
      type: 'list',
      listType: 'bullet',
      start: 1,
      tag: 'ul',
      direction: null,
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          ...block('listitem', '項目', undefined, { value: 1 }),
        },
      ],
    }
    const { editor, saved } = await mountEditor({
      modelValue: content(
        paragraph('外面'),
        list,
        block('quote', '引用'),
        {
          type: 'nested-doc',
          version: 1,
          content: inner(),
        },
        {
          type: 'grid-container',
          version: 1,
          cols: 2,
          gap: '16px',
          cells: [
            inner(),
            inner(),
          ],
        },
        {
          type: 'steps',
          version: 1,
          steps: [
            {
              id: 's_one',
              title: '第一步',
              content: inner(),
            },
          ],
        },
      ),
    })
    expectAllDistinct(ids(editor))

    // Type in the outer document and in each editor nested in it that is on the page.
    caretAtEnd(editor, 0)
    await type(editor, '字')
    const nestedRoots = [
      ...document.querySelectorAll<HTMLElement>('[contenteditable]'),
    ]
      .map(element => (element as unknown as { __lexicalEditor?: LexicalEditor }).__lexicalEditor)
      .filter((nested): nested is LexicalEditor => !!nested && nested !== editor)
    expect(nestedRoots.length).toBeGreaterThanOrEqual(4)
    for (const nested of nestedRoots) {
      nested.update(() => {
        $getRoot().getFirstChild()!.selectEnd().insertText('字')
      }, { discrete: true })
    }
    await flushPromises()

    const out = saved.at(-1)!
    const top = out.root.children as Json[]
    expectAllDistinct(idsOf(top))
    const within = top.map(({ $: _state, ...rest }) => rest)
    expect(JSON.stringify(within)).not.toContain('blockId')
  })
})

describe('reading the IDs', () => {
  it('the element of each top-level block says its ID, new ones too', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const root = editor.getRootElement()!
    const onPage = () => [...root.children].map(element => element.getAttribute('data-block-id'))

    expect(onPage()).toEqual(ids(editor))

    caretAtEnd(editor, 0)
    await command(editor, INSERT_PARAGRAPH_COMMAND)
    expect(onPage()).toHaveLength(4)
    expect(onPage()).toEqual(ids(editor))

    await run(editor, () => {
      $turnBlocksInto([keys(editor)[2]], 'h1')
    })
    expect(onPage()).toEqual(ids(editor))
  })

  it('the package gives the plugin and the ways to read and make an ID', async () => {
    expect(Object.keys((BlockIdPlugin as unknown as { props?: object }).props ?? {})).toEqual([])
    expect(blockIdState.key).toBe('blockId')

    const made = Array.from({ length: 200 }, createBlockId)
    expectAllDistinct(made)

    const { editor } = await mountEditor({
      modelValue: content(paragraph('一', 'known001'), paragraph('二', 'known002')),
    })
    editor.getEditorState().read(() => {
      const [first, second] = $getRoot().getChildren()
      expect($getBlockId(first)).toBe('known001')
      expect($getBlockById('known002')?.getKey()).toBe(second.getKey())
      expect($getBlockById('nothere')).toBeNull()
      expect($getBlockById('')).toBeNull()
      expect($getBlockId(first.getFirstChild()!)).toBe('')
    })
  })

  it('go into LiteXML as the id of each block', async () => {
    const { editor } = await mountEditor({
      modelValue: three(),
    })
    const xml = serializeToXml(stored(editor) as never, createDefaultRegistry())
    for (const id of ids(editor))
      expect(xml).toContain(`id="${id}"`)
  })
})
