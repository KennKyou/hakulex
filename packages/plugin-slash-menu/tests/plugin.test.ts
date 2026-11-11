import type { ElementNode, LexicalEditor } from 'lexical'
import type { SlashMenuItem } from '../src'
import { $isHorizontalRuleNode, RichEditor } from '@hakulex/editor'
import { $isListNode } from '@lexical/list'
import { $isHeadingNode } from '@lexical/rich-text'
import { $computeTableMapSkipCellCheck, $createTableNodeWithDimensions, $isTableNode } from '@lexical/table'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { builtinSlashItems, SlashMenuPlugin } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

function mountWithMenu(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    attachTo: document.body,
    slots: {
      default: () => h(SlashMenuPlugin, props),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.getRootElement()!.focus()
  return { wrapper, editor }
}

/** Puts `text` in a single paragraph with the caret at its end. */
async function setText(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
  await flushPromises()
}

function press(editor: LexicalEditor, command: typeof KEY_ENTER_COMMAND) {
  return editor.dispatchCommand(command, new KeyboardEvent('keydown'))
}

const menu = () => document.querySelector('.hlx-slash-menu')
function options() {
  return [
    ...document.querySelectorAll('.hlx-slash-item'),
  ]
}
const titles = () => options().map(option => option.querySelector('.hlx-slash-title')!.textContent)
const activeTitle = () => document.querySelector('.hlx-slash-item[aria-selected="true"] .hlx-slash-title')?.textContent

describe('slashMenuPlugin', () => {
  it('opens on "/" and filters by query', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/')
    expect(options()).toHaveLength(builtinSlashItems.length)

    await setText(editor, '/h2')
    expect(titles()).toEqual(['標題 2'])
  })

  it('stays closed for a slash inside a word', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, 'and/or')
    expect(menu()).toBeNull()
  })

  it('applies the active item with Enter and removes the trigger text', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, 'Intro /h1')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild()
      expect($isHeadingNode(first) && first.getTag()).toBe('h1')
      expect(first?.getTextContent()).toBe('Intro ')
    })
    expect(menu()).toBeNull()
  })

  it('moves the highlight with arrow keys and mirrors it in aria-activedescendant', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/list')
    expect(activeTitle()).toBe('項目清單')

    press(editor, KEY_ARROW_DOWN_COMMAND)
    await flushPromises()
    expect(activeTitle()).toBe('編號清單')

    const active = document.querySelector('.hlx-slash-item[aria-selected="true"]')!
    expect(editor.getRootElement()!.getAttribute('aria-activedescendant')).toBe(active.id)

    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    editor.getEditorState().read(() => {
      const first = $getRoot().getFirstChild()
      expect($isListNode(first) && first.getListType()).toBe('number')
    })
    expect(editor.getRootElement()!.hasAttribute('aria-activedescendant')).toBe(false)
  })

  it('escape closes the menu until the trigger is gone', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/he')
    press(editor, KEY_ESCAPE_COMMAND)
    await flushPromises()
    expect(menu()).toBeNull()

    // Typing on keeps it closed: same trigger.
    editor.update(() => {
      $getRoot().getFirstDescendant()!.selectEnd().insertText('a')
    }, { discrete: true })
    await flushPromises()
    expect(menu()).toBeNull()

    // A fresh trigger opens again.
    await setText(editor, 'x')
    await setText(editor, '/')
    expect(menu()).not.toBeNull()
  })

  it('accepts custom items and emits select', async () => {
    const run = vi.fn()
    const custom: SlashMenuItem = {
      key: 'hello',
      title: 'Say hello',
      keywords: ['greet'],
      run,
    }
    const onSelect = vi.fn()
    const { editor } = mountWithMenu({
      items: [...builtinSlashItems, custom],
      onSelect,
    })

    await setText(editor, '/greet')
    expect(titles()).toEqual(['Say hello'])
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    expect(run).toHaveBeenCalledWith(editor)
    expect(onSelect).toHaveBeenCalledWith(custom)
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('')
  })

  it('inserts a divider in place of the empty line', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/hr')
    expect(titles()).toEqual(['分隔線'])
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    editor.getEditorState().read(() => {
      const children = $getRoot().getChildren()
      expect(children.map(node => node.getType())).toEqual(['horizontalrule', 'paragraph'])
      expect($isHorizontalRuleNode(children[0])).toBe(true)
    })
  })

  it.each([
    ['/image'],
    ['/圖片'],
  ])('opens the image dialog from %s and removes the query', async (query) => {
    const { editor } = mountWithMenu()
    await setText(editor, query)
    expect(titles()).toEqual(['圖片'])
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    expect(document.querySelector('.hlx-image-dialog')).not.toBeNull()
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toBe('')
  })

  it.each([
    ['/table'],
    ['/表格'],
  ])('inserts a table with a header row from %s and removes the query', async (query) => {
    const { editor } = mountWithMenu()
    await setText(editor, query)
    expect(titles()).toEqual(['表格'])
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    editor.getEditorState().read(() => {
      const table = $getRoot().getChildren().find($isTableNode)!
      expect(table).toBeDefined()
      expect(table.getChildrenSize()).toBe(3)
      const [map] = $computeTableMapSkipCellCheck(table, null, null)
      expect(map[0]).toHaveLength(3)
      expect(map[0].every(({ cell }) => cell.hasHeader())).toBe(true)
      expect(map[1].some(({ cell }) => cell.hasHeader())).toBe(false)
      expect($getRoot().getTextContent()).not.toContain('/')
    })
  })

  it('undoes the table in one step', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/table')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(editor.getEditorState().read(() => $getRoot().getChildren().some($isTableNode))).toBe(false)
  })

  it.each([
    ['/alert', '提示', 'alert-quote'],
    ['/提示', '提示', 'alert-quote'],
    ['/banner', '橫幅', 'banner'],
    ['/橫幅', '橫幅', 'banner'],
    ['/details', '摺疊區塊', 'details'],
    ['/摺疊', '摺疊區塊', 'details'],
  ])('inserts from %s, removes the query, and undoes in one step', async (query, title, type) => {
    const { editor } = mountWithMenu()
    await setText(editor, query)
    expect(titles()).toEqual([title])
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    editor.getEditorState().read(() => {
      expect($getRoot().getChildren().map(node => node.getType())).toEqual([type])
      expect($getRoot().getTextContent()).toBe('')
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getParent()?.getType()).toBe(type)
    })

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(editor.getEditorState().read(() => $getRoot().getChildren().some(node => node.getType() === type))).toBe(false)
  })

  it('stays in the cell when inserting a block inside a table', async () => {
    const { editor } = mountWithMenu()
    editor.update(() => {
      const table = $createTableNodeWithDimensions(2, 2, { rows: true, columns: false })
      $getRoot().clear().append(table)
      const [map] = $computeTableMapSkipCellCheck(table, null, null)
      map[1][1].cell.getFirstChildOrThrow<ElementNode>().append($createTextNode('/alert')).selectEnd()
    }, { discrete: true })
    await flushPromises()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    editor.getEditorState().read(() => {
      const table = $getRoot().getChildren().find($isTableNode)!
      expect(table.getChildrenSize()).toBe(2)
      const [map] = $computeTableMapSkipCellCheck(table, null, null)
      expect(map[1]).toHaveLength(2)
      expect(map[1][1].cell.getChildren().map(node => node.getType())).toContain('alert-quote')
    })
  })

  it('nests a block inside another block', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/banner')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText('/details')
    }, { discrete: true })
    await flushPromises()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()

    editor.getEditorState().read(() => {
      const [banner] = $getRoot().getChildren() as ElementNode[]
      expect(banner.getType()).toBe('banner')
      expect(banner.getChildren().map(node => node.getType())).toContain('details')
    })
  })

  it.each(['/dynamic', '/動態'])('adds a dynamic block from %s, with its panel open', async (query) => {
    const { editor } = mountWithMenu()
    await setText(editor, query)
    expect(titles()).toContain('動態元件')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(editor.getEditorState().read(() => $getRoot().getChildren().map(node => node.getType()))).toContain('dynamic')
    expect(document.querySelector('.hlx-block-panel[aria-label="動態元件"]')).not.toBeNull()
  })

  it('leaves Enter to the editor while closed', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, 'plain')
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(editor.getEditorState().read(() => $getRoot().getChildrenSize())).toBe(2)
  })
})

describe('footnote item', () => {
  const inputs = () => [
    ...document.querySelectorAll<HTMLInputElement>('.hlx-footnote-input'),
  ]
  const references = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent())
  const paragraphText = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getFirstChild()?.getTextContent())

  async function insertFootnote(editor: LexicalEditor, before = '') {
    await setText(editor, `${before}/footnote`)
    await flushPromises()
    expect(document.querySelector('.hlx-slash-menu')).not.toBeNull()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
  }

  it('inserts a reference, removes the trigger, and focuses the new content', async () => {
    const { editor } = mountWithMenu()
    await insertFootnote(editor, '前 ')
    expect(paragraphText(editor)).toBe('前 [^1]')
    expect(inputs()).toHaveLength(1)
    expect(document.activeElement).toBe(inputs()[0])
  })

  it('finds it by the Chinese name too', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/註腳')
    await flushPromises()
    expect(document.querySelectorAll('.hlx-slash-menu [role="option"]')).toHaveLength(1)
  })

  it('returns the caret after the reference on Enter, with typing continuing there', async () => {
    const { editor } = mountWithMenu()
    await insertFootnote(editor, '前 ')
    const [input] = inputs()
    input.value = '內容'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(inputs()[0].value).toBe('內容')
    expect(document.activeElement).toBe(editor.getRootElement())

    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText('後')
    }, { discrete: true })
    await flushPromises()
    expect(paragraphText(editor)).toBe('前 [^1]後')
  })

  it('undoes in one step to before the trigger was typed', async () => {
    const { editor } = mountWithMenu()
    await insertFootnote(editor, '前 ')
    const [input] = inputs()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(references(editor)).toBe('前 ')
    expect(inputs()).toHaveLength(0)
    expect(document.querySelector('.hlx-footnote-ref')).toBeNull()
  })

  it('does not open in inline code', async () => {
    const { editor } = mountWithMenu()
    editor.update(() => {
      const node = $createTextNode('/footnote').toggleFormat('code')
      $getRoot().clear().append($createParagraphNode().append(node))
      node.selectEnd()
    }, { discrete: true })
    await flushPromises()
    expect(document.querySelector('.hlx-slash-menu')).toBeNull()
  })

  it('is not reachable from a note input', async () => {
    const { editor } = mountWithMenu()
    await insertFootnote(editor)
    const [input] = inputs()
    input.value = '/footnote'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flushPromises()
    expect(document.querySelector('.hlx-slash-menu')).toBeNull()
    expect(document.querySelectorAll('.hlx-footnote-ref')).toHaveLength(1)
  })
})

describe('media items', () => {
  const dialog = () => document.querySelector<HTMLElement>('.hlx-media-dialog')
  const paragraph = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getFirstChild()?.getTextContent())

  it.each([
    ['/video', '影片'],
    ['/file', '檔案'],
    ['/影片', '影片'],
    ['/附件', '檔案'],
  ])('%s opens the %s dialog, removing the trigger', async (trigger, noun) => {
    const { editor } = mountWithMenu()
    await setText(editor, trigger)
    await flushPromises()
    expect(document.querySelector('.hlx-slash-menu')).not.toBeNull()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
    expect(dialog()?.textContent).toContain(`插入${noun}`)
    expect(paragraph(editor)).toBe('')
  })
})

describe('tag and comment items', () => {
  const line = (editor: LexicalEditor) => (editor.getEditorState().toJSON().root.children[0] as unknown as { children: { type: string, text: string }[] }).children

  async function insert(editor: LexicalEditor, query: string, before = '前 ') {
    await setText(editor, `${before}${query}`)
    await flushPromises()
    expect(document.querySelector('.hlx-slash-menu')).not.toBeNull()
    press(editor, KEY_ENTER_COMMAND)
    await flushPromises()
  }

  it.each([
    ['/tag', 'tag', '標籤'],
    ['/標籤', 'tag', '標籤'],
    ['/comment', 'comment', '註解'],
    ['/註解', 'comment', '註解'],
  ])('%s inserts it with its text selected, leaving no trigger', async (query, type, value) => {
    const { editor } = mountWithMenu()
    await insert(editor, query)
    expect(line(editor).map(node => [node.type, node.text])).toEqual([
      ['text', '前 '],
      [type, value],
    ])
    editor.getEditorState().read(() => {
      expect($getSelection()?.getTextContent()).toBe(value)
    })
  })

  it.each(['/tag', '/comment'])('%s lets typing replace the text', async (query) => {
    const { editor } = mountWithMenu()
    await insert(editor, query)
    const type = line(editor)[1].type
    editor.dispatchCommand(CONTROLLED_TEXT_INSERTION_COMMAND, '新')
    await flushPromises()
    expect(line(editor).map(node => [node.type, node.text])).toEqual([
      ['text', '前 '],
      [type, '新'],
    ])
  })

  it.each(['/tag', '/comment'])('%s goes away with one undo', async (query) => {
    const { editor } = mountWithMenu()
    await insert(editor, query)
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(line(editor).map(node => node.type)).toEqual(['text'])
    expect(line(editor)[0].text).toBe('前 ')
  })
})

describe('inside a step', () => {
  const content = (...children: unknown[]) => ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  })
  const paragraph = () => ({
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children: [],
  })

  async function mountNested() {
    const wrapper = mount(RichEditor, {
      props: {
        modelValue: content(paragraph(), {
          type: 'steps',
          version: 1,
          steps: [
            {
              id: 'a',
              title: '甲',
              content: content(paragraph()),
            },
          ],
        }),
      } as never,
      attachTo: document.body,
      slots: {
        default: () => h(SlashMenuPlugin),
        nested: () => h(SlashMenuPlugin),
      },
    })
    await flushPromises()
    const outer = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
    const nestedRoot = document.querySelector<HTMLElement & { __lexicalEditor: LexicalEditor }>('.hlx-step-content [data-lexical-editor]')!
    return { outer, nested: nestedRoot.__lexicalEditor, nestedRoot }
  }

  it('hides what can\'t go in a step and acts on the step', async () => {
    const { nested, nestedRoot } = await mountNested()
    nestedRoot.focus()
    await setText(nested, '/')
    const keys = titles()
    expect(keys).not.toContain('步驟')
    expect(keys).not.toContain('註腳')
    expect(keys).toContain('標題 1')
    await setText(nested, '/h1')
    press(nested, KEY_ENTER_COMMAND)
    await flushPromises()
    nested.getEditorState().read(() => {
      expect($isHeadingNode($getRoot().getFirstChild())).toBe(true)
    })
  })

  it('leaves the outer menu as it was', async () => {
    const { outer } = await mountNested()
    outer.getRootElement()!.focus()
    await setText(outer, '/')
    expect(titles()).toContain('步驟')
    expect(titles()).toContain('註腳')
  })
})

describe('content blocks', () => {
  it('lists the code snippet', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/snippet')
    expect(titles()).toContain('程式碼片段')
  })

  it('lists the chart', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/chart')
    expect(titles()).toContain('圖表')
  })

  it('lists the poll', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/poll')
    expect(titles()).toEqual(['投票'])
  })

  it('lists the link card', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/card')
    expect(titles()).toEqual(['連結卡片'])
  })

  it('lists the gallery', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/gallery')
    expect(titles()).toEqual(['圖庫'])
  })
  it('lists the chat', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/chat')
    expect(titles()).toEqual(['對話'])
  })
  it('doesn\'t get in the way of the file item', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/file')
    expect(titles()).toEqual(['檔案'])
  })
  it('lists the nested document, but not inside a step', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/nested')
    expect(titles()).toEqual(['巢狀文件'])
  })
  it('lists the grid', async () => {
    const { editor } = mountWithMenu()
    await setText(editor, '/grid')
    expect(titles()).toContain('格狀版面')
  })
})
