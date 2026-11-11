import type { PollAdapter, PollState, SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

afterEach(() => {
  document.body.innerHTML = ''
})

function root(...children: unknown[]) {
  return {
    root: { type: 'root', children },
  }
}
function poll(pollId: string, extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'poll',
    version: 1,
    pollId,
    question: `Question ${pollId}`,
    options: [
      { id: 'o_a', label: 'Apple' },
      { id: 'o_b', label: 'Banana' },
      { id: 'o_c', label: 'Cherry' },
    ],
    mode: 'single',
    ...extra,
  }
}
function open(extra: Partial<PollState> = {}): PollState {
  return {
    tallies: { o_a: 3, o_b: 1 },
    totalVotes: 4,
    canVote: true,
    closed: false,
    ...extra,
  }
}

function fakeAdapter(states: Record<string, PollState> = {}) {
  const adapter = {
    load: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map(id => [id, states[id] ?? open()]))),
    vote: vi.fn(async (_id: string, optionIds: string[]) => open({
      tallies: { o_a: 3, o_b: 1, [optionIds[0]]: 5 },
      totalVotes: 6,
      userVote: optionIds,
    })),
  } satisfies PollAdapter
  return adapter
}

async function mountPolls(children: SerializedNode[], props: Record<string, unknown>) {
  const wrapper = mount(RichRenderer, {
    props: {
      value: root(...children),
      ...props,
    } as never,
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}
const optionsOf = (wrapper: ReturnType<typeof mount>, pollId: string) => wrapper.find(`[data-poll-id="${pollId}"]`)

describe('voting', () => {
  it('loads the polls without a state once, together', async () => {
    const adapter = fakeAdapter()
    const wrapper = await mountPolls([
      poll('p_1'),
      poll('p_2'),
      poll('p_3'),
    ], {
      pollAdapter: adapter,
      polls: {
        p_2: open(),
      },
    })
    expect(wrapper.text()).toContain('Apple')
    expect(adapter.load).toHaveBeenCalledTimes(1)
    expect(adapter.load).toHaveBeenCalledWith(['p_1', 'p_3'])
  })

  it('shows loading until the state arrives', async () => {
    let resolve!: (value: Record<string, PollState>) => void
    const adapter = {
      load: vi.fn(() => new Promise<Record<string, PollState>>((done) => {
        resolve = done
      })),
      vote: vi.fn(),
    }
    const wrapper = await mountPolls([
      poll('p_1'),
    ], { pollAdapter: adapter })
    expect(wrapper.text()).toContain('讀取中')
    resolve({
      p_1: open(),
    })
    await flushPromises()
    expect(wrapper.text()).not.toContain('讀取中')
    expect(wrapper.find('input[type="radio"]').exists()).toBe(true)
  })

  it('votes for one option, then shows the results and the choice', async () => {
    const adapter = fakeAdapter()
    let release!: () => void
    const sent = new Promise<void>((done) => {
      release = done
    })
    const vote = adapter.vote.getMockImplementation()!
    adapter.vote.mockImplementationOnce(async (id, optionIds) => {
      await sent
      return vote(id, optionIds)
    })
    const wrapper = await mountPolls([
      poll('p_1'),
    ], { pollAdapter: adapter })
    const button = wrapper.find('.hlx-poll-footer button')
    expect(button.attributes('disabled')).toBeDefined()
    await wrapper.findAll('input[type="radio"]')[1].setValue(true)
    expect(button.attributes('disabled')).toBeUndefined()
    await button.trigger('click')
    expect(wrapper.find('.hlx-poll-footer button').attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(adapter.vote).toHaveBeenCalledWith('p_1', ['o_b'])
    const chosen = wrapper.findAll('.hlx-poll-option[data-chosen]')
    expect(chosen).toHaveLength(1)
    expect(chosen[0].text()).toContain('Banana')
    expect(wrapper.text()).toContain('共 6 票')
    expect(chosen[0].text()).toMatch(/5\s*·\s*83%/)
  })

  it('votes for several options at once', async () => {
    const adapter = fakeAdapter()
    const wrapper = await mountPolls([
      poll('p_1', { mode: 'multiple' }),
    ], { pollAdapter: adapter })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    await boxes[0].setValue(true)
    await boxes[2].setValue(true)
    await wrapper.find('.hlx-poll-footer button').trigger('click')
    await flushPromises()
    expect(adapter.vote).toHaveBeenCalledWith('p_1', ['o_a', 'o_c'])
  })

  it.each([
    [
      'always',
      open(),
      true,
    ],
    [
      'always',
      open({
        userVote: ['o_a'],
      }),
      true,
    ],
    [
      'after-vote',
      open(),
      false,
    ],
    [
      'after-vote',
      open({
        userVote: ['o_a'],
      }),
      true,
    ],
    [
      'after-vote',
      open({ closed: true, canVote: false }),
      true,
    ],
    [
      'after-close',
      open({
        userVote: ['o_a'],
      }),
      false,
    ],
    [
      'after-close',
      open({ closed: true, canVote: false }),
      true,
    ],
  ] as const)('with %s results, %j shows counts: %s', async (showResults, state, shown) => {
    const wrapper = await mountPolls([
      poll('p_1', { showResults }),
    ], {
      pollAdapter: fakeAdapter(),
      polls: { p_1: state },
    })
    expect(wrapper.find('.hlx-poll-count').exists()).toBe(shown)
    expect(wrapper.text().includes('共 4 票')).toBe(shown)
  })

  it('offers no vote when the backend says no, and says when it is closed', async () => {
    const wrapper = await mountPolls([
      poll('p_1'),
      poll('p_2'),
    ], {
      pollAdapter: fakeAdapter(),
      polls: {
        p_1: open({ canVote: false }),
        p_2: open({ closed: true, canVote: false }),
      },
    })
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.find('button').exists()).toBe(false)
    expect(optionsOf(wrapper, 'p_2').text()).toContain('已截止')
    expect(optionsOf(wrapper, 'p_1').text()).not.toContain('已截止')
  })

  it('shows the question and options with an error when loading fails', async () => {
    const adapter = {
      load: vi.fn(async () => {
        throw new Error('down')
      }),
      vote: vi.fn(),
    }
    const wrapper = await mountPolls([
      poll('p_1'),
    ], { pollAdapter: adapter })
    expect(wrapper.text()).toContain('Apple')
    expect(wrapper.find('[role="alert"]').text()).toContain('無法讀取')
    expect(wrapper.find('input').exists()).toBe(false)
  })

  it('keeps the choice when voting fails, and can try again', async () => {
    const adapter = fakeAdapter()
    adapter.vote.mockRejectedValueOnce(new Error('down'))
    const wrapper = await mountPolls([
      poll('p_1'),
    ], { pollAdapter: adapter })
    await wrapper.findAll('input[type="radio"]')[0].setValue(true)
    await wrapper.find('.hlx-poll-footer button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('投票失敗')
    expect((wrapper.findAll('input[type="radio"]')[0].element as HTMLInputElement).checked).toBe(true)
    await wrapper.find('.hlx-poll-footer button').trigger('click')
    await flushPromises()
    expect(adapter.vote).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('leaves polls nobody can vote on alone', async () => {
    const adapter = fakeAdapter()
    const wrapper = await mountPolls([
      poll('p_1', { pollId: undefined }),
    ], { pollAdapter: adapter })
    expect(adapter.load).not.toHaveBeenCalled()
    expect(wrapper.find('input').exists()).toBe(false)
  })
})

describe('server rendering with a backend', () => {
  it('starts with the state it is given, and hydrates without loading again', async () => {
    const adapter = fakeAdapter()
    const polls = {
      p_1: open({
        userVote: ['o_a'],
      }),
    }
    const app = () => createSSRApp({
      render: () => h(RichRenderer, {
        value: root(poll('p_1')) as never,
        pollAdapter: adapter,
        polls,
      }),
    })
    const html = await renderToString(app())
    expect(html).toContain('共 4 票')
    expect(html).toContain('type="radio"')
    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const warn = vi.spyOn(console, 'warn')
    app().mount(container)
    await flushPromises()
    expect(warn).not.toHaveBeenCalled()
    expect(adapter.load).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('shows loading on the server for a poll without a state', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: root(poll('p_1')) as never,
        pollAdapter: fakeAdapter(),
      }),
    }))
    expect(html).toContain('讀取中')
  })
})
