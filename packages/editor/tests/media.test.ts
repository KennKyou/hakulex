import type { ElementNode, LexicalEditor, SerializedEditorState, SerializedLexicalNode, TextNode } from 'lexical'
import type { ImageNode } from '../src'
import { RichRenderer } from '@hakulex/renderer'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { DRAG_DROP_PASTE } from '@lexical/rich-text'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createNodeSelection,
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isNodeSelection,
  $setSelection,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_DELETE_COMMAND,
  KEY_ENTER_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { $createVideoNode, builtinTransformers, OPEN_MEDIA_DIALOG_COMMAND, RichEditor, serializeEditorState } from '../src'
import { hasRichHtml, isMarkdown } from '../src/paste/detect'

interface Json extends SerializedLexicalNode {
  children?: Json[]
  text?: string
  src?: string
  poster?: string
  width?: number
  height?: number
  name?: string
  size?: number
  mimeType?: string
  ext?: string
  display?: string
}

afterEach(() => {
  document.body.innerHTML = ''
})

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

const rootChildren = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const blockTypes = (editor: LexicalEditor) => rootChildren(editor).map(node => node.type)
function find(nodes: Json[], type: string): Json[] {
  return nodes.flatMap(node => [
    ...(node.type === type
      ? [node]
      : []),
    ...find(node.children ?? [], type),
  ])
}
const videos = (editor: LexicalEditor) => find(rootChildren(editor), 'video')
const files = (editor: LexicalEditor) => find(rootChildren(editor), 'file')
const documentText = (editor: LexicalEditor) => find(rootChildren(editor), 'text').map(node => node.text).join('')
const dom = (editor: LexicalEditor) => editor.getRootElement()!

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
function paragraph(...children: unknown[]) {
  return {
    type: 'paragraph',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    textFormat: 0,
    textStyle: '',
    children,
  }
}
function video(extra: Record<string, unknown> = {}) {
  return {
    type: 'video',
    version: 1,
    src: 'https://example.com/a.webm',
    ...extra,
  }
}
function file(extra: Record<string, unknown> = {}) {
  return {
    type: 'file',
    version: 1,
    src: 'https://example.com/a.pdf',
    name: 'a.pdf',
    display: 'block',
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
  editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })
  return flushPromises()
}
const exportMarkdown = (editor: LexicalEditor) => editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))

function setParagraphs(editor: LexicalEditor, ...lines: string[]) {
  editor.update(() => {
    const root = $getRoot().clear()
    for (const line of lines) {
      root.append($createParagraphNode().append(...(line
        ? [
            $createTextNode(line),
          ]
        : [])))
    }
    root.getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd()
  }, { discrete: true })
  return flushPromises()
}

async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

const dialog = () => document.querySelector<HTMLElement>('.hlx-media-dialog')
const field = (name: string) => dialog()!.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
const picker = () => dialog()!.querySelector<HTMLInputElement>('input[type="file"]')
const problem = () => dialog()!.querySelector('[role="alert"]')
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel')
const panelField = (name: string) => panel()!.querySelector<HTMLInputElement>(`input[name="${name}"]`)!
/** Types into the panel; with `entered`, also as a browser does on Enter. */
async function typeIn(name: string, value: string, entered = false) {
  const input = panelField(name)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  if (entered)
    input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

async function openDialog(editor: LexicalEditor, kind: 'video' | 'file', nodeKey?: string) {
  editor.dispatchCommand(OPEN_MEDIA_DIALOG_COMMAND, { kind, nodeKey })
  await flushPromises()
}

async function fill(name: string, value: string) {
  const input = field(name)
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}

async function choose(chosen: File) {
  const input = picker()!
  Object.defineProperty(input, 'files', {
    value: [chosen],
    configurable: true,
  })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
}

async function submit() {
  dialog()!.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

const webm = (name = 'clip.webm') => new File(['abc'], name, { type: 'video/webm' })
const pdf = (name = 'report.pdf') => new File(['abcd'], name, { type: 'application/pdf' })
const png = (name = 'pic.png') => new File(['x'], name, { type: 'image/png' })

const uploadVideo = (extra: Record<string, unknown> = { width: 640, height: 360 }) => vi.fn(async (chosen: File) => ({ src: `/uploads/${chosen.name}`, ...extra }))
const uploadFile = () => vi.fn(async (chosen: File) => ({ src: `/uploads/${chosen.name}` }))
const uploadImage = () => vi.fn(async (chosen: File) => ({ src: `/uploads/${chosen.name}`, width: 10, height: 10 }))

const status = () => document.querySelector('.hlx-media-upload [role="status"]')
const failure = () => document.querySelector('.hlx-media-upload [role="alert"]')

describe('document model', () => {
  it('round-trips through JSON without being changed', async () => {
    const doc = documentWith(
      video({ poster: 'https://example.com/a.png', width: 640, height: 360 }),
      file({ size: 10, mimeType: 'application/pdf', ext: 'pdf' }),
      paragraph(text('前'), file({ display: 'inline' }), text('後')),
    )
    const { editor } = mountEditor({ modelValue: doc })
    await flushPromises()
    expect(videos(editor)[0]).toMatchObject({ poster: 'https://example.com/a.png', width: 640, height: 360 })
    expect(files(editor)[0]).toMatchObject({
      size: 10,
      mimeType: 'application/pdf',
      ext: 'pdf',
      display: 'block',
    })
    expect(files(editor)[1].display).toBe('inline')

    const json = editor.getEditorState().toJSON()
    const reloaded = mountEditor({ modelValue: json }).editor
    await flushPromises()
    expect(reloaded.getEditorState().toJSON()).toEqual(json)
  })

  it('takes bad values as missing, without errors', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { editor } = mountEditor({
      modelValue: documentWith(
        video({ width: '640', height: -1, poster: 42 }),
        file({
          name: 42,
          size: -1,
          mimeType: 'nope',
          ext: 'a.b',
          display: 'weird',
        }),
      ),
    })
    await flushPromises()
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
    const [v] = videos(editor)
    expect(v.width).toBeUndefined()
    expect(v.height).toBeUndefined()
    expect(v.poster).toBeUndefined()
    const [f] = files(editor)
    expect(f).toMatchObject({ name: '檔案', display: 'block' })
    expect(f.size).toBeUndefined()
    expect(f.mimeType).toBeUndefined()
    expect(f.ext).toBeUndefined()
  })

  it.each([
    ['javascript:alert(1)'],
    ['data:video/mp4;base64,AAAA'],
    ['//evil.example/a'],
  ])('shows a note for the unsafe source %s', async (src) => {
    const { editor } = mountEditor({
      modelValue: documentWith(video({ src }), file({ src })),
      editable: false,
    })
    await flushPromises()
    expect(dom(editor).querySelector('video')).toBeNull()
    expect(dom(editor).querySelector('a')).toBeNull()
    expect(dom(editor).querySelector('.hlx-media-invalid')).not.toBeNull()
    expect(dom(editor).querySelector('.hlx-file--invalid')!.textContent).toContain('a.pdf')
  })
})

describe('markdown', () => {
  const VIDEO = '<video src="https://example.com/a.webm?x=1&amp;y=2" poster="https://example.com/&quot;a.png" width="640" height="360" controls></video>'
  const FILE = '<a href="/a.pdf?x=1&amp;y=2" download="報 &quot;告&quot;.pdf" data-hlx-file data-size="1536" data-mime-type="application/pdf">報 &quot;告&quot;.pdf</a>'

  it('imports and exports both unchanged', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, `${VIDEO}\n\n${FILE}`)
    expect(blockTypes(editor)).toEqual(['video', 'file'])
    expect(videos(editor)[0]).toMatchObject({
      src: 'https://example.com/a.webm?x=1&y=2',
      poster: 'https://example.com/"a.png',
      width: 640,
      height: 360,
    })
    expect(files(editor)[0]).toMatchObject({
      src: '/a.pdf?x=1&y=2',
      name: '報 "告".pdf',
      size: 1536,
      mimeType: 'application/pdf',
      ext: 'pdf',
      display: 'block',
    })
    expect(exportMarkdown(editor)).toBe(`${VIDEO}\n\n${FILE}`)
  })

  it.each([
    ['an unsafe video', '<video src="javascript:alert(1)" controls></video>'],
    ['a data video', '<video src="data:video/mp4;base64,AAAA" controls></video>'],
    ['a video without a source', '<video controls></video>'],
    ['an unsafe file', '<a href="javascript:alert(1)" data-hlx-file>x</a>'],
    ['an ordinary link', '<a href="https://example.com">一般連結</a>'],
    ['a video in a sentence', '看 <video src="/a.webm"></video> 這個'],
  ])('leaves %s as text', async (_name, markdown) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, markdown)
    expect(videos(editor)).toHaveLength(0)
    expect(files(editor)).toHaveLength(0)
    expect(documentText(editor)).toBe(markdown)
    expect(dom(editor).querySelector('video')).toBeNull()
  })

  it('ignores other attributes', async () => {
    const { editor } = mountEditor()
    await importMarkdown(editor, '<video src="/a.webm" onerror="alert(1)" autoplay></video>')
    expect(videos(editor)).toHaveLength(1)
    const element = dom(editor).querySelector('video')!
    expect(element.hasAttribute('onerror')).toBe(false)
    expect(element.hasAttribute('autoplay')).toBe(false)
    expect(exportMarkdown(editor)).toBe('<video src="/a.webm" controls></video>')
  })

  it('reads an inline file with text around it', async () => {
    const { editor } = mountEditor()
    const markdown = '前 <a href="/a.pdf" download="a.pdf" data-hlx-file data-display="inline">a.pdf</a> 後'
    await importMarkdown(editor, markdown)
    expect(blockTypes(editor)).toEqual(['paragraph'])
    expect(files(editor)[0]).toMatchObject({ src: '/a.pdf', name: 'a.pdf', display: 'inline' })
    expect(documentText(editor)).toBe('前  後')
    expect(exportMarkdown(editor)).toBe(markdown)
  })

  it.each([
    [
      'an alert',
      (line: string) => `> [!NOTE]\n> ${line}`,
      'alert-quote',
    ],
    [
      'a table cell',
      (line: string) => `| ${line} |\n| --- |`,
      'tablecell',
    ],
  ])('works in %s', async (_name, wrap, container) => {
    const { editor } = mountEditor()
    await importMarkdown(editor, wrap('<video src="/a.webm" controls></video>'))
    const [block] = find(rootChildren(editor), container)
    expect(find([block], 'video')).toHaveLength(1)

    const json = editor.getEditorState().toJSON()
    await importMarkdown(editor, exportMarkdown(editor))
    expect(find(find(rootChildren(editor), container), 'video')).toHaveLength(1)

    const rendered = mount(RichRenderer, {
      props: { value: json },
    })
    expect(rendered.find('video').attributes('src')).toBe('/a.webm')
  })
})

describe('html and paste', () => {
  it('keeps nodes and fields through export and paste', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(
        video({ poster: 'https://example.com/a.png', width: 640, height: 360 }),
        file({ size: 10, mimeType: 'application/pdf' }),
        paragraph(text('前'), file({ display: 'inline' })),
      ),
    })
    await flushPromises()
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))

    const target = mountEditor().editor
    await setParagraphs(target, '')
    const data = new DataTransfer()
    data.setData('text/html', html)
    target.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
    await flushPromises()
    expect(videos(target)[0]).toMatchObject({
      src: 'https://example.com/a.webm',
      poster: 'https://example.com/a.png',
      width: 640,
      height: 360,
    })
    expect(files(target).map(node => node.display)).toEqual(['block', 'inline'])
    expect(files(target)[0]).toMatchObject({ name: 'a.pdf', size: 10, mimeType: 'application/pdf' })
    expect(documentText(target)).not.toContain('a.pdf')
  })

  it('reads what the renderer outputs, and refuses unsafe sources', async () => {
    const rendered = mount(RichRenderer, {
      props: {
        value: documentWith(video({ src: '/a.webm' }), file()),
      },
    })
    const target = mountEditor().editor
    await setParagraphs(target, '')
    const data = new DataTransfer()
    data.setData('text/html', `${rendered.html()}<video src="javascript:alert(1)"></video>`)
    target.dispatchCommand(PASTE_COMMAND, new ClipboardEvent('paste', { clipboardData: data }))
    await flushPromises()
    expect(videos(target).map(node => node.src)).toEqual(['/a.webm'])
    expect(files(target)).toHaveLength(1)
    expect(documentText(target)).not.toContain('下載影片')
  })

  it.each([
    ['<video src="/a.webm" controls></video>', true],
    ['<a href="/a.pdf" data-hlx-file>a</a>', true],
    ['我喜歡 video 和 file', false],
    ['<a href="/a">x</a>', false],
  ])('isMarkdown(%j) is %j', (value, expected) => {
    expect(isMarkdown(value)).toBe(expected)
  })

  it('counts media in copied HTML as rich', () => {
    expect(hasRichHtml('<video src="/a.webm"></video>')).toBe(true)
    expect(hasRichHtml('<a data-hlx-file href="/a">x</a>')).toBe(true)
  })
})

describe('dialog with a URL', () => {
  it('inserts a video, with the caret below, and undoes in one step', async () => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '')
    await openDialog(editor, 'video')
    expect(picker()).toBeNull()
    await fill('src', 'https://example.com/a.webm')
    await fill('poster', 'https://example.com/a.png')
    await submit()

    expect(dialog()).toBeNull()
    expect(blockTypes(editor)).toEqual(['video', 'paragraph'])
    expect(videos(editor)[0]).toMatchObject({ src: 'https://example.com/a.webm', poster: 'https://example.com/a.png' })
    expect(editor.getEditorState().read(() => $getSelection()?.getNodes()[0].getType())).toBe('paragraph')

    await undo(editor)
    expect(videos(editor)).toHaveLength(0)
  })

  it('names a file from its URL', async () => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '')
    await openDialog(editor, 'file')
    expect(picker()).toBeNull()
    await fill('src', 'https://example.com/docs/%E5%A0%B1%E5%91%8A.pdf?x=1')
    await submit()
    expect(files(editor)[0]).toMatchObject({
      name: '報告.pdf',
      ext: 'pdf',
      display: 'block',
    })
  })

  it('uses a typed name', async () => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '')
    await openDialog(editor, 'file')
    await fill('src', '/a.pdf')
    await fill('name', '年度報告.pdf')
    await submit()
    expect(files(editor)[0].name).toBe('年度報告.pdf')
  })

  it.each([
    ['video', 'src', 'javascript:alert(1)'],
    ['video', 'src', ''],
    ['file', 'src', 'data:text/html,x'],
  ] as const)('refuses a bad %s %s %j', async (kind, name, value) => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '')
    await openDialog(editor, kind)
    await fill(name, value)
    await submit()
    expect(problem()).not.toBeNull()
    expect(dialog()).not.toBeNull()
    expect(blockTypes(editor)).toEqual(['paragraph'])
  })

  it('refuses a bad poster', async () => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '')
    await openDialog(editor, 'video')
    await fill('src', '/a.webm')
    await fill('poster', 'javascript:alert(1)')
    await submit()
    expect(problem()).not.toBeNull()
    expect(videos(editor)).toHaveLength(0)
  })

  it('leaves the document alone when cancelled, and returns focus', async () => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '文字')
    const before = editor.getEditorState().toJSON()
    await openDialog(editor, 'video')
    await fill('src', '/a.webm')
    dialog()!.querySelector<HTMLButtonElement>('button[data-cancel]')!.click()
    await flushPromises()
    expect(dialog()).toBeNull()
    expect(editor.getEditorState().toJSON().root).toEqual(before.root)
    expect(document.activeElement).toBe(dom(editor))
  })

  it('edits in place in the panel, prefilled, a step at a time, keeping what the source still describes', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(file({ size: 10, mimeType: 'application/pdf' }), paragraph()),
    })
    await flushPromises()
    const key = editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())
    await openDialog(editor, 'file', key)
    expect(dialog()).toBeNull()
    expect(panelField('src').value).toBe('https://example.com/a.pdf')
    expect(panelField('name').value).toBe('a.pdf')
    await typeIn('name', 'b.pdf')
    expect(files(editor)).toHaveLength(1)
    expect(files(editor)[0]).toMatchObject({
      name: 'b.pdf',
      size: 10,
      mimeType: 'application/pdf',
      ext: 'pdf',
    })

    await undo(editor)
    expect(files(editor)[0].name).toBe('a.pdf')

    await typeIn('src', '/other.zip', true)
    expect(files(editor)[0].src).toBe('/other.zip')
    expect(files(editor)[0].size).toBeUndefined()
    expect(files(editor)[0].mimeType).toBeUndefined()
  })

  it('opens the panel for a selected block on Enter, and from its toolbar', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前')), video(), paragraph()),
    })
    await flushPromises()
    dom(editor).querySelector<HTMLElement>('.hlx-media-editor')!.click()
    await flushPromises()
    expect(dom(editor).querySelector('.hlx-media-editor')!.hasAttribute('data-selected')).toBe(true)

    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    await flushPromises()
    expect(panelField('src').value).toBe('https://example.com/a.webm')
    document.querySelector<HTMLButtonElement>('.hlx-block-toolbar button')!.click()
    await flushPromises()
    expect(panel()).toBeNull()

    document.querySelector<HTMLButtonElement>('.hlx-block-toolbar button')!.click()
    await flushPromises()
    expect(panel()).not.toBeNull()
  })

  it('opens no dialog while read-only', async () => {
    const { editor } = mountEditor({ editable: false })
    await flushPromises()
    await openDialog(editor, 'video')
    expect(dialog()).toBeNull()
  })
})

describe('dialog with a chosen file', () => {
  it('takes everything about a file from the file itself', async () => {
    const upload = uploadFile()
    const { editor } = mountEditor({ uploadFile: upload })
    await setParagraphs(editor, '')
    await openDialog(editor, 'file')
    await choose(pdf())
    await submit()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(files(editor)[0]).toMatchObject({
      src: '/uploads/report.pdf',
      name: 'report.pdf',
      size: 4,
      mimeType: 'application/pdf',
      ext: 'pdf',
    })
  })

  it('uses the size of an uploaded video', async () => {
    const { editor } = mountEditor({
      uploadVideo: uploadVideo(),
    })
    await setParagraphs(editor, '')
    await openDialog(editor, 'video')
    await choose(webm())
    await submit()
    expect(videos(editor)[0]).toMatchObject({ src: '/uploads/clip.webm', width: 640, height: 360 })
  })

  it('still inserts a video whose size can not be read', async () => {
    const { editor } = mountEditor({
      uploadVideo: uploadVideo({}),
    })
    await setParagraphs(editor, '')
    await openDialog(editor, 'video')
    await choose(webm())
    await submit()
    await vi.waitFor(() => expect(videos(editor)).toHaveLength(1), { timeout: 5000 })
    expect(videos(editor)[0].width).toBeUndefined()
  }, 8000)

  it('refuses anything but a video in the video dialog', async () => {
    const upload = uploadVideo()
    const { editor } = mountEditor({ uploadVideo: upload })
    await setParagraphs(editor, '')
    await openDialog(editor, 'video')
    await choose(pdf())
    expect(problem()).not.toBeNull()
    await submit()
    expect(upload).not.toHaveBeenCalled()
  })

  it.each([
    [
      'throws',
      vi.fn(async () => {
        throw new Error('太大了')
      }),
      '太大了',
    ],
    [
      'returns an unsafe URL',
      vi.fn(async () => ({ src: 'javascript:alert(1)' })),
      '網址',
    ],
    [
      'returns a data URL',
      vi.fn(async () => ({ src: 'data:application/pdf;base64,AAAA' })),
      '網址',
    ],
  ])('shows an error when the upload %s, and allows a retry', async (_name, upload, message) => {
    const { editor } = mountEditor({ uploadFile: upload })
    await setParagraphs(editor, '')
    await openDialog(editor, 'file')
    await choose(pdf())
    await submit()
    expect(problem()?.textContent).toContain(message)
    expect(files(editor)).toHaveLength(0)
    expect(dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false)
  })

  it('locks the form while uploading, and ignores the result once cancelled', async () => {
    let finish: (value: { src: string }) => void = () => {}
    const upload = vi.fn(() => new Promise<{ src: string }>((resolve) => {
      finish = resolve
    }))
    const { editor } = mountEditor({ uploadFile: upload })
    await setParagraphs(editor, '')
    await openDialog(editor, 'file')
    await choose(pdf())
    await submit()
    expect(dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true)
    expect(field('src').disabled).toBe(true)
    await submit()
    expect(upload).toHaveBeenCalledTimes(1)

    dialog()!.querySelector<HTMLButtonElement>('button[data-cancel]')!.click()
    await flushPromises()
    finish({ src: '/uploads/report.pdf' })
    await flushPromises()
    expect(files(editor)).toHaveLength(0)
  })

  it('inserts nothing when the editor went read-only during the upload', async () => {
    let finish: (value: { src: string }) => void = () => {}
    const upload = vi.fn(() => new Promise<{ src: string }>((resolve) => {
      finish = resolve
    }))
    const { editor, wrapper } = mountEditor({ uploadFile: upload })
    await setParagraphs(editor, '')
    await openDialog(editor, 'file')
    await choose(pdf())
    await submit()
    await wrapper.setProps({ editable: false })
    await flushPromises()
    finish({ src: '/uploads/report.pdf' })
    await flushPromises()
    expect(files(editor)).toHaveLength(0)
  })

  it('replaces a file in place from the panel, with one undo back to the old one', async () => {
    const { editor } = mountEditor({
      uploadFile: uploadFile(),
      modelValue: documentWith(file({ size: 10 }), paragraph()),
    })
    await flushPromises()
    const key = editor.getEditorState().read(() => $getRoot().getFirstChildOrThrow().getKey())
    await openDialog(editor, 'file', key)
    const input = panel()!.querySelector<HTMLInputElement>('input[type="file"]')!
    Object.defineProperty(input, 'files', {
      value: [
        pdf('new.pdf'),
      ],
      configurable: true,
    })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    await flushPromises()
    expect(files(editor)).toHaveLength(1)
    expect(files(editor)[0]).toMatchObject({ src: '/uploads/new.pdf', name: 'new.pdf', size: 4 })

    await undo(editor)
    expect(files(editor)[0]).toMatchObject({ src: 'https://example.com/a.pdf', name: 'a.pdf', size: 10 })
  })
})

describe('dropping and pasting files', () => {
  it('sends each kind to its own place, losing nothing', async () => {
    const image = uploadImage()
    const video = uploadVideo()
    const attachment = uploadFile()
    const { editor } = mountEditor({ uploadImage: image, uploadVideo: video, uploadFile: attachment })
    await setParagraphs(editor, '文字')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png(),
      webm(),
      pdf(),
    ])
    await flushPromises()
    expect(image).toHaveBeenCalledTimes(1)
    expect(video).toHaveBeenCalledTimes(1)
    expect(attachment).toHaveBeenCalledTimes(1)
    expect(find(rootChildren(editor), 'image')).toHaveLength(1)
    expect(videos(editor)).toHaveLength(1)
    expect(files(editor)).toHaveLength(1)
    expect(files(editor)[0].name).toBe('report.pdf')
  })

  it('undoes media in one step', async () => {
    const { editor } = mountEditor({
      uploadVideo: uploadVideo(),
      uploadFile: uploadFile(),
    })
    await setParagraphs(editor, '文字')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      webm(),
      pdf(),
    ])
    await flushPromises()
    expect(blockTypes(editor)).toContain('video')
    await undo(editor)
    expect(videos(editor)).toHaveLength(0)
    expect(files(editor)).toHaveLength(0)
    expect(documentText(editor)).toBe('文字')
  })

  it('falls back to a file when only uploadFile is there', async () => {
    const attachment = uploadFile()
    const { editor } = mountEditor({ uploadFile: attachment })
    await setParagraphs(editor, '')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      webm(),
      png(),
    ])
    await flushPromises()
    expect(files(editor).map(node => node.name)).toEqual(['clip.webm', 'pic.png'])
    expect(videos(editor)).toHaveLength(0)
    expect(find(rootChildren(editor), 'image')).toHaveLength(0)
  })

  it('leaves images to uploadImage when that is all there is', async () => {
    const image = uploadImage()
    const { editor } = mountEditor({ uploadImage: image })
    await setParagraphs(editor, '')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      png(),
      pdf(),
    ])
    await flushPromises()
    expect(image).toHaveBeenCalledTimes(1)
    expect(files(editor)).toHaveLength(0)
  })

  it('does nothing without an upload function', async () => {
    const { editor } = mountEditor()
    await setParagraphs(editor, '文字')
    const before = editor.getEditorState().toJSON().root
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      webm(),
      pdf(),
    ])
    await flushPromises()
    expect(editor.getEditorState().toJSON().root).toEqual(before)
  })

  function clipboard(chosen: File[], entries: Record<string, string> = {}) {
    const data = new DataTransfer()
    for (const item of chosen)
      data.items.add(item)
    for (const [kind, value] of Object.entries(entries))
      data.setData(kind, value)
    return new ClipboardEvent('paste', { clipboardData: data, cancelable: true })
  }

  it('uploads a pasted file, but takes text first when both are there', async () => {
    const upload = uploadVideo()
    const { editor } = mountEditor({ uploadVideo: upload })
    await setParagraphs(editor, '')
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      webm(),
    ]))
    await flushPromises()
    expect(videos(editor)).toHaveLength(1)

    upload.mockClear()
    await setParagraphs(editor, '')
    editor.dispatchCommand(PASTE_COMMAND, clipboard([
      webm(),
    ], { 'text/plain': '純文字' }))
    await flushPromises()
    expect(upload).not.toHaveBeenCalled()
    expect(documentText(editor)).toBe('純文字')
  })

  it('reports status and failures, inserting what worked', async () => {
    let finish: () => void = () => {}
    const attachment = vi.fn((chosen: File) => new Promise<{ src: string }>((resolve, reject) => {
      if (chosen.name === 'bad.pdf')
        reject(new Error('no'))
      else
        finish = () => resolve({ src: `/uploads/${chosen.name}` })
    }))
    const { editor } = mountEditor({ uploadFile: attachment })
    await setParagraphs(editor, '')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      pdf(),
      pdf('bad.pdf'),
    ])
    await flushPromises()
    expect(status()?.textContent).toContain('2')

    finish()
    await flushPromises()
    expect(status()).toBeNull()
    expect(files(editor)).toHaveLength(1)
    expect(failure()?.textContent).toContain('1')
    document.querySelector<HTMLButtonElement>('.hlx-media-upload button')!.click()
    await flushPromises()
    expect(failure()).toBeNull()
  })

  it('leaves the caret where the author moved it during the upload', async () => {
    let finish: () => void = () => {}
    const attachment = vi.fn((chosen: File) => new Promise<{ src: string }>((resolve) => {
      finish = () => resolve({ src: `/uploads/${chosen.name}` })
    }))
    const { editor } = mountEditor({ uploadFile: attachment })
    await setParagraphs(editor, '一', '二')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      pdf(),
    ])
    await flushPromises()
    editor.update(() => $getRoot().getLastChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd(), { discrete: true })
    finish()
    await flushPromises()
    expect(blockTypes(editor).indexOf('file')).toBe(1)
    expect(editor.getEditorState().read(() => $getSelection()?.getNodes()[0].getTextContent())).toBe('二')
  })

  it('inserts nothing when read-only by the time it finishes, and starts nothing while read-only', async () => {
    let finish: () => void = () => {}
    const attachment = vi.fn((chosen: File) => new Promise<{ src: string }>((resolve) => {
      finish = () => resolve({ src: `/uploads/${chosen.name}` })
    }))
    const { editor, wrapper } = mountEditor({ uploadFile: attachment })
    await setParagraphs(editor, '')
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      pdf(),
    ])
    await flushPromises()
    await wrapper.setProps({ editable: false })
    await flushPromises()
    finish()
    await flushPromises()
    expect(files(editor)).toHaveLength(0)

    attachment.mockClear()
    editor.dispatchCommand(DRAG_DROP_PASTE, [
      pdf(),
    ])
    await flushPromises()
    expect(attachment).not.toHaveBeenCalled()
  })

  it('marks the editor while files are dragged over it, when something can take them', async () => {
    function drag(kind: string) {
      const event = new Event(kind, { bubbles: true, cancelable: true }) as DragEvent
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          types: ['Files'],
          files: [],
        },
      })
      return event
    }
    const { editor } = mountEditor({
      uploadFile: uploadFile(),
    })
    await flushPromises()
    dom(editor).dispatchEvent(drag('dragenter'))
    expect(dom(editor).hasAttribute('data-media-drop')).toBe(true)
    dom(editor).dispatchEvent(drag('dragleave'))
    expect(dom(editor).hasAttribute('data-media-drop')).toBe(false)

    const bare = mountEditor().editor
    await flushPromises()
    dom(bare).dispatchEvent(drag('dragenter'))
    expect(dom(bare).hasAttribute('data-media-drop')).toBe(false)
  })
})

describe('selecting and moving', () => {
  const press = (editor: LexicalEditor, command: typeof KEY_ARROW_DOWN_COMMAND, key: string) =>
    editor.dispatchCommand(command, new KeyboardEvent('keydown', { key, cancelable: true }))
  const selectedType = (editor: LexicalEditor) => editor.getEditorState().read(() => {
    const selection = $getSelection()
    return $isNodeSelection(selection)
      ? selection.getNodes()[0].getType()
      : selection?.getNodes()[0].getType()
  })

  it('moves onto a block and on past it, adding a line at the end of the document', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('前')), video(), file()),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd(), { discrete: true })
    await flushPromises()

    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(selectedType(editor)).toBe('video')
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(selectedType(editor)).toBe('file')
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(blockTypes(editor)).toEqual([
      'paragraph',
      'video',
      'file',
      'paragraph',
    ])

    press(editor, KEY_ARROW_UP_COMMAND, 'ArrowUp')
    await flushPromises()
    expect(selectedType(editor)).toBe('file')
  })

  it('moves between images and media', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(), {
        type: 'image',
        version: 1,
        src: 'https://example.com/a.png',
        altText: '',
      }, video()),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ReturnType<typeof $createParagraphNode>>().selectEnd(), { discrete: true })
    await flushPromises()
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(selectedType(editor)).toBe('image')
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(selectedType(editor)).toBe('video')
    press(editor, KEY_ARROW_UP_COMMAND, 'ArrowUp')
    await flushPromises()
    expect(selectedType(editor)).toBe('image')
  })

  it('goes into a new line rather than selecting the footnotes that follow', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(
        paragraph(text('前'), { type: 'footnote', version: 1, identifier: '1' }),
        video(),
        {
          type: 'footnote-section',
          version: 1,
          definitions: { 1: '內容' },
        },
      ),
    })
    await flushPromises()
    dom(editor).querySelector<HTMLElement>('.hlx-media-editor')!.click()
    await flushPromises()
    press(editor, KEY_ARROW_DOWN_COMMAND, 'ArrowDown')
    await flushPromises()
    expect(blockTypes(editor)).toEqual([
      'paragraph',
      'video',
      'paragraph',
      'footnote-section',
    ])
    expect(selectedType(editor)).toBe('paragraph')
  })

  it('keeps a click on a file card from following the link while editing, but not while reading', async () => {
    const click = (editor: LexicalEditor) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      dom(editor).querySelector('a.hlx-file')!.dispatchEvent(event)
      return event
    }
    const writer = mountEditor({
      modelValue: documentWith(file()),
    }).editor
    await flushPromises()
    expect(click(writer).defaultPrevented).toBe(true)
    await flushPromises()
    expect(dom(writer).querySelector('.hlx-media-editor')!.hasAttribute('data-selected')).toBe(true)

    const reader = mountEditor({
      modelValue: documentWith(file()),
      editable: false,
    }).editor
    await flushPromises()
    expect(click(reader).defaultPrevented).toBe(false)
    await flushPromises()
    expect(dom(reader).querySelector('.hlx-media-editor')!.hasAttribute('data-selected')).toBe(false)
    expect(dom(reader).querySelector('.hlx-media-edit')).toBeNull()
  })

  it('leaves a click on the video itself to the player', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(video()),
    })
    await flushPromises()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    dom(editor).querySelector('video')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('lifts a block out of a paragraph, keeping the text around it', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph()),
    })
    await flushPromises()
    await importMarkdown(editor, '<video src="/a.webm" controls></video>')
    expect(blockTypes(editor)).toEqual(['video'])

    const inline = mountEditor({
      modelValue: documentWith(paragraph(text('前'), file({ display: 'inline' }), text('後'))),
    }).editor
    await flushPromises()
    expect(blockTypes(inline)).toEqual(['paragraph'])
    expect(files(inline)).toHaveLength(1)
  })
})

describe('blocks already stored in a paragraph', () => {
  const stored = (block: unknown) => documentWith(paragraph(text('前')), paragraph(block, text('字')), paragraph(text('後')))
  const output = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState())
  const image = {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'a',
  }
  const cell = (...children: unknown[]) => ({
    type: 'tablecell',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    backgroundColor: null,
    colSpan: 1,
    headerState: 0,
    rowSpan: 1,
    children,
  })
  const table = (...children: unknown[]) => ({
    type: 'table',
    version: 1,
    format: '',
    indent: 0,
    direction: null,
    children: [
      {
        type: 'tablerow',
        version: 1,
        format: '',
        indent: 0,
        direction: null,
        children: [
          cell(...children),
        ],
      },
    ],
  })

  it.each([
    ['an image', image],
    [
      'a video',
      video(),
    ],
    [
      'an embed',
      {
        type: 'embed',
        version: 1,
        url: 'https://example.com/embed',
        source: null,
      },
    ],
  ])('leaves %s where it is', async (_name, block) => {
    const value = stored(block)
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('leaves an image in a table cell paragraph where it is', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(table(paragraph(image))),
    })
    await flushPromises()
    const [paragraphNode] = find(rootChildren(editor), 'tablecell')[0].children!
    expect(paragraphNode).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'image' },
      ],
    })
  })

  it('leaves it in nested content too', async () => {
    const nested = documentWith(paragraph(image))
    const value = documentWith({ type: 'nested-doc', version: 1, content: nested })
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('leaves it there when the document is replaced after mounting', async () => {
    const { editor, wrapper } = mountEditor({
      modelValue: documentWith(paragraph(text('先'))),
    })
    await flushPromises()
    const value = stored(image)
    await wrapper.setProps({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
  })

  it('stays put while its neighbors and the block itself are edited', async () => {
    const { editor } = mountEditor({
      modelValue: stored(image),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ElementNode>().selectEnd().insertText('x'), { discrete: true })
    editor.update(() => {
      const node = $getRoot().getChildAtIndex<ElementNode>(1)!.getFirstChild() as ImageNode
      node.setData({
        ...node.getData(),
        altText: 'b',
      })
    }, { discrete: true })
    await flushPromises()
    expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(find(rootChildren(editor), 'image')[0]).toMatchObject({ altText: 'b' })
  })

  it('can be passed, deleted and restored by keyboard', async () => {
    const error = vi.spyOn(console, 'error')
    const { editor } = mountEditor({
      modelValue: stored(image),
    })
    await flushPromises()
    editor.update(() => $getRoot().getFirstChildOrThrow<ElementNode>().selectEnd(), { discrete: true })
    for (const [command, key] of [
      [KEY_ARROW_DOWN_COMMAND, 'ArrowDown'],
      [KEY_ARROW_UP_COMMAND, 'ArrowUp'],
    ] as const) {
      editor.dispatchCommand(command, new KeyboardEvent('keydown', { key }))
      await flushPromises()
    }
    editor.update(() => {
      const selection = $createNodeSelection()
      selection.add(($getRoot().getChildAtIndex<ElementNode>(1)!.getFirstChild() as ImageNode).getKey())
      $setSelection(selection)
    }, { discrete: true })
    editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown', { key: 'Delete' }))
    await flushPromises()
    expect(find(rootChildren(editor), 'image')).toHaveLength(0)
    expect(documentText(editor)).toContain('字')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(find(rootChildren(editor), 'image')).toHaveLength(1)
    // Back where it was, not moved out as if it were new.
    expect(blockTypes(editor)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(error).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it('still moves a new block out of the paragraph it lands in', async () => {
    const { editor } = mountEditor({
      modelValue: documentWith(paragraph(text('左右'))),
    })
    await flushPromises()
    editor.update(() => {
      const target = $getRoot().getFirstChildOrThrow<ElementNode>().getFirstChildOrThrow<TextNode>()
      target.select(1, 1).insertNodes([
        $createVideoNode({ src: 'https://example.com/a.mp4' }),
      ])
    }, { discrete: true })
    await flushPromises()
    expect(blockTypes(editor)).toContain('video')
  })
})
