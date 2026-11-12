import type { ModelRequest, ScriptStep } from '@hakulex/agent-core'
import type { LexicalEditor, SerializedEditorState } from 'lexical'
import type { AgentController } from '../../src/agent'
import { scriptedModel } from '@hakulex/agent-core'
import { RichEditor } from '@hakulex/editor'
import { flushPromises, mount } from '@vue/test-utils'
import { $createRangeSelection, $getRoot, $isElementNode, $setSelection, REDO_COMMAND, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import { AgentBinding, useAgent } from '../../src/agent'

type Json = Record<string, any>

afterEach(() => {
  document.body.innerHTML = ''
})

function text(value: string): Json {
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
function paragraph(value: string): Json {
  return {
    type: 'paragraph',
    children: [
      text(value),
    ],
    direction: null,
    format: '',
    indent: 0,
    version: 1,
    textFormat: 0,
    textStyle: '',
  }
}
function content(...children: Json[]) {
  return {
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as SerializedEditorState
}
const four = () => content(paragraph('一'), paragraph('二'), paragraph('三'), paragraph('四'))

const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const blocks = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const texts = (editor: LexicalEditor) => blocks(editor).map(textOf)
const ids = (editor: LexicalEditor) => blocks(editor).map(block => block.$?.blockId as string)
const states = (agent: AgentController) => agent.items.value.map(item => `${item.kind}:${item.state}`)

/** The steps of a script may need the IDs the editor gave its blocks, which exist only once it is mounted. */
type Script = (blockIds: string[]) => ScriptStep[][]

async function setup(script: Script, options: { editable?: boolean, modelValue?: SerializedEditorState } = {}) {
  const requests: ModelRequest[] = []
  const saved: Json[] = []
  // Filled in once the editor is mounted and its blocks have their IDs.
  const play = {
    model: scriptedModel([]),
  }
  const agent = useAgent({
    model: (request) => {
      requests.push(request)
      return play.model(request)
    },
  })
  const wrapper = mount(RichEditor, {
    props: {
      'modelValue': options.modelValue ?? four(),
      'editable': options.editable ?? true,
      'onUpdate:modelValue': (value: SerializedEditorState) => saved.push(JSON.parse(JSON.stringify(value))),
    } as never,
    attachTo: document.body,
    slots: {
      default: () => h(AgentBinding, { agent }),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  await flushPromises()
  play.model = scriptedModel(script(ids(editor)))
  return {
    agent,
    editor,
    wrapper,
    requests,
    saved,
  }
}

async function command(editor: LexicalEditor, name: Parameters<LexicalEditor['dispatchCommand']>[0]) {
  editor.dispatchCommand(name, undefined as never)
  await flushPromises()
}
async function edit(editor: LexicalEditor, index: number, value: string) {
  editor.update(() => {
    const block = $getRoot().getChildAtIndex(index)
    if ($isElementNode(block))
      block.selectEnd().insertText(value)
  }, { discrete: true })
  await flushPromises()
}

const threeEdits: Script = ([, b, c]) => [
  [
    {
      tool: 'replace_block',
      input: { blockId: b, xml: '<h2>新的二</h2>' },
    },
    {
      tool: 'delete_block',
      input: { blockId: c },
    },
    {
      tool: 'insert_blocks',
      input: { position: 'start', xml: '<p>頭</p>' },
    },
  ],
  [
    { text: '好了。' },
  ],
]

describe('joining an agent to an editor', () => {
  it('is not ready until it is in an editor, and lets go when the editor goes', async () => {
    let asked = 0
    const agent = useAgent({
      model: (request) => {
        asked += 1
        return scriptedModel([
          [
            { text: '不該被呼叫' },
          ],
        ])(request)
      },
    })
    expect(agent.ready.value).toBe(false)
    await expect(agent.send('改')).rejects.toThrow(/editor/i)
    expect(asked).toBe(0)
    expect(agent.items.value).toEqual([])
    expect(agent.accept('replace:x')).toMatchObject({ ok: false })
    expect(agent.selection()).toBeUndefined()

    const wrapper = mount(RichEditor, {
      props: {
        modelValue: four(),
      } as never,
      attachTo: document.body,
      slots: {
        default: () => h(AgentBinding, { agent }),
      },
    })
    await flushPromises()
    expect(agent.ready.value).toBe(true)
    // The plugin numbers the blocks itself.
    const numbered = ids((wrapper.vm as unknown as { editor: LexicalEditor }).editor)
    for (const id of numbered)
      expect(id).toMatch(/^[\w-]{8}$/)
    expect(new Set(numbered).size).toBe(4)

    wrapper.unmount()
    expect(agent.ready.value).toBe(false)
    await expect(agent.send('改')).rejects.toThrow(/editor/i)
  })

  it('shows the model the editor\'s document, and keeps state and items current by itself', async () => {
    const { agent, editor, requests } = await setup(([, b]) => [
      [
        {
          tool: 'replace_block',
          input: { blockId: b, xml: '<p>AI 的二</p>' },
        },
      ],
      [
        { text: '好了。' },
      ],
    ])
    await edit(editor, 0, '（打過字）')
    const seenStates: string[] = []
    // As a template would: a component that reads the refs re-renders when they change.
    const view = mount(defineComponent({
      setup: () => () => {
        seenStates.push(`${agent.state.value.status}/${agent.items.value.map(item => item.state).join(',')}`)
        return h('div')
      },
    }))

    await agent.send('改第二段')
    await flushPromises()

    const user = requests[0].messages.findLast(message => message.role === 'user')!
    expect(user.role === 'user' && user.text).toContain('一（打過字）')
    expect(user.role === 'user' && user.text).toContain(`<p id="${ids(editor)[1]}">二</p>`)
    expect(agent.state.value.status).toBe('idle')
    expect(agent.state.value.messages.at(-1)?.text).toBe('好了。')
    expect(states(agent)).toEqual(['replace:pending'])
    expect(seenStates).toContain('running/')
    expect(seenStates.at(-1)).toBe('idle/pending')
    expect(texts(editor)).toEqual(['一（打過字）', '二', '三', '四'])

    await edit(editor, 1, '（使用者改了）')
    expect(states(agent)).toEqual(['replace:conflict'])
    expect(seenStates.at(-1)).toBe('idle/conflict')

    await command(editor, UNDO_COMMAND)
    expect(texts(editor)[1]).toBe('二')
    expect(states(agent)).toEqual(['replace:pending'])
    view.unmount()
  })
})

describe('accepting', () => {
  it('writes each item into the editor as one step that undo takes back', async () => {
    const { agent, editor, saved } = await setup(threeEdits)
    const original = ids(editor)
    await agent.send('改')
    expect(states(agent)).toEqual(['insert:pending', 'replace:pending', 'delete:pending'])

    const [insertion, replacement, deletion] = agent.items.value
    expect(agent.accept(replacement.id).ok).toBe(true)
    await flushPromises()
    expect(texts(editor)).toEqual(['一', '新的二', '三', '四'])
    expect(blocks(editor)[1].type).toBe('heading')
    expect(ids(editor)).toEqual(original)
    expect(states(agent)).toEqual(['insert:pending', 'delete:pending'])

    expect(agent.accept(deletion.id).ok).toBe(true)
    await flushPromises()
    expect(texts(editor)).toEqual(['一', '新的二', '四'])

    expect(agent.accept(insertion.id).ok).toBe(true)
    await flushPromises()
    expect(texts(editor)).toEqual(['頭', '一', '新的二', '四'])
    expect(ids(editor)[0]).toBe(insertion.blockIds[0])
    expect(ids(editor).slice(1)).toEqual([original[0], original[1], original[3]])
    expect(states(agent)).toEqual([])

    // What went out is the document and nothing else.
    const out = saved.at(-1)!
    expect((out.root.children as Json[]).map(textOf)).toEqual(['頭', '一', '新的二', '四'])
    expect(JSON.stringify(out)).not.toMatch(/proposal|accepted|pending|agent/i)

    // One undo per accepted item, in reverse.
    await command(editor, UNDO_COMMAND)
    expect(texts(editor)).toEqual(['一', '新的二', '四'])
    expect(states(agent)).toContain('insert:pending')
    await command(editor, UNDO_COMMAND)
    expect(texts(editor)).toEqual(['一', '新的二', '三', '四'])
    await command(editor, UNDO_COMMAND)
    expect(texts(editor)).toEqual(['一', '二', '三', '四'])
    expect(ids(editor)).toEqual(original)
    expect(states(agent)).toEqual(['insert:pending', 'replace:pending', 'delete:pending'])

    await command(editor, REDO_COMMAND)
    expect(texts(editor)).toEqual(['一', '新的二', '三', '四'])
    expect(states(agent)).toEqual(['insert:pending', 'delete:pending'])
  })

  it('all at once is one step, leaves a conflict alone, and overwrites it when asked', async () => {
    const { agent, editor } = await setup(([a, b, c, d]) => [
      [
        {
          tool: 'replace_block',
          input: { blockId: a, xml: '<p>AI 的一</p>' },
        },
        {
          tool: 'replace_block',
          input: { blockId: b, xml: '<p>AI 的二</p>' },
        },
        {
          tool: 'delete_block',
          input: { blockId: c },
        },
        {
          tool: 'insert_blocks',
          input: { position: 'after', blockId: d, xml: '<p>尾</p>' },
        },
      ],
      [
        { text: '好了。' },
      ],
    ])
    await agent.send('改')
    await edit(editor, 0, '（使用者）')
    expect(states(agent)).toEqual([
      'replace:conflict',
      'replace:pending',
      'delete:pending',
      'insert:pending',
    ])

    expect(agent.acceptAll().ok).toBe(true)
    await flushPromises()
    expect(texts(editor)).toEqual(['一（使用者）', 'AI 的二', '四', '尾'])
    expect(states(agent)).toEqual(['replace:conflict'])

    await command(editor, UNDO_COMMAND)
    expect(texts(editor)).toEqual(['一（使用者）', '二', '三', '四'])
    expect(states(agent)).toEqual([
      'replace:conflict',
      'replace:pending',
      'delete:pending',
      'insert:pending',
    ])

    const conflict = agent.items.value[0]
    expect(agent.accept(conflict.id).ok).toBe(false)
    expect(texts(editor)[0]).toBe('一（使用者）')
    expect(agent.accept(conflict.id, { overwrite: true }).ok).toBe(true)
    await flushPromises()
    expect(texts(editor)[0]).toBe('AI 的一')
  })

  it('writes nothing into an editor that is read-only', async () => {
    const { agent, editor, wrapper } = await setup(threeEdits)
    await agent.send('改')
    await wrapper.setProps({ editable: false })
    await flushPromises()

    const result = agent.accept(agent.items.value[1].id)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/read-only/i)
    expect(agent.acceptAll().ok).toBe(false)
    await flushPromises()
    expect(texts(editor)).toEqual(['一', '二', '三', '四'])
    expect(states(agent)).toEqual(['insert:pending', 'replace:pending', 'delete:pending'])
  })

  it('rejecting through the controller takes items off the list', async () => {
    const { agent } = await setup(threeEdits)
    await agent.send('改')
    agent.reject(agent.items.value[0].id)
    expect(states(agent)).toEqual(['replace:pending', 'delete:pending'])
    agent.rejectAll()
    expect(agent.items.value).toEqual([])
    expect(agent.snapshot().proposal.rejected).toHaveLength(3)
  })
})

describe('the selection', () => {
  function select(editor: LexicalEditor, from: [number, number], to: [number, number]) {
    editor.update(() => {
      const leaf = (index: number) => {
        const block = $getRoot().getChildAtIndex(index)
        return $isElementNode(block)
          ? block.getFirstDescendant()!
          : block!
      }
      const selection = $createRangeSelection()
      selection.anchor.set(leaf(from[0]).getKey(), from[1], 'text')
      selection.focus.set(leaf(to[0]).getKey(), to[1], 'text')
      $setSelection(selection)
    }, { discrete: true })
  }

  it('is the selected text and its block, or the blocks a selection spans, or nothing for a caret', async () => {
    const { agent, editor, requests } = await setup(() => [
      [
        { text: '看到了。' },
      ],
    ], {
      modelValue: content(paragraph('第一段的文字'), paragraph('第二段的文字'), paragraph('第三段')),
    })
    const [a, b] = ids(editor)

    select(editor, [0, 1], [0, 3])
    expect(agent.selection()).toEqual({ blockId: a, text: '一段' })

    select(editor, [1, 2], [0, 2])
    expect(agent.selection()).toEqual({
      blockIds: [a, b],
    })

    select(editor, [2, 1], [2, 1])
    expect(agent.selection()).toBeUndefined()

    // It goes straight into `send`.
    select(editor, [0, 1], [0, 3])
    await agent.send('改這裡', {
      selection: agent.selection(),
    })
    const user = requests[0].messages.findLast(message => message.role === 'user')!
    expect(user.role === 'user' && user.text).toMatch(new RegExp(`<selection block="${a}">一段</selection>`))
  })
})
