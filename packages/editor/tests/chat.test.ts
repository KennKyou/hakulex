import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { $convertToMarkdownString } from '@lexical/markdown'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { $isChatNode, builtinTransformers, RichEditor, serializeEditorState } from '../src'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
})

const element = {
  format: '',
  indent: 0,
  direction: null,
  version: 1,
}
function doc(...children: unknown[]) {
  return ({
    root: { ...element, type: 'root', children },
  }) as unknown as SerializedEditorState
}
function chat(variant: unknown, participants: unknown, messages: unknown, extra: Record<string, unknown> = {}) {
  return {
    type: 'chat',
    version: 1,
    variant,
    participants,
    messages,
    ...extra,
  }
}
const user = {
  id: 'u',
  kind: 'user',
  name: '小明',
  extra: 1,
}
const agent = { id: 'a', kind: 'agent' }

async function mountEditor(value: SerializedEditorState) {
  const wrapper = mount(RichEditor, {
    props: { modelValue: value } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, editor: (wrapper.vm as unknown as { editor: LexicalEditor }).editor }
}
const read = (editor: LexicalEditor) => serializeEditorState(editor.getEditorState()).root.children as Json[]

describe('stored data', () => {
  it.each([
    [
      'all fields',
      chat('user-agent', [user, agent], [
        {
          id: '1',
          participantId: 'u',
          content: '字',
          extra: 2,
        },
      ], { other: 3 }),
    ],
    [
      'an unknown variant',
      chat('made-up', [user], []),
    ],
    [
      'bad lists',
      chat('user-user', 'x', 7),
    ],
    [
      'bad items',
      chat('user-agent', [
        1,
        null,
        { id: 7 },
      ], [
        1,
        { content: 7 },
      ]),
    ],
  ])('leaves %s as they are', async (_name, node) => {
    const value = doc(node)
    const { editor } = await mountEditor(value)
    expect(editor.getEditorState().read(() => $isChatNode($getRoot().getFirstChild()))).toBe(true)
    expect(read(editor)).toEqual(value.root.children)
  })

  it('shows what the renderer shows, with HTML as text', async () => {
    const { wrapper } = await mountEditor(doc(chat('user-agent', [user, agent], [
      { id: '1', participantId: 'u', content: '<img src=x onerror=alert(1)> **粗**' },
    ])))
    expect(wrapper.find('.hlx-chat-bubble strong').text()).toBe('粗')
    expect(wrapper.find('.hlx-chat-bubble img').exists()).toBe(false)
  })

  it('reads as its messages, for copying and search', async () => {
    const { editor } = await mountEditor(doc(chat('user-agent', [user, agent], [
      { id: '1', participantId: 'u', content: '問' },
      { id: '2', participantId: 'a', content: '答' },
    ])))
    expect(editor.getEditorState().read(() => $getRoot().getTextContent())).toContain('問\n答')
  })
})

describe('markdown', () => {
  it('quotes bubbles with who said them, and leaves the agent as it is', async () => {
    const { editor } = await mountEditor(doc(chat('user-agent', [user, agent], [
      { id: '1', participantId: 'u', content: '一\n二' },
      { id: '2', participantId: 'a', content: '**答**' },
      { id: '3', participantId: 'nobody', content: '誰' },
    ])))
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe([
      '> **小明：** 一',
      '> 二',
      '',
      '**答**',
      '',
      '> **未知：** 誰',
    ].join('\n'))
  })

  it('quotes everyone between users', async () => {
    const { editor } = await mountEditor(doc(chat('user-user', [
      { id: 'u', kind: 'user' },
      { id: 'o', kind: 'user', name: '小華' },
    ], [
      { id: '1', participantId: 'u', content: '甲' },
      { id: '2', participantId: 'o', content: '乙' },
    ])))
    expect(editor.getEditorState().read(() => $convertToMarkdownString(builtinTransformers))).toBe('> **使用者：** 甲\n\n> **小華：** 乙')
  })
})
