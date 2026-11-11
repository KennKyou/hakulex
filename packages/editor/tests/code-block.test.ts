import type { LexicalEditor } from 'lexical'
import type { CodeBlockNode } from '../src'
import { EditorView } from '@codemirror/view'
import { $generateNodesFromDOM } from '@lexical/html'
import { $convertFromMarkdownString, $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  HISTORY_PUSH_TAG,
  KEY_ENTER_COMMAND,
  UNDO_COMMAND,
} from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $createCodeBlockNode, $isCodeBlockNode, builtinTransformers, INSERT_CODE_BLOCK_COMMAND, RichEditor, serializeEditorState } from '../src'

function mountEditor(props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, { props, attachTo: document.body })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

function setParagraph(editor: LexicalEditor, text: string) {
  editor.update(() => {
    const node = $createTextNode(text)
    $getRoot().clear().append($createParagraphNode().append(node))
    node.selectEnd()
  }, { discrete: true })
}

/** Top-level blocks; code blocks as `code:<language>:<code>`. */
function blocks(editor: LexicalEditor) {
  return editor.getEditorState().read(() =>
    $getRoot().getChildren().map(node => ($isCodeBlockNode(node)
      ? `code:${node.getLanguage()}:${node.getCode()}`
      : `${node.getType()}:${node.getTextContent()}`)))
}

const codeMirror = () => EditorView.findFromDOM(document.querySelector<HTMLElement>('.cm-editor')!)!

afterEach(() => {
  document.body.innerHTML = ''
})

describe('code block node', () => {
  it('imports and exports markdown fences', () => {
    const { editor } = mountEditor()
    const markdown = 'Intro\n\n```typescript\nconst a = 1\n\nconst b = 2\n```\n\n```\nplain\n```'
    editor.update(() => $convertFromMarkdownString(markdown, builtinTransformers), { discrete: true })

    expect(blocks(editor)).toEqual([
      'paragraph:Intro',
      'code:ts:const a = 1\n\nconst b = 2',
      'code:plaintext:plain',
    ])
    const exported = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(exported).toBe('Intro\n\n```ts\nconst a = 1\n\nconst b = 2\n```\n\n```\nplain\n```')
  })

  it('uses a longer fence when the code contains backticks', () => {
    const { editor } = mountEditor()
    editor.update(() => $convertFromMarkdownString('````md\n```js\nx\n```\n````', builtinTransformers), { discrete: true })
    expect(blocks(editor)).toEqual(['code:markdown:```js\nx\n```'])
    const exported = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(exported).toBe('````markdown\n```js\nx\n```\n````')
  })

  it('round-trips through JSON as `code-block`', async () => {
    const { editor } = mountEditor()
    editor.update(() => $convertFromMarkdownString('```py\nprint(1)\n```', builtinTransformers), { discrete: true })
    const json = editor.getEditorState().toJSON()
    expect(json.root.children[0]).toMatchObject({ type: 'code-block', code: 'print(1)', language: 'python' })

    document.body.innerHTML = ''
    const reloaded = mountEditor({ modelValue: json })
    await flushPromises()
    expect(blocks(reloaded.editor)).toEqual(['code:python:print(1)'])
  })
})

describe('inserting', () => {
  it('replaces an empty paragraph via INSERT_CODE_BLOCK_COMMAND', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '')
    editor.dispatchCommand(INSERT_CODE_BLOCK_COMMAND, 'go')
    await flushPromises()
    expect(blocks(editor)).toEqual(['code:go:'])
  })

  it('turns "```rust" + Enter into a rust code block', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, '```rust')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(blocks(editor)).toEqual(['code:rust:'])
  })

  it('leaves Enter alone on ordinary text', async () => {
    const { editor } = mountEditor()
    setParagraph(editor, 'not a ``` fence')
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
    expect(blocks(editor)[0]).toBe('paragraph:not a ``` fence')
  })
})

describe('collapsing', () => {
  const LONG = Array.from({ length: 21 }, (_, i) => `line ${i + 1}`).join('\n')
  function withLongBlock(props: Record<string, unknown> = {}) {
    const setup = mountEditor(props)
    setup.editor.update(() => $getRoot().clear().append($createCodeBlockNode(LONG, 'js')), { discrete: true })
    return setup
  }

  it.each([true, false])('never collapses in the editor (editable: %j)', async (editable) => {
    const { wrapper } = withLongBlock({ editable })
    await flushPromises()
    expect(wrapper.find('.hlx-code-card').attributes('data-collapsed')).toBeUndefined()
    expect(wrapper.find('.hlx-code-toggle').exists()).toBe(false)
    expect(codeMirror().state.doc.lines).toBe(21)
  })
})

describe('codeMirror sync', () => {
  async function withBlock(code: string) {
    const setup = mountEditor()
    setup.editor.update(() => $convertFromMarkdownString(`\`\`\`js\n${code}\n\`\`\``, builtinTransformers), { discrete: true })
    await flushPromises()
    return setup
  }

  it('mounts CodeMirror with the node code', async () => {
    await withBlock('a()')
    expect(codeMirror().state.doc.toString()).toBe('a()')
  })

  it('writes CodeMirror edits back to the node', async () => {
    const { editor } = await withBlock('a()')
    codeMirror().dispatch({
      changes: { from: 3, insert: '\nb()' },
    })
    await flushPromises()
    expect(blocks(editor)).toEqual(['code:js:a()\nb()'])
  })

  it('pushes node changes (e.g. undo) into CodeMirror', async () => {
    const { editor } = await withBlock('a()')
    editor.update(() => {
      const node = $getRoot().getFirstChild()
      if ($isCodeBlockNode(node))
        node.setCode('replaced()')
    }, { discrete: true })
    await flushPromises()
    expect(codeMirror().state.doc.toString()).toBe('replaced()')
  })

  it('is read-only when the editor is', async () => {
    const { wrapper } = await withBlock('a()')
    await wrapper.setProps({ editable: false })
    await flushPromises()
    expect(codeMirror().state.readOnly).toBe(true)
  })
})

describe('stored language', () => {
  const doc = (language: unknown) => ({
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [
        {
          type: 'code-block',
          version: 1,
          code: 'const a = 1',
          language,
        },
      ],
    },
  })
  const node = () => $getRoot().getFirstChild() as CodeBlockNode
  const output = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()) as unknown as ReturnType<typeof doc>

  it.each([
    'typescript',
    'javascript',
    'foo',
    'TS',
  ])('outputs %s as it was stored', async (language) => {
    const value = doc(language)
    const { editor } = mountEditor({ modelValue: value })
    await flushPromises()
    expect(output(editor)).toEqual(value)
    editor.update(() => node().setCode('const b = 2'), { discrete: true })
    expect(output(editor).root.children[0]).toMatchObject({ code: 'const b = 2', language })
  })

  it('uses the normalized language for everything else', async () => {
    const { editor, wrapper } = mountEditor({
      modelValue: doc('typescript'),
    })
    await flushPromises()
    expect(editor.read(() => node().getLanguage())).toBe('ts')
    expect(wrapper.find('.hlx-code-block').text()).not.toContain('typescript')
    const foo = mountEditor({
      modelValue: doc('foo'),
    })
    await flushPromises()
    expect(foo.editor.read(() => node().getLanguage())).toBe('plaintext')
  })

  it.each([
    [42],
    [null],
    ['  '],
  ])('treats %j as plain text', async (language) => {
    const { editor } = mountEditor({
      modelValue: doc(language),
    })
    await flushPromises()
    expect(output(editor).root.children[0].language).toBe('plaintext')
  })

  it('rewrites it only when the author picks another, and undo brings it back', async () => {
    const { editor } = mountEditor({
      modelValue: doc('typescript'),
    })
    await flushPromises()
    // A selection comes before any edit, and that's where history starts.
    editor.update(() => node().selectNext(), { discrete: true })
    editor.update(() => node().setLanguage('ts'), { discrete: true, tag: HISTORY_PUSH_TAG })
    expect(output(editor).root.children[0].language).toBe('typescript')
    editor.update(() => node().setLanguage('python'), { discrete: true, tag: HISTORY_PUSH_TAG })
    expect(output(editor).root.children[0].language).toBe('python')
    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(output(editor).root.children[0].language).toBe('typescript')
  })

  it('still normalizes what comes from markdown and HTML', async () => {
    const { editor } = mountEditor()
    editor.update(() => $convertFromMarkdownString('```typescript\nlet a\n```', builtinTransformers), { discrete: true })
    expect(output(editor).root.children[0].language).toBe('ts')
    const dom = new DOMParser().parseFromString('<pre><code class="language-typescript">x</code></pre>', 'text/html')
    editor.update(() => {
      $getRoot().clear().append(...$generateNodesFromDOM(editor, dom))
    }, { discrete: true })
    expect(output(editor).root.children[0].language).toBe('ts')
  })
})

describe('the card while editing', () => {
  it('numbers the lines, and shows the language\'s icon, which follows a new language', async () => {
    const { editor } = mountEditor({
      modelValue: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'code-block',
              version: 1,
              code: 'a\nb\nc',
              language: 'ts',
            },
          ],
        },
      },
    })
    await flushPromises()
    expect(document.querySelectorAll('.hlx-code-card .cm-lineNumbers .cm-gutterElement').length).toBeGreaterThanOrEqual(3)
    const icon = () => document.querySelector('.hlx-code-card .hlx-code-lang-icon svg')!.getAttribute('data-icon')
    expect(icon()).toBe('typescript')
    editor.update(() => ($getRoot().getFirstChild() as CodeBlockNode).setLanguage('python'), { discrete: true })
    await flushPromises()
    expect(icon()).toBe('python')
  })
})
