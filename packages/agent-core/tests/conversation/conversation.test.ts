import type { AgentState, Model, ModelChunk, ModelRequest, ScriptStep } from '../../src/conversation'
import type { AgentDocument, Block } from '../../src/edits'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkXml, createDefaultRegistry } from '@hakulex/litexml'
import { describe, expect, it } from 'vitest'
import { createAgent, scriptedModel, systemPrompt } from '../../src/conversation'
import { agentTools } from '../../src/edits'

type Json = Record<string, any>

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
function p(id: string, value: string): Block {
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
    $: { blockId: id },
  } as unknown as Block
}
function doc(...children: Block[]): AgentDocument {
  return {
    root: {
      type: 'root',
      children,
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  } as unknown as AgentDocument
}
const three = () => doc(p('a1', '一'), p('b2', '二'), p('c3', '三'))
const textOf = (node: Json): string => node.text ?? (node.children ?? []).map(textOf).join('')
const textsOf = (document: AgentDocument) => ((document.root as Json).children as Json[]).map(textOf)
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))

/** A place for the document to live, as a host would have. */
function host(initial = three()) {
  let document = initial
  return {
    getDocument: () => document,
    set: (next: AgentDocument) => {
      document = next
    },
  }
}

/** Wraps a model so that the requests it gets can be looked at afterwards. */
function recording(model: Model) {
  const requests: ModelRequest[] = []
  const wrapped: Model = (request) => {
    requests.push({
      ...request,
      messages: copy(request.messages),
    })
    return model(request)
  }
  return { model: wrapped, requests }
}
const lastUser = (request: ModelRequest) => request.messages.findLast(message => message.role === 'user')!
const usersOf = (request: ModelRequest) => request.messages.filter(message => message.role === 'user')

const replaceB2: ScriptStep = {
  tool: 'replace_block',
  input: { blockId: 'b2', xml: '<p>短的二</p>' },
}

describe('a turn', () => {
  it('sends the built-in prompt with the host\'s instructions, the tools and the document', async () => {
    const { model, requests } = recording(scriptedModel([
      [
        { text: '好的，沒有需要改的地方。' },
      ],
    ]))
    const agent = createAgent({
      model,
      ...host(),
      instructions: '一律用繁體中文回答。',
    })

    await agent.send('把第二段改短')

    expect(requests).toHaveLength(1)
    const request = requests[0]
    expect(systemPrompt.length).toBeGreaterThan(200)
    expect(request.system.startsWith(systemPrompt)).toBe(true)
    expect(request.system).toContain('一律用繁體中文回答。')
    expect(request.tools).toEqual(agentTools)
    expect(request.messages).toHaveLength(1)
    expect(lastUser(request).text).toContain('<p id="b2">二</p>')
    expect(lastUser(request).text).toContain('把第二段改短')

    const state = agent.getState()
    expect(state.status).toBe('idle')
    expect(state.messages.map(message => [message.role, message.text])).toEqual([
      ['user', '把第二段改短'],
      ['assistant', '好的，沒有需要改的地方。'],
    ])
  })

  it('runs the tools the model calls and gives it the results, until it calls none', async () => {
    const { model, requests } = recording(scriptedModel([
      [
        { text: '我來改。' },
        replaceB2,
      ],
      [
        { text: '改好了。' },
      ],
    ]))
    const place = host()
    const agent = createAgent({ model, ...place })

    await agent.send('把第二段改短')

    expect(requests).toHaveLength(2)
    const second = requests[1].messages
    expect(second.map(message => message.role)).toEqual(['user', 'assistant', 'tool'])
    const call = second[1].role === 'assistant'
      ? second[1].toolCalls[0]
      : null
    expect(call).toMatchObject({ name: 'replace_block' })
    expect(JSON.parse(call!.input)).toEqual({ blockId: 'b2', xml: '<p>短的二</p>' })
    expect(second[2]).toMatchObject({ role: 'tool', callId: call!.id, isError: false })
    expect(second[2].role === 'tool' && second[2].content).toContain('b2')

    expect(agent.items()).toMatchObject([
      {
        kind: 'replace',
        state: 'pending',
        blockIds: ['b2'],
      },
    ])
    expect(textsOf(place.getDocument())).toEqual(['一', '二', '三'])
    const messages = agent.getState().messages
    expect(messages.map(message => message.role)).toEqual(['user', 'assistant', 'assistant'])
    expect(messages[1].role === 'assistant' && messages[1].tools).toMatchObject([
      { name: 'replace_block', state: 'done' },
    ])
    expect(messages[2].text).toBe('改好了。')
  })

  it('puts the document only on the newest message, as proposed, and mentions a rejection once', async () => {
    const { model, requests } = recording(scriptedModel([
      [
        replaceB2,
        {
          tool: 'delete_block',
          input: { blockId: 'c3' },
        },
      ],
      [
        { text: '好了。' },
      ],
      [
        { text: '了解。' },
      ],
      [
        { text: '好。' },
      ],
    ]))
    const agent = createAgent({
      model,
      ...host(),
    })

    await agent.send('第一次')
    agent.reject(agent.items().find(item => item.kind === 'delete')!.id)
    await agent.send('第二次')

    const users = usersOf(requests[2])
    expect(users).toHaveLength(2)
    expect(users[0].text).toContain('第一次')
    expect(users[0].text).not.toContain('<doc>')
    expect(users[1].text).toContain('第二次')
    // The proposed state: the replacement is in, the rejected deletion is not.
    expect(users[1].text).toContain('<p id="b2">短的二</p>')
    expect(users[1].text).toContain('<p id="c3">三</p>')
    expect(users[1].text).toMatch(/rejected/i)
    expect(users[1].text).toContain('c3')

    await agent.send('第三次')
    const later = usersOf(requests[3])
    expect(later).toHaveLength(3)
    expect(later[0].text).not.toContain('<doc>')
    expect(later[1].text).not.toContain('<doc>')
    // It is still part of what was said in the second message, and is not said again in the third.
    expect(later[1].text).toMatch(/rejected/i)
    expect(later[2].text).not.toMatch(/rejected/i)
    expect(later[2].text).toContain('<doc>')
  })

  it('tells the model what was wrong with a call, and stops at the limit keeping what worked', async () => {
    const bad: ScriptStep = {
      tool: 'replace_block',
      input: { blockId: 'nope', xml: '<p>x</p>' },
    }
    const { model, requests } = recording(scriptedModel([
      [replaceB2, bad],
      [bad],
      [bad],
      [
        { text: '到不了這裡' },
      ],
    ]))
    const agent = createAgent({
      model,
      ...host(),
      maxRounds: 3,
    })

    await agent.send('改')

    expect(requests).toHaveLength(3)
    const results = requests[2].messages.filter(message => message.role === 'tool')
    expect(results.map(message => message.role === 'tool' && message.isError)).toEqual([false, true, true])
    expect(results[1].role === 'tool' && results[1].content).toContain('nope')

    const state = agent.getState()
    expect(state.status).toBe('idle')
    const last = state.messages.at(-1)!
    expect(last.role === 'assistant' && last.stopped).toBe('rounds')
    expect(last.role === 'assistant' && last.tools).toMatchObject([
      { state: 'failed' },
    ])
    expect(agent.items()).toMatchObject([
      { kind: 'replace', state: 'pending' },
    ])
  })

  it('stops when told to, keeping the text and the changes so far', async () => {
    let signal: AbortSignal | undefined
    const scripted = scriptedModel([
      [
        replaceB2,
        { text: '這是一段很長很長很長很長很長很長很長很長很長很長的回覆' },
      ],
    ], { delay: 5, chunkSize: 2 })
    const model: Model = (request) => {
      signal = request.signal
      return scripted(request)
    }
    const agent = createAgent({
      model,
      ...host(),
    })
    const seen: AgentState[] = []
    agent.subscribe((state) => {
      seen.push(state)
      const last = state.messages.at(-1)
      if (last?.role === 'assistant' && last.text.length >= 4)
        agent.stop()
    })

    await agent.send('改')

    expect(signal?.aborted).toBe(true)
    const state = agent.getState()
    expect(state.status).toBe('idle')
    const last = state.messages.at(-1)!
    expect(last.role === 'assistant' && last.stopped).toBe('aborted')
    expect(last.text.length).toBeGreaterThanOrEqual(4)
    expect(last.text.length).toBeLessThan(20)
    expect(agent.items()).toMatchObject([
      { kind: 'replace', state: 'pending' },
    ])
    expect(seen.some(entry => entry.status === 'running')).toBe(true)
  })

  it('reports an error from the model without retrying, and retries when asked', async () => {
    let calls = 0
    const model: Model = async function* () {
      calls += 1
      yield { type: 'text', text: '開頭' }
      if (calls === 1)
        throw new Error('503 overloaded')
      yield { type: 'text', text: '，完成。' }
    }
    const agent = createAgent({
      model,
      ...host(),
    })

    await agent.send('改')
    expect(calls).toBe(1)
    expect(agent.getState()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('503 overloaded'),
    })

    await agent.retry()
    expect(calls).toBe(2)
    const state = agent.getState()
    expect(state.status).toBe('idle')
    expect(state.error).toBeUndefined()
    expect(state.messages.map(message => [message.role, message.text])).toEqual([
      ['user', '改'],
      ['assistant', '開頭，完成。'],
    ])

    // It can go on from there.
    await agent.send('再來')
    expect(calls).toBe(3)
    expect(agent.getState().messages.filter(message => message.role === 'user')).toHaveLength(2)
  })

  it('does not send a document that is too long', async () => {
    const { model, requests } = recording(scriptedModel([
      [
        { text: '不會被呼叫' },
      ],
    ]))
    const agent = createAgent({
      model,
      ...host(),
      maxDocumentChars: 20,
    })

    await agent.send('改')

    expect(requests).toEqual([])
    const state = agent.getState()
    expect(state.status).toBe('error')
    expect(state.error).toContain('20')
    expect(state.error).toMatch(/\d{2,}/)
  })

  it('tells subscribers of every step: thinking, text, and a tool call as it is written and run', async () => {
    const agent = createAgent({
      model: scriptedModel([
        [
          { thinking: '先想一下要怎麼改' },
          { text: '我來改第二段。' },
          replaceB2,
        ],
        [
          { text: '好了。' },
        ],
      ], { chunkSize: 3 }),
      ...host(),
    })
    const seen: AgentState[] = []
    const off = agent.subscribe(state => seen.push(state))

    await agent.send('改')

    const replies = seen.map(state => state.messages[1]).filter(message => message?.role === 'assistant')
    const thinking = replies.map(message => message.thinking.length)
    const words = replies.map(message => message.text.length)
    expect(new Set(thinking).size).toBeGreaterThan(3)
    expect(new Set(words).size).toBeGreaterThan(3)
    expect([...thinking].sort((a, b) => a - b)).toEqual(thinking)
    expect([...words].sort((a, b) => a - b)).toEqual(words)

    const tool = replies.map(message => message.tools[0]).filter(Boolean)
    expect(tool[0]).toMatchObject({ name: 'replace_block', state: 'running', input: '' })
    expect(tool.some(use => use.state === 'running' && use.input.length > 0 && use.input.length < JSON.stringify((replaceB2 as Json).input).length)).toBe(true)
    expect(tool.at(-1)).toMatchObject({ state: 'done' })
    expect(tool.at(-1)!.result).toContain('b2')
    expect(seen[0].status).toBe('running')
    expect(seen.at(-1)!.status).toBe('idle')

    off()
    const count = seen.length
    await agent.send('再來')
    expect(seen).toHaveLength(count)
  })
})

describe('reviewing through the agent', () => {
  async function reviewed() {
    const place = host()
    const agent = createAgent({
      model: scriptedModel([
        [
          replaceB2,
          {
            tool: 'delete_block',
            input: { blockId: 'c3' },
          },
          {
            tool: 'insert_blocks',
            input: { position: 'start', xml: '<p>頭</p>' },
          },
        ],
        [
          { text: '好了。' },
        ],
      ]),
      ...place,
    })
    await agent.send('改')
    return { agent, place }
  }

  it('lists the items from the document as it is, and hands back the document to write on accept', async () => {
    const { agent, place } = await reviewed()
    const items = agent.items()
    expect(items.map(item => `${item.kind}:${item.state}`)).toEqual(['insert:pending', 'replace:pending', 'delete:pending'])

    const result = agent.accept(items[1].id)
    expect(result.ok).toBe(true)
    expect(textsOf(result.document)).toEqual(['一', '短的二', '三'])
    // The agent writes nothing: until the host does, the document is as it was.
    expect(textsOf(place.getDocument())).toEqual(['一', '二', '三'])
    place.set(result.document)
    expect(agent.items().map(item => `${item.kind}:${item.state}`)).toEqual(['insert:pending', 'replace:accepted', 'delete:pending'])

    agent.reject(items[2].id)
    expect(agent.items().map(item => item.kind)).toEqual(['insert', 'replace'])

    const all = agent.acceptAll()
    expect(textsOf(all.document)).toEqual(['頭', '一', '短的二', '三'])
    place.set(all.document)
    expect(agent.items().every(item => item.state === 'accepted')).toBe(true)

    expect(agent.accept('replace:nope')).toMatchObject({
      ok: false,
      document: place.getDocument(),
    })
  })

  it('rejectAll leaves nothing to review', async () => {
    const { agent } = await reviewed()
    expect(agent.items()).toHaveLength(3)
    agent.rejectAll()
    expect(agent.items()).toEqual([])
  })

  it('a snapshot is plain data that another agent picks up from', async () => {
    const { agent, place } = await reviewed()
    const snapshot = JSON.parse(JSON.stringify(agent.snapshot()))
    expect(snapshot.version).toBe(1)

    const { model, requests } = recording(scriptedModel([
      [
        { text: '接著做。' },
      ],
    ]))
    const other = createAgent({ model, getDocument: place.getDocument, snapshot })
    expect(other.getState().messages).toEqual(agent.getState().messages)
    expect(other.items()).toEqual(agent.items())

    await other.send('繼續')
    expect(usersOf(requests[0])).toHaveLength(2)
    expect(requests[0].messages.some(message => message.role === 'tool')).toBe(true)
  })
})

describe('the built-in prompt', () => {
  it('names the tools there are, and only elements LiteXML reads', () => {
    for (const tool of agentTools)
      expect(systemPrompt).toContain(tool.name)
    const registry = createDefaultRegistry()
    const tags = [
      ...new Set([
        ...systemPrompt.matchAll(/<([a-z][\w-]*)/g),
      ].map(match => match[1])),
    ]
    expect(tags.length).toBeGreaterThan(15)
    // <selection> is what documentToXml adds after the document; it is not written by the model.
    const unknown = tags.filter(tag => tag !== 'selection' && checkXml(`<${tag}></${tag}>`, registry).some(problem => problem.kind === 'unknown-tag'))
    expect(unknown).toEqual([])
    // What it shows as the right way to write things is right.
    for (const sample of [
      '<b>bold</b>',
      '<h2>heading</h2>',
      '<ul><li><p>item</p></li></ul>',
      '<a href="url">text</a>',
    ])
      expect(systemPrompt).toContain(sample)
    expect(checkXml('<p><b>bold</b> <a href="url">text</a><br /></p><h2>heading</h2><ul><li><p>item</p></li></ul><hr />', registry)).toEqual([])
  })

  it('keeps what goes into the document apart from what is said to the author', () => {
    const section = (title: string) => systemPrompt.split(/^## /m).find(part => part.startsWith(title)) ?? ''
    // The ban on Markdown is about the xml handed to a tool, and says so.
    const markdown = section('How to write LiteXML').split('\n').find(line => line.includes('Never use Markdown')) ?? ''
    expect(markdown).toMatch(/in (the )?xml/i)
    // The reply is chat text: no tags there, and Markdown is welcome.
    const answer = section('How to answer')
    expect(answer).toMatch(/chat/i)
    expect(answer).toMatch(/no (XML or HTML )?tags|without tags|not write (XML or HTML )?tags/i)
    expect(answer).toMatch(/Markdown/)
  })
})

describe('models', () => {
  it('a model is a function, and nothing in the package takes a key or names a service', () => {
    const root = join(import.meta.dirname, '../../src')
    const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
      entry.isDirectory()
        ? files(join(dir, entry.name))
        : [
            join(dir, entry.name),
          ])
    const code = files(root)
      .filter(file => !file.includes('/claude/'))
      .map(file => readFileSync(file, 'utf8'))
      .join('\n')
    expect(code).not.toMatch(/api[_-]?key/i)
    expect(code).not.toMatch(/authorization/i)
    expect(code).not.toMatch(/https?:\/\//)
    expect(code).not.toMatch(/\bfetch\(/)
  })

  async function collect(model: Model, request: Partial<ModelRequest> = {}) {
    const chunks: ModelChunk[] = []
    const full = {
      system: '',
      messages: [],
      tools: [],
      signal: new AbortController().signal,
      ...request,
    }
    for await (const chunk of model(full))
      chunks.push(chunk)
    return chunks
  }

  it('the scripted model plays its rounds in order, in small pieces', async () => {
    const model = scriptedModel([
      [
        { thinking: '想一想' },
        { text: '這是第一輪的回覆內容' },
        {
          tool: 'delete_block',
          input: { blockId: 'c3' },
        },
      ],
      [
        { text: '第二輪' },
      ],
    ], { chunkSize: 4 })

    const first = await collect(model)
    expect(first.at(-1)).toEqual({ type: 'done' })
    expect(first.filter(chunk => chunk.type === 'thinking').map(chunk => chunk.text).join('')).toBe('想一想')
    const words = first.filter(chunk => chunk.type === 'text')
    expect(words.length).toBeGreaterThan(1)
    expect(words.map(chunk => chunk.text).join('')).toBe('這是第一輪的回覆內容')
    const kinds = first.map(chunk => chunk.type)
    expect(kinds.indexOf('thinking')).toBeLessThan(kinds.indexOf('text'))
    expect(kinds.indexOf('tool_call_start')).toBeLessThan(kinds.indexOf('tool_call_partial'))
    expect(kinds.indexOf('tool_call_partial')).toBeLessThan(kinds.indexOf('tool_call'))
    const call = first.find(chunk => chunk.type === 'tool_call')!
    expect(call).toMatchObject({ name: 'delete_block' })
    expect(call.type === 'tool_call' && JSON.parse(call.input)).toEqual({ blockId: 'c3' })

    const second = await collect(model)
    expect(second.filter(chunk => chunk.type === 'text').map(chunk => chunk.text).join('')).toBe('第二輪')

    // Past the end of the script it answers with the same closing words, and throws nothing.
    const third = await collect(model)
    const fourth = await collect(model)
    expect(third.some(chunk => chunk.type === 'text')).toBe(true)
    expect(third).toEqual(fourth)
  })

  it('the scripted model can work a tool call out from the request, waits between pieces, and stops when aborted', async () => {
    const fromRequest = scriptedModel([
      [
        {
          tool: 'delete_block',
          input: (request: ModelRequest) => ({ blockId: request.system }),
        },
      ],
    ])
    const chunks = await collect(fromRequest, { system: 'from-request' })
    const call = chunks.find(chunk => chunk.type === 'tool_call')!
    expect(call.type === 'tool_call' && JSON.parse(call.input)).toEqual({ blockId: 'from-request' })

    const slow = scriptedModel([
      [
        { text: '一二三四五六七八九十' },
      ],
    ], { delay: 20, chunkSize: 1 })
    const started = Date.now()
    await collect(slow)
    expect(Date.now() - started).toBeGreaterThanOrEqual(150)

    const controller = new AbortController()
    const aborted = scriptedModel([
      [
        { text: '一二三四五六七八九十' },
      ],
    ], { delay: 20, chunkSize: 1 })
    setTimeout(() => controller.abort(), 50)
    const before = Date.now()
    const partial = await collect(aborted, { signal: controller.signal })
    expect(Date.now() - before).toBeLessThan(150)
    expect(partial.filter(chunk => chunk.type === 'text').length).toBeLessThan(10)
  })
})
