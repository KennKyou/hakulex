import type { AgentDocument, AgentSelection, Proposal, Rejection } from '../edits'
import type {
  Agent,
  AgentMessage,
  AgentOptions,
  AgentSnapshot,
  AgentState,
  AgentToolUse,
  ModelMessage,
  ModelToolCall,
  StoredMessage,
} from './types'
import {
  acceptAll,
  acceptItem,
  agentTools,
  applyToolCall,
  createProposal,
  documentToXml,
  rejectAll,
  rejectItem,
  reviewItems,
  settleProposal,
  takeRejected,
} from '../edits'
import { systemFor } from './prompt'

type AssistantMessage = Extract<AgentMessage, { role: 'assistant' }>

const DEFAULT_ROUNDS = 8

function notesFor(rejected: Rejection[]): string {
  if (rejected.length === 0)
    return ''
  const lines = rejected.map((rejection) => {
    const what = rejection.kind === 'insert'
      ? 'new blocks'
      : rejection.kind === 'delete'
        ? 'removing the block'
        : 'new content for the block'
    return `- ${what} ${rejection.blockIds.join(', ')}${rejection.text
      ? `: "${rejection.text}"`
      : ''}`
  })
  return `The author rejected these edits you proposed. Do not propose them again unless asked:\n${lines.join('\n')}`
}

/** A user message as the model reads it: only the newest one comes with the document. */
function userText(message: Extract<StoredMessage, { role: 'user' }>, xml: string | null): string {
  const parts = [
    xml === null
      ? ''
      : `The document as it is now, with the edits you proposed that are still open:\n${xml.trimEnd()}`,
    message.notes,
    xml === null && !message.notes
      ? message.text
      : `The author's request:\n${message.text}`,
  ]
  return parts.filter(Boolean).join('\n\n')
}

/**
 * Runs the conversation with a model: sends what the user wrote together with the document,
 * carries out the tools the model calls against a proposal, and goes on until the model is done.
 * It never writes to the document: accepting hands the new document back to you.
 */
export function createAgent(options: AgentOptions): Agent {
  const maxRounds = Math.max(1, options.maxRounds ?? DEFAULT_ROUNDS)
  const system = systemFor(options.instructions)
  const listeners = new Set<(state: AgentState) => void>()
  const restored = options.snapshot

  let state: AgentState = { status: 'idle', messages: restored?.messages ?? [], proposal: restored?.proposal ?? createProposal() }
  const history: StoredMessage[] = [
    ...restored?.history ?? [],
  ]
  let turn = restored?.turn ?? 0
  let made = state.messages.length
  let controller: AbortController | null = null

  function set(patch: Partial<AgentState>) {
    const next = {
      ...state,
      ...patch,
    }
    if ('error' in patch && patch.error === undefined)
      delete next.error
    state = next
    for (const listener of [...listeners])
      listener(state)
  }
  /** Replaces the reply in progress, which is always the last message. */
  function reply(change: (message: AssistantMessage) => AssistantMessage, more: Partial<AgentState> = {}) {
    const last = state.messages.at(-1)
    if (last?.role !== 'assistant')
      return
    set({
      ...more,
      messages: [
        ...state.messages.slice(0, -1),
        change(last),
      ],
    })
  }
  function tool(id: string, change: (use: AgentToolUse | undefined) => AgentToolUse, more: Partial<AgentState> = {}) {
    reply((message) => {
      const known = message.tools.some(use => use.id === id)
      return {
        ...message,
        tools: known
          ? message.tools.map(use => use.id === id
              ? change(use)
              : use)
          : [
              ...message.tools,
              change(undefined),
            ],
      }
    }, more)
  }

  const newestUser = () => history.map(message => message.role).lastIndexOf('user')

  function requestMessages(xml: string): ModelMessage[] {
    const newest = newestUser()
    return history.map((message, index): ModelMessage => message.role === 'user'
      ? {
          role: 'user',
          text: userText(message, index === newest
            ? xml
            : null),
        }
      : message)
  }

  /** Asks the model, round after round, for the newest user message. */
  async function run() {
    const seen = options.getDocument()
    const newest = history[newestUser()]
    const selection: AgentSelection | undefined = newest?.role === 'user'
      ? newest.selection
      : undefined
    const xml = documentToXml(seen, { proposal: state.proposal, selection, registry: options.registry })
    if (options.maxDocumentChars !== undefined && xml.length > options.maxDocumentChars) {
      set({ status: 'error', error: `The document is ${xml.length} characters as LiteXML, over the limit of ${options.maxDocumentChars}. It was not sent.` })
      return
    }

    const abort = new AbortController()
    controller = abort
    set({ status: 'running', error: undefined })
    try {
      for (let round = 0; round < maxRounds; round++) {
        set({
          messages: [
            ...state.messages,
            {
              id: `m${++made}`,
              role: 'assistant',
              text: '',
              thinking: '',
              tools: [],
            },
          ],
        })
        const calls: ModelToolCall[] = []
        const results: StoredMessage[] = []
        const kept: unknown[] = []

        for await (const chunk of options.model({
          system,
          messages: requestMessages(xml),
          tools: agentTools,
          signal: abort.signal,
        })) {
          if (abort.signal.aborted)
            break
          if (chunk.type === 'text') {
            reply(message => ({ ...message, text: message.text + chunk.text }))
          }
          else if (chunk.type === 'thinking') {
            reply(message => ({ ...message, thinking: message.thinking + chunk.text }))
          }
          else if (chunk.type === 'tool_call_start') {
            tool(chunk.id, use => use ?? {
              id: chunk.id,
              name: chunk.name,
              input: '',
              state: 'running',
            })
          }
          else if (chunk.type === 'tool_call_partial') {
            tool(chunk.id, use => ({
              id: chunk.id,
              name: chunk.name,
              state: 'running',
              ...use,
              input: chunk.input,
            }))
          }
          else if (chunk.type === 'tool_call') {
            const result = applyToolCall(options.getDocument(), state.proposal, chunk, { turn, seen, registry: options.registry })
            calls.push({ id: chunk.id, name: chunk.name, input: chunk.input })
            results.push({
              role: 'tool',
              callId: chunk.id,
              content: result.content,
              isError: !result.ok,
            })
            tool(chunk.id, () => ({
              id: chunk.id,
              name: chunk.name,
              input: chunk.input,
              state: result.ok ? 'done' : 'failed',
              result: result.content,
            }), { proposal: result.proposal })
          }
          else if (chunk.type === 'state') {
            kept.push(chunk.value)
          }
          else {
            break
          }
        }

        const stopped = abort.signal.aborted
        const last = state.messages.at(-1) as AssistantMessage
        if (last.text || calls.length > 0) {
          history.push({
            role: 'assistant',
            text: last.text,
            // What a model keeps for itself is only whole when the reply ended by itself.
            thinking: stopped ? '' : last.thinking,
            toolCalls: calls,
            state: stopped
              ? []
              : kept,
          }, ...results)
        }
        if (stopped) {
          // A call the model was still writing never ran.
          reply(message => ({
            ...message,
            stopped: 'aborted',
            tools: message.tools.map(use => use.state === 'running'
              ? { ...use, state: 'failed', result: 'Stopped before it ran.' }
              : use),
          }))
          break
        }
        if (calls.length === 0)
          break
        if (round === maxRounds - 1)
          reply(message => ({ ...message, stopped: 'rounds' }))
      }
      set({ status: 'idle' })
    }
    catch (error) {
      if (abort.signal.aborted) {
        reply(message => ({ ...message, stopped: 'aborted' }), { status: 'idle' })
      }
      else {
        reply(message => ({ ...message, stopped: 'error' }), {
          status: 'error',
          error: error instanceof Error
            ? error.message
            : String(error),
        })
      }
    }
    finally {
      controller = null
    }
  }

  function accepted(result: { ok: boolean, document: AgentDocument, proposal: Proposal, reason?: string }) {
    if (result.ok)
      set({ proposal: result.proposal })
    return {
      ok: result.ok,
      document: result.document,
      ...(result.reason
        ? { reason: result.reason }
        : {}),
    }
  }

  return {
    async send(text, sendOptions = {}) {
      if (state.status === 'running')
        return
      // What was settled since the last turn is forgotten, and what was rejected is said once.
      const taken = takeRejected(settleProposal(options.getDocument(), state.proposal))
      turn += 1
      history.push({
        role: 'user',
        text,
        notes: notesFor(taken.rejected),
        ...(sendOptions.selection
          ? { selection: sendOptions.selection }
          : {}),
      })
      set({
        status: 'running',
        error: undefined,
        proposal: taken.proposal,
        messages: [
          ...state.messages,
          {
            id: `m${++made}`,
            role: 'user',
            text,
            ...(sendOptions.selection
              ? { selection: sendOptions.selection }
              : {}),
          },
        ],
      })
      await run()
    },
    stop() {
      controller?.abort()
    },
    async retry() {
      if (state.status !== 'error')
        return
      const messages = [...state.messages]
      while (messages.at(-1)?.role === 'assistant' && (messages.at(-1) as AssistantMessage).stopped === 'error')
        messages.pop()
      set({ messages })
      await run()
    },
    items: () => reviewItems(options.getDocument(), state.proposal),
    accept: (itemId, acceptOptions) => accepted(acceptItem(options.getDocument(), state.proposal, itemId, acceptOptions)),
    acceptAll: () => accepted(acceptAll(options.getDocument(), state.proposal)),
    reject(itemId) {
      const next = rejectItem(state.proposal, itemId)
      if (next !== state.proposal)
        set({ proposal: next })
    },
    rejectAll() {
      const next = rejectAll(settleProposal(options.getDocument(), state.proposal))
      if (next !== state.proposal)
        set({ proposal: next })
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: (): AgentSnapshot => ({
      version: 1,
      messages: state.messages,
      proposal: state.proposal,
      history: [...history],
      turn,
    }),
  }
}
