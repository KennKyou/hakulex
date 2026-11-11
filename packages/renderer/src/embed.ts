import type { FunctionalComponent, InjectionKey, VNode } from 'vue'
import { h } from 'vue'
import TweetEmbed from './views/TweetEmbed.vue'

export type EmbedSource = 'tweet' | 'youtube' | 'apple-music' | 'spotify' | 'codesandbox' | 'bilibili' | 'github-file' | 'github-gist'

export const EMBED_LABELS: Record<EmbedSource, string> = {
  'tweet': 'X 貼文',
  'youtube': 'YouTube',
  'apple-music': 'Apple Music',
  'spotify': 'Spotify',
  'codesandbox': 'CodeSandbox',
  'bilibili': 'Bilibili',
  'github-file': 'GitHub 檔案',
  'github-gist': 'GitHub Gist',
}

export interface EmbedFrame {
  src: string
  allow: string
}

export interface ParsedEmbed {
  source: EmbedSource
  /** How to show it inline. Sources without one are links. */
  frame?: EmbedFrame
  /** An X post's ID, which `TweetEmbed` shows once in the browser. */
  tweetId?: string
}

/** The renderer's color scheme, for embeds that come in a light and a dark look. */
export const EmbedThemeKey: InjectionKey<() => 'light' | 'dark'> = Symbol('EmbedTheme')

const VIDEO_ALLOW = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen'
const MUSIC_ALLOW = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'

/** The parts of a path, still percent-encoded, so an encoded `/` or `"` fails the formats below. */
const segments = (url: URL) => url.pathname.split('/').filter(Boolean)

function parseYoutube(url: URL): ParsedEmbed | null {
  const id = url.hostname === 'youtu.be'
    ? segments(url)[0]
    : ['www.youtube.com', 'youtube.com', 'm.youtube.com'].includes(url.hostname) && url.pathname === '/watch'
        ? url.searchParams.get('v')
        : null
  return id && /^[\w-]{6,20}$/.test(id)
    ? {
        source: 'youtube',
        frame: { src: `https://www.youtube.com/embed/${id}`, allow: VIDEO_ALLOW },
      }
    : null
}

function parseBilibili(url: URL): ParsedEmbed | null {
  if (!['www.bilibili.com', 'bilibili.com', 'm.bilibili.com'].includes(url.hostname))
    return null
  const [kind, id] = segments(url)
  return kind === 'video' && id && /^BV[0-9A-Za-z]{10}$/.test(id)
    ? {
        source: 'bilibili',
        frame: { src: `https://player.bilibili.com/player.html?bvid=${id}&autoplay=0`, allow: VIDEO_ALLOW },
      }
    : null
}

const SPOTIFY_TYPES = new Set([
  'album',
  'artist',
  'episode',
  'playlist',
  'show',
  'track',
])

function parseSpotify(url: URL): ParsedEmbed | null {
  if (url.hostname !== 'open.spotify.com')
    return null
  const parts = segments(url)
  const [kind, id] = parts[0] === 'embed' || parts[0]?.startsWith('intl-')
    ? parts.slice(1)
    : parts
  return SPOTIFY_TYPES.has(kind) && /^[0-9A-Z]{10,40}$/i.test(id ?? '')
    ? {
        source: 'spotify',
        frame: { src: `https://open.spotify.com/embed/${kind}/${id}`, allow: MUSIC_ALLOW },
      }
    : null
}

const APPLE_KINDS = new Set([
  'album',
  'playlist',
  'song',
  'station',
  'music-video',
])

function parseAppleMusic(url: URL): ParsedEmbed | null {
  if (url.hostname !== 'music.apple.com' && url.hostname !== 'embed.music.apple.com')
    return null
  const parts = segments(url)
  const [country, kind] = parts
  // The name in the middle is optional and only there for people to read.
  const name = parts.length === 4
    ? parts[2]
    : null
  const id = parts.length === 4
    ? parts[3]
    : parts[2]
  if (parts.length < 3 || parts.length > 4 || !/^[a-z]{2}$/.test(country) || !APPLE_KINDS.has(kind))
    return null
  if (!/^(?:\d+|[a-z]{2}\.[\w.-]+)$/.test(id) || (name !== null && !/^[\w.~-]+$/.test(name)))
    return null
  const track = url.searchParams.get('i')
  if (track !== null && !/^\d+$/.test(track))
    return null
  const path = [
    country,
    kind,
    ...(name === null
      ? []
      : [name]),
    id,
  ].join('/')
  return {
    source: 'apple-music',
    frame: {
      src: `https://embed.music.apple.com/${path}${track === null
        ? ''
        : `?i=${track}`}`,
      allow: 'autoplay *; encrypted-media *; fullscreen *; clipboard-write',
    },
  }
}

function parseCodesandbox(url: URL): ParsedEmbed | null {
  if (url.hostname !== 'codesandbox.io')
    return null
  const parts = segments(url)
  return parts.length === 2 && parts[0] === 's' && /^[\w-]{1,64}$/.test(parts[1])
    ? {
        source: 'codesandbox',
        frame: { src: `https://codesandbox.io/embed/${parts[1]}?fontsize=14&hidenavigation=1`, allow: 'clipboard-write' },
      }
    : null
}

function parseGist(url: URL): ParsedEmbed | null {
  if (url.hostname !== 'gist.github.com')
    return null
  const parts = segments(url)
  return parts.length === 2 && /^[\w-]{1,39}$/.test(parts[0]) && /^[0-9a-f]{4,64}$/.test(parts[1])
    ? {
        source: 'github-gist',
        frame: { src: `https://gist.github.com/${parts[0]}/${parts[1]}.pibb`, allow: '' },
      }
    : null
}

function parseTweet(url: URL): ParsedEmbed | null {
  if (![
    'x.com',
    'www.x.com',
    'twitter.com',
    'www.twitter.com',
    'mobile.twitter.com',
  ].includes(url.hostname)) {
    return null
  }
  const id = url.pathname.match(/^\/\w{1,32}\/status\/(\d{1,25})\/?$/)?.[1]
  return id
    ? { source: 'tweet', tweetId: id }
    : null
}

function parseGithubFile(url: URL): ParsedEmbed | null {
  if (url.hostname !== 'github.com')
    return null
  const parts = segments(url)
  return parts.length >= 5 && parts[2] === 'blob'
    ? { source: 'github-file' }
    : null
}

const PARSERS = [
  parseYoutube,
  parseBilibili,
  parseSpotify,
  parseAppleMusic,
  parseCodesandbox,
  parseGist,
  parseTweet,
  parseGithubFile,
]

/** A URL that browsers will treat as http(s), or `null`. */
export function parseHttpUrl(value: unknown): URL | null {
  if (typeof value !== 'string')
    return null
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url
      : null
  }
  catch {
    return null
  }
}

/**
 * What a URL is, going by the URL alone: exact hosts, IDs in strict formats, and `src` built from
 * fixed strings. A document can claim any `source`, so that field is never read.
 */
export function parseEmbedUrl(value: unknown): ParsedEmbed | null {
  const url = parseHttpUrl(value)
  if (!url)
    return null
  for (const parse of PARSERS) {
    const parsed = parse(url)
    if (parsed)
      return parsed
  }
  return null
}

// No `allow-top-navigation`: an embed doesn't get to take over the page.
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'

export function embedLabel(url: unknown): string {
  const parsed = parseEmbedUrl(url)
  return parsed ? EMBED_LABELS[parsed.source] : '連結'
}

export function renderEmbed(url: unknown): VNode | null {
  if (typeof url !== 'string' || !url.trim())
    return null
  const parsed = parseEmbedUrl(url)
  if (parsed?.frame) {
    const label = EMBED_LABELS[parsed.source]
    return h('div', { 'class': 'hlx-embed', 'data-source': parsed.source }, [
      h('iframe', {
        class: 'hlx-embed-frame',
        src: parsed.frame.src,
        title: label,
        sandbox: SANDBOX,
        allow: parsed.frame.allow,
        loading: 'lazy',
        referrerpolicy: 'strict-origin-when-cross-origin',
        allowfullscreen: true,
      }),
      parsed.source === 'github-gist' && h('a', {
        class: 'hlx-embed-source',
        href: url,
        rel: 'noopener noreferrer',
        target: '_blank',
      }, '在 GitHub 上查看'),
    ])
  }
  if (parsed?.tweetId)
    return h(TweetEmbed, { url, id: parsed.tweetId })
  const safe = parseHttpUrl(url) !== null
  return h('div', { class: 'hlx-embed hlx-embed--link' }, [
    h('span', { class: 'hlx-embed-label' }, embedLabel(url)),
    safe
      ? h('a', {
          class: 'hlx-embed-url',
          href: url,
          rel: 'noopener noreferrer',
          target: '_blank',
        }, url)
      : h('span', { class: 'hlx-embed-url' }, url),
  ])
}

export const EmbedView: FunctionalComponent<{ url?: unknown }> = props => renderEmbed(props.url)
EmbedView.props = ['url']
