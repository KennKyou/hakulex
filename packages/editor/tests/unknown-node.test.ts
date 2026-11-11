import type { ElementNode, LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  DecoratorNode,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  $canTurnBlock,
  $deleteBlock,
  $duplicateBlocks,
  $moveBlocks,
  builtinTransformers,
  RichEditor,
  serializeEditorState,
} from '../src'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
})

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
function doc(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}

// The shapes stored documents have.
const poll = {
  type: 'excalidraw',
  version: 1,
  poll: [
    { id: 'a', title: '第一步', content: '<b>內容</b>' },
  ],
}
const chip = {
  type: 'chip',
  version: 1,
  platform: 'github',
  handle: 'octocat',
  displayName: 'Octocat',
}
const tag = {
  ...text('標籤'),
  type: 'badge',
}
const richQuote = {
  ...element,
  type: 'pull-quote',
  attribution: '某人',
  children: [
    paragraph(text('引文')),
  ],
}
const card = {
  type: 'container-x',
  version: 1,
  cols: 2,
  gap: 8,
  cells: [
    doc(paragraph(text('左'))),
    doc(paragraph(text('右'))),
  ],
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

async function mountEditor(modelValue: unknown, props: Record<string, unknown> = {}) {
  const updates: SerializedEditorState[] = []
  const wrapper = mount(RichEditor, {
    props: {
      'modelValue': clone(modelValue),
      'onUpdate:modelValue': (value: SerializedEditorState | null | undefined) => {
        if (value)
          updates.push(value)
      },
      ...props,
    } as never,
    attachTo: document.body,
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  // Edits made before the first state lands would be merged into it.
  await flushPromises()
  return { wrapper, editor, updates }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const dom = (editor: LexicalEditor) => editor.getRootElement()!
function placeholders(editor: LexicalEditor) {
  return [
    ...dom(editor).querySelectorAll<HTMLElement>('[data-unknown-type]'),
  ]
}

function append(editor: LexicalEditor, value: string) {
  editor.update(() => {
    $getRoot().getLastChildOrThrow<ElementNode>().append($createTextNode(value))
  }, { discrete: true })
}

function keyOfBlock(editor: LexicalEditor, index: number) {
  return editor.getEditorState().read(() => $getRoot().getChildren()[index].getKey())
}

describe('loading', () => {
  it('opens a document with node types it does not have', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前')), poll, card, richQuote, paragraph(text('後'))))
    expect(dom(editor).textContent).toContain('前')
    expect(dom(editor).textContent).toContain('後')
    expect(rootChildren(editor).map(node => node.type)).toEqual([
      'paragraph',
      'hlx-unknown-block',
      'hlx-unknown-block',
      'hlx-unknown-block',
      'paragraph',
    ])
  })

  it('makes them inline inside text and blocks where blocks go', async () => {
    const cell = {
      ...element,
      type: 'tablecell',
      colSpan: 1,
      rowSpan: 1,
      headerState: 0,
      children: [poll],
    }
    const table = {
      ...element,
      type: 'table',
      children: [
        {
          ...element,
          type: 'tablerow',
          children: [cell],
        },
      ],
    }
    const alert = {
      ...element,
      type: 'alert-quote',
      alertType: 'note',
      children: [poll],
    }
    const banner = {
      ...element,
      type: 'banner',
      bannerType: 'info',
      children: [poll],
    }
    const details = {
      ...element,
      type: 'details',
      summary: '摘要',
      open: true,
      children: [poll],
    }
    const { editor } = await mountEditor(doc(paragraph(chip, text('字'), tag), alert, banner, details, table))
    const [line, alertNode, bannerNode, detailsNode, tableNode] = rootChildren(editor)
    expect(line.children.map((node: Json) => node.type)).toEqual(['hlx-unknown-inline', 'text', 'hlx-unknown-inline'])
    expect(alertNode.children[0].type).toBe('hlx-unknown-block')
    expect(bannerNode.children[0].type).toBe('hlx-unknown-block')
    expect(detailsNode.children[0].type).toBe('hlx-unknown-block')
    expect(tableNode.children[0].children[0].children[0].type).toBe('hlx-unknown-block')
  })

  it('takes a new document from outside', async () => {
    const { wrapper, editor } = await mountEditor(doc(paragraph(text('舊'))))
    await wrapper.setProps({
      modelValue: doc(paragraph(text('新')), poll),
    } as never)
    await flushPromises()
    expect(dom(editor).textContent).toContain('新')
    expect(placeholders(editor).map(node => node.dataset.unknownType)).toEqual(['excalidraw'])
  })

  it('leaves nodes it was given alone', async () => {
    class CustomNode extends DecoratorNode<null> {
      static getType() {
        return 'custom-thing'
      }

      static clone(node: CustomNode) {
        return new CustomNode(node.__key)
      }

      static importJSON() {
        return new CustomNode()
      }

      createDOM() {
        return document.createElement('div')
      }

      updateDOM() {
        return false as const
      }

      decorate() {
        return null
      }

      isInline() {
        return false as const
      }
    }
    const { editor } = await mountEditor(doc({ type: 'custom-thing', version: 1 }), {
      nodes: [CustomNode],
    })
    expect(rootChildren(editor)[0].type).toBe('custom-thing')
  })

  it.each([
    [
      'no type',
      { version: 1, a: 1 },
    ],
    [
      'a number',
      { type: 3 },
    ],
    [
      '__proto__',
      JSON.parse('{"type":"__proto__","a":1}'),
    ],
    [
      'constructor',
      { type: 'constructor' },
    ],
  ])('keeps a node whose type is %s', async (_name, node) => {
    const { editor, updates } = await mountEditor(doc(node, paragraph()))
    expect(rootChildren(editor)[0].type).toBe('hlx-unknown-block')
    append(editor, '字')
    await flushPromises()
    expect(updates.at(-1)!.root.children[0]).toEqual(node)
  })
})

describe('writing back', () => {
  it('gives back exactly what it read, after editing elsewhere', async () => {
    const source = doc(poll, paragraph(tag, text('字'), chip), richQuote, card, paragraph())
    const { editor, updates } = await mountEditor(source)
    append(editor, '新')
    await flushPromises()
    const children = updates.at(-1)!.root.children as Json[]
    expect(children[0]).toEqual(poll)
    expect(children[1].children[0]).toEqual(tag)
    expect(children[1].children[2]).toEqual(chip)
    expect(children[2]).toEqual(richQuote)
    expect(children[3]).toEqual(card)
    expect(JSON.stringify(updates.at(-1))).not.toContain('hlx-unknown')
  })

  it('does not hand out its own copy', async () => {
    const { editor, updates } = await mountEditor(doc(poll, paragraph()))
    append(editor, '一')
    await flushPromises()
    ;(updates.at(-1)!.root.children[0] as Json).poll[0].title = '改掉'
    append(editor, '二')
    await flushPromises()
    expect(updates.at(-1)!.root.children[0]).toEqual(poll)
  })

  it('stays quiet until something is edited', async () => {
    const { editor, updates } = await mountEditor(doc(poll, paragraph(text('字'))))
    editor.update(() => {
      $getRoot().getLastChildOrThrow<any>().selectEnd()
    }, { discrete: true })
    await flushPromises()
    expect(updates).toEqual([])
  })

  it('serializes a state for whoever uses the change event', async () => {
    const onChange = vi.fn()
    const { editor, updates } = await mountEditor(doc(poll, paragraph()), { onChange })
    append(editor, '字')
    await flushPromises()
    const state = onChange.mock.calls.at(-1)![0]
    expect(serializeEditorState(state)).toEqual(updates.at(-1))
    expect(state.toJSON().root.children[0].type).toBe('hlx-unknown-block')
  })

  it('becomes the real node once the type is registered', async () => {
    const wrapped = {
      type: 'hlx-unknown-block',
      version: 1,
      raw: paragraph(text('甲')),
    }
    const inlineWrapped = {
      type: 'hlx-unknown-inline',
      version: 1,
      raw: text('乙'),
    }
    const { editor } = await mountEditor(doc(wrapped, paragraph(inlineWrapped)))
    const [first, second] = rootChildren(editor)
    expect(first.type).toBe('paragraph')
    expect(second.children[0].type).toBe('text')
  })

  it('does not wrap what is already wrapped', async () => {
    const stored = { type: 'hlx-unknown-block', version: 1, raw: poll }
    const { editor, updates } = await mountEditor(doc(stored, paragraph()))
    expect(rootChildren(editor)[0].raw).toEqual(poll)
    append(editor, '字')
    await flushPromises()
    expect(updates.at(-1)!.root.children[0]).toEqual(poll)
  })

  it.each([
    [
      'null',
      {
        type: 'hlx-unknown-block',
        version: 1,
        raw: null,
        extra: 1,
      },
    ],
    [
      'text',
      { type: 'hlx-unknown-block', version: 1, raw: 'poll' },
    ],
    [
      'missing',
      { type: 'hlx-unknown-block', version: 1 },
    ],
    [
      'a list',
      {
        type: 'hlx-unknown-block',
        version: 1,
        raw: [poll],
      },
    ],
    [
      'a wrapper',
      {
        type: 'hlx-unknown-block',
        version: 1,
        raw: { type: 'hlx-unknown-inline', raw: poll },
      },
    ],
  ])('keeps a wrapper whose raw is %s', async (_name, stored) => {
    const { editor, updates } = await mountEditor(doc(stored, paragraph()))
    expect(placeholders(editor)).toHaveLength(1)
    append(editor, '字')
    await flushPromises()
    expect(updates.at(-1)!.root.children[0]).toEqual(stored)
  })
})

describe('block placeholder', () => {
  it('shows the type as text, and nothing it holds', async () => {
    const hostile = { type: '<img src=x onerror=alert(1)>', html: '<script>bad()</script>', text: '<b>字</b>' }
    const { editor } = await mountEditor(doc(hostile, poll))
    const [first, second] = placeholders(editor)
    expect(first.textContent).toContain('<img src=x onerror=alert(1)>')
    expect(first.querySelector('img,script,b')).toBeNull()
    expect(second.textContent).toContain('excalidraw')
    expect(second.textContent).not.toContain('第一步')
  })

  it('selects on click, and takes Up / Down to it and past it', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('上')), poll, paragraph(text('下'))))
    placeholders(editor)[0].click()
    await flushPromises()
    const isSelected = () => editor.getEditorState().read(() => {
      const selection = $getSelection()
      return $isNodeSelection(selection) && selection.getNodes()[0]?.getType() === 'hlx-unknown-block'
    })
    expect(isSelected()).toBe(true)
    editor.update(() => {
      editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, null as never)
    }, { discrete: true })
    expect(isSelected()).toBe(false)
    editor.update(() => {
      $getRoot().getFirstChildOrThrow<any>().selectEnd()
      editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, null as never)
    }, { discrete: true })
    expect(isSelected()).toBe(true)
  })

  it('gets a line to go to at either end of the document', async () => {
    const { editor } = await mountEditor(doc(poll))
    placeholders(editor)[0].click()
    editor.update(() => {
      editor.dispatchCommand(KEY_ARROW_UP_COMMAND, null as never)
    }, { discrete: true })
    expect(rootChildren(editor).at(0)!.type).toBe('paragraph')
  })

  it('deletes, and undo brings it back as it was', async () => {
    const { editor, updates } = await mountEditor(doc(paragraph(text('上')), poll, paragraph(text('下'))))
    const key = keyOfBlock(editor, 1)
    editor.update(() => {
      $deleteBlock(key)
    }, { discrete: true })
    await flushPromises()
    expect(updates.at(-1)!.root.children.map(node => node.type)).toEqual(['paragraph', 'paragraph'])
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(updates.at(-1)!.root.children[1]).toEqual(poll)
  })

  it('moves and copies, and copies do not share data', async () => {
    const { editor, updates } = await mountEditor(doc(poll, paragraph(text('字'))))
    const key = keyOfBlock(editor, 0)
    editor.update(() => {
      $moveBlocks([key], 'down')
    }, { discrete: true })
    await flushPromises()
    expect(updates.at(-1)!.root.children[1]).toEqual(poll)
    editor.update(() => {
      $duplicateBlocks([key])
    }, { discrete: true })
    await flushPromises()
    const children = updates.at(-1)!.root.children as Json[]
    expect(children[1]).toEqual(poll)
    expect(children[2]).toEqual(poll)
    expect(children[2]).not.toBe(children[1])
  })

  it('can not be turned into something else', async () => {
    const { editor } = await mountEditor(doc(poll))
    editor.getEditorState().read(() => {
      expect($canTurnBlock($getRoot().getFirstChildOrThrow())).toBe(false)
    })
  })

  it('is not selected when read only', async () => {
    const { editor } = await mountEditor(doc(poll, paragraph()), { editable: false })
    placeholders(editor)[0].click()
    await flushPromises()
    expect(placeholders(editor)[0].dataset.selected).toBeUndefined()
    expect(editor.getEditorState().read(() => $isNodeSelection($getSelection()))).toBe(false)
  })
})

describe('inline placeholder', () => {
  it('shows its text, or the type if it has none', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), tag, text('中'), chip, text('後'))))
    const [first, second] = placeholders(editor)
    expect(first.textContent).toBe('標籤')
    expect(second.textContent).toBe('chip')
    expect(dom(editor).querySelector('p')!.contains(first)).toBe(true)
  })

  it('undoes being removed', async () => {
    const { editor, updates } = await mountEditor(doc(paragraph(text('前'), chip, text('後'))))
    editor.update(() => {
      $getRoot().getFirstChildOrThrow<any>().getChildren()[1].remove()
    }, { discrete: true })
    await flushPromises()
    expect((updates.at(-1)!.root.children[0] as Json).children).toHaveLength(1)
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect((updates.at(-1)!.root.children[0] as Json).children[1]).toEqual(chip)
  })
})

describe('exporting', () => {
  it('leaves placeholders out of HTML', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), tag, chip, text('後')), poll))
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
    expect(html).toContain('前')
    expect(html).toContain('後')
    for (const word of [
      '標籤',
      'chip',
      'octocat',
      'excalidraw',
      '第一步',
      'hlx-unknown',
    ])
      expect(html).not.toContain(word)
  })

  it('gives markdown the inline text and nothing else', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前'), tag, chip, text('後')), poll, paragraph(text('尾'))))
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown).toContain('前標籤後')
    expect(markdown).toContain('尾')
    for (const word of ['chip', 'octocat', 'excalidraw', '第一步'])
      expect(markdown).not.toContain(word)
  })
})
