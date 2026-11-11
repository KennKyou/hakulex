import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { RichRenderer } from '@hakulex/renderer'
import { $createAutoLinkNode } from '@lexical/link'
import { $convertFromMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createParagraphNode, $createTextNode, $getRoot, createEditor } from 'lexical'
import { afterEach, expect, it } from 'vitest'
import { builtinNodes, builtinTransformers, RichEditor, serializeEditorState } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

const MARKDOWN = `# Title

Some **bold**, *italic*, ***both***, ~~strike~~, \`code\`, ==mark== and a [link](https://example.com), plus $E=mc^2$, ||雷 **粗**||, <ruby>漢<rt>hàn</rt></ruby>, ^上^, ~下~, ++底++, <tag>標籤</tag> and <!--筆記-->, {GH@octocat}, [Octocat]{TG@octocat}, {weibo@a}, with a note[^1] and another[^2].

## Title

> A quote with **bold**

- one
    - nested
- two

1. first
2. second

- [ ] todo
- [x] done

| **Name** | Note |
| --- | --- |
| [Ada](https://example.com) | \`code\` |

\`\`\`ts
const answer = 42
\`\`\`

$$
\\frac{a}{b}
$$

![cat](https://example.com/a.png)

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

***

Visit https://example.org today

Last line

<video src="/a.webm" width="640" height="360" controls></video>

<a href="/a.pdf" download="a.pdf" data-hlx-file data-size="10">a.pdf</a>

[^1]: 第一個註腳

[^2]: 第二個註腳`

/**
 * Structure and classes only. Lexical wraps plain text in a class-less
 * <span data-lexical-text>; the renderer emits bare text, so such spans are
 * transparent. Attributes other than class, and empty text nodes, are ignored.
 */
function shape(node: Node): string {
  // Empty text nodes include Vue Teleport's anchors inside decorator blocks.
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent
      ? JSON.stringify(node.textContent)
      : ''
  }
  if (!(node instanceof HTMLElement))
    return ''
  // Lexical's invisible caret anchor next to a trailing decorator, and the column
  // sizes it manages (the renderer only outputs them for documents that set widths).
  if (node.hasAttribute('data-lexical-decorator-boundary') || node.tagName === 'COLGROUP')
    return ''
  // Code blocks differ inside by design (CodeMirror vs. highlighted <pre>); compare the host only.
  // Likewise math and diagrams: compare the hosts, not KaTeX / pele output (rendered asynchronously).
  for (const host of [
    'hlx-code-block',
    'hlx-math-block',
    'hlx-math-inline',
    'hlx-mermaid-block',
    'hlx-image-block',
    'hlx-video-block',
    'hlx-file-block',
  ]) {
    if (node.classList.contains(host))
      return `${node.tagName.toLowerCase()}.${host}(…)`
  }
  // Comments are for authors, and an attribution with nothing in it shows nothing.
  if (node.classList.contains('hlx-comment') || (node.tagName === 'FOOTER' && !node.textContent))
    return ''
  // A heading's anchor link is for readers only.
  if (node.classList.contains('hlx-heading-anchor'))
    return ''
  // The editor draws a ruby's reading from an attribute, as a real `rt` would take the caret.
  if (node.tagName === 'RT')
    return ''
  const children = [...node.childNodes].map(shape).filter(Boolean)
  // The renderer writes `tbody` because HTML parsers add one; Lexical's DOM has none.
  // Likewise the hosts Lexical needs around a footnote and its section.
  if ((node.tagName === 'SPAN' && !node.className) || node.tagName === 'TBODY' || node.classList.contains('hlx-footnote-host') || node.classList.contains('hlx-footnote-click') || node.classList.contains('hlx-mention-node') || node.classList.contains('hlx-mention-editor'))
    return children.join(' ')
  const classes = [...node.classList].sort().join('.')
  return `${node.tagName.toLowerCase()}${classes
    ? `.${classes}`
    : ''}(${children.join(' ')})`
}

/** The blocks of a step: in the editor they sit in the step's own editable element. */
function shapeOfContent(step: Element) {
  const blocks = step.querySelector('[data-lexical-editor]') ?? step
  return [...blocks.children].map(shape).filter(Boolean)
}

function stepContent(markdown: string) {
  const scratch = createEditor({
    nodes: builtinNodes.filter(node => !('getType' in node) || !['steps', 'footnote', 'footnote-section'].includes(node.getType())),
    onError: (error) => {
      throw error
    },
  })
  scratch.update(() => $convertFromMarkdownString(markdown, builtinTransformers.filter(transformer => !('dependencies' in transformer) || transformer.dependencies.every(dependency => dependency.getType() !== 'footnote'))), { discrete: true })
  return scratch.getEditorState().toJSON()
}

it('renderer output matches the editor DOM for the same document', async () => {
  const editorWrapper = mount(RichEditor, { attachTo: document.body })
  const editor = (editorWrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.update(() => $convertFromMarkdownString(MARKDOWN, builtinTransformers), { discrete: true })
  await flushPromises()
  // Readers are who the two have to agree for: editing adds controls to footnotes.
  editor.setEditable(false)
  await flushPromises()

  const json = editor.getEditorState().toJSON()
  const rendererWrapper = mount(RichRenderer, {
    props: { value: json },
    attachTo: document.body,
  })
  await flushPromises()

  const editorBlocks = [
    ...editorWrapper.find('.hlx-content').element.children,
  ].map(shape).filter(Boolean)
  const rendererBlocks = [...rendererWrapper.element.children].map(shape)

  // Sanity: the document covers every built-in block type.
  const tags = editorBlocks.map(block => block.slice(0, block.indexOf('.')))
  expect(tags).toEqual([
    'h1',
    'p',
    'h2',
    'blockquote',
    'ul',
    'ol',
    'ul',
    'div', // table
    'div', // code block
    'div', // math block
    'div', // image
    'div', // mermaid
    'div', // horizontal rule
    'p', // autolink
    'p',
    'div', // video
    'div', // file
    'section', // footnotes
  ])
  expect(rendererBlocks).toEqual(editorBlocks)
})

it('renders what is inside steps the same way in both', async () => {
  const editorWrapper = mount(RichEditor, {
    props: {
      editable: false,
      modelValue: {
        root: {
          type: 'root',
          version: 1,
          format: '',
          indent: 0,
          direction: null,
          children: [
            {
              type: 'steps',
              version: 1,
              steps: [
                {
                  id: 'a',
                  title: '甲',
                  content: stepContent('# 小標\n\n一段 **粗** 字\n\n- 項目'),
                },
                {
                  id: 'b',
                  title: '乙',
                  content: stepContent('{GH@octocat} 字'),
                },
              ],
            },
          ],
        },
      } as unknown as SerializedEditorState,
    } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const editor = (editorWrapper.vm as unknown as { editor: LexicalEditor }).editor
  const rendererWrapper = mount(RichRenderer, {
    props: {
      value: serializeEditorState(editor.getEditorState()),
    },
    attachTo: document.body,
  })
  await flushPromises()

  const shapes = (container: Element) => [
    ...container.querySelectorAll('.hlx-step-content'),
  ].map(step => shapeOfContent(step))
  const fromEditor = shapes(editorWrapper.element.querySelector('.hlx-steps')!)
  expect(fromEditor).toHaveLength(2)
  expect(fromEditor[0][0]).toContain('h1')
  expect(shapes(rendererWrapper.element.querySelector('.hlx-steps') ?? rendererWrapper.element)).toEqual(fromEditor)
})

it('renders blocks edited in a dialog the same way in both', async () => {
  const image = {
    src: 'https://example.com/a.png',
    alt: '甲',
    width: 4,
    height: 3,
  }
  const blocks = [
    {
      type: 'code-snippet',
      version: 1,
      files: [
        {
          filename: 'a.ts',
          code: 'x',
          highlightLines: [1],
        },
        { filename: 'b.ts', code: 'y' },
      ],
    },
    {
      type: 'gallery',
      version: 1,
      images: [image, image],
      layout: 'grid',
      aspect: '4:3',
    },
    {
      type: 'gallery',
      version: 1,
      images: [image, image],
      layout: 'masonry',
      maxItemHeight: 100,
    },
    {
      type: 'gallery',
      version: 1,
      images: [image, image],
      layout: 'carousel',
    },
    {
      type: 'chat',
      version: 1,
      variant: 'user-agent',
      participants: [
        { id: 'u', kind: 'user', name: '小明' },
        { id: 'a', kind: 'agent' },
      ],
      messages: [
        { id: '1', participantId: 'u', content: '**問**' },
        { id: '2', participantId: 'a', content: '- 答' },
      ],
    },
  ]
  const value = {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: blocks,
    },
  } as unknown as SerializedEditorState
  const editorWrapper = mount(RichEditor, {
    props: { editable: false, modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const rendererWrapper = mount(RichRenderer, {
    props: { value },
    attachTo: document.body,
  })
  await flushPromises()
  const shapes = (container: Element) => [
    ...container.querySelectorAll('.hlx-snippet, .hlx-gallery, .hlx-chat'),
  ].map(shape)
  const fromEditor = shapes(editorWrapper.element)
  expect(fromEditor).toHaveLength(5)
  expect(shapes(rendererWrapper.element.parentElement!).slice(-5)).toEqual(fromEditor)
})

it('renders what is inside nested documents and grids the same way in both', async () => {
  const blocks = [
    {
      type: 'nested-doc',
      version: 1,
      content: stepContent('# 小標\n\n一段 **粗** 字'),
    },
    {
      type: 'grid-container',
      version: 1,
      cols: 2,
      gap: '8px',
      cells: [
        stepContent('- 項目'),
        stepContent('{GH@octocat} 字'),
      ],
    },
  ]
  const value = {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: blocks,
    },
  } as unknown as SerializedEditorState
  const editorWrapper = mount(RichEditor, {
    props: { editable: false, modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  const rendererWrapper = mount(RichRenderer, {
    props: { value },
    attachTo: document.body,
  })
  await flushPromises()
  const shapes = (container: Element) => [
    ...container.querySelectorAll('.hlx-nested-doc-body, .hlx-grid-cell'),
  ].map(shapeOfContent)
  const fromEditor = shapes(editorWrapper.element)
  expect(fromEditor).toHaveLength(3)
  expect(fromEditor[0][0]).toContain('h1')
  expect(shapes(rendererWrapper.element.parentElement!).slice(-3)).toEqual(fromEditor)
})

it('renders an unlinked autolink the same way in both', async () => {
  const editorWrapper = mount(RichEditor, { attachTo: document.body })
  const editor = (editorWrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.update(() => {
    const link = $createAutoLinkNode('https://example.org', { isUnlinked: true })
    $getRoot().clear().append($createParagraphNode().append(link.append($createTextNode('https://example.org'))))
  }, { discrete: true })
  await flushPromises()

  const rendererWrapper = mount(RichRenderer, {
    props: {
      value: editor.getEditorState().toJSON(),
    },
    attachTo: document.body,
  })
  await flushPromises()

  const editorBlocks = [
    ...editorWrapper.find('.hlx-content').element.children,
  ].map(shape)
  expect(editorBlocks[0]).not.toContain('a.')
  expect([...rendererWrapper.element.children].map(shape)).toEqual(editorBlocks)
})

it('gives an image with a caption and width the same figure in both', async () => {
  const image = {
    type: 'image',
    version: 1,
    src: 'https://example.com/a.png',
    altText: 'cat',
    width: 800,
    height: 600,
    caption: 'A cat',
    displayWidth: 50,
  }
  const value = {
    root: {
      type: 'root',
      version: 1,
      format: '',
      indent: 0,
      direction: null,
      children: [image],
    },
  } as unknown as SerializedEditorState
  const editorWrapper = mount(RichEditor, {
    props: { modelValue: value },
    attachTo: document.body,
  })
  const rendererWrapper = mount(RichRenderer, {
    props: { value },
    attachTo: document.body,
  })
  await flushPromises()

  const describeFigure = (root: Element) => {
    const figure = root.querySelector('.hlx-image-block figure')!
    const img = figure.querySelector<HTMLElement>('img:not([data-lexical-decorator-boundary])')!
    return {
      figure: figure.className,
      children: [...figure.children].map(child => `${child.tagName}.${child.className}`),
      caption: figure.querySelector('figcaption')?.textContent?.trim(),
      width: img.style.width,
      attrs: [
        img.getAttribute('width'),
        img.getAttribute('height'),
        img.getAttribute('alt'),
      ],
    }
  }
  expect(describeFigure(editorWrapper.element)).toEqual(describeFigure(rendererWrapper.element))
  expect(describeFigure(rendererWrapper.element).width).toBe('50%')
})

it('renders callout blocks the same way in both', async () => {
  const editorWrapper = mount(RichEditor, { attachTo: document.body })
  const editor = (editorWrapper.vm as unknown as { editor: LexicalEditor }).editor
  editor.update(() => $convertFromMarkdownString(
    '> [!WARNING]\n> In an **alert**\n\n::: tip\n- in a banner\n:::\n\n::: details{summary="更多"}\nIn details\n:::',
    builtinTransformers,
  ), { discrete: true })
  await flushPromises()

  const rendererWrapper = mount(RichRenderer, {
    props: {
      value: editor.getEditorState().toJSON(),
    },
    attachTo: document.body,
  })
  await flushPromises()

  const editorBlocks = [
    ...editorWrapper.find('.hlx-content').element.children,
  ].map(shape)
  expect(editorBlocks).toHaveLength(3)
  expect(editorBlocks[0]).toContain('hlx-callout-label')
  expect(editorBlocks[0]).toContain('警告')
  expect(editorBlocks[2]).toContain('span.hlx-details-summary-text("更多")')
  expect([...rendererWrapper.element.children].map(shape)).toEqual(editorBlocks)
})

it('renderer output matches the editor DOM for quotes with and without an attribution', async () => {
  const text = (value: string) => ({
    type: 'text',
    version: 1,
    text: value,
    format: 0,
    style: '',
    mode: 'normal',
    detail: 0,
  })
  const element = {
    format: '',
    indent: 0,
    direction: null,
    version: 1,
  }
  const value = {
    root: {
      ...element,
      type: 'root',
      children: [
        {
          ...element,
          type: 'rich-quote',
          attribution: '魯迅',
          children: [
            text('甲'),
          ],
        },
        {
          ...element,
          type: 'rich-quote',
          attribution: null,
          children: [
            text('乙'),
          ],
        },
        {
          ...element,
          type: 'quote',
          children: [
            text('丙'),
          ],
        },
      ],
    },
  } as unknown as SerializedEditorState
  const editorWrapper = mount(RichEditor, {
    props: { modelValue: value },
    attachTo: document.body,
  })
  await flushPromises()
  const rendererWrapper = mount(RichRenderer, {
    props: { value },
    attachTo: document.body,
  })
  await flushPromises()
  const blocks = (root: Element) => [...root.children].map(shape).filter(Boolean)
  const expected = blocks(rendererWrapper.element)
  expect(expected[0]).toContain('footer')
  expect(blocks(editorWrapper.find('.hlx-content').element)).toEqual(expected)
})
