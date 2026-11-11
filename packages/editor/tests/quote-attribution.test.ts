import type { ElementNode, LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { RichEditor, serializeEditorState } from '../src'

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
const quote = (...children: unknown[]) => ({ ...element, type: 'quote', children })
function richQuote(attribution: string | null, ...children: unknown[]) {
  return {
    ...element,
    type: 'rich-quote',
    attribution,
    children,
  }
}
function doc(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  } as unknown as SerializedEditorState
}

async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    attachTo: document.body,
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  await flushPromises()
  editor.getRootElement()!.focus()
  return { editor, wrapper }
}

function caretIn(editor: LexicalEditor, path: number[] = [0]) {
  editor.update(() => {
    let node = $getRoot() as ElementNode
    for (const index of path)
      node = node.getChildAtIndex<ElementNode>(index)!
    node.selectEnd()
  }, { discrete: true })
}
const input = () => document.querySelector<HTMLInputElement>('.hlx-quote-bar input')
const first = (editor: LexicalEditor) => (serializeEditorState(editor.getEditorState()).root.children as Json[])[0]

async function write(value: string) {
  const field = input()!
  field.focus()
  field.value = value
  field.dispatchEvent(new Event('input'))
  await flushPromises()
}
async function press(key: string, init: KeyboardEventInit = {}) {
  input()!.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  }))
  await flushPromises()
}
async function undo(editor: LexicalEditor) {
  editor.dispatchCommand(UNDO_COMMAND, undefined)
  await flushPromises()
}

describe('showing', () => {
  it('shows when the caret is in a quote, and not elsewhere', async () => {
    const { editor } = await mountEditor(doc(quote(text('字')), paragraph(text('外'))))
    caretIn(editor)
    await flushPromises()
    expect(input()).not.toBeNull()
    expect(input()!.value).toBe('')
    caretIn(editor, [1])
    await flushPromises()
    expect(input()).toBeNull()
  })

  it('shows inside a quote holding paragraphs too, with what is there', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', paragraph(text('字')))))
    caretIn(editor, [0, 0])
    await flushPromises()
    expect(input()!.value).toBe('魯迅')
  })

  it('does not show when read only, but keeps showing the attribution', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', text('字'))), { editable: false })
    caretIn(editor)
    await flushPromises()
    expect(input()).toBeNull()
    expect(editor.getRootElement()!.querySelector('footer')!.textContent).toBe('— 魯迅')
  })

  it('goes away when focus leaves the editor', async () => {
    const { editor } = await mountEditor(doc(quote(text('字'))))
    caretIn(editor)
    await flushPromises()
    const outside = document.body.appendChild(document.createElement('button'))
    outside.focus()
    await flushPromises()
    expect(input()).toBeNull()
  })

  it('is told apart from where a callout puts its bar', async () => {
    const alert = {
      ...element,
      type: 'alert-quote',
      alertType: 'note',
      children: [
        quote(text('字')),
      ],
    }
    const { editor } = await mountEditor(doc(alert))
    caretIn(editor, [0, 0])
    await flushPromises()
    const bars = document.querySelectorAll('.hlx-callout-bar')
    expect(bars).toHaveLength(2)
    expect(document.querySelector('.hlx-quote-bar')).not.toBeNull()
  })
})

describe('editing', () => {
  it('makes a plain quote a rich one with Enter, keeping the rest', async () => {
    const source = {
      ...quote(text('內文')),
      format: 'center',
      direction: 'ltr',
      indent: 1,
    }
    const { editor } = await mountEditor(doc(source))
    caretIn(editor)
    await flushPromises()
    await write(' 魯迅 ')
    await press('Enter')
    expect(first(editor)).toMatchObject({
      type: 'rich-quote',
      attribution: '魯迅',
      format: 'center',
      indent: 1,
      direction: 'ltr',
    })
    expect(first(editor).children[0].text).toBe('內文')
    expect(editor.getRootElement()!.querySelector('footer')!.textContent).toBe('— 魯迅')
    expect(document.activeElement).toBe(editor.getRootElement())
    expect(input()!.value).toBe('魯迅')
  })

  it('takes one undo to go back to the plain quote', async () => {
    const source = quote(text('內文'))
    const { editor } = await mountEditor(doc(source))
    caretIn(editor)
    await flushPromises()
    await write('魯迅')
    await press('Enter')
    await undo(editor)
    expect(first(editor)).toEqual(source)
  })

  it('takes one undo when changing a rich quote', async () => {
    const { editor } = await mountEditor(doc(richQuote('甲', text('字'))))
    caretIn(editor)
    await flushPromises()
    await write('乙')
    await press('Enter')
    input()!.dispatchEvent(new FocusEvent('blur'))
    await flushPromises()
    expect(first(editor).attribution).toBe('乙')
    await undo(editor)
    expect(first(editor).attribution).toBe('甲')
  })

  it('clears it, staying a rich quote', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', text('字'))))
    caretIn(editor)
    await flushPromises()
    await write('   ')
    await press('Enter')
    expect(first(editor)).toMatchObject({ type: 'rich-quote', attribution: null })
    expect(editor.getRootElement()!.querySelector('footer')!.textContent).toBe('')
  })

  it('leaves a plain quote plain when nothing was written', async () => {
    const source = quote(text('字'))
    const { editor } = await mountEditor(doc(source))
    caretIn(editor)
    await flushPromises()
    await write('  ')
    await press('Enter')
    expect(first(editor)).toEqual(source)
  })

  it('drops the edit with Esc', async () => {
    const source = quote(text('字'))
    const { editor } = await mountEditor(doc(source))
    caretIn(editor)
    await flushPromises()
    await write('魯迅')
    await press('Escape')
    expect(first(editor)).toEqual(source)
    expect(document.activeElement).toBe(editor.getRootElement())
    expect(input()!.value).toBe('')
  })

  it('writes it when leaving, as one undo', async () => {
    const source = quote(text('字'))
    const { editor } = await mountEditor(doc(source))
    caretIn(editor)
    await flushPromises()
    await write('魯迅')
    input()!.dispatchEvent(new FocusEvent('blur'))
    await flushPromises()
    expect(first(editor).attribution).toBe('魯迅')
    await undo(editor)
    expect(first(editor)).toEqual(source)
  })

  it('does not confirm with the Enter that picks a word', async () => {
    const source = quote(text('字'))
    const { editor } = await mountEditor(doc(source))
    caretIn(editor)
    await flushPromises()
    await write('魯')
    await press('Enter', { isComposing: true })
    expect(first(editor)).toEqual(source)
    expect(document.activeElement).toBe(input())
  })

  it('does not drop the edit with the Esc that cancels a composition', async () => {
    const { editor } = await mountEditor(doc(quote(text('字'))))
    caretIn(editor)
    await flushPromises()
    await write('魯')
    await press('Escape', { isComposing: true })
    expect(input()!.value).toBe('魯')
  })
})

describe('pressing the attribution', () => {
  it('puts the caret at the end of the quote, which brings up the field', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', text('字')), paragraph(text('外'))))
    caretIn(editor, [1])
    await flushPromises()
    expect(input()).toBeNull()
    const footer = editor.getRootElement()!.querySelector('footer')!
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    footer.dispatchEvent(event)
    await flushPromises()
    expect(event.defaultPrevented).toBe(true)
    expect(input()!.value).toBe('魯迅')
  })

  it('does nothing when read only', async () => {
    const { editor } = await mountEditor(doc(richQuote('魯迅', text('字'))), { editable: false })
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    editor.getRootElement()!.querySelector('footer')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})
