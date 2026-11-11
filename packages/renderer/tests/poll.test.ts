import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { extractPolls, RichRenderer } from '../src'

function root(...children: unknown[]) {
  return {
    root: { type: 'root', children },
  }
}
function ssr(...children: unknown[]) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: root(...children) as never,
    }),
  }))
}
function poll(extra: Record<string, unknown> = {}): SerializedNode {
  return {
    type: 'poll',
    version: 1,
    pollId: 'p_one',
    question: 'Which one?',
    options: [
      { id: 'o_a', label: 'Apple' },
      { id: 'o_b', label: 'Banana' },
    ],
    mode: 'single',
    ...extra,
  }
}

describe('poll without a backend (SSR)', () => {
  it('shows the question and options, and no way to vote', async () => {
    const html = await ssr(poll())
    expect(html).toContain('class="hlx-poll"')
    expect(html).toContain('Which one?')
    expect(html).toContain('Apple')
    expect(html).toContain('Banana')
    expect(html).toContain('單選')
    expect(html).not.toContain('<button')
    expect(html).not.toContain('<input')
  })

  it('says when several can be chosen', async () => {
    expect(await ssr(poll({ mode: 'multiple' }))).toContain('可複選')
  })

  it('shows a closing time the same way everywhere', async () => {
    const html = await ssr(poll({ closeAt: '2026-12-31T15:30:00.000Z' }))
    expect(html).toContain('datetime="2026-12-31T15:30:00.000Z"')
    expect(html).toContain('2026-12-31 15:30 UTC')
  })

  it.each([
    ['not a date'],
    [42],
    [''],
  ])('leaves out the closing time %j', async (closeAt) => {
    const html = await ssr(poll({ closeAt }))
    expect(html).not.toContain('<time')
    expect(html).toContain('Which one?')
  })

  it('shows HTML in the text as text', async () => {
    const html = await ssr(poll({
      question: '<b>bold</b>',
      options: [
        { id: 'o', label: '<img src=x onerror=alert(1)>' },
      ],
    }))
    expect(html).not.toContain('<b>bold')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it.each([
    [
      'options that are not a list',
      { options: 'nope' },
    ],
    [
      'options without text or id',
      {
        options: [
          { id: 'o_a', label: 'Apple' },
          { id: 'o_b' },
          { label: 'x' },
          null,
          { id: 'o_c', label: '  ' },
        ],
      },
    ],
    [
      'an unknown mode',
      { mode: 'ranked' },
    ],
    [
      'no pollId',
      { pollId: undefined },
    ],
  ])('shows what it can with %s', async (_name, extra) => {
    const html = await ssr(poll(extra))
    expect(html).toContain('Which one?')
    expect(html).not.toContain('>x<')
  })

  it('treats an unknown mode as single choice', async () => {
    expect(await ssr(poll({ mode: 'ranked' }))).toContain('單選')
  })

  it('shows nothing without a question or options', async () => {
    expect(await ssr(poll({ question: '', options: [] }))).not.toContain('hlx-poll')
  })

  it('keeps a paragraph holding a poll out of a p', async () => {
    const html = await ssr({
      type: 'paragraph',
      children: [
        poll(),
      ],
    })
    expect(html).toMatch(/^<div class="hlx-root[^>]*><div class="hlx-paragraph/)
    expect(html).toContain('hlx-poll')
  })
})

describe('extractPolls', () => {
  it('finds polls anywhere, nested content included, once each', () => {
    const nested = {
      type: 'nested-doc',
      content: root(poll({ pollId: 'p_nested' })),
    }
    const doc = root(poll(), {
      type: 'paragraph',
      children: [
        poll({
          pollId: 'p_inline',
          mode: 'multiple',
          closeAt: '2026-01-01T00:00:00Z',
          showResults: 'after-vote',
        }),
      ],
    }, nested, poll())
    expect(extractPolls(doc as never)).toEqual([
      {
        pollId: 'p_one',
        question: 'Which one?',
        mode: 'single',
        options: [
          { id: 'o_a', label: 'Apple' },
          { id: 'o_b', label: 'Banana' },
        ],
      },
      {
        pollId: 'p_inline',
        question: 'Which one?',
        mode: 'multiple',
        options: [
          { id: 'o_a', label: 'Apple' },
          { id: 'o_b', label: 'Banana' },
        ],
        closeAt: '2026-01-01T00:00:00Z',
        showResults: 'after-vote',
      },
      {
        pollId: 'p_nested',
        question: 'Which one?',
        mode: 'single',
        options: [
          { id: 'o_a', label: 'Apple' },
          { id: 'o_b', label: 'Banana' },
        ],
      },
    ])
  })

  it('leaves out polls that cannot be voted on', () => {
    const doc = root(poll({ pollId: undefined }), poll({ pollId: '' }), poll({ pollId: 'p_empty', options: [] }), poll({ pollId: 'p_bad', showResults: 'never' }))
    expect(extractPolls(doc as never)).toEqual([
      {
        pollId: 'p_bad',
        question: 'Which one?',
        mode: 'single',
        options: [
          { id: 'o_a', label: 'Apple' },
          { id: 'o_b', label: 'Banana' },
        ],
      },
    ])
  })
})
