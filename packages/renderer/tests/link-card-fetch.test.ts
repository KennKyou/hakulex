import type { LinkCardProvider, LinkCardSettings, SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { RichRenderer } from '../src'

/*
 * Cards for addresses a source knows: fetched in the browser once near the screen, never on the
 * server, and never written into the document. The responses are shaped as the APIs answer.
 */

const observers: { callback: IntersectionObserverCallback, targets: Element[], options?: IntersectionObserverInit }[] = []
class FakeObserver {
  entry: (typeof observers)[number]
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.entry = { callback, targets: [], options }
    observers.push(this.entry)
  }

  observe(target: Element) {
    this.entry.targets.push(target)
  }

  disconnect() {
    this.entry.targets = []
  }

  unobserve() {}
}
/** Brings every watched card near the screen. */
async function scrollToCards() {
  for (const { callback, targets } of [...observers]) {
    if (targets.length)
      callback(targets.map(target => ({ isIntersecting: true, target }) as IntersectionObserverEntry), {} as IntersectionObserver)
  }
  await flushPromises()
  await flushPromises()
}

beforeEach(() => {
  observers.length = 0
  vi.stubGlobal('IntersectionObserver', FakeObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

let unique = 0
/** A repository no other test asks for: a page asks once for each. */
const repo = () => `owner/repo-${++unique}`

const responses: Record<string, (url: string) => unknown> = {
  'repos/[^/]+/[^/]+$': url => ({
    name: url.split('/').pop(),
    description: 'A repository',
    stargazers_count: 1234,
    language: 'TypeScript',
    owner: { avatar_url: 'https://avatars.example.com/owner.png' },
  }),
  '/pulls/': () => ({
    title: 'Add cards',
    state: 'closed',
    merged: true,
    additions: 12,
    deletions: 3,
    user: { avatar_url: 'https://avatars.example.com/pr.png' },
  }),
  '/issues/': () => ({
    title: 'Cards break',
    state: 'open',
    user: { avatar_url: 'https://avatars.example.com/issue.png' },
  }),
  '/commits/': () => ({
    sha: 'abcdef1234567',
    commit: { message: 'Fix the cards\n\nSigned-off-by: Someone' },
    stats: { additions: 5, deletions: 7 },
    author: { avatar_url: 'https://avatars.example.com/commit.png' },
  }),
  '/discussions/': () => ({
    title: 'Ideas',
    category: { name: 'Q&A' },
    user: { avatar_url: 'https://avatars.example.com/d.png' },
  }),
}
function answer(url: string) {
  for (const [pattern, make] of Object.entries(responses)) {
    if (new RegExp(pattern).test(url))
      return make(url)
  }
  throw new Error(`No answer for ${url}`)
}
const ARXIV = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Attention
  Is All You Need</title><author><name>Ashish Vaswani</name></author><author><name>Noam Shazeer</name></author></entry></feed>`

function card(url: string, extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'link-card',
    version: 1,
    url,
    ...extra,
  }
}
function show(cards: SerializedNode[], linkCards?: LinkCardSettings) {
  return mount(RichRenderer, {
    props: {
      value: {
        root: { type: 'root', children: cards },
      },
      linkCards,
    } as never,
    attachTo: document.body,
  })
}
const fetchJson = () => vi.fn(async (url: string) => answer(url))

describe('fetching a card\'s data', () => {
  it('waits until the card is near the screen, showing a placeholder, then shows what came back', async () => {
    const json = fetchJson()
    const name = repo()
    const wrapper = show([
      card(`https://github.com/${name}`),
    ], { fetchJson: json })
    await flushPromises()
    expect(json).not.toHaveBeenCalled()
    expect(wrapper.find('.hlx-link-card').attributes('data-loading')).toBeDefined()
    expect(wrapper.find('a.hlx-link-card').attributes('href')).toBe(`https://github.com/${name}`)
    expect(observers.at(-1)!.options?.rootMargin).toBe('400px 0px')
    await scrollToCards()
    expect(json).toHaveBeenCalledWith(`https://api.github.com/repos/${name}`, undefined)
    const shown = wrapper.find('.hlx-link-card')
    expect(shown.attributes('data-loading')).toBeUndefined()
    expect(shown.attributes('data-shape')).toBe('compact')
    expect(shown.find('.hlx-link-card-title-text').text()).toBe(name.split('/')[1])
    expect(shown.find('.hlx-link-card-badge').text()).toBe('1,234')
    expect(shown.find('.hlx-link-card-badge svg').exists()).toBe(true)
    expect(shown.find('.hlx-link-card-description').text()).toBe('A repository')
    expect(shown.find('img.hlx-link-card-image').attributes('src')).toBe('https://avatars.example.com/owner.png')
    // TypeScript's color tints the card.
    expect(shown.attributes('style')).toContain('--hlx-link-card-color: #2b7489')
    expect(shown.find('.hlx-link-card-tint').exists()).toBe(true)
  })

  it.each([
    [
      'a pull request',
      'pull/7',
      'PR: Add cards',
      ['Merged', '+12', '-3', 'owner/'],
      '#8957e5',
    ],
    [
      'an issue',
      'issues/8',
      'Issue: Cards break',
      ['Open', '#8 · owner/'],
      '#238636',
    ],
    [
      'a commit',
      'commit/abcdef1234567',
      'Fix the cards',
      ['+5', '-7', 'abcdef1', 'owner/'],
      undefined,
    ],
    [
      'a discussion',
      'discussions/9',
      'Discussion: Ideas',
      ['Q&A', '#9 · owner/'],
      undefined,
    ],
  ])('shows %s', async (_name, path, title, pieces, color) => {
    const wrapper = show([
      card(`https://github.com/${repo()}/${path}`),
    ], {
      fetchJson: fetchJson(),
    })
    await scrollToCards()
    const shown = wrapper.find('.hlx-link-card')
    expect(shown.find('.hlx-link-card-title-text').text()).toBe(title)
    const parts = shown.findAll('.hlx-link-card-part').map(part => part.text())
    for (const piece of pieces)
      expect(parts.some(part => part.includes(piece)), piece).toBe(true)
    if (color)
      expect(shown.attributes('style')).toContain(`--hlx-link-card-color: ${color}`)
    expect(shown.find('img.hlx-link-card-image').exists()).toBe(true)
  })

  it('shows an arXiv paper, wider, with its id and authors', async () => {
    const fetched = vi.fn(async () => new Response(ARXIV))
    vi.stubGlobal('fetch', fetched)
    const wrapper = show([
      card('https://arxiv.org/abs/1706.03762v7'),
    ])
    await scrollToCards()
    expect(fetched).toHaveBeenCalledWith('https://export.arxiv.org/api/query?id_list=1706.03762v7')
    const shown = wrapper.find('.hlx-link-card')
    expect(shown.attributes('data-shape')).toBe('expanded')
    expect(shown.find('.hlx-link-card-title-text').text()).toBe('Attention Is All You Need')
    expect(shown.find('.hlx-link-card-badge').attributes('data-mono')).toBeDefined()
    expect(shown.find('.hlx-link-card-badge').text()).toBe('1706.03762v7')
    expect(shown.find('.hlx-link-card-description').text()).toBe('Ashish Vaswani et al.')
  })

  it('asks once for the same address, and not at all for one no source knows', async () => {
    const json = fetchJson()
    const url = `https://github.com/${repo()}`
    const wrapper = show([
      card(url),
      card(url),
      card('https://example.com/a', { title: 'Stored' }),
    ], { fetchJson: json })
    await scrollToCards()
    expect(json).toHaveBeenCalledTimes(1)
    const cards = wrapper.findAll('.hlx-link-card')
    expect(cards[1]!.find('.hlx-link-card-title-text').text()).toBe(cards[0]!.find('.hlx-link-card-title-text').text())
    expect(cards[2]!.find('.hlx-link-card-title-text').text()).toBe('Stored')
    expect(cards[2]!.attributes('data-loading')).toBeUndefined()
  })

  it('uses the stored source and id when a provider has that name', async () => {
    const json = fetchJson()
    const name = repo()
    show([
      card('https://example.com/elsewhere', { source: 'gh-repo', id: name }),
    ], { fetchJson: json })
    await scrollToCards()
    expect(json).toHaveBeenCalledWith(`https://api.github.com/repos/${name}`, undefined)
  })

  it('shows what is stored while fetching, and keeps it when the fetch fails', async () => {
    let fail!: (error: Error) => void
    const json = vi.fn(() => new Promise((_resolve, reject) => fail = reject))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = show([
      card(`https://github.com/${repo()}`, { title: 'Stored', description: 'Kept' }),
    ], { fetchJson: json })
    await scrollToCards()
    expect(wrapper.find('.hlx-link-card').attributes('data-loading')).toBeUndefined()
    expect(wrapper.find('.hlx-link-card-title-text').text()).toBe('Stored')
    fail(new Error('rate limited'))
    await flushPromises()
    expect(wrapper.find('.hlx-link-card').attributes('data-failed')).toBeUndefined()
    expect(wrapper.find('.hlx-link-card-description').text()).toBe('Kept')
    error.mockRestore()
  })

  it.each([
    [
      'fails',
      () => Promise.reject(new Error('down')),
    ],
    [
      'answers with something else',
      async () => ({ unexpected: true }),
    ],
  ])('says so when it %s, for a card with only its address', async (_name, reply) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const name = repo()
    const wrapper = show([
      card(`https://github.com/${name}`),
    ], {
      fetchJson: vi.fn(reply),
    })
    await scrollToCards()
    const shown = wrapper.find('a.hlx-link-card')
    expect(shown.attributes('data-failed')).toBeDefined()
    expect(shown.attributes('href')).toBe(`https://github.com/${name}`)
    expect(shown.text()).toContain(`github.com/${name}`)
    expect(shown.text()).toContain('無法預覽・仍可前往')
    error.mockRestore()
  })

  it('keeps only text, known icons, plain colors and safe pictures from a source', async () => {
    const strange: LinkCardProvider = {
      name: 'strange',
      priority: 1000,
      matchUrl: url => url.hostname === 'strange.example'
        ? {
            id: url.pathname.slice(1),
          }
        : null,
      isValidId: () => true,
      fetch: async () => ({
        title: '<b>bold</b>',
        description: [
          { text: '<img src=x onerror=alert(1)>', icon: 'nope' as never, color: 'red; background: url(x)' },
        ],
        image: 'javascript:alert(1)',
        color: 'url(x)',
      }),
    }
    const wrapper = show([
      card('https://strange.example/a'),
    ], {
      providers: [strange],
    })
    await scrollToCards()
    const shown = wrapper.find('.hlx-link-card')
    expect(shown.find('.hlx-link-card-title-text').text()).toBe('<b>bold</b>')
    expect(shown.find('b').exists()).toBe(false)
    expect(shown.find('.hlx-link-card-description').text()).toBe('<img src=x onerror=alert(1)>')
    expect(shown.find('.hlx-link-card-description img').exists()).toBe(false)
    expect(shown.find('img').exists()).toBe(false)
    expect(shown.attributes('style') ?? '').not.toContain('url(')
    expect(shown.html()).not.toContain('background: url')
  })
})

describe('a site\'s settings', () => {
  it('adds providers, replaces a built-in one of the same name, and sends GitHub requests through its adapter', async () => {
    const request = vi.fn(async (url: string) => answer(url))
    const json = vi.fn(async () => ({ title: 'Mine' }))
    const mine: LinkCardProvider = {
      name: 'mine',
      matchUrl: url => url.hostname === 'mine.example'
        ? { id: 'x' }
        : null,
      isValidId: () => true,
      fetch: async (id, context) => context!.fetchJson!(`https://api.mine.example/${id}`),
    }
    const replaced: LinkCardProvider = {
      name: 'arxiv',
      priority: 80,
      matchUrl: url => url.hostname === 'arxiv.org'
        ? { id: 'replaced' }
        : null,
      isValidId: () => true,
      fetch: async () => ({ title: 'Replaced' }),
    }
    const name = repo()
    const wrapper = show([
      card(`https://github.com/${name}`),
      card('https://mine.example/page'),
      card('https://arxiv.org/abs/2401.00001'),
    ], {
      providers: [mine, replaced],
      adapters: {
        github: { request } as never,
      },
      fetchJson: json,
    })
    await scrollToCards()
    expect(request).toHaveBeenCalledWith(`https://api.github.com/repos/${name}`, undefined)
    expect(json).toHaveBeenCalledWith('https://api.mine.example/x')
    const titles = wrapper.findAll('.hlx-link-card-title-text').map(title => title.text())
    expect(titles).toEqual([name.split('/')[1], 'Mine', 'Replaced'])
  })

  it('fetches nothing when turned off', async () => {
    const json = fetchJson()
    const wrapper = show([
      card(`https://github.com/${repo()}`),
    ], { enabled: false, fetchJson: json })
    await scrollToCards()
    expect(json).not.toHaveBeenCalled()
    expect(wrapper.find('.hlx-link-card').attributes('data-loading')).toBeUndefined()
    expect(wrapper.find('.hlx-link-card-title-text').text()).toContain('https://github.com/')
  })
})

describe('on the server', () => {
  it('asks for nothing, and holds a known address\'s place with a placeholder link', async () => {
    const json = fetchJson()
    const name = repo()
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: {
          root: {
            type: 'root',
            children: [
              card(`https://github.com/${name}`),
              card(`https://github.com/${repo()}`, { title: 'Stored' }),
            ],
          },
        },
        linkCards: { fetchJson: json },
      }),
    }))
    expect(json).not.toHaveBeenCalled()
    expect(html).toMatch(new RegExp(`<a class="hlx-link-card"[^>]*data-loading[^>]*href="https://github.com/${name}"`))
    expect(html).toContain('Stored')
    expect(html).toContain('data-shape="compact"')
  })
})
