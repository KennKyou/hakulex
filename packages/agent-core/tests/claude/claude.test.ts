import type { ModelChunk, ModelMessage, ModelRequest } from '../../src/conversation'
import type { AgentDocument, Block } from '../../src/edits'
import { describe, expect, it } from 'vitest'
import { claudeModel } from '../../src/claude'
import { createAgent } from '../../src/conversation'
import { agentTools } from '../../src/edits'

type Json = Record<string, any>

/*
 * The streams below are written from the Messages API documentation (streaming and thinking
 * pages, read 2026-11-12): event names, block and delta shapes are as shown there. They are not
 * recordings of the service.
 */
function sse(events: [string, Json][], newline = '\n') {
  return events
    .map(([event, data]) => `event: ${event}${newline}data: ${JSON.stringify(data)}${newline}${newline}`)
    .join('')
}

const SIGNATURE = 'EqQBCgIYAhIM1gbcDa9GJwZA2b3hGgxBdjrkzLoky3dl1pkiMOYds'

function messageStart(): [string, Json] {
  return [
    'message_start',
    {
      type: 'message_start',
      message: {
        id: 'msg_01',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-opus-5-5',
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 25, output_tokens: 1 },
      },
    },
  ]
}
function stop(index: number): [string, Json] {
  return [
    'content_block_stop',
    { type: 'content_block_stop', index },
  ]
}
function delta(index: number, value: Json): [string, Json] {
  return [
    'content_block_delta',
    { type: 'content_block_delta', index, delta: value },
  ]
}
function start(index: number, block: Json): [string, Json] {
  return [
    'content_block_start',
    { type: 'content_block_start', index, content_block: block },
  ]
}
function messageEnd(reason: string, more: Json = {}): [string, Json][] {
  return [
    [
      'message_delta',
      {
        type: 'message_delta',
        delta: { stop_reason: reason, stop_sequence: null, ...more },
        usage: { output_tokens: 89 },
      },
    ],
    [
      'message_stop',
      { type: 'message_stop' },
    ],
  ]
}

/** Thinking, a sentence, then one tool call whose arguments arrive in pieces. */
const toolTurn: [string, Json][] = [
  messageStart(),
  [
    'ping',
    { type: 'ping' },
  ],
  start(0, { type: 'thinking', thinking: '', signature: '' }),
  delta(0, { type: 'thinking_delta', thinking: '第二段太長，' }),
  delta(0, { type: 'thinking_delta', thinking: '改短一點。' }),
  delta(0, { type: 'signature_delta', signature: SIGNATURE }),
  stop(0),
  start(1, { type: 'text', text: '' }),
  delta(1, { type: 'text_delta', text: '我來' }),
  delta(1, { type: 'text_delta', text: '改第二段。' }),
  stop(1),
  [
    'something_new',
    { type: 'something_new', note: 'an event type from the future' },
  ],
  start(2, {
    type: 'tool_use',
    id: 'toolu_01T1x',
    name: 'replace_block',
    input: {},
  }),
  delta(2, { type: 'input_json_delta', partial_json: '' }),
  delta(2, { type: 'input_json_delta', partial_json: '{"blockId":' }),
  delta(2, { type: 'input_json_delta', partial_json: ' "b2", "xml": "<p>短' }),
  delta(2, { type: 'input_json_delta', partial_json: '的二</p>"}' }),
  stop(2),
  ...messageEnd('tool_use'),
]
const textTurn: [string, Json][] = [
  messageStart(),
  start(0, { type: 'text', text: '' }),
  delta(0, { type: 'text_delta', text: '改好了。' }),
  stop(0),
  ...messageEnd('end_turn'),
]

/** A response whose body arrives a few bytes at a time, so that characters and events are cut anywhere. */
function streamed(text: string, size = 7, init: ResponseInit = { status: 200 }) {
  const bytes = new TextEncoder().encode(text)
  let at = 0
  return new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length)
        return controller.close()
      controller.enqueue(bytes.slice(at, at + size))
      at += size
    },
  }), init)
}

function sender(responses: (() => Response)[]) {
  const bodies: Json[] = []
  const signals: AbortSignal[] = []
  return {
    bodies,
    signals,
    send: async (body: Record<string, unknown>, signal: AbortSignal) => {
      bodies.push(JSON.parse(JSON.stringify(body)))
      signals.push(signal)
      return responses[bodies.length - 1]()
    },
  }
}

function request(messages: ModelMessage[]): ModelRequest {
  return {
    system: 'You are an editor.',
    messages,
    tools: agentTools,
    signal: new AbortController().signal,
  }
}
async function collect(iterable: AsyncIterable<ModelChunk>) {
  const chunks: ModelChunk[] = []
  for await (const chunk of iterable)
    chunks.push(chunk)
  return chunks
}

function p(id: string, value: string): Block {
  return {
    type: 'paragraph',
    children: [
      {
        type: 'text',
        text: value,
        format: 0,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
      },
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
function three() {
  return ({
    root: {
      type: 'root',
      children: [
        p('a1', '一'),
        p('b2', '二'),
        p('c3', '三'),
      ],
      direction: null,
      format: '',
      indent: 0,
      version: 1,
    },
  }) as unknown as AgentDocument
}

describe('the request', () => {
  it('is a Messages API body: system, tools, messages, streaming, with the stable parts marked for caching', async () => {
    const { send, bodies, signals } = sender([
      () => streamed(sse(textTurn)),
    ])
    const model = claudeModel({ send, model: 'claude-opus-5-5' })
    const asked = request([
      { role: 'user', text: '把第二段改短' },
    ])

    await collect(model(asked))

    expect(bodies).toHaveLength(1)
    const body = bodies[0]
    expect(body.model).toBe('claude-opus-5-5')
    expect(body.stream).toBe(true)
    expect(body.max_tokens).toBe(64000)
    expect(body.system).toEqual([
      {
        type: 'text',
        text: 'You are an editor.',
        cache_control: { type: 'ephemeral' },
      },
    ])
    expect(body.tools.map((tool: Json) => tool.name)).toEqual(['insert_blocks', 'replace_block', 'delete_block'])
    for (const [index, tool] of body.tools.entries()) {
      expect(tool.description).toBe(agentTools[index].description)
      expect(tool.input_schema).toEqual(agentTools[index].parameters)
      expect(tool.eager_input_streaming).toBe(true)
      expect(tool.parameters).toBeUndefined()
    }
    expect(body.tools.map((tool: Json) => tool.cache_control)).toEqual([
      undefined,
      undefined,
      { type: 'ephemeral' },
    ])
    expect(body.messages).toEqual([
      { role: 'user', content: '把第二段改短' },
    ])
    expect(signals[0]).toBe(asked.signal)
    // Whatever authenticates the request is the sender's business.
    expect(JSON.stringify(body)).not.toMatch(/key|authorization|token"/i)
  })

  it('takes its limit and further fields from the options, which win', async () => {
    const { send, bodies } = sender([
      () => streamed(sse(textTurn)),
    ])
    const model = claudeModel({
      send,
      model: 'claude-sonnet-5-5',
      maxTokens: 8000,
      body: {
        thinking: { type: 'adaptive', display: 'summarized' },
        output_config: { effort: 'low' },
        stream: true,
      },
    })
    await collect(model(request([
      { role: 'user', text: '改' },
    ])))
    expect(bodies[0]).toMatchObject({
      model: 'claude-sonnet-5-5',
      max_tokens: 8000,
      thinking: { type: 'adaptive', display: 'summarized' },
      output_config: { effort: 'low' },
    })
  })

  it('writes earlier tool calls and their results the way the API wants them back', async () => {
    const { send, bodies } = sender([
      () => streamed(sse(textTurn)),
    ])
    const model = claudeModel({ send, model: 'claude-opus-5-5' })
    const kept = [
      { type: 'thinking', thinking: '第二段太長，改短一點。', signature: SIGNATURE },
      { type: 'redacted_thinking', data: 'opaque' },
      { type: 'text', text: '我來改。' },
      {
        type: 'tool_use',
        id: 'toolu_a',
        name: 'replace_block',
        input: { blockId: 'b2', xml: '<p>短</p>' },
      },
      {
        type: 'tool_use',
        id: 'toolu_b',
        name: 'delete_block',
        input: { blockId: 'c3' },
      },
    ]
    await collect(model(request([
      { role: 'user', text: '第一次' },
      {
        role: 'assistant',
        text: '我來改。',
        thinking: '第二段太長，改短一點。',
        toolCalls: [
          { id: 'toolu_a', name: 'replace_block', input: '{"blockId":"b2","xml":"<p>短</p>"}' },
          { id: 'toolu_b', name: 'delete_block', input: '{"blockId":"c3"}' },
        ],
        state: [
          { anthropicContent: kept },
        ],
      },
      {
        role: 'tool',
        callId: 'toolu_a',
        content: 'Proposed new content.',
        isError: false,
      },
      {
        role: 'tool',
        callId: 'toolu_b',
        content: 'There is no block.',
        isError: true,
      },
      // A reply the adapter has no blocks for, as after the user stopped it.
      {
        role: 'assistant',
        text: '被中止的回覆',
        thinking: '',
        toolCalls: [
          { id: 'toolu_c', name: 'delete_block', input: '{"blockId":"a1"}' },
        ],
        state: [],
      },
      {
        role: 'tool',
        callId: 'toolu_c',
        content: 'ok',
        isError: false,
      },
      { role: 'user', text: '第二次' },
    ])))

    expect(bodies[0].messages).toEqual([
      { role: 'user', content: '第一次' },
      // Exactly the blocks the model produced, thinking and its signature included, in their order.
      { role: 'assistant', content: kept },
      // Every result of one reply in a single user message.
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_a', content: 'Proposed new content.' },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_b',
            content: 'There is no block.',
            is_error: true,
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '被中止的回覆' },
          {
            type: 'tool_use',
            id: 'toolu_c',
            name: 'delete_block',
            input: { blockId: 'a1' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'toolu_c', content: 'ok' },
        ],
      },
      { role: 'user', content: '第二次' },
    ])
  })
})

describe('the stream', () => {
  for (const [name, newline, size] of [
    ['in small pieces', '\n', 5],
    ['with CRLF line ends', '\r\n', 64],
    ['all at once', '\n', 100000],
  ] as const) {
    it(`becomes chunks: thinking, text and a tool call as it is written (${name})`, async () => {
      const { send } = sender([
        () => streamed(sse(toolTurn, newline), size),
      ])
      const chunks = await collect(claudeModel({ send, model: 'claude-opus-5-5' })(request([
        { role: 'user', text: '改' },
      ])))

      const of = <T extends ModelChunk['type']>(type: T) => chunks.filter((chunk): chunk is Extract<ModelChunk, { type: T }> => chunk.type === type)
      expect(of('thinking').map(chunk => chunk.text).join('')).toBe('第二段太長，改短一點。')
      expect(of('text').map(chunk => chunk.text).join('')).toBe('我來改第二段。')
      expect(of('tool_call_start')).toEqual([
        { type: 'tool_call_start', id: 'toolu_01T1x', name: 'replace_block' },
      ])
      // Each partial is everything so far, not only what is new.
      expect(of('tool_call_partial').map(chunk => chunk.input)).toEqual([
        '{"blockId":',
        '{"blockId": "b2", "xml": "<p>短',
        '{"blockId": "b2", "xml": "<p>短的二</p>"}',
      ])
      expect(of('tool_call')).toEqual([
        {
          type: 'tool_call',
          id: 'toolu_01T1x',
          name: 'replace_block',
          input: '{"blockId": "b2", "xml": "<p>短的二</p>"}',
        },
      ])
      expect(of('state')).toHaveLength(1)
      expect(of('state')[0].value).toEqual({
        anthropicContent: [
          { type: 'thinking', thinking: '第二段太長，改短一點。', signature: SIGNATURE },
          { type: 'text', text: '我來改第二段。' },
          {
            type: 'tool_use',
            id: 'toolu_01T1x',
            name: 'replace_block',
            input: { blockId: 'b2', xml: '<p>短的二</p>' },
          },
        ],
      })
      expect(chunks.at(-1)).toEqual({ type: 'done' })
      const kinds = chunks.map(chunk => chunk.type)
      expect(kinds.indexOf('thinking')).toBeLessThan(kinds.indexOf('text'))
      expect(kinds.indexOf('text')).toBeLessThan(kinds.indexOf('tool_call_start'))
      expect(kinds.indexOf('tool_call')).toBeLessThan(kinds.indexOf('state'))
    })
  }

  it('drives a whole turn through the agent, and sends the thinking back unchanged with the tool result', async () => {
    const { send, bodies } = sender([
      () => streamed(sse(toolTurn), 11),
      () => streamed(sse(textTurn), 11),
    ])
    const agent = createAgent({
      model: claudeModel({ send, model: 'claude-opus-5-5' }),
      getDocument: three,
    })

    await agent.send('把第二段改短')

    expect(agent.getState().status).toBe('idle')
    expect(agent.items()).toMatchObject([
      {
        kind: 'replace',
        state: 'pending',
        blockIds: ['b2'],
      },
    ])
    expect(agent.getState().messages.map(message => message.text)).toEqual(['把第二段改短', '我來改第二段。', '改好了。'])
    expect(bodies).toHaveLength(2)
    const [user, assistant, results] = bodies[1].messages
    expect(user.content).toContain('<p id="b2">二</p>')
    expect(assistant.content).toEqual([
      { type: 'thinking', thinking: '第二段太長，改短一點。', signature: SIGNATURE },
      { type: 'text', text: '我來改第二段。' },
      {
        type: 'tool_use',
        id: 'toolu_01T1x',
        name: 'replace_block',
        input: { blockId: 'b2', xml: '<p>短的二</p>' },
      },
    ])
    expect(results.role).toBe('user')
    expect(results.content).toMatchObject([
      { type: 'tool_result', tool_use_id: 'toolu_01T1x' },
    ])
    expect(results.content[0].is_error).toBeUndefined()
  })
})

describe('when it goes wrong', () => {
  const ask = (response: () => Response) => collect(claudeModel({ send: sender([response]).send, model: 'claude-opus-5-5' })(request([
    { role: 'user', text: '改' },
  ])))

  it('throws with the status and what the service said when the request is turned down', async () => {
    const overloaded = () => new Response(JSON.stringify({
      type: 'error',
      error: { type: 'overloaded_error', message: 'Overloaded' },
    }), { status: 529 })
    await expect(ask(overloaded)).rejects.toThrow(/529.*overloaded_error.*Overloaded/)
    await expect(ask(() => new Response('<html>Bad Gateway</html>', { status: 502 }))).rejects.toThrow(/502.*Bad Gateway/)

    const agent = createAgent({
      model: claudeModel({ send: sender([overloaded]).send, model: 'claude-opus-5-5' }),
      getDocument: three,
    })
    await agent.send('改')
    expect(agent.getState()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('529'),
    })
  })

  it('throws on an error event in the middle of the stream', async () => {
    const broken = sse([
      messageStart(),
      start(0, { type: 'text', text: '' }),
      delta(0, { type: 'text_delta', text: '開頭' }),
      [
        'error',
        {
          type: 'error',
          error: { type: 'overloaded_error', message: 'Overloaded' },
        },
      ],
    ])
    await expect(ask(() => streamed(broken))).rejects.toThrow(/overloaded_error.*Overloaded/)
  })

  it('does not hand over a tool call from a reply that was cut off or refused', async () => {
    const cut = (reason: string, more: Json = {}) => sse([
      messageStart(),
      start(0, {
        type: 'tool_use',
        id: 'toolu_cut',
        name: 'replace_block',
        input: {},
      }),
      delta(0, { type: 'input_json_delta', partial_json: '{"blockId": "b2", "xml": "<p>寫到一' }),
      stop(0),
      ...messageEnd(reason, more),
    ])
    for (const [reason, more, why] of [
      ['max_tokens', {}, /max_tokens/],
      [
        'refusal',
        {
          stop_details: { type: 'refusal', category: 'cyber', explanation: 'Declined.' },
        },
        /refus.*cyber/i,
      ],
    ] as const) {
      const { send } = sender([
        () => streamed(cut(reason, more)),
      ])
      const seen: ModelChunk[] = []
      const run = async () => {
        for await (const chunk of claudeModel({ send, model: 'claude-opus-5-5' })(request([
          { role: 'user', text: '改' },
        ])))
          seen.push(chunk)
      }
      await expect(run()).rejects.toThrow(why)
      expect(seen.some(chunk => chunk.type === 'tool_call')).toBe(false)
    }
  })

  it('passes on a reply that only ran out of room while writing text', async () => {
    const long = sse([
      messageStart(),
      start(0, { type: 'text', text: '' }),
      delta(0, { type: 'text_delta', text: '很長的回覆' }),
      stop(0),
      ...messageEnd('max_tokens'),
    ])
    const chunks = await ask(() => streamed(long))
    expect(chunks.filter(chunk => chunk.type === 'text')).toHaveLength(1)
    expect(chunks.at(-1)).toEqual({ type: 'done' })
  })

  it('throws when the stream ends before the message does', async () => {
    const half = sse([
      messageStart(),
      start(0, { type: 'text', text: '' }),
      delta(0, { type: 'text_delta', text: '開頭' }),
    ])
    await expect(ask(() => streamed(half))).rejects.toThrow(/ended/i)
  })
})
