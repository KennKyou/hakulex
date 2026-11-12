import type {
  AcceptOptions,
  AgentAcceptResult,
  AgentDocument,
  AgentOptions,
  AgentSelection,
  AgentSnapshot,
  AgentState,
  ReviewItem,
} from '@hakulex/agent-core'
import type { Ref, ShallowRef } from 'vue'

/** As for `createAgent` in `@hakulex/agent-core`, without the document: that comes from the editor. */
export type UseAgentOptions = Omit<AgentOptions, 'getDocument'>

/** What an editor gives an agent once the two are joined. Used by `AgentPlugin`, not by you. */
export interface AgentHost {
  getDocument: () => AgentDocument
  editable: () => boolean
  /** Writes an accepted item into the editor, as one step of its history. */
  apply: (items: ReviewItem[], document: AgentDocument) => void
  selection: () => AgentSelection | undefined
}

export interface AgentController {
  /** The conversation: status, messages and the proposal. */
  state: Readonly<ShallowRef<AgentState>>
  /** What there is to review, kept up to date with both the proposal and the editor. */
  items: Readonly<ShallowRef<ReviewItem[]>>
  /** Whether the agent is joined to an editor. Until then it can't be sent anything. */
  ready: Readonly<Ref<boolean>>
  send: (text: string, options?: { selection?: AgentSelection }) => Promise<void>
  stop: () => void
  retry: () => Promise<void>
  /** Accepts an item and writes it into the editor. */
  accept: (itemId: string, options?: AcceptOptions) => AgentAcceptResult
  acceptAll: () => AgentAcceptResult
  reject: (itemId: string) => void
  rejectAll: () => void
  /** What is selected in the editor now, in the form `send` takes. */
  selection: () => AgentSelection | undefined
  snapshot: () => AgentSnapshot
  /** Joins the agent to an editor, or with `null` lets go of it. Called by `AgentPlugin`. */
  attach: (host: AgentHost | null) => void
  /** Works the items out again. Called by `AgentPlugin` when the editor changes. */
  refresh: () => void
}
