import type { ScriptStep } from '@hakulex/agent-core'
import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriptedModel } from '@hakulex/agent-core'
import { $turnBlocksInto, RichEditor } from '@hakulex/editor'
import { flushPromises, mount } from '@vue/test-utils'
import { $getRoot, $isElementNode, UNDO_COMMAND } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { useAgent } from '../../src/agent'
import AgentPlugin from '../../src/AgentPlugin.vue'

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
const four = () => content(paragraph('第一段的文字'), paragraph('第二段的文字'), paragraph('第三段的文字'), paragraph('第四段的文字'))

const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const blocks = (editor: LexicalEditor) => editor.getEditorState().toJSON().root.children as Json[]
const texts = (editor: LexicalEditor) => blocks(editor).map(textOf)
const ids = (editor: LexicalEditor) => blocks(editor).map(block => block.$?.blockId as string)

type Script = (blockIds: string[]) => ScriptStep[]

async function setup(script: Script, options: { bar?: boolean, editable?: boolean } = {}) {
  const play = {
    model: scriptedModel([]),
  }
  const saved: Json[] = []
  const agent = useAgent({
    model: request => play.model(request),
  })
  const wrapper = mount(RichEditor, {
    props: {
      'modelValue': four(),
      'editable': options.editable ?? true,
      'onUpdate:modelValue': (value: SerializedEditorState) => saved.push(JSON.parse(JSON.stringify(value))),
    } as never,
    attachTo: document.body,
    slots: {
      default: () => h(AgentPlugin, {
        agent,
        ...(options.bar === undefined
          ? {}
          : { bar: options.bar }),
      }),
    },
  })
  const editor = (wrapper.vm as unknown as { editor: LexicalEditor }).editor
  await flushPromises()
  play.model = scriptedModel([
    script(ids(editor)),
    [
      { text: '好了。' },
    ],
  ])
  await agent.send('改')
  await flushPromises()
  return { agent, editor, wrapper, saved }
}

const root = () => document.querySelector<HTMLElement>('.hlx-content')!
const layer = () => document.querySelector<HTMLElement>('.hlx-agent-layer')
function cards() {
  return [
    ...document.querySelectorAll<HTMLElement>('.hlx-agent-card'),
  ]
}
const bar = () => document.querySelector<HTMLElement>('.hlx-agent-bar')
const blockElement = (id: string) => root().querySelector<HTMLElement>(`[data-block-id="${id}"]`)!
function buttons(within: Element) {
  return [
    ...within.querySelectorAll<HTMLButtonElement>('button'),
  ]
}
/** A button by what it says, or for the icon buttons by the start of its name. */
function button(within: Element, name: string) {
  return buttons(within).find(candidate =>
    candidate.textContent?.trim() === name || candidate.getAttribute('aria-label')?.startsWith(name))!
}
const names = (within: Element) => buttons(within).map(candidate => candidate.getAttribute('aria-label'))
const ANSWERS = ['接受這項修改', '拒絕這項修改']
async function press(target: HTMLElement) {
  target.click()
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

const replaceSecond: Script = ([, b]) => [
  {
    tool: 'replace_block',
    input: { blockId: b, xml: '<p>第二段的<b>新</b>文字</p>' },
  },
]
/** A paragraph turned into a heading: the two can't be shown as one merged block. */
const retypeSecond: Script = ([, b]) => [
  {
    tool: 'replace_block',
    input: { blockId: b, xml: '<h2>變成標題</h2>' },
  },
]
const everyKind: Script = ([a, b, c, d]) => [
  {
    tool: 'replace_block',
    input: { blockId: b, xml: '<p>第二段改過了</p>' },
  },
  {
    tool: 'delete_block',
    input: { blockId: c },
  },
  {
    tool: 'insert_blocks',
    input: { position: 'after', blockId: a, xml: '<p>插在中間</p>' },
  },
  {
    tool: 'insert_blocks',
    input: { position: 'start', xml: '<p>插在開頭</p>' },
  },
  {
    tool: 'insert_blocks',
    input: { position: 'after', blockId: d, xml: '<p>插在結尾</p><p>結尾第二段</p>' },
  },
]

describe('a pending replacement of text', () => {
  it('shows old and new merged where the block is, with the block itself covered', async () => {
    const { editor, saved } = await setup(replaceSecond)
    const [, b] = ids(editor)

    expect(layer()).not.toBeNull()
    expect(layer()!.closest('.hlx-editor-body')).not.toBeNull()
    expect(layer()!.closest('[contenteditable="true"]')).toBeNull()
    expect(root().contains(layer())).toBe(false)

    expect(cards()).toHaveLength(1)
    const [card] = cards()
    expect(card.dataset.kind).toBe('replace')
    expect(card.dataset.state).toBe('pending')
    expect(card.dataset.mode).toBe('inline')
    expect(card.dataset.anchor).toBe(b)
    // One block holding both versions: what was added is marked, the rest is not.
    expect(card.querySelectorAll('.hlx-renderer > *')).toHaveLength(1)
    expect(card.querySelector('.hlx-renderer')!.textContent).toBe('第二段的新文字')
    const styled = [
      ...card.querySelectorAll<HTMLElement>('.hlx-renderer [style]'),
    ].map(element => element.textContent)
    expect(styled.join('')).toContain('新')
    expect(styled.join('')).not.toContain('文字')
    expect(names(card)).toEqual(ANSWERS)
    // No heading row: it reads as the document.
    expect(card.querySelector('.hlx-agent-card-title')).toBeNull()

    // The block is still in the document as it was, only out of sight and out of reach.
    const block = blockElement(b)
    expect(block.textContent).toBe('第二段的文字')
    expect(block.dataset.agentHidden).toBe('true')
    expect(block.style.visibility).toBe('hidden')
    expect(block.getAttribute('contenteditable')).toBe('false')
    expect(block.dataset.agentChange).toBeUndefined()
    expect(root().querySelectorAll('[data-agent-hidden]')).toHaveLength(1)
    expect(texts(editor)).toEqual(['第一段的文字', '第二段的文字', '第三段的文字', '第四段的文字'])
    expect(saved).toEqual([])
    expect(JSON.stringify(editor.getEditorState().toJSON())).not.toContain('新')
  })

  it('shows what was taken out struck through, in the same block', async () => {
    await setup(([, b]) => [
      {
        tool: 'replace_block',
        input: { blockId: b, xml: '<p>第二段的句子</p>' },
      },
    ])
    const [card] = cards()
    expect(card.dataset.mode).toBe('inline')
    const body = card.querySelector('.hlx-renderer')!
    // Both the old words and the new ones are there to read.
    expect(body.textContent).toContain('文字')
    expect(body.textContent).toContain('句子')
    expect(body.textContent).toContain('第二段的')
    expect(body.querySelectorAll('[style]').length).toBeGreaterThanOrEqual(2)
  })

  it('goes into the document on accept, and comes back with undo', async () => {
    const { editor } = await setup(replaceSecond)
    const [, b] = ids(editor)

    await press(button(cards()[0], '接受'))
    expect(texts(editor)[1]).toBe('第二段的新文字')
    expect(cards()).toEqual([])
    const shown = blockElement(b)
    expect(shown.dataset.agentHidden).toBeUndefined()
    expect(shown.style.visibility).toBe('')
    expect(shown.getAttribute('contenteditable')).toBeNull()
    expect(shown.style.marginBottom).toBe('')

    editor.dispatchCommand(UNDO_COMMAND, undefined)
    await flushPromises()
    expect(texts(editor)[1]).toBe('第二段的文字')
    expect(cards()).toHaveLength(1)
    expect(cards()[0].dataset.mode).toBe('inline')
    expect(blockElement(b).dataset.agentHidden).toBe('true')
  })

  it('uncovers the block and gives its room back on reject', async () => {
    const { editor } = await setup(replaceSecond)
    const [, b] = ids(editor)

    await press(button(cards()[0], '拒絕'))
    expect(cards()).toEqual([])
    const block = blockElement(b)
    expect(block.dataset.agentHidden).toBeUndefined()
    expect(block.style.visibility).toBe('')
    expect(block.getAttribute('contenteditable')).toBeNull()
    expect(root().querySelectorAll('[data-agent-change], [data-agent-hidden], [style*="margin"], [style*="visibility"]')).toHaveLength(0)
    expect(texts(editor)[1]).toBe('第二段的文字')
  })

  it('is no part of the editable area, and typing elsewhere leaves it be', async () => {
    const { editor } = await setup(replaceSecond)
    const [card] = cards()
    expect(card.closest('[contenteditable="true"]')).toBeNull()
    expect(card.querySelector('[contenteditable="true"]')).toBeNull()

    await edit(editor, 0, '（照常打字）')
    expect(texts(editor)[0]).toBe('第一段的文字（照常打字）')
    expect(cards()).toHaveLength(1)
    expect(cards()[0].dataset.state).toBe('pending')
    expect(cards()[0].dataset.mode).toBe('inline')
    expect(cards()[0].textContent).not.toContain('照常打字')
  })
})

describe('the other kinds of item', () => {
  it('a change that can\'t be merged shows the new block under the old one, which stays', async () => {
    const { editor } = await setup(retypeSecond)
    const [, b] = ids(editor)
    const [card] = cards()

    expect(card.dataset.mode).toBe('stack')
    expect(card.querySelector('.hlx-renderer h2')!.textContent).toBe('變成標題')
    expect(names(card)).toEqual(ANSWERS)
    const block = blockElement(b)
    expect(block.dataset.agentChange).toBe('replace')
    expect(block.dataset.agentHidden).toBeUndefined()
    expect(block.style.visibility).toBe('')
    expect(block.style.marginBottom).toMatch(/px$/)

    // The block follows when it becomes another element.
    editor.update(() => {
      $turnBlocksInto([
        $getRoot().getChildAtIndex(0)!.getKey(),
      ], 'h2')
    }, { discrete: true })
    await flushPromises()
    expect(blockElement(b).style.marginBottom).toMatch(/px$/)

    await press(button(card, '拒絕'))
    expect(cards()).toEqual([])
    expect(blockElement(b).style.marginBottom).toBe('')
    expect(blockElement(b).dataset.agentChange).toBeUndefined()
  })

  it('leaves the blocks alone when it lays out again and nothing has moved', async () => {
    const { editor } = await setup(retypeSecond)
    const [, b] = ids(editor)
    const kept = blockElement(b).style.marginBottom
    expect(kept).toMatch(/px$/)

    // Every write to a block's style, even one that is put back at once, moves the page for a moment.
    const writes: MutationRecord[] = []
    const watcher = new MutationObserver(records => writes.push(...records))
    watcher.observe(root(), {
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })
    // An update that changes no block: the layer lays out again all the same.
    editor.update(() => {
      $getRoot().getChildAtIndex(0)!.selectEnd()
    }, { discrete: true })
    await flushPromises()
    editor.update(() => {
      $getRoot().getChildAtIndex(0)!.selectStart()
    }, { discrete: true })
    await flushPromises()
    writes.push(...watcher.takeRecords())
    watcher.disconnect()

    expect(writes).toEqual([])
    expect(blockElement(b).style.marginBottom).toBe(kept)
  })

  it('measures a block\'s own margin again when the block is styled another way', async () => {
    const sheet = document.createElement('style')
    sheet.textContent = '.roomy { margin-bottom: 40px; }'
    document.head.append(sheet)
    try {
      const { editor } = await setup(retypeSecond)
      const [, b] = ids(editor)
      const before = Number.parseFloat(blockElement(b).style.marginBottom)

      blockElement(b).classList.add('roomy')
      editor.update(() => {
        $getRoot().getChildAtIndex(0)!.selectEnd()
      }, { discrete: true })
      await flushPromises()

      expect(Number.parseFloat(blockElement(b).style.marginBottom)).toBe(before + 40)
    }
    finally {
      sheet.remove()
    }
  })

  it('mark a block to be removed, and show new blocks where they would go', async () => {
    const { editor } = await setup(everyKind)
    const [a, b, c, d] = ids(editor)

    expect(cards().map(card => `${card.dataset.kind}:${card.dataset.mode}@${card.dataset.anchor}`)).toEqual([
      'insert:insert@start',
      `insert:insert@${a}`,
      `replace:inline@${b}`,
      `delete:delete@${c}`,
      `insert:insert@${d}`,
    ])
    expect(blockElement(c).dataset.agentChange).toBe('delete')
    expect(blockElement(c).dataset.agentHidden).toBeUndefined()
    expect(blockElement(b).dataset.agentHidden).toBe('true')
    expect(blockElement(a).dataset.agentChange).toBeUndefined()

    const [atStart, between, , removal, atEnd] = cards()
    expect(atStart.querySelector('.hlx-renderer')!.textContent).toBe('插在開頭')
    expect(between.querySelector('.hlx-renderer')!.textContent).toBe('插在中間')
    expect([
      ...atEnd.querySelectorAll('.hlx-renderer p'),
    ].map(element => element.textContent)).toEqual(['插在結尾', '結尾第二段'])
    expect(removal.querySelector('.hlx-renderer')).toBeNull()
    for (const card of cards()) {
      expect(names(card)).toEqual(ANSWERS)
      expect(card.querySelector('.hlx-agent-card-title')).toBeNull()
    }

    // Room is kept above the first block for what goes at the start, and under blocks for what follows them.
    expect(blockElement(a).style.marginTop).toMatch(/px$/)
    for (const id of [a, d])
      expect(blockElement(id).style.marginBottom).toMatch(/px$/)
    // A deletion sits on its own block and takes no room.
    expect(blockElement(c).style.marginBottom).toBe('')

    await press(button(atEnd, '接受'))
    expect(texts(editor).slice(-2)).toEqual(['插在結尾', '結尾第二段'])
    await press(button(cards().find(card => card.dataset.kind === 'delete')!, '接受'))
    expect(texts(editor)).not.toContain('第三段的文字')
    expect(cards().map(card => card.dataset.kind)).toEqual(['insert', 'insert', 'replace'])
  })

  it('a conflict shows the block again, says why and offers the two ways out', async () => {
    for (const choice of ['保留我的', '改用 AI 的'] as const) {
      document.body.innerHTML = ''
      const { editor } = await setup(replaceSecond)
      await edit(editor, 1, '（我改的）')

      const [card] = cards()
      expect(card.dataset.state).toBe('conflict')
      expect(card.dataset.mode).toBe('stack')
      expect(card.textContent).toContain('衝突')
      expect(card.textContent).toMatch(/你.*改/)
      const block = blockElement(ids(editor)[1])
      expect(block.dataset.agentChange).toBe('conflict')
      expect(block.dataset.agentHidden).toBeUndefined()
      expect(block.style.visibility).toBe('')
      expect(block.getAttribute('contenteditable')).toBeNull()
      expect(buttons(card).map(candidate => candidate.textContent?.trim())).toEqual(['保留我的', '改用 AI 的'])

      await press(button(card, choice))
      expect(cards()).toEqual([])
      expect(texts(editor)[1]).toBe(choice === '保留我的'
        ? '第二段的文字（我改的）'
        : '第二段的新文字')
    }
  })
})

describe('the review bar', () => {
  it('counts what is left, steps through the items in order, and accepts or rejects all', async () => {
    const { editor, agent } = await setup(everyKind)
    await edit(editor, 1, '（我改的）')

    expect(bar()).not.toBeNull()
    expect(bar()!.textContent).toContain('5')
    expect(bar()!.textContent).toMatch(/1\s*項衝突/)
    const current = () => cards().findIndex(card => card.dataset.current === 'true')
    expect(current()).toBe(-1)

    const next = button(bar()!, '下一個')
    const previous = button(bar()!, '上一個')
    const visited: number[] = []
    for (let step = 0; step < 6; step++) {
      await press(next)
      visited.push(current())
    }
    expect(visited).toEqual([0, 1, 2, 3, 4, 0])
    await press(previous)
    expect(current()).toBe(4)
    expect(cards().filter(card => card.dataset.current === 'true')).toHaveLength(1)

    await press(button(bar()!, '全部接受'))
    expect(texts(editor)).toEqual([
      '插在開頭',
      '第一段的文字',
      '插在中間',
      '第二段的文字（我改的）',
      '第四段的文字',
      '插在結尾',
      '結尾第二段',
    ])
    expect(cards().map(card => card.dataset.state)).toEqual(['conflict'])
    expect(bar()!.textContent).toContain('1')

    await press(button(bar()!, '全部拒絕'))
    expect(cards()).toEqual([])
    expect(bar()).toBeNull()
    expect(agent.items.value).toEqual([])
    expect(root().querySelectorAll('[data-agent-change], [data-agent-hidden], [style*="margin"], [style*="visibility"]')).toHaveLength(0)
  })

  it('is not there without anything to review, or when turned off', async () => {
    const none = await setup(() => [])
    expect(none.agent.items.value).toEqual([])
    expect(bar()).toBeNull()
    expect(cards()).toEqual([])

    document.body.innerHTML = ''
    await setup(replaceSecond, { bar: false })
    expect(cards()).toHaveLength(1)
    expect(bar()).toBeNull()
  })
})

describe('using it', () => {
  it('everything is a named button in a named region, and focus is kept after pressing one', async () => {
    await setup(everyKind)

    for (const card of cards()) {
      expect(card.getAttribute('role')).toBe('group')
      expect(card.getAttribute('aria-label')).toMatch(/AI/)
      for (const candidate of buttons(card)) {
        expect(candidate.type).toBe('button')
        expect(candidate.getAttribute('aria-label')).toMatch(/這項/)
        expect(candidate.textContent?.trim().length).toBeGreaterThan(0)
        expect(candidate.tabIndex).toBe(0)
      }
    }
    expect(new Set(cards().map(card => card.getAttribute('aria-label'))).size).toBeGreaterThan(1)
    expect(bar()!.getAttribute('role')).toBe('toolbar')
    expect(bar()!.getAttribute('aria-label')).toMatch(/AI/)
    for (const candidate of buttons(bar()!))
      expect(candidate.type).toBe('button')

    const accept = button(cards()[1], '接受')
    accept.focus()
    await press(accept)
    expect(document.activeElement).not.toBe(document.body)
    expect(document.activeElement?.closest('.hlx-agent-card, .hlx-agent-bar')).not.toBeNull()
  })

  it('undo and redo pressed on a card or on the bar reach the editor', async () => {
    const { editor } = await setup(everyKind)
    const key = (target: HTMLElement, init: KeyboardEventInit) => {
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
      target.dispatchEvent(event)
      return event
    }

    await press(button(cards()[2], '接受'))
    expect(texts(editor)[1]).toBe('第二段改過了')
    // The keyboard is on a card now, not in the document.
    const focused = document.activeElement as HTMLElement
    expect(focused.closest('.hlx-agent-card')).not.toBeNull()

    expect(key(focused, { key: 'z', metaKey: true }).defaultPrevented).toBe(true)
    await flushPromises()
    expect(texts(editor)[1]).toBe('第二段的文字')
    expect(cards()).toHaveLength(5)

    key(button(bar()!, '下一個'), { key: 'z', ctrlKey: true, shiftKey: true })
    await flushPromises()
    expect(texts(editor)[1]).toBe('第二段改過了')
    expect(cards()).toHaveLength(4)

    key(cards()[0], { key: 'y', ctrlKey: true })
    await flushPromises()
    expect(texts(editor)[1]).toBe('第二段改過了')
    // Other keys are left alone.
    expect(key(cards()[0], { key: 'z' }).defaultPrevented).toBe(false)
    expect(key(cards()[0], { key: 'a', metaKey: true }).defaultPrevented).toBe(false)
  })

  it('offers nothing to press in a read-only editor', async () => {
    const { wrapper, editor } = await setup(everyKind)
    await wrapper.setProps({ editable: false })
    await flushPromises()

    expect(cards()).toHaveLength(5)
    for (const candidate of [
      ...cards().flatMap(buttons),
      button(bar()!, '全部接受'),
      button(bar()!, '全部拒絕'),
    ])
      expect(candidate.disabled).toBe(true)
    expect(button(bar()!, '下一個').disabled).toBe(false)
    expect(texts(editor)).toHaveLength(4)
  })

  it('has its styles in one file of its own, in the editor\'s tokens', () => {
    const here = join(import.meta.dirname, '../../src')
    const css = readFileSync(join(here, 'styles.css'), 'utf8')
    const manifest = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'))
    expect(manifest.exports['./style.css']).toBe('./src/styles.css')

    const classes = [
      ...css.matchAll(/\.([a-z][\w-]*)/gi),
    ].map(match => match[1])
    expect(classes.length).toBeGreaterThan(8)
    expect(classes.filter(name => !name.startsWith('hlx-'))).toEqual([])
    expect(css).toContain('.hlx-agent-card')
    expect(css).toContain('.hlx-agent-bar')
    expect(css).toContain('[data-agent-change')
    expect(css).toMatch(/var\(--hlx-color-/)
    // Colors come from tokens, so that the dark scheme and a site's own theme apply.
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgba?\(/i)

    for (const file of [
      'AgentPlugin.vue',
      'review/ReviewLayer.vue',
      'review/ReviewCard.vue',
      'review/ReviewBar.vue',
    ]) {
      const source = readFileSync(join(here, file), 'utf8')
      expect(source).not.toMatch(/import\s+['"][^'"]+\.css['"]/)
      expect(source).not.toContain('<style')
    }
  })
})
