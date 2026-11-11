import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $createTextNode, $getRoot, $getSelection, $insertNodes, $isNodeSelection, $isRangeSelection, KEY_ARROW_DOWN_COMMAND, KEY_DELETE_COMMAND, PASTE_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { builtinTransformers, INSERT_EMBED_COMMAND, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
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
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC'
function embed(url = YOUTUBE, source: string | null = 'youtube') {
  return {
    type: 'embed',
    version: 1,
    url,
    source,
  }
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]
const input = () => document.querySelector<HTMLInputElement>('.hlx-embed-input')!
const types = (editor: LexicalEditor) => read(editor).map(node => node.type)

async function setUrl(value: string) {
  input().focus()
  input().value = value
  input().dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function press(key: string, init: KeyboardEventInit = {}) {
  input().dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  }))
  await flushPromises()
}

async function update(editor: LexicalEditor, fn: () => void) {
  await new Promise<void>(resolve => editor.update(fn, { discrete: true, onUpdate: resolve }))
  await flushPromises()
}

async function paste(editor: LexicalEditor, plain: string) {
  const event = new Event('paste', { cancelable: true }) as ClipboardEvent
  Object.defineProperty(event, 'clipboardData', {
    value: {
      getData: (type: string) => (type === 'text/plain'
        ? plain
        : ''),
      files: [],
      types: ['text/plain'],
    },
  })
  editor.update(() => {
    editor.dispatchCommand(PASTE_COMMAND, event)
  }, { discrete: true })
  await flushPromises()
}

describe('the row', () => {
  it('shows the source and the URL, with no iframe', async () => {
    await mountEditor(doc(embed()))
    expect(document.querySelector('.hlx-embed-label')!.textContent).toBe('YouTube')
    expect(input().value).toBe(YOUTUBE)
    expect(document.querySelector('iframe')).toBeNull()
    expect(document.querySelector('[data-action="remove"]')).not.toBeNull()
    expect(document.querySelector('[data-action="open"]')).not.toBeNull()
  })

  it('can only be read when the editor is read-only', async () => {
    await mountEditor(doc(embed()), { editable: false })
    expect(input().readOnly).toBe(true)
    expect(document.querySelector('[data-action="remove"]')).toBeNull()
    expect(document.querySelector('[data-action="open"]')).not.toBeNull()
  })

  it('keeps keys in the input away from the editor', async () => {
    const { editor } = await mountEditor(doc(embed()))
    const listener = vi.fn(() => false)
    const stop = editor.registerCommand(KEY_DELETE_COMMAND, listener, 4)
    await press('Delete')
    stop()
    expect(listener).not.toHaveBeenCalled()
  })

  it('opens the link in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    await mountEditor(doc(embed()))
    ;(document.querySelector('[data-action="open"]') as HTMLElement).click()
    expect(open).toHaveBeenCalledWith(YOUTUBE, '_blank', 'noopener,noreferrer')
  })

  it('has nothing to open for an unsafe URL', async () => {
    await mountEditor(doc(embed('javascript:alert(1)', null)))
    expect(document.querySelector('[data-action="open"]')).toBeNull()
  })
})

describe('changing the URL', () => {
  it('saves on Enter with its source, as one undo step, and moves to the next line', async () => {
    const { editor } = await mountEditor(doc(embed(), paragraph(text('後'))))
    await setUrl(`  ${SPOTIFY} `)
    await press('Enter')
    expect(read(editor)[0]).toEqual(embed(SPOTIFY, 'spotify'))
    expect(document.querySelector('.hlx-embed-label')!.textContent).toBe('Spotify')
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().getTextContent()).toBe('後')
    })
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(read(editor)[0]).toEqual(embed())
  })

  it('makes a line to go to when there is none', async () => {
    const { editor } = await mountEditor(doc(embed()))
    await setUrl(SPOTIFY)
    await press('Enter')
    expect(types(editor)).toEqual(['embed', 'paragraph'])
  })

  it('saves on leaving, without pulling the caret back', async () => {
    const { editor } = await mountEditor(doc(embed(), paragraph(text('後'))))
    await setUrl(SPOTIFY)
    const tags: string[][] = []
    const stop = editor.registerUpdateListener(({ tags: current }) => tags.push([...current]))
    input().blur()
    await flushPromises()
    stop()
    expect(read(editor)[0]).toEqual(embed(SPOTIFY, 'spotify'))
    expect(tags.some(current => current.includes('skip-dom-selection'))).toBe(true)
  })

  it('makes no undo step when nothing changed', async () => {
    const { editor } = await mountEditor(doc(embed(), paragraph(text('後'))))
    const updates = vi.fn()
    const stop = editor.registerUpdateListener(({ dirtyLeaves, dirtyElements }) => {
      if (dirtyLeaves.size || dirtyElements.size)
        updates()
    })
    input().focus()
    input().blur()
    await flushPromises()
    stop()
    expect(updates).not.toHaveBeenCalled()
  })

  it('esc throws the change away', async () => {
    const { editor } = await mountEditor(doc(embed()))
    await setUrl(SPOTIFY)
    await press('Escape')
    expect(input().value).toBe(YOUTUBE)
    input().blur()
    await flushPromises()
    expect(read(editor)[0]).toEqual(embed())
  })

  it.each(['javascript:alert(1)', 'not a url', 'ftp://example.com/'])('won\'t save %s', async (url) => {
    const { editor } = await mountEditor(doc(embed()))
    await setUrl(url)
    await press('Enter')
    expect(document.querySelector('.hlx-embed-error')).not.toBeNull()
    expect(read(editor)[0]).toEqual(embed())
    input().blur()
    await flushPromises()
    expect(read(editor)[0]).toEqual(embed())
  })

  it('clears the error once the URL changes', async () => {
    await mountEditor(doc(embed()))
    await setUrl('javascript:alert(1)')
    await press('Enter')
    await setUrl(SPOTIFY)
    expect(document.querySelector('.hlx-embed-error')).toBeNull()
  })

  it('leaves the Enter that picks a word alone', async () => {
    const { editor } = await mountEditor(doc(embed()))
    await setUrl(SPOTIFY)
    await press('Enter', { isComposing: true })
    expect(read(editor)[0]).toEqual(embed())
  })

  it('accepts any http URL, with no source', async () => {
    const { editor } = await mountEditor(doc(embed()))
    await setUrl('https://example.com/')
    await press('Enter')
    expect(read(editor)[0]).toEqual(embed('https://example.com/', null))
    expect(document.querySelector('.hlx-embed-label')!.textContent).toBe('連結')
  })
})

describe('as a block', () => {
  it('arrow keys reach it, and Delete removes it, which can be undone', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前')), embed()))
    await update(editor, () => $getRoot().getFirstChildOrThrow<any>().selectEnd())
    await update(editor, () => editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown')))
    editor.getEditorState().read(() => expect($isNodeSelection($getSelection())).toBe(true))
    await update(editor, () => editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown')))
    expect(types(editor)).not.toContain('embed')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toContain('embed')
  })

  it('a click on the label selects it', async () => {
    const { editor } = await mountEditor(doc(embed(), paragraph()))
    ;(document.querySelector('.hlx-embed-label') as HTMLElement).click()
    await flushPromises()
    editor.getEditorState().read(() => expect($isNodeSelection($getSelection())).toBe(true))
    expect(document.querySelector('.hlx-embed-editor')!.hasAttribute('data-selected')).toBe(true)
  })

  it('the remove button removes it, which can be undone', async () => {
    const { editor } = await mountEditor(doc(embed(), paragraph(text('後'))))
    ;(document.querySelector('[data-action="remove"]') as HTMLElement).click()
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph'])
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toEqual(['embed', 'paragraph'])
  })
})

describe('pasting', () => {
  it('turns a supported URL in an empty paragraph into an embed, as one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前')), paragraph()))
    await update(editor, () => $getRoot().getLastChildOrThrow<any>().select())
    await paste(editor, ` ${YOUTUBE}\n`)
    expect(types(editor)).toEqual(['paragraph', 'embed', 'paragraph'])
    expect(read(editor)[1]).toEqual(embed())
    editor.getEditorState().read(() => {
      const selection = $getSelection()
      expect($isRangeSelection(selection) && selection.anchor.getNode().is($getRoot().getLastChild())).toBe(true)
    })
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph', 'paragraph'])
  })

  it.each([
    ['a tweet', 'https://x.com/octocat/status/1'],
    ['a GitHub file', 'https://github.com/a/b/blob/main/c.ts'],
  ])('takes %s too', async (_name, url) => {
    const { editor } = await mountEditor(doc(paragraph()))
    await update(editor, () => $getRoot().getFirstChildOrThrow<any>().select())
    await paste(editor, url)
    expect(types(editor)[0]).toBe('embed')
  })

  it.each([
    ['an unsupported URL', 'https://example.com/'],
    ['a URL with other text', `看 ${YOUTUBE}`],
    ['two URLs', `${YOUTUBE}\n${SPOTIFY}`],
    ['a look-alike', 'https://evilbilibili.com/video/BV1GJ411x7h7'],
  ])('leaves %s alone', async (_name, plain) => {
    const { editor } = await mountEditor(doc(paragraph()))
    await update(editor, () => $getRoot().getFirstChildOrThrow<any>().select())
    await paste(editor, plain)
    expect(types(editor)).not.toContain('embed')
  })

  it('doesn\'t split a paragraph that has text', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('前後'))))
    await update(editor, () => ($getRoot().getFirstDescendant() as any).select(1, 1))
    await paste(editor, YOUTUBE)
    expect(types(editor)).toEqual(['paragraph'])
  })

  it('doesn\'t act in a list item or a quote', async () => {
    const list = {
      ...element,
      type: 'list',
      listType: 'bullet',
      start: 1,
      tag: 'ul',
      children: [
        {
          ...element,
          type: 'listitem',
          value: 1,
          checked: undefined,
          children: [],
        },
      ],
    }
    const { editor } = await mountEditor(doc(list))
    await update(editor, () => ($getRoot().getFirstChildOrThrow<any>().getFirstChild()).select())
    await paste(editor, YOUTUBE)
    expect(types(editor)).toEqual(['list'])
  })
})

describe('inserting', () => {
  it('adds an empty embed with the input focused', async () => {
    const { editor } = await mountEditor(doc(paragraph()))
    await update(editor, () => $getRoot().getFirstChildOrThrow<any>().select())
    editor.dispatchCommand(INSERT_EMBED_COMMAND, undefined)
    await flushPromises()
    expect(read(editor)[0]).toEqual(embed('', null))
    expect(document.activeElement).toBe(input())
  })

  it('is one undo step', async () => {
    const { editor } = await mountEditor(doc(paragraph(text('字'))))
    await update(editor, () => $getRoot().selectEnd())
    editor.dispatchCommand(INSERT_EMBED_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toContain('embed')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(types(editor)).toEqual(['paragraph'])
  })
})

describe('markdown', () => {
  it('exports as <url>, which comes back as a link', async () => {
    const { editor } = await mountEditor(doc(embed()))
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown).toBe(`<${YOUTUBE}>`)
    await update(editor, () => $convertFromMarkdownString(markdown, builtinTransformers))
    const link = read(editor)[0].children[0]
    expect(link.type).toBe('link')
    expect(link.url).toBe(YOUTUBE)
  })

  it('leaves unsafe text alone on the way in', async () => {
    const { editor } = await mountEditor(doc(paragraph()))
    await update(editor, () => $convertFromMarkdownString('<javascript:alert(1)>', builtinTransformers))
    expect(read(editor)[0].children[0].type).toBe('text')
  })
})

describe('html', () => {
  const exported = (editor: LexicalEditor) => editor.getEditorState().read(() => $generateHtmlFromNodes(editor))

  async function reimported(html: string) {
    const { editor } = await mountEditor(doc(paragraph()))
    await update(editor, () => {
      const dom = new DOMParser().parseFromString(html, 'text/html')
      $getRoot().clear().append($createParagraphNode().append($createTextNode('')))
      $getRoot().selectStart()
      $insertNodes($generateNodesFromDOM(editor, dom))
    })
    return read(editor)
  }

  it.each([
    [
      embed(),
    ],
    [
      embed('https://example.com/thinking/1', 'thinking'),
    ],
  ])('goes out as a link and comes back the same', async (node) => {
    const { editor } = await mountEditor(doc(node))
    const html = exported(editor)
    const link = new DOMParser().parseFromString(html, 'text/html').querySelector('a')!
    expect(link.getAttribute('href')).toBe(node.url)
    expect(link.hasAttribute('data-hlx-embed')).toBe(true)
    expect((await reimported(html)).find(item => item.type === 'embed')).toEqual(node)
  })

  it('doesn\'t make a link out of an unsafe URL', async () => {
    const { editor } = await mountEditor(doc(embed('javascript:alert(1)', null)))
    expect(new DOMParser().parseFromString(exported(editor), 'text/html').querySelector('a')).toBeNull()
    const nodes = await reimported('<a href="javascript:alert(1)" data-hlx-embed>x</a>')
    expect(nodes.map(node => node.type)).not.toContain('embed')
  })
})
