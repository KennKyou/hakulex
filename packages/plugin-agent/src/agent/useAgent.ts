import type { AgentAcceptResult, AgentDocument, ReviewItem } from '@hakulex/agent-core'
import type { AgentController, AgentHost, UseAgentOptions } from './types'
import { createAgent } from '@hakulex/agent-core'
import { ref, shallowRef } from 'vue'

const UNATTACHED = 'The agent is not attached to an editor yet: put <AgentPlugin :agent="agent" /> inside a RichEditor.'
const NO_DOCUMENT = {
  root: {
    type: 'root',
    version: 1,
    children: [],
    direction: null,
    format: '',
    indent: 0,
  },
} as unknown as AgentDocument

/**
 * An agent for use with an editor. Make it where you like (it needs no editor yet), hand it to
 * `<AgentPlugin>` inside the `RichEditor` it should work on, and to whatever shows the
 * conversation. Its `state` and `items` are refs, so templates follow them by themselves.
 */
export function useAgent(options: UseAgentOptions): AgentController {
  let host: AgentHost | null = null
  const ready = ref(false)
  const core = createAgent({
    ...options,
    getDocument: () => {
      if (!host)
        throw new Error(UNATTACHED)
      return host.getDocument()
    },
  })
  const state = shallowRef(core.getState())
  const items = shallowRef<ReviewItem[]>([])

  /**
   * What still needs an answer. An accepted item is left out: the editor keeps blocks in its
   * own form, so what it holds can't be told apart from the block having been edited since.
   */
  const open = () => core.items().filter(item => item.state !== 'accepted')

  function refresh() {
    // Working the items out means writing the whole document out: only when there is something to review.
    if (state.value.proposal.changes.length === 0 && items.value.length === 0)
      return
    items.value = host
      ? open()
      : []
  }
  core.subscribe((next) => {
    state.value = next
    refresh()
  })

  /** Accepts in the core, then writes what was accepted into the editor. */
  function accept(pick: (all: ReviewItem[]) => ReviewItem[], run: () => AgentAcceptResult): AgentAcceptResult {
    if (!host)
      return { ok: false, document: NO_DOCUMENT, reason: UNATTACHED }
    if (!host.editable()) {
      return {
        ok: false,
        document: host.getDocument(),
        reason: 'The editor is read-only, so nothing was written.',
      }
    }
    const chosen = pick(open())
    const result = run()
    if (result.ok)
      host.apply(chosen, result.document)
    refresh()
    return result
  }

  return {
    state,
    items,
    ready,
    send: (text, sendOptions) => host
      ? core.send(text, sendOptions)
      : Promise.reject(new Error(UNATTACHED)),
    stop: core.stop,
    retry: () => host
      ? core.retry()
      : Promise.reject(new Error(UNATTACHED)),
    accept: (itemId, acceptOptions) => accept(
      all => all.filter(item => item.id === itemId),
      () => core.accept(itemId, acceptOptions),
    ),
    acceptAll: () => accept(all => all.filter(item => item.state === 'pending'), core.acceptAll),
    reject: core.reject,
    rejectAll: () => {
      if (host)
        core.rejectAll()
    },
    selection: () => host?.selection(),
    snapshot: core.snapshot,
    attach(next) {
      host = next
      ready.value = next !== null
      items.value = next
        ? open()
        : []
    },
    refresh,
  }
}
