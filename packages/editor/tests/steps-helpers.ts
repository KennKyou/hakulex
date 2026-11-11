import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { flushPromises, mount } from '@vue/test-utils'
import { $addUpdateTag, $getRoot, $getSelection, $isRangeSelection, HISTORY_PUSH_TAG } from 'lexical'
import { RichEditor, serializeEditorState } from '../src'

export type Json = Record<string, any>

export function text(value: string) {
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
export function paragraph(...children: unknown[]) {
  return {
    ...element,
    type: 'paragraph',
    textFormat: 0,
    textStyle: '',
    children,
  }
}
export function content(...children: unknown[]) {
  return {
    root: { ...element, type: 'root', children },
  }
}
export function doc(...children: unknown[]) {
  return content(...children) as unknown as SerializedEditorState
}
export function step(id: string, title: string, ...children: unknown[]) {
  return {
    id,
    title,
    content: content(...children),
  }
}
export const steps = (...items: unknown[]) => ({ type: 'steps', version: 1, steps: items })

export async function mountEditor(value: SerializedEditorState, props: Record<string, unknown> = {}, slots: Record<string, unknown> = {}) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value, ...props } as never,
    slots: slots as never,
    attachTo: document.body,
  })
  await flushPromises()
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  return { wrapper, editor }
}

export const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]

/** The editors of the steps on the page, in order. */
export function stepEditors(): LexicalEditor[] {
  return [
    ...document.querySelectorAll<HTMLElement & { __lexicalEditor: LexicalEditor }>('.hlx-step-content [data-lexical-editor]'),
  ]
    .map(root => root.__lexicalEditor)
}

export const textOf = (editor: LexicalEditor) => editor.getEditorState().read(() => $getRoot().getTextContent())

/** One edit at the end of `editor`, kept apart from the last one in the history. */
export async function typeInto(editor: LexicalEditor, value: string) {
  editor.update(() => {
    $addUpdateTag(HISTORY_PUSH_TAG)
    $getRoot().selectEnd()
    const selection = $getSelection()
    if ($isRangeSelection(selection))
      selection.insertText(value)
  }, { discrete: true })
  await flushPromises()
}
