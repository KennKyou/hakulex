import type { LitexmlRegistry } from '@hakulex/litexml'
import type { AcceptOptions, AgentDocument, AgentSelection, Proposal, ReviewItem, ToolDefinition } from '../edits'

/** A tool call as a model makes it. `input` is the JSON text of its arguments. */
export interface ModelToolCall {
  id: string
  name: string
  input: string
}

/** The conversation as a model is given it. */
export type ModelMessage
  = | { role: 'user', text: string }
    | {
      role: 'assistant'
      text: string
      thinking: string
      toolCalls: ModelToolCall[]
      /** Whatever the model handed over with `state` chunks, for it to get back unchanged. */
      state: unknown[]
    }
    | { role: 'tool', callId: string, content: string, isError: boolean }

export interface ModelRequest {
  system: string
  messages: ModelMessage[]
  tools: ToolDefinition[]
  /** Aborted when the user stops the turn: stop sending chunks. */
  signal: AbortSignal
}

/** What a model sends back, piece by piece. */
export type ModelChunk
  = | { type: 'text', text: string }
    | { type: 'thinking', text: string }
    /** A tool call has begun; its arguments are still to come. */
    | { type: 'tool_call_start', id: string, name: string }
    /** The arguments of a tool call so far, all of them each time, not only what is new. */
    | { type: 'tool_call_partial', id: string, name: string, input: string }
    /** A finished tool call. May come without the two above. */
    | { type: 'tool_call', id: string, name: string, input: string }
    /** Something of the provider's own to keep with this reply and send back with it, such as a signed thinking block. */
    | { type: 'state', value: unknown }
    | { type: 'done' }

/**
 * A model is a function you write or pick: it gets the conversation and answers with a stream of
 * chunks. Keys, addresses and whether there is a server of yours in between are all inside it;
 * this package never sees them.
 */
export type Model = (request: ModelRequest) => AsyncIterable<ModelChunk>

/** A tool call as it shows in the conversation. */
export interface AgentToolUse {
  id: string
  name: string
  /** The JSON text of its arguments, growing while the model writes them. */
  input: string
  state: 'running' | 'done' | 'failed'
  /** What the model was told once it ran. */
  result?: string
}

export type AgentMessage
  = | { id: string, role: 'user', text: string, selection?: AgentSelection }
    | {
      id: string
      role: 'assistant'
      text: string
      thinking: string
      tools: AgentToolUse[]
      /** Set when the reply did not end by itself: the user stopped it, it ran out of rounds, or it failed. */
      stopped?: 'aborted' | 'rounds' | 'error'
    }

export interface AgentState {
  status: 'idle' | 'running' | 'error'
  /** Why, when `status` is `error`. */
  error?: string
  messages: AgentMessage[]
  proposal: Proposal
}

/** Everything needed to pick a conversation up again. Plain data. */
export interface AgentSnapshot {
  version: 1
  messages: AgentMessage[]
  proposal: Proposal
  history: StoredMessage[]
  turn: number
}

/** A message as it is kept: a user message holds the user's words and what they were told once, not the document. */
export type StoredMessage
  = | { role: 'user', text: string, notes: string, selection?: AgentSelection }
    | Exclude<ModelMessage, { role: 'user' }>

export interface AgentOptions {
  model: Model
  /** The document as it is now. Called whenever the agent needs to look. */
  getDocument: () => AgentDocument
  /** Added to the built-in system prompt: tone, language, what the document is for. */
  instructions?: string
  /** How many times the model may be asked in one turn. Default 8. */
  maxRounds?: number
  /** Refuses to send a document whose LiteXML is longer than this. No limit by default. */
  maxDocumentChars?: number
  registry?: LitexmlRegistry
  snapshot?: AgentSnapshot
}

export interface AgentAcceptResult {
  ok: boolean
  /** The document with the item applied, for you to put back where the document lives. */
  document: AgentDocument
  reason?: string
}

export interface Agent {
  /** Sends what the user wrote and runs until the model has nothing more to do. */
  send: (text: string, options?: { selection?: AgentSelection }) => Promise<void>
  /** Stops the turn in progress. */
  stop: () => void
  /** After an error: tries the last message again. */
  retry: () => Promise<void>
  /** What there is to review, from the document as it is now. */
  items: () => ReviewItem[]
  accept: (itemId: string, options?: AcceptOptions) => AgentAcceptResult
  acceptAll: () => AgentAcceptResult
  reject: (itemId: string) => void
  rejectAll: () => void
  getState: () => AgentState
  /** Calls `listener` with every new state. Returns the way to stop. */
  subscribe: (listener: (state: AgentState) => void) => () => void
  snapshot: () => AgentSnapshot
}

/** One thing a scripted model does in a round. */
export type ScriptStep
  = | { thinking: string }
    | { text: string }
    | { tool: string, input: unknown | ((request: ModelRequest) => unknown) }

export interface ScriptOptions {
  /** Milliseconds between chunks. Default 0. */
  delay?: number
  /** Characters of text per chunk. Default 8. */
  chunkSize?: number
}
