import type { Model, ModelChunk, ModelMessage, ModelRequest } from '../conversation'

export interface ClaudeModelOptions {
  /**
   * Sends one request and hands back the response as it streams. Yours to write: this is where
   * the address, the credentials and any server of your own in between live.
   */
  send: (body: Record<string, unknown>, signal: AbortSignal) => Promise<Response>
  /** The model to ask, by its ID. */
  model: string
  /** The most the model may write in one reply. Default 64000. */
  maxTokens?: number
  /** More fields for the request, such as `thinking` or `output_config`. They win over what this adapter sets. */
  body?: Record<string, unknown>
}

type Json = Record<string, any>

const DEFAULT_MAX_TOKENS = 64000
const CACHED = { type: 'ephemeral' }

/** The blocks of a reply exactly as the model produced them, kept to be sent back as they were. */
interface Kept { anthropicContent: Json[] }

const isKept = (value: unknown): value is Kept => Array.isArray((value as Kept | null)?.anthropicContent)

function parsed(input: string): Json {
  try {
    const value = JSON.parse(input)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {}
  }
  catch {
    return {}
  }
}

/**
 * The conversation as the Messages API takes it. A reply goes back as the very blocks it came
 * in, thinking and signatures included, which the API requires while tools are in use; the
 * results of one reply's tool calls go into a single user message.
 */
function messagesFor(messages: ModelMessage[]): Json[] {
  const out: Json[] = []
  for (const message of messages) {
    if (message.role === 'user') {
      out.push({ role: 'user', content: message.text })
    }
    else if (message.role === 'assistant') {
      const kept = message.state.find(isKept)
      out.push({
        role: 'assistant',
        content: kept?.anthropicContent ?? [
          ...(message.text
            ? [
                { type: 'text', text: message.text },
              ]
            : []),
          ...message.toolCalls.map(call => ({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: parsed(call.input),
          })),
        ],
      })
    }
    else {
      const result = {
        type: 'tool_result',
        tool_use_id: message.callId,
        content: message.content,
        ...(message.isError
          ? { is_error: true }
          : {}),
      }
      const last = out.at(-1)
      if (last?.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
        last.content.push(result)
      }
      else {
        out.push({
          role: 'user',
          content: [result],
        })
      }
    }
  }
  return out
}

function bodyFor(request: ModelRequest, options: ClaudeModelOptions): Json {
  return {
    model: options.model,
    max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
    stream: true,
    // The prompt and the tools are the same on every request, so they are marked for caching.
    system: [
      { type: 'text', text: request.system, cache_control: CACHED },
    ],
    tools: request.tools.map((tool, index) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
      // Arguments stream as they are written. What arrives is checked before any tool runs.
      eager_input_streaming: true,
      ...(index === request.tools.length - 1
        ? { cache_control: CACHED }
        : {}),
    })),
    messages: messagesFor(request.messages),
    ...options.body,
  }
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => '')
  try {
    const error = JSON.parse(text).error
    if (error?.message)
      return new Error(`The Claude API answered ${response.status} (${error.type}): ${error.message}`)
  }
  catch {}
  return new Error(`The Claude API answered ${response.status}: ${text.trim().slice(0, 200) || 'no details'}`)
}

/** The server-sent events of a response, one parsed `data` at a time. */
async function* events(response: Response): AsyncIterable<Json> {
  const decoder = new TextDecoder()
  let pending = ''

  function* take(final: boolean): Iterable<Json> {
    const parts = pending.split(/\r?\n\r?\n/)
    pending = final
      ? ''
      : parts.pop()!
    for (const part of parts) {
      const data = part.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
      if (data)
        yield JSON.parse(data)
    }
  }

  if (!response.body) {
    pending = await response.text()
    yield* take(true)
    return
  }
  const reader = response.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done)
        break
      pending += decoder.decode(value, { stream: true })
      yield* take(false)
    }
    pending += decoder.decode()
    yield* take(true)
  }
  finally {
    reader.releaseLock()
  }
}

/**
 * A model that speaks the Claude Messages API. It builds the request and reads the streamed
 * reply; sending is left to `send`, so no key or address ever passes through this package.
 */
export function claudeModel(options: ClaudeModelOptions): Model {
  return async function* (request): AsyncIterable<ModelChunk> {
    const response = await options.send(bodyFor(request, options), request.signal)
    if (!response.ok)
      throw await failure(response)

    /** The reply's blocks by index, filled in as their deltas arrive. */
    const blocks: Json[] = []
    const written = new Map<number, string>()
    let stopReason: string | null = null
    let details: Json | null = null
    let ended = false

    for await (const event of events(response)) {
      if (event.type === 'error')
        throw new Error(`The Claude API reported an error (${event.error?.type}): ${event.error?.message}`)

      if (event.type === 'content_block_start') {
        blocks[event.index] = { ...event.content_block }
        if (event.content_block.type === 'tool_use') {
          written.set(event.index, '')
          yield { type: 'tool_call_start', id: event.content_block.id, name: event.content_block.name }
        }
      }
      else if (event.type === 'content_block_delta') {
        const block = blocks[event.index]
        const delta = event.delta
        if (!block || !delta)
          continue
        if (delta.type === 'text_delta') {
          block.text = (block.text ?? '') + delta.text
          yield { type: 'text', text: delta.text }
        }
        else if (delta.type === 'thinking_delta') {
          block.thinking = (block.thinking ?? '') + delta.thinking
          yield { type: 'thinking', text: delta.thinking }
        }
        else if (delta.type === 'signature_delta') {
          block.signature = (block.signature ?? '') + delta.signature
        }
        else if (delta.type === 'input_json_delta') {
          const input = (written.get(event.index) ?? '') + delta.partial_json
          written.set(event.index, input)
          if (input) {
            yield {
              type: 'tool_call_partial',
              id: block.id,
              name: block.name,
              input,
            }
          }
        }
      }
      else if (event.type === 'message_delta') {
        stopReason = event.delta?.stop_reason ?? stopReason
        details = event.delta?.stop_details ?? details
      }
      else if (event.type === 'message_stop') {
        ended = true
      }
      // Anything else (ping, and event types added later) is not for us.
    }

    if (!ended)
      throw new Error('The reply from the Claude API ended before the message was complete.')
    if (stopReason === 'refusal') {
      throw new Error(`The model refused${details?.category
        ? ` (${details.category})`
        : ''}${details?.explanation
        ? `: ${details.explanation}`
        : '.'}`)
    }
    const calls = [...written].map(([index, input]) => ({ block: blocks[index], input }))
    if (calls.length > 0 && stopReason === 'max_tokens')
      throw new Error('The reply was cut off at max_tokens in the middle of a tool call, which was not run. Raise maxTokens and try again.')

    // Tool calls are handed over only now, when the reply is known to be whole.
    for (const { block, input } of calls) {
      block.input = parsed(input)
      yield {
        type: 'tool_call',
        id: block.id,
        name: block.name,
        input,
      }
    }
    yield {
      type: 'state',
      value: {
        anthropicContent: blocks.filter(Boolean),
      } satisfies Kept,
    }
    yield { type: 'done' }
  }
}
