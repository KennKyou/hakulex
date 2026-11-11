import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { DynamicImportKey } from '@hakulex/renderer'
import { $generateHtmlFromNodes } from '@lexical/html'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $createNodeSelection, $getRoot, $getSelection, $isNodeSelection, $setSelection, KEY_ARROW_DOWN_COMMAND, KEY_DELETE_COMMAND, KEY_ENTER_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { $isDynamicNode, builtinTransformers, DynamicNode, INSERT_DYNAMIC_COMMAND, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>
const mounted: { unmount: () => void }[] = []

/** A module that follows the contract: an input inside the component, and a record of what it got. */
function fakeModule() {
  const handle = {
    unmount: vi.fn(),
    update: vi.fn(),
  }
  const mountComponent = vi.fn((container: HTMLElement, _input: Json) => {
    const input = document.createElement('input')
    input.className = 'inside'
    container.append(input)
    return handle
  })
  return {
    module: {
      default: { mount: mountComponent },
    },
    mountComponent,
    handle,
  }
}
let fake: ReturnType<typeof fakeModule>
let importModule: ReturnType<typeof vi.fn>

// Near the screen at once: loading as it comes into view is the renderer's to check.
class SeenObserver {
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) {
    this.callback([
      { isIntersecting: true, target } as unknown as IntersectionObserverEntry,
    ], this as unknown as IntersectionObserver)
  }

  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  fake = fakeModule()
  importModule = vi.fn(async () => fake.module)
  vi.stubGlobal('IntersectionObserver', SeenObserver)
})
afterEach(() => {
  mounted.splice(0).forEach(wrapper => wrapper.unmount())
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
function paragraph(value = '') {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children: value
      ? [
          {
            type: 'text',
            version: 1,
            text: value,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
          },
        ]
      : [],
  }
}
function dynamic(extra: Json = {}) {
  return {
    type: 'dynamic',
    version: 1,
    url: '/widgets/counter.js',
    props: { start: 3 },
    initialHeight: 200,
    ...extra,
  }
}
function documentWith(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}

let editor: LexicalEditor
async function mountEditor(value: SerializedEditorState, props: Json = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    global: {
      provide: { [DynamicImportKey as symbol]: importModule },
    },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return wrapper
}
const output = () => serializeEditorState(editor.getEditorState()).root.children as unknown as Json[]
const stored = () => output().find(node => node.type === 'dynamic')!
const block = () => document.querySelector<HTMLElement>('.hlx-dynamic-editor')!
const box = () => document.querySelector<HTMLElement>('.hlx-dynamic')!
const panel = () => document.querySelector<HTMLElement>('.hlx-block-panel[aria-label="動態元件"]')
const field = <T extends HTMLElement = HTMLInputElement>(name: string) => panel()!.querySelector<T>(`[data-field="${name}"]`)!
const alertText = () => panel()?.querySelector('[role="alert"]')?.textContent?.trim() ?? null
const toolbar = () => document.querySelector<HTMLElement>('.hlx-block-toolbar[aria-label="動態元件"]')
const inside = () => box().querySelector('.hlx-dynamic-host')!.shadowRoot!.querySelector<HTMLInputElement>('input.inside')!

function pickBlock() {
  editor.update(() => {
    const selection = $createNodeSelection()
    selection.add($getRoot().getChildren().find($isDynamicNode)!.getKey())
    $setSelection(selection)
  }, { discrete: true })
  return flushPromises()
}
async function type(name: string, value: string, entered = false) {
  const target = field<HTMLInputElement | HTMLTextAreaElement>(name)
  target.focus()
  target.value = value
  target.dispatchEvent(new Event('input', { bubbles: true }))
  if (entered)
    target.dispatchEvent(new Event('change', { bubbles: true }))
  await flushPromises()
  await flushPromises()
}
async function leave(name: string) {
  field(name).dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
  await flushPromises()
}
async function undo() {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

describe('stored dynamic blocks', () => {
  it('output what they were loaded with, fields of their own included', async () => {
    const value = documentWith(dynamic({ extra: 1 }), paragraph())
    await mountEditor(value)
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
    expect(fake.mountComponent).toHaveBeenCalledOnce()
    expect(fake.mountComponent.mock.calls[0][1]).toEqual({
      props: { start: 3 },
      host: { theme: 'light' },
    })
  })

  it('show bad values as missing, and output them as they were', async () => {
    const value = documentWith(dynamic({
      url: 3,
      props: [1],
      initialHeight: 0,
    }))
    await mountEditor(value)
    expect(box().style.minHeight).toBe('320px')
    expect(box().textContent).toContain('沒有元件網址')
    expect(serializeEditorState(editor.getEditorState())).toEqual(value)
  })

  it('load from another origin only when the site allows it', async () => {
    await mountEditor(documentWith(dynamic({ url: 'https://cdn.example.net/a.js' })))
    expect(box().textContent).toContain('未允許載入')
    expect(importModule).not.toHaveBeenCalled()
    mounted.splice(0).forEach(wrapper => wrapper.unmount())
    document.body.innerHTML = ''
    await mountEditor(documentWith(dynamic({ url: 'https://cdn.example.net/a.js' })), {
      allowDynamicUrl: (url: string) => url.startsWith('https://cdn.example.net/'),
    })
    expect(fake.mountComponent).toHaveBeenCalledOnce()
  })
})

describe('adding one', () => {
  it('inserts an empty block with its panel open on the address, as one undo step', async () => {
    await mountEditor(documentWith(paragraph('前')))
    editor.update(() => $getRoot().selectEnd(), { discrete: true })
    editor.dispatchCommand(INSERT_DYNAMIC_COMMAND, undefined)
    await flushPromises()
    expect(stored()).toMatchObject({
      type: 'dynamic',
      url: '',
      props: {},
      initialHeight: 320,
    })
    expect(box().textContent).toContain('沒有元件網址')
    expect(panel()).not.toBeNull()
    expect(document.activeElement).toBe(field('url'))
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()
    await undo()
    expect(output().some(node => node.type === 'dynamic')).toBe(false)
  })
})

describe('the panel', () => {
  async function opened(extra: Json = {}) {
    await mountEditor(documentWith(dynamic(extra), paragraph()))
    await pickBlock()
    editor.dispatchCommand(KEY_ENTER_COMMAND, new KeyboardEvent('keydown', { key: 'Enter' }))
    await flushPromises()
  }

  it('writes each change as it is made, a step for each field', async () => {
    await opened({ url: '' })
    expect(field('url').value).toBe('')
    await type('url', '/widgets/coun')
    expect(stored().url).toBe('')
    await type('url', '/widgets/counter.js', true)
    expect(stored().url).toBe('/widgets/counter.js')
    expect(fake.mountComponent).toHaveBeenCalledOnce()
    await type('initialHeight', '240')
    await leave('initialHeight')
    expect(stored().initialHeight).toBe(240)
    expect(box().style.minHeight).toBe('240px')
    await type('props', '{"start":5}')
    await leave('props')
    expect(stored().props).toEqual({ start: 5 })
    expect(fake.handle.update).toHaveBeenLastCalledWith({
      props: { start: 5 },
      host: { theme: 'light' },
    })
    expect(fake.mountComponent).toHaveBeenCalledOnce()
    toolbar()!.querySelector('button')!.click()
    await flushPromises()
    expect(panel()).toBeNull()
    await undo()
    expect(stored()).toMatchObject({
      initialHeight: 240,
      props: { start: 3 },
    })
    await undo()
    expect(stored().initialHeight).toBe(200)
  })

  it.each([
    [
      'url',
      'ftp://example.com/a.js',
      true,
      '網址要是 http(s) 或這個網站的路徑',
    ],
    [
      'initialHeight',
      '0',
      false,
      '初始高度要是 1 到 4000 的整數',
    ],
    [
      'initialHeight',
      'abc',
      false,
      '初始高度要是 1 到 4000 的整數',
    ],
    [
      'props',
      'not json',
      false,
      'props 要是 JSON 物件',
    ],
    [
      'props',
      '[1, 2]',
      false,
      'props 要是 JSON 物件',
    ],
  ])('refuses %s %j, keeping the last good value', async (name, value, entered, message) => {
    await opened()
    const before = stored()
    await type(name, value, entered)
    expect(alertText()).toBe(message)
    expect(field(name).getAttribute('aria-invalid')).toBe('true')
    expect(stored()).toEqual(before)
  })

  it('puts the block back as it was on Esc', async () => {
    await opened()
    const before = stored()
    await type('initialHeight', '500')
    await leave('initialHeight')
    await type('props', '{"start":9}')
    await new Promise(resolve => setTimeout(resolve, 5))
    field('props').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).toBeNull()
    expect(stored()).toEqual(before)
  })
})

describe('as a block', () => {
  it('is picked by its 選取 button and the keyboard, opened from its toolbar and a double click, and deleted and restored', async () => {
    await mountEditor(documentWith(paragraph('前'), dynamic(), paragraph('後')))
    block().querySelector<HTMLButtonElement>('.hlx-dynamic-pick')!.click()
    await flushPromises()
    expect(block().hasAttribute('data-selected')).toBe(true)
    // The button goes once it has picked the block, so the keyboard goes to the editor.
    expect(document.activeElement).toBe(editor.getRootElement())
    expect(toolbar()).not.toBeNull()
    toolbar()!.querySelector('button')!.click()
    await flushPromises()
    expect(panel()).not.toBeNull()
    toolbar()!.querySelector('button')!.click()
    await flushPromises()
    expect(panel()).toBeNull()
    block().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(panel()).not.toBeNull()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await flushPromises()

    editor.update(() => $getRoot().getFirstChildOrThrow().selectEnd(), { discrete: true })
    editor.dispatchCommand(KEY_ARROW_DOWN_COMMAND, new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    await flushPromises()
    expect(editor.read(() => $isNodeSelection($getSelection()))).toBe(true)
    editor.dispatchCommand(KEY_DELETE_COMMAND, new KeyboardEvent('keydown', { key: 'Delete' }))
    await flushPromises()
    expect(output().some(node => node.type === 'dynamic')).toBe(false)
    await undo()
    expect(output().some(node => node.type === 'dynamic')).toBe(true)
  })

  it('keeps what happens inside the component to the component', async () => {
    await mountEditor(documentWith(paragraph('前'), dynamic(), paragraph('後')))
    const before = serializeEditorState(editor.getEditorState())
    const heard: string[] = []
    for (const name of [
      'keydown',
      'beforeinput',
      'input',
      'paste',
      'copy',
      'cut',
      'compositionstart',
      'compositionend',
      'click',
      'dblclick',
    ])
      editor.getRootElement()!.addEventListener(name, () => heard.push(name))
    const target = inside()
    target.focus()
    for (const event of [
      new KeyboardEvent('keydown', {
        key: 'Backspace',
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
      new InputEvent('beforeinput', {
        inputType: 'insertText',
        data: 'a',
        bubbles: true,
        composed: true,
        cancelable: true,
      }),
      new InputEvent('input', {
        inputType: 'insertText',
        data: 'a',
        bubbles: true,
        composed: true,
      }),
      new Event('paste', { bubbles: true, composed: true, cancelable: true }),
      new CompositionEvent('compositionstart', { bubbles: true, composed: true }),
      new CompositionEvent('compositionend', { bubbles: true, composed: true }),
      new MouseEvent('click', { bubbles: true, composed: true }),
      new MouseEvent('dblclick', { bubbles: true, composed: true }),
    ])
      target.dispatchEvent(event)
    await flushPromises()
    expect(heard).toEqual([])
    expect(panel()).toBeNull()
    expect(block().hasAttribute('data-selected')).toBe(false)
    expect(serializeEditorState(editor.getEditorState())).toEqual(before)
  })

  it('runs the component while read-only, with no toolbar and no panel', async () => {
    await mountEditor(documentWith(dynamic()), { editable: false })
    expect(fake.mountComponent).toHaveBeenCalledOnce()
    expect(block().querySelector('.hlx-dynamic-pick')).toBeNull()
    block().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    await flushPromises()
    expect(toolbar()).toBeNull()
    expect(panel()).toBeNull()
  })
})

describe('exporting and copying', () => {
  it('leaves it out of Markdown and HTML', async () => {
    await mountEditor(documentWith(paragraph('前'), dynamic(), paragraph('後')))
    const markdown = editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))
    expect(markdown.split(/\n+/).filter(Boolean)).toEqual(['前', '後'])
    const html = editor.getEditorState().read(() => $generateHtmlFromNodes(editor))
    expect(html).toContain('前')
    expect(html).not.toContain('counter.js')
    expect(html).not.toContain('dynamic')
  })

  it('keeps its address, props and height in a copy', async () => {
    await mountEditor(documentWith(dynamic(), paragraph()))
    const copy = editor.read(() => ($getRoot().getFirstChild() as DynamicNode).exportJSON())
    editor.update(() => {
      $getRoot().append(DynamicNode.importJSON(copy))
    }, { discrete: true })
    expect(output().filter(node => node.type === 'dynamic')[1]).toMatchObject({
      url: '/widgets/counter.js',
      props: { start: 3 },
      initialHeight: 200,
    })
  })
})
