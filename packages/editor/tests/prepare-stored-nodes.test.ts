import type { LexicalEditor, SerializedLexicalNode } from 'lexical'
import { mount } from '@vue/test-utils'
import { $parseSerializedNode } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $prepareStoredNodes, RichEditor } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

function text(value: string) {
  return {
    type: 'text',
    text: value,
    format: 0,
    detail: 0,
    mode: 'normal',
    style: '',
    version: 1,
  }
}
function paragraph(...children: unknown[]) {
  return {
    type: 'paragraph',
    children,
    direction: 'ltr',
    format: '',
    indent: 0,
    textFormat: 0,
    textStyle: '',
    version: 1,
  }
}
function content(...children: unknown[]) {
  return {
    root: {
      type: 'root',
      children,
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  }
}

function editorOf() {
  const wrapper = mount(RichEditor, { attachTo: document.body })
  return (wrapper.vm as unknown as { editor: LexicalEditor }).editor
}

describe('$prepareStoredNodes', () => {
  it('turns stored nodes into ones this editor can parse', () => {
    const editor = editorOf()
    const stored = [
      {
        type: 'alert-quote',
        alertType: 'note',
        content: content(paragraph(text('注意'))),
        version: 1,
      },
      { type: 'excalidraw', snapshot: '{}', version: 1 },
      paragraph(text('a'), { type: 'unknown-inline', value: 1, version: 1 }),
    ] as unknown as SerializedLexicalNode[]
    let prepared: any[] = []
    let types: string[] = []
    editor.update(() => {
      prepared = $prepareStoredNodes(stored)
      types = prepared.map(node => $parseSerializedNode(node).getType())
    }, { discrete: true })
    expect(prepared[0].children[0].children[0].text).toBe('注意')
    expect(prepared[0].content).toBeUndefined()
    expect(prepared[1]).toEqual({ type: 'hlx-unknown-block', version: 1, raw: stored[1] })
    expect(prepared[2].children[1]).toEqual({ type: 'hlx-unknown-inline', version: 1, raw: (stored[2] as any).children[1] })
    expect(types).toEqual(['alert-quote', 'hlx-unknown-block', 'paragraph'])
  })
})
