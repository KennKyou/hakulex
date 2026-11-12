import type { LitexmlRegistry } from '@hakulex/litexml'
import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'

/** A document as the editor saves it. */
export type AgentDocument = SerializedEditorState

/** One top-level block of a document. Its ID is at `$.blockId`. */
export type Block = SerializedLexicalNode

interface ChangeBase {
  /** The turn of the conversation that proposed it. */
  turn: number
  /** Set once the change has been accepted, so that a later edit of the block isn't taken for a conflict. */
  accepted?: true
}

/** Replace a block of the document with another, which keeps its ID. */
export interface ReplaceChange extends ChangeBase {
  kind: 'replace'
  id: string
  /** The block as it was when the change was proposed. */
  base: Block
  node: Block
}

/** Take a block out of the document. */
export interface DeleteChange extends ChangeBase {
  kind: 'delete'
  id: string
  /** The block as it was when the change was proposed. */
  base: Block
}

/** New blocks for one gap between two blocks of the document. */
export interface InsertChange {
  kind: 'insert'
  /** The block of the document they come after; `null` for the start. */
  after: string | null
  /** The block of the document they come before; `null` for the end. */
  before: string | null
  blocks: { id: string, node: Block, turn: number }[]
}

export type Change = ReplaceChange | DeleteChange | InsertChange

/** What the model is told about a proposed change the user turned down. */
export interface Rejection {
  kind: Change['kind']
  blockIds: string[]
  turn: number
  /** The start of the text the change would have put in or taken out. */
  text: string
}

/**
 * Everything proposed for a document and not yet settled. Plain data: it can be kept as JSON and
 * picked up again later.
 */
export interface Proposal {
  version: 1
  changes: Change[]
  rejected: Rejection[]
}

export type ReviewState = 'pending' | 'accepted' | 'conflict'

/** One thing for the user to accept or reject. */
export interface ReviewItem {
  /** Stays the same for as long as the item is about the same block or gap. */
  id: string
  kind: Change['kind']
  state: ReviewState
  blockIds: string[]
  /** The blocks as they are without the change: one for a replacement or a deletion, none for new blocks. */
  before: Block[]
  /** The blocks the change puts there: none for a deletion. */
  after: Block[]
  /** The latest turn that touched it. */
  turn: number
}

/** A selection to point the model at. */
export type AgentSelection
  = | { blockIds: string[] }
    | { blockId: string, text: string }

export interface DocumentXmlOptions {
  /** Shows the document as it would be with what is pending in this proposal. */
  proposal?: Proposal
  selection?: AgentSelection
  registry?: LitexmlRegistry
}

/** A tool as a model is told about it. `parameters` is a JSON Schema. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  name: string
  /** The arguments, as an object or as the JSON text a model sent. */
  input: unknown
}

export interface ToolCallOptions {
  /** The turn to record on what this call proposes. */
  turn?: number
  /** The document as the model last saw it: a call on a block edited since then is turned down. */
  seen?: AgentDocument
  registry?: LitexmlRegistry
}

export interface ToolCallResult {
  /** The proposal after the call; the very one passed in when the call failed. */
  proposal: Proposal
  ok: boolean
  /** What to send back to the model. */
  content: string
}

export interface AcceptOptions {
  /** For an item in conflict: take the proposed blocks over what the user has. */
  overwrite?: boolean
}

export interface AcceptResult {
  document: AgentDocument
  proposal: Proposal
  /** Whether anything was applied. */
  ok: boolean
  /** Why nothing was applied. */
  reason?: string
}
