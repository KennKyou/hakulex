import type { InjectionKey } from 'vue'
import { reactive } from 'vue'

/** What a backend says about one poll. Who may vote, and whether it's closed, is up to it. */
export interface PollState {
  /** Votes per option id. */
  tallies: Record<string, number>
  totalVotes: number
  /** What this reader voted for. Leave it out if they haven't. */
  userVote?: string[]
  canVote: boolean
  closed: boolean
}

/**
 * How polls reach a backend. Nothing here sends requests itself: the
 * application decides where state comes from and who the reader is.
 */
export interface PollAdapter {
  /** The state of several polls at once: one request for all the polls on a page. */
  load: (pollIds: string[]) => Promise<Record<string, PollState>>
  /** Records a vote and returns the poll's state after it. */
  vote: (pollId: string, optionIds: string[]) => Promise<PollState>
}

export type PollEntry
  = | { status: 'loading' }
    | { status: 'error' }
    | { status: 'ready', state: PollState }

export interface PollContext {
  /** Whether there is a backend: without one, polls only show their options. */
  readonly enabled: boolean
  entry: (pollId: string) => PollEntry
  /** Asks for a poll's state, unless it has one. Requests made together go out together. */
  request: (pollId: string) => void
  vote: (pollId: string, optionIds: string[]) => Promise<void>
}

export const PollContextKey: InjectionKey<PollContext> = Symbol('PollContext')

export function createPollContext(
  adapter: () => PollAdapter | undefined,
  initial: () => Record<string, PollState> | undefined,
): PollContext {
  const loaded = reactive(new Map<string, PollEntry>())
  let queued: string[] = []

  function flush() {
    const ids = queued
    queued = []
    const backend = adapter()
    if (!backend || !ids.length)
      return
    backend.load(ids).then(
      (states) => {
        for (const id of ids) {
          const state = states[id]
          loaded.set(id, state
            ? { status: 'ready', state }
            : { status: 'error' })
        }
      },
      () => {
        for (const id of ids)
          loaded.set(id, { status: 'error' })
      },
    )
  }

  return {
    get enabled() {
      return !!adapter()
    },
    entry(pollId) {
      const given = initial()?.[pollId]
      return loaded.get(pollId) ?? (given
        ? { status: 'ready', state: given }
        : { status: 'loading' })
    },
    request(pollId) {
      if (loaded.has(pollId) || initial()?.[pollId] || queued.includes(pollId))
        return
      if (!queued.length)
        queueMicrotask(flush)
      queued.push(pollId)
    },
    async vote(pollId, optionIds) {
      const backend = adapter()
      if (!backend)
        return
      const state = await backend.vote(pollId, optionIds)
      loaded.set(pollId, { status: 'ready', state })
    },
  }
}
