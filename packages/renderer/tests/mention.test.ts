import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { MENTION_PLATFORMS, RichRenderer } from '../src'

function mention(platform: unknown, handle: unknown, displayName?: unknown): SerializedNode {
  return {
    type: 'mention',
    version: 1,
    platform,
    handle,
    ...(displayName === undefined
      ? {}
      : { displayName }),
  }
}

async function ssr(...children: SerializedNode[]) {
  const value = {
    root: {
      type: 'root',
      children: [
        { type: 'paragraph', children },
      ],
    },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value }),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('mention', () => {
  it.each([
    ['GH', 'https://github.com/octocat'],
    ['TW', 'https://x.com/octocat'],
    ['TG', 'https://t.me/octocat'],
    ['DC', 'https://discord.com/users/octocat'],
    ['YT', 'https://www.youtube.com/@octocat'],
    ['TH', 'https://www.threads.com/@octocat'],
    ['IG', 'https://www.instagram.com/octocat'],
    ['BL', 'https://space.bilibili.com/octocat'],
    ['RD', 'https://www.reddit.com/user/octocat'],
  ])('links %s with its icon', async (platform, href) => {
    const html = await ssr(mention(platform, 'octocat'))
    const link = html.querySelector('a')!
    expect(link.getAttribute('href')).toBe(href)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(link.textContent).toBe('octocat')
    expect(html.querySelector('.hlx-mention-icon svg')).not.toBeNull()
  })

  it('prefers the display name and drops a leading @ from the handle', async () => {
    expect((await ssr(mention('GH', 'octocat', 'Octocat'))).querySelector('a')!.textContent).toBe('Octocat')
    const html = await ssr(mention('GH', '@@octocat'))
    expect(html.querySelector('a')!.textContent).toBe('octocat')
    expect(html.querySelector('a')!.getAttribute('href')).toBe('https://github.com/octocat')
  })

  it('encodes the handle, so it can\'t change where the link goes', async () => {
    const href = (await ssr(mention('GH', 'a/../b?c=<d>'))).querySelector('a')!.getAttribute('href')!
    expect(href).toBe(`https://github.com/${encodeURIComponent('a/../b?c=<d>')}`)
    for (const handle of ['.', '..'])
      expect((await ssr(mention('GH', handle))).querySelector('a')).toBeNull()
  })

  it.each([
    'weibo',
    '__proto__',
    'constructor',
    'toString',
    7,
    null,
  ])('shows plain text for platform %s', async (platform) => {
    const html = await ssr(mention(platform, 'octocat', 'Octocat'))
    expect(html.querySelector('a')).toBeNull()
    expect(html.querySelector('svg')).toBeNull()
    expect(html.querySelector('.hlx-mention')!.textContent).toBe('@Octocat')
  })

  it('takes fields that are not text without an error', async () => {
    const html = await ssr(mention('GH', 42, { a: 1 }))
    expect(html.querySelector('a')).toBeNull()
    expect(html.querySelector('.hlx-mention')!.textContent).toBe('@')
  })

  it('escapes a handle and a name that contain HTML', async () => {
    const html = await ssr(
      mention('weibo', '<img src=x onerror=alert(1)>'),
      mention('GH', 'octocat', '<script>alert(1)</script>'),
    )
    expect(html.querySelector('img,script')).toBeNull()
    expect(html.querySelector('a')!.textContent).toBe('<script>alert(1)</script>')
  })

  it('names every platform for the editor, by name from A to Z', () => {
    expect(Object.keys(MENTION_PLATFORMS)).toEqual([
      'BL',
      'DC',
      'GH',
      'IG',
      'RD',
      'TG',
      'TH',
      'TW',
      'YT',
    ])
    expect(Object.values(MENTION_PLATFORMS).map(platform => platform.label)).toEqual([
      'Bilibili',
      'Discord',
      'GitHub',
      'Instagram',
      'Reddit',
      'Telegram',
      'Threads',
      'X',
      'YouTube',
    ])
  })

  it('draws X, Threads and GitHub in the text color, as their marks are black and white', () => {
    for (const platform of ['GH', 'TW', 'TH'])
      expect(MENTION_PLATFORMS[platform].color, platform).toBeUndefined()
    for (const platform of ['TG', 'DC', 'YT', 'IG', 'BL', 'RD'])
      expect(MENTION_PLATFORMS[platform].color, platform).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('shows a 知乎 mention, no longer offered, as plain text', async () => {
    const html = await ssr(mention('ZH', 'octocat'))
    expect(html.querySelector('a')).toBeNull()
    expect(html.textContent).toContain('@octocat')
  })

  it('counts towards a heading\'s id', async () => {
    const value = {
      root: {
        type: 'root',
        children: [
          {
            type: 'heading',
            tag: 'h2',
            children: [
              { type: 'text', text: '感謝 ', format: 0 },
              mention('GH', 'octocat'),
            ],
          },
        ],
      },
    }
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, { value }),
    }))
    expect(html).toContain('id="感謝-octocat"')
  })
})
