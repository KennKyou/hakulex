import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { parseEmbedUrl, RichRenderer } from '../src'

function embed(url: unknown, source: unknown = null): SerializedNode {
  return {
    type: 'embed',
    version: 1,
    url,
    source,
  }
}

async function ssr(node: SerializedNode, renderers?: Record<string, unknown>) {
  const value = {
    root: {
      type: 'root',
      children: [node],
    },
  }
  const html = await renderToString(createSSRApp({
    render: () => h(RichRenderer, { value, renderers } as never),
  }))
  const container = document.createElement('div')
  container.innerHTML = html
  return container
}

describe('working out the source from the URL', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&t=30', 'youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc', 'youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.bilibili.com/video/BV1GJ411x7h7/?p=2', 'bilibili', 'https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&autoplay=0'],
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'spotify', 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
    ['https://open.spotify.com/intl-ja/album/4uLU6hMCjMI75M1A2tKUQC?si=x', 'spotify', 'https://open.spotify.com/embed/album/4uLU6hMCjMI75M1A2tKUQC'],
    ['https://music.apple.com/us/album/some-name/1440857781', 'apple-music', 'https://embed.music.apple.com/us/album/some-name/1440857781'],
    ['https://music.apple.com/jp/album/some-name/1440857781?i=1440857782', 'apple-music', 'https://embed.music.apple.com/jp/album/some-name/1440857781?i=1440857782'],
    ['https://music.apple.com/us/playlist/name/pl.u-abc123', 'apple-music', 'https://embed.music.apple.com/us/playlist/name/pl.u-abc123'],
    ['https://codesandbox.io/s/new-abc12', 'codesandbox', 'https://codesandbox.io/embed/new-abc12?fontsize=14&hidenavigation=1'],
    ['https://gist.github.com/octocat/0123abcdef', 'github-gist', 'https://gist.github.com/octocat/0123abcdef.pibb'],
  ])('%s', (url, source, src) => {
    const parsed = parseEmbedUrl(url)!
    expect(parsed.source).toBe(source)
    expect(parsed.frame!.src).toBe(src)
  })

  it.each([
    ['https://x.com/octocat/status/1234567890', 'tweet'],
    ['https://twitter.com/octocat/status/1234567890?s=20', 'tweet'],
    ['https://github.com/octocat/repo/blob/main/a.ts', 'github-file'],
  ])('%s is a link with a source', (url, source) => {
    const parsed = parseEmbedUrl(url)!
    expect(parsed.source).toBe(source)
    expect(parsed.frame).toBeUndefined()
  })

  it.each([
    // Hosts that only look right.
    'https://evilbilibili.com/video/BV1GJ411x7h7',
    'https://www.bilibili.com.evil.com/video/BV1GJ411x7h7',
    'https://www.youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://evil.com/www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com@evil.com/watch?v=dQw4w9WgXcQ',
    'https://notgist.github.com/octocat/0123abcdef',
    // IDs with other characters.
    'https://www.youtube.com/watch?v=a"><script>',
    'https://www.youtube.com/watch?v=../../evil',
    'https://youtu.be/a%2Fb',
    'https://www.bilibili.com/video/BV1GJ411x7h7%22',
    'https://www.bilibili.com/video/av170001',
    'https://open.spotify.com/track/a%22b',
    'https://open.spotify.com/user/abc123abc123',
    'https://music.apple.com/us/album/a%22%3E/1440857781?i=a&b',
    'https://music.apple.com/us/album/name/not-a-number',
    'https://codesandbox.io/s/a%2F..%2Fb',
    'https://gist.github.com/octocat/not-hex!',
    // Not what they embed.
    'https://www.youtube.com/channel/abc',
    'https://x.com/octocat',
    'https://x.com/octocat/status/abc',
    'https://github.com/octocat/repo',
    'https://example.com/',
    // Not http.
    'ftp://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'javascript:alert(1)',
    'not a url',
    '',
    7,
    null,
  ])('%s has no source', (url) => {
    expect(parseEmbedUrl(url)?.source ?? null).toBeNull()
    expect(parseEmbedUrl(url)?.frame).toBeUndefined()
  })
})

describe('rendering', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.bilibili.com/video/BV1GJ411x7h7',
    'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://music.apple.com/us/album/some-name/1440857781',
    'https://codesandbox.io/s/new-abc12',
    'https://gist.github.com/octocat/0123abcdef',
  ])('%s gets a limited iframe', async (url) => {
    const frame = (await ssr(embed(url))).querySelector('iframe')!
    expect(frame.getAttribute('src')).toBe(parseEmbedUrl(url)!.frame!.src)
    expect(frame.getAttribute('title')).toBeTruthy()
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-top-navigation ')
    expect(frame.getAttribute('allow')).not.toBeNull()
    expect(frame.getAttribute('loading')).toBe('lazy')
  })

  it('adds a link to the source of a gist', async () => {
    const link = (await ssr(embed('https://gist.github.com/octocat/0123abcdef'))).querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://gist.github.com/octocat/0123abcdef')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it.each([
    ['https://evil.com/x', 'youtube'],
    ['https://evilbilibili.com/video/BV1GJ411x7h7', 'bilibili'],
    ['https://example.com/thinking/1', 'thinking'],
    ['https://www.youtube.com/watch?v=a%22b', 'youtube'],
  ])('doesn\'t believe a stored source: %s claiming %s', async (url, source) => {
    const html = await ssr(embed(url, source))
    expect(html.querySelector('iframe')).toBeNull()
    const link = html.querySelector('a')!
    expect(link.getAttribute('href')).toBe(url)
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it.each([
    ['https://x.com/octocat/status/1', 'X 貼文'],
    ['https://github.com/a/b/blob/main/c.ts', 'GitHub 檔案'],
    ['https://example.com/', '連結'],
  ])('shows %s as a link labelled %s', async (url, label) => {
    const html = await ssr(embed(url))
    expect(html.querySelector('iframe')).toBeNull()
    expect(html.querySelector('.hlx-embed-label')!.textContent).toBe(label)
    expect(html.querySelector('a')!.getAttribute('href')).toBe(url)
  })

  it('shows an unsafe URL as text', async () => {
    const html = await ssr(embed('javascript:alert(1)', 'youtube'))
    expect(html.querySelector('a,iframe')).toBeNull()
    expect(html.textContent).toContain('javascript:alert(1)')
  })

  it('escapes what it shows', async () => {
    const html = await ssr(embed('<img src=x onerror=alert(1)>'))
    expect(html.querySelector('img')).toBeNull()
  })

  it.each(['', '   ', 7, null, undefined])('outputs nothing for the empty URL %s', async (url) => {
    expect((await ssr(embed(url))).querySelector('.hlx-embed')).toBeNull()
  })

  it('can be overridden', async () => {
    const html = await ssr(embed('https://x.com/octocat/status/1'), {
      embed: () => h('b', '自訂'),
    })
    expect(html.querySelector('b')!.textContent).toBe('自訂')
  })
})
