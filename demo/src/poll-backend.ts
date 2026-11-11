import type { PollAdapter, PollState } from '@hakulex/renderer'

/**
 * Stands in for a real backend: votes live in memory and go when the page reloads.
 * One reader, so "who voted" is just the last vote.
 */
interface StoredPoll {
  tallies: Record<string, number>
  userVote?: string[]
  closed?: boolean
}

const polls = new Map<string, StoredPoll>([
  [
    'p_demo_lunch',
    {
      tallies: { o_noodle: 3, o_rice: 2 },
    },
  ],
  [
    'p_demo_pets',
    {
      tallies: {
        o_cat: 4,
        o_dog: 3,
        o_fish: 1,
        o_none: 2,
      },
    },
  ],
  [
    'p_demo_closed',
    {
      tallies: { o_yes: 7, o_no: 2 },
      closed: true,
    },
  ],
])

function stateOf(pollId: string): PollState {
  const poll = polls.get(pollId) ?? { tallies: {} }
  return {
    tallies: { ...poll.tallies },
    totalVotes: Object.values(poll.tallies).reduce((sum, count) => sum + count, 0),
    ...(poll.userVote
      ? {
          userVote: [...poll.userVote],
        }
      : {}),
    canVote: !poll.closed,
    closed: !!poll.closed,
  }
}

const later = <T>(value: () => T) => new Promise<T>(resolve => setTimeout(() => resolve(value()), 300))

export const pollBackend: PollAdapter = {
  load: pollIds => later(() => Object.fromEntries(pollIds.map(id => [
    id,
    stateOf(id),
  ]))),
  vote: (pollId, optionIds) => later(() => {
    const poll = polls.get(pollId) ?? { tallies: {} }
    if (poll.closed)
      throw new Error('closed')
    // Voting again replaces the earlier vote.
    for (const id of poll.userVote ?? [])
      poll.tallies[id] = (poll.tallies[id] ?? 1) - 1
    for (const id of optionIds)
      poll.tallies[id] = (poll.tallies[id] ?? 0) + 1
    poll.userVote = [...optionIds]
    polls.set(pollId, poll)
    return stateOf(pollId)
  }),
}
