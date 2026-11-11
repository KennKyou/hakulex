import type { ElementNode, LexicalEditor, SerializedEditorState, SerializedLexicalNode } from 'lexical'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_BACKSPACE_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinTransformers, INSERT_CALLOUT_COMMAND, INSERT_CODE_BLOCK_COMMAND, INSERT_IMAGE_COMMAND, RichEditor, serializeEditorState } from '../src'
import { isMarkdown } from '../src/paste/detect'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  format?: number
  alertType?: string
  bannerType?: string
  summary?: string
  open?: boolean
  url?: string
  src?: string
}

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.getRootElement()!.focus()
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const types = (editor: LexicalEditor) => rootChildren(editor).map(node => node.type)
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}

function paragraph(text = '') {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children: text
      ? [
          {
            type: 'text',
            version: 1,
            text,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
          },
        ]
      : [],
  }
}
function block(type: string, extra: Record<string, unknown>, ...children: unknown[]) {
  return {
    type,
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children,
    ...extra,
  }
}
function documentWith(...children: unknown[]): SerializedEditorState {
  return {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children,
    },
  } as unknown as SerializedEditorState
}

function importMarkdown(editor: LexicalEditor, markdown: string) {
  return editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
}
const exportMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

function caretInEmptyParagraph(editor: LexicalEditor, before = '') {
  editor.update(() => {
    const root = $getRoot().clear()
    if (before)
      root.append($createParagraphNode().append($createTextNode(before)))
    const empty = $createParagraphNode()
    root.append(empty)
    empty.select()
  }, { discrete: true })
}

async function insert(editor: LexicalEditor, kind: 'alert' | 'banner' | 'details') {
  caretInEmptyParagraph(editor)
  await flushPromises()
  editor.dispatchCommand(INSERT_CALLOUT_COMMAND, kind)
  await flushPromises()
}

function typeText(editor: LexicalEditor, value: string) {
  editor.update(() => {
    const selection = $getSelection()
    if ($isRangeSelection(selection))
      selection.insertText(value)
  }, { discrete: true })
}

function press(editor: LexicalEditor, command: typeof KEY_ENTER_COMMAND, key: string) {
  return editor.dispatchCommand(command, new KeyboardEvent('keydown', { key, cancelable: true }))
}

function caretType(editor: LexicalEditor) {
  return editor.getEditorState().read(() => {
    const selection = $getSelection()
    if (!$isRangeSelection(selection))
      return null
    const node = selection.anchor.getNode()
    return node.getTopLevelElementOrThrow().getType()
  })
}

const bar = () => document.querySelector<HTMLElement>('.hlx-callout-bar')

describe('document model', () => {
  it('round-trips all three through JSON, with blocks inside', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '> [!WARNING]\n> **bold**\n> - item\n\n::: tip\ntext\n:::\n\n::: details{summary="更多"}\n```ts\ncode\n```\n:::')
    await flushPromises()
    expect(types(editor)).toEqual(['alert-quote', 'banner', 'details'])
    expect(rootChildren(editor)[0].alertType).toBe('warning')
    expect(rootChildren(editor)[1].bannerType).toBe('tip')
    expect(rootChildren(editor)[2]).toMatchObject({ summary: '更多', open: false })

    const json = editor.getEditorState().toJSON()
    const reloaded = mountEditor({ modelValue: json }).editor
    await flushPromises()
    expect(reloaded.getEditorState().toJSON()).toEqual(json)
  })

  it.each([
    [
      'alert-quote',
      { alertType: 'evil' },
      'alertType',
      'note',
    ],
    [
      'banner',
      { bannerType: 42 },
      'bannerType',
      'note',
    ],
    [
      'details',
      { summary: 42 },
      'summary',
      '',
    ],
    [
      'details',
      { summary: 'x', open: 'yes' },
      'open',
      false,
    ],
  ])('treats bad values in %s as not provided', async (type, extra, field, expected) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = mountEditor({
      modelValue: documentWith(block(type, extra, paragraph('x'))),
    })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    expect((rootChildren(editor)[0] as unknown as Record<string, unknown>)[field]).toBe(expected)
  })

  it('gives an empty block a paragraph to type in', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(block('banner', { bannerType: 'tip' })),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow().markDirty(), { discrete: true })
    await flushPromises()
    expect(rootChildren(editor)[0].children?.map(child => child.type)).toEqual(['paragraph'])
  })

  it('renders the same structure as the renderer', async () => {
    const { wrapper } = mountEditor({
      modelValue: documentWith(
        block('alert-quote', { alertType: 'warning' }, paragraph('a')),
        block('details', { summary: 'S', open: true }, paragraph('b')),
      ),
    })
    await flushPromises()
    expect(wrapper.find('.hlx-alert[data-type="warning"] > .hlx-callout-label').text()).toBe('警告')
    expect(wrapper.find('.hlx-alert > .hlx-callout-body > p').text()).toBe('a')
    expect(wrapper.find('details.hlx-details[open] > summary.hlx-details-summary').text()).toBe('S')
    // An arrow before the summary, as in the renderer.
    expect(wrapper.find('summary.hlx-details-summary > .hlx-details-chevron[aria-hidden="true"] svg path').attributes('d')).toBe('m9 18 6-6-6-6')
    expect(wrapper.find('summary.hlx-details-summary > .hlx-details-summary-text').text()).toBe('S')
    expect(wrapper.find('details > .hlx-details-body > p').text()).toBe('b')
  })
})

describe('keyboard', () => {
  it('leaves from the last empty paragraph on Enter', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'alert')
    typeText(editor, 'content')
    press(editor, KEY_ENTER_COMMAND, 'Enter')
    await flushPromises()
    expect(rootChildren(editor)[0].children).toHaveLength(2)

    expect(press(editor, KEY_ENTER_COMMAND, 'Enter')).toBe(true)
    await flushPromises()
    typeText(editor, 'outside')
    await flushPromises()

    expect(types(editor)).toEqual(['alert-quote', 'paragraph'])
    expect(rootChildren(editor)[0].children).toHaveLength(1)
    expect(textOf(rootChildren(editor)[0])).toBe('content')
    expect(textOf(rootChildren(editor)[1])).toBe('outside')
  })

  it('stays inside on Enter in the only empty paragraph', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'banner')
    press(editor, KEY_ENTER_COMMAND, 'Enter')
    await flushPromises()
    expect(types(editor)).toEqual(['banner'])
  })

  it('turns back into a paragraph on Backspace when empty, and undo restores it', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'alert')
    expect(press(editor, KEY_BACKSPACE_COMMAND, 'Backspace')).toBe(true)
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph'])
    expect(caretType(editor)).toBe('paragraph')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toEqual(['alert-quote'])
  })

  it('does not leave on Backspace at the start of text', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph('before'), block('banner', { bannerType: 'tip' }, paragraph('inside'))),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getLastChildOrThrow<ReturnType<typeof $createParagraphNode>>().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectStart()
    }, { discrete: true })
    await flushPromises()
    press(editor, KEY_BACKSPACE_COMMAND, 'Backspace')
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph', 'banner'])
    expect(textOf(rootChildren(editor)[1])).toBe('inside')
    expect(textOf(rootChildren(editor)[0])).toBe('before')
  })

  it.each([
    [
      'down',
      KEY_ARROW_DOWN_COMMAND,
      'ArrowDown',
      ['banner', 'paragraph'],
    ],
    [
      'up',
      KEY_ARROW_UP_COMMAND,
      'ArrowUp',
      ['paragraph', 'banner'],
    ],
  ])('adds a paragraph when leaving %s past the edge of the document', async (_name, command, key, expected) => {
    const { editor } = mountEditor()
    await insert(editor, 'banner')
    expect(press(editor, command, key)).toBe(true)
    await flushPromises()
    typeText(editor, 'outside')
    await flushPromises()
    expect(types(editor)).toEqual(expected)
    expect(textOf(rootChildren(editor).find(node => node.type === 'paragraph')!)).toBe('outside')
    expect(textOf(rootChildren(editor).find(node => node.type === 'banner')!)).toBe('')
  })

  it('moves to an existing neighbor without adding a paragraph', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(block('banner', { bannerType: 'tip' }, paragraph('in')), paragraph('after')),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd()
    }, { discrete: true })
    await flushPromises()
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(types(editor)).toEqual(['banner', 'paragraph'])
    expect(caretType(editor)).toBe('paragraph')
  })

  it('does not move into a collapsed details with the arrow keys', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(
        block('banner', { bannerType: 'tip' }, paragraph('in')),
        block('details', { summary: 'S', open: false }, paragraph('hidden')),
      ),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd()
    }, { discrete: true })
    await flushPromises()
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    typeText(editor, 'typed')
    await flushPromises()
    expect(textOf(find(rootChildren(editor), 'details')[0])).toBe('hidden')
  })

  it('leaves arrows alone when not at the edge of the block', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'banner')
    press(editor, KEY_ENTER_COMMAND, 'Enter')
    await flushPromises()
    expect(press(editor, KEY_ARROW_UP_COMMAND, 'ArrowUp')).toBe(false)
    expect(types(editor)).toEqual(['banner'])
  })
})

describe('clicking below', () => {
  it.each([
    ['alert'],
    ['banner'],
    ['details'],
  ] as const)('adds a paragraph after a trailing %s', async (kind) => {
    const { editor } = mountEditor()
    await insert(editor, kind)
    editor.getRootElement()!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientY: 100 }))
    await flushPromises()
    expect(types(editor).at(-1)).toBe('paragraph')
    expect(caretType(editor)).toBe('paragraph')
  })
})

describe('toolbar', () => {
  it('appears inside a block, and goes away outside', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'alert')
    expect(bar()).not.toBeNull()
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(caretType(editor)).toBe('paragraph')
    expect(bar()).toBeNull()
  })

  it('goes away when focus leaves the editor, and comes back', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'alert')
    expect(bar()).not.toBeNull()

    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await flushPromises()
    expect(bar()).toBeNull()

    editor.getRootElement()!.focus()
    await flushPromises()
    expect(bar()).not.toBeNull()
  })

  it('switches the type and undoes it', async () => {
    const { wrapper, editor } = mountEditor()
    await insert(editor, 'banner')
    typeText(editor, 'keep')
    await flushPromises()

    const select = bar()!.querySelector('select')!
    expect(select.value).toBe('note')
    select.value = 'caution'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    expect(rootChildren(editor)[0].bannerType).toBe('caution')
    expect(wrapper.find('.hlx-banner').attributes('data-type')).toBe('caution')
    expect(wrapper.find('.hlx-callout-label').text()).toBe('注意')
    expect(textOf(rootChildren(editor)[0])).toBe('keep')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(rootChildren(editor)[0].bannerType).toBe('note')
  })

  it('edits the details summary', async () => {
    const { wrapper, editor } = mountEditor()
    await insert(editor, 'details')
    const input = bar()!.querySelector('input')!
    input.value = '新摘要'
    input.dispatchEvent(new Event('input'))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(rootChildren(editor)[0].summary).toBe('新摘要')
    expect(wrapper.find('summary').text()).toBe('新摘要')
    // A new summary keeps its arrow.
    expect(wrapper.find('summary > .hlx-details-summary-text').text()).toBe('新摘要')
    expect(wrapper.find('summary > .hlx-details-chevron svg').exists()).toBe(true)
  })

  it('removes the block but keeps its content', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'alert')
    typeText(editor, 'keep')
    await flushPromises()
    bar()!.querySelector<HTMLElement>('[aria-label="移除區塊"]')!.click()
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph'])
    expect(textOf(rootChildren(editor)[0])).toBe('keep')
    expect(bar()).toBeNull()
  })

  it('has none while read-only', async () => {
    const { editor, wrapper } = mountEditor()
    await insert(editor, 'alert')
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(bar()).toBeNull()
  })
})

describe('details summary clicks', () => {
  const clickSummary = () => {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    document.querySelector('summary')!.dispatchEvent(event)
    return event
  }

  it('collapses, moves the caret out, and undoes', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'details')
    expect(rootChildren(editor)[0].open).toBe(true)

    const event = clickSummary()
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(rootChildren(editor)[0].open).toBe(false)
    expect(caretType(editor)).toBe('paragraph')
    expect(document.querySelector('details')!.open).toBe(false)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(rootChildren(editor)[0].open).toBe(true)
  })

  it('leaves the document alone while read-only', async () => {
    const value = documentWith(block('details', { summary: 's', open: false }, paragraph('x')))
    const { editor } = mountEditor({ modelValue: value, editable: false })
    await flushPromises()
    const before = editor.getEditorState().toJSON()
    const event = clickSummary()
    await flushPromises()
    expect(event.defaultPrevented).toBe(false)
    expect(editor.getEditorState().toJSON()).toEqual(before)
  })
})

describe('markdown', () => {
  it('reads an alert and writes it back', async () => {
    const markdown = '> [!WARNING]\n> **bold** text\n>\n> - one\n> - two'
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    await flushPromises()
    const [alert] = rootChildren(editor)
    expect(alert.type).toBe('alert-quote')
    expect(alert.alertType).toBe('warning')
    expect(alert.children?.map(child => child.type)).toEqual(['paragraph', 'list'])
    expect(find([alert], 'text')[0].format).toBe(1)
    expect(exportMarkdown(editor)).toBe(markdown)
  })

  it('keeps ordinary quotes as quotes', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '> just a quote')
    await flushPromises()
    expect(types(editor)).toEqual(['quote'])
  })

  it('reads aliases, escaped summaries and nesting, and writes standard names', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '::: danger\nouter\n\n::: details{summary="更多 \\"說明\\""}\ninner\n:::\n:::')
    await flushPromises()
    const [banner] = rootChildren(editor)
    expect(banner).toMatchObject({ type: 'banner', bannerType: 'caution' })
    const [details] = find([banner], 'details')
    expect(details).toMatchObject({ summary: '更多 "說明"', open: false })
    expect(textOf(details)).toBe('inner')
    expect(exportMarkdown(editor)).toBe('::: caution\nouter\n\n::: details{summary="更多 \\"說明\\""}\ninner\n:::\n:::')
  })

  it('does not treat ::: inside a code fence as an end', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '::: note\n```\n:::\n```\n:::')
    await flushPromises()
    expect(types(editor)).toEqual(['banner'])
    expect(find(rootChildren(editor), 'code-block')).toHaveLength(1)
  })

  it.each([
    ['an unclosed block', '::: note\ntext'],
    ['an unknown type', '::: nope\ntext\n:::'],
    ['an unknown alert', '> [!FOO]\n> text'],
  ])('keeps the text of %s', async (_name, markdown) => {
    const { editor } = mountEditor()
    importMarkdown(editor, markdown)
    await flushPromises()
    expect(find(rootChildren(editor), 'banner')).toHaveLength(0)
    expect(find(rootChildren(editor), 'alert-quote')).toHaveLength(0)
    expect(rootChildren(editor).map(textOf).join('\n')).toContain('text')
  })

  it('does not convert while typing', async () => {
    const { editor } = mountEditor()
    caretInEmptyParagraph(editor)
    for (const char of '::: note ') {
      typeText(editor, char)
      await flushPromises()
    }
    expect(types(editor)).toEqual(['paragraph'])
  })
})

describe('pasting and HTML', () => {
  async function paste(editor: LexicalEditor, entries: Record<string, string>) {
    const data = new DataTransfer()
    for (const [type, value] of Object.entries(entries))
      data.setData(type, value)
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
    await flushPromises()
  }

  it('detects the block syntax but not lookalikes', () => {
    expect(isMarkdown('> [!NOTE]\n> text')).toBe(true)
    expect(isMarkdown('::: tip\ntext\n:::')).toBe(true)
    expect(isMarkdown('::: tip with no end')).toBe(false)
    expect(isMarkdown('a ::: b')).toBe(false)
  })

  it.each([
    ['alert', '> [!NOTE]\n> text', 'alert-quote'],
    ['banner', '::: tip\ntext\n:::', 'banner'],
  ])('pastes a markdown %s in one undo step', async (_name, markdown, type) => {
    const { editor } = mountEditor()
    caretInEmptyParagraph(editor, 'before')
    await flushPromises()
    await paste(editor, { 'text/plain': markdown })
    expect(types(editor)).toContain(type)
    expect(rootChildren(editor).map(textOf).join('')).not.toMatch(/\[!|:::/)

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).not.toContain(type)
    expect(rootChildren(editor).map(textOf).join('')).toContain('before')
  })

  it('does not leave the caret inside a pasted, collapsed details', async () => {
    const { editor } = mountEditor()
    caretInEmptyParagraph(editor)
    await flushPromises()
    await paste(editor, { 'text/plain': '::: details{summary="S"}\nhidden\n:::' })
    await flushPromises()
    expect(find(rootChildren(editor), 'details')[0].open).toBe(false)
    expect(caretType(editor)).toBe('paragraph')
    expect(bar()).toBeNull()

    typeText(editor, 'outside')
    await flushPromises()
    expect(textOf(find(rootChildren(editor), 'details')[0])).toBe('hidden')
    expect(rootChildren(editor).map(textOf)).toContain('outside')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'details')).toHaveLength(0)
  })

  it('reads its own exported HTML back', async () => {
    const { editor } = mountEditor()
    importMarkdown(editor, '> [!TIP]\n> a\n\n::: warning\nb\n:::\n\n::: details{summary="S"}\nc\n:::')
    await flushPromises()
    const html = await new Promise<string>((resolve) => {
      editor.read(() => {
        const parts = $getRoot().getChildren().map((node) => {
          const element = node.exportDOM(editor).element as HTMLElement
          const paragraphText = node.getTextContent()
          const p = document.createElement('p')
          p.textContent = paragraphText
          element.append(p)
          return element.outerHTML
        })
        resolve(parts.join(''))
      })
    })

    caretInEmptyParagraph(editor)
    await flushPromises()
    await paste(editor, { 'text/html': html })
    await flushPromises()
    const nodes = rootChildren(editor)
    expect(find(nodes, 'alert-quote')[0]).toMatchObject({ alertType: 'tip' })
    expect(find(nodes, 'banner')[0]).toMatchObject({ bannerType: 'warning' })
    expect(find(nodes, 'details')[0]).toMatchObject({ summary: 'S' })
    expect(textOf(find(nodes, 'details')[0])).toBe('c')
  })

  it('reads a pasted details, keeps its text, and neutralizes unsafe links', async () => {
    const { editor } = mountEditor()
    caretInEmptyParagraph(editor)
    await flushPromises()
    await paste(editor, {
      'text/html': '<details open><summary>S</summary>plain <a href="javascript:alert(1)">evil</a><p>more</p></details>',
    })
    await flushPromises()
    const [details] = find(rootChildren(editor), 'details')
    expect(details).toMatchObject({ summary: 'S', open: true })
    expect(textOf(details)).toContain('evil')
    expect(textOf(details)).toContain('more')
    expect(textOf(details)).not.toContain('S')
    expect(details.children?.every(child => child.type !== 'text')).toBe(true)
    expect(document.querySelector('a[href^="javascript"]')).toBeNull()
  })
})

describe('content inside a block', () => {
  it('keeps images and code blocks inside', async () => {
    const { editor } = mountEditor()
    await insert(editor, 'banner')
    editor.dispatchCommand(INSERT_IMAGE_COMMAND, { src: 'https://example.com/a.png', altText: 'x' })
    await flushPromises()
    expect(types(editor)).toEqual(['banner'])
    expect(find(rootChildren(editor), 'image')).toHaveLength(1)

    editor.dispatchCommand(INSERT_CODE_BLOCK_COMMAND, 'ts')
    await flushPromises()
    expect(types(editor)).toEqual(['banner'])
    expect(find(rootChildren(editor), 'code-block')).toHaveLength(1)
  })
})

describe('alert and banner stored as `content`', () => {
  const contentOf = (...children: unknown[]) => documentWith(...children)
  const stored = (type: string, field: string, kind: string, ...children: unknown[]) => ({
    type,
    version: 1,
    $: { blockId: `${type}-id` },
    [field]: kind,
    content: contentOf(...children),
  })
  const output = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState())
  const alert = (...children: unknown[]) => stored('alert-quote', 'alertType', 'note', ...children)
  const banner = (...children: unknown[]) => stored('banner', 'bannerType', 'tip', ...children)

  it('shows the content and outputs it unchanged when nothing is edited', async () => {
    const value = documentWith(
      alert(
        paragraph('in alert'),
        {
          type: 'never-registered',
          version: 1,
          children: [
            paragraph('unknown'),
          ],
          extra: 1,
        },
        banner(paragraph('in a nested banner')),
      ),
      banner(paragraph('in banner')),
    )
    const { editor, wrapper } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(wrapper.text()).toContain('in alert')
    expect(wrapper.text()).toContain('in a nested banner')
    expect(wrapper.text()).toContain('in banner')
    expect(output(editor)).toEqual(value)
  })

  it('keeps the direction, format and indent of the content root', async () => {
    const value = documentWith({
      ...alert(paragraph('a')),
      content: {
        root: {
          ...contentOf().root,
          children: [
            paragraph('a'),
          ],
          direction: 'ltr',
        },
      },
    })
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('reads the older `children` form and writes `content` when edited', async () => {
    const { editor, wrapper } = mountEditor({
      modelValue: documentWith(block('alert-quote', { alertType: 'warning' }, paragraph('old'))),
    })
    await flushPromises()
    expect(wrapper.text()).toContain('old')
    editor.update(() => {
      $getRoot().getFirstChild<ElementNode>()!.getFirstChild<ElementNode>()!.selectEnd().insertText('er')
    }, { discrete: true })
    await flushPromises()

    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted).toHaveLength(1)
    const [stored] = (emitted[0][0] as SerializedEditorState).root.children as Json[]
    expect(stored).not.toHaveProperty('children')
    expect((stored as unknown as { content: SerializedEditorState }).content.root.children).toMatchObject([
      {
        type: 'paragraph',
        children: [
          { text: 'older' },
        ],
      },
    ])

    // Handing the output back doesn't reload it.
    await wrapper.setProps({ modelValue: emitted[0][0] })
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    expect(wrapper.text()).toContain('older')
  })

  it('edits the content like any other, with undo', async () => {
    const { editor, wrapper } = mountEditor({
      modelValue: documentWith(banner(paragraph('a'))),
    })
    await flushPromises()
    editor.update(() => {
      $getRoot().getFirstChild<ElementNode>()!.getFirstChild<ElementNode>()!.selectEnd()
    }, { discrete: true })
    typeText(editor, 'b')
    await flushPromises()
    const last = wrapper.emitted('update:modelValue')!.at(-1)![0] as SerializedEditorState
    expect((last.root.children[0] as unknown as { content: SerializedEditorState }).content.root.children)
      .toMatchObject([
        {
          children: [
            { text: 'ab' },
          ],
        },
      ])
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect((output(editor).root.children[0] as unknown as { content: SerializedEditorState }).content.root.children)
      .toMatchObject([
        {
          children: [
            { text: 'a' },
          ],
        },
      ])
  })

  it('pastes a copied block with the same content', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph('x'), alert(paragraph('copied'))),
    })
    await flushPromises()
    const nodes = rootChildren(editor).slice(1)
    editor.update(() => $getRoot().getFirstChild<ElementNode>()!.selectEnd(), { discrete: true })
    const clipboard = new DataTransfer()
    clipboard.setData('application/x-lexical-editor', JSON.stringify({ namespace: editor._config.namespace, nodes }))
    editor.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: clipboard }))
    await flushPromises()
    const alerts = (output(editor).root.children as unknown as { type: string, content?: SerializedEditorState }[])
      .filter(node => node.type === 'alert-quote')
    expect(alerts).toHaveLength(2)
    expect(alerts[0].content!.root.children).toMatchObject([
      {
        children: [
          { text: 'copied' },
        ],
      },
    ])
    expect(alerts[1].content!.root.children).toMatchObject([
      {
        children: [
          { text: 'copied' },
        ],
      },
    ])
  })

  it.each([
    ['a string', 'nope'],
    ['no root', {}],
    [
      'a root without children',
      { root: {} },
    ],
    ['null', null],
  ])(
    'gives invalid content (%s) a line to type on',
    async (_name, content) => {
      const { editor, wrapper } = mountEditor({
        modelValue: documentWith({
          type: 'alert-quote',
          version: 1,
          alertType: 'note',
          content,
        }),
      })
      await flushPromises()
      expect(wrapper.find('.hlx-alert').exists()).toBe(true)
      expect(rootChildren(editor)[0].children).toMatchObject([
        { type: 'paragraph' },
      ])
    },
  )
})

it('keeps the textFormat stored on details', async () => {
  const value = documentWith(block('details', { summary: 's', open: false, textFormat: 1 }, paragraph('a')))
  const { editor } = mountEditor({ modelValue: value })
  await flushPromises()
  expect(serializeEditorState(editor.getEditorState())).toEqual(value)
  const without = documentWith(block('details', { summary: 's', open: false }, paragraph('a')))
  const other = mountEditor({ modelValue: without }).editor
  await flushPromises()
  expect(serializeEditorState(other.getEditorState())).toEqual(without)
})

describe('the type\'s icon in the editor', () => {
  it('heads an alert and a banner as the renderer does, and follows a change of type', async () => {
    const { editor, wrapper } = mountEditor()
    await flushPromises()
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'alert')
    await flushPromises()
    const label = wrapper.find('.hlx-alert > .hlx-callout-label')
    expect(label.attributes('contenteditable')).toBe('false')
    expect(label.find('.hlx-callout-icon').attributes('aria-hidden')).toBe('true')
    expect(label.find('.hlx-callout-icon svg path').attributes('d')).toBe('M12 16v-4')
    expect(label.find('.hlx-callout-title').text()).toBe('備註')

    editor.update(() => {
      const alert = $getRoot().getChildren().find(node => node.getType() === 'alert-quote') as unknown as { setCalloutType: (type: string) => void }
      alert.setCalloutType('caution')
    }, { discrete: true })
    await flushPromises()
    expect(wrapper.find('.hlx-alert .hlx-callout-icon svg path').attributes('d')).toBe('M12 16h.01')
    expect(wrapper.find('.hlx-alert .hlx-callout-title').text()).toBe('注意')

    editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'banner')
    await flushPromises()
    expect(wrapper.find('.hlx-banner > .hlx-callout-label .hlx-callout-title').classes()).toContain('hlx-visually-hidden')
    expect(wrapper.find('.hlx-banner > .hlx-callout-label .hlx-callout-icon svg').exists()).toBe(true)
  })

  it('leaves the icon out of the text, the export and a copy', async () => {
    const { editor } = mountEditor()
    await flushPromises()
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(INSERT_CALLOUT_COMMAND, 'alert')
    await flushPromises()
    editor.update(() => {
      const selection = $getSelection()
      if ($isRangeSelection(selection))
        selection.insertText('內容')
    }, { discrete: true })
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).not.toContain('備註')
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown).not.toContain('<svg')
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
    expect(html).not.toContain('<svg')
    expect(html).toContain('內容')
  })
})
