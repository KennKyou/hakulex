<script setup lang="ts">
import { inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { EMBED_LABELS, EmbedThemeKey } from '../embed'

/*
 * An X post, in X's own embed page in a sandboxed iframe, so none of X's code runs in this page.
 * On the server and at first it is the label and link, so hydration matches; in the browser the
 * iframe loads unseen and replaces the link once X says how tall the post is. X's page waits for
 * an answer to its messages before it shows the post, then reports its height. Nothing in those
 * messages but the height is used. Without a height in time, or with no post, the link stays.
 */
const props = defineProps<{ url: string, id: string }>()

const X_ORIGIN = 'https://platform.twitter.com'
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms'
/** How long X has to show the post, in milliseconds. */
const TIMEOUT = 10_000
const MIN_HEIGHT = 80
const MAX_HEIGHT = 2000

interface Frame {
  key: number
  src: string
  /** Set once X reports it; until then the frame loads unseen. */
  height?: number
}

const theme = inject(EmbedThemeKey, () => 'light' as const)
const frames = ref<Frame[]>([])
const state = ref<'loading' | 'shown' | 'failed'>('loading')
const elements = new Map<number, HTMLIFrameElement>()
const timers = new Map<number, ReturnType<typeof setTimeout>>()
let next = 0

/** The page's language as X names it: Chinese by region or script, others by their code. */
function xLanguage(): string | undefined {
  const lang = document.documentElement.lang.trim().toLowerCase()
  if (/^zh-(?:hant|tw|hk|mo)\b/.test(lang))
    return 'zh-tw'
  if (/^zh\b/.test(lang))
    return 'zh-cn'
  return /^[a-z]{2,3}$/.test(lang.split('-')[0])
    ? lang.split('-')[0]
    : undefined
}

function frameSrc(look: 'light' | 'dark') {
  const query = new URLSearchParams({ id: props.id, theme: look, dnt: 'true' })
  const lang = xLanguage()
  if (lang)
    query.set('lang', lang)
  return `${X_ORIGIN}/embed/Tweet.html?${query}`
}

function drop(key: number) {
  clearTimeout(timers.get(key))
  timers.delete(key)
  elements.delete(key)
  frames.value = frames.value.filter(frame => frame.key !== key)
}

function load() {
  const key = ++next
  frames.value = [
    ...frames.value,
    {
      key,
      src: frameSrc(theme()),
    },
  ]
  timers.set(key, setTimeout(fail, TIMEOUT, key))
}

function fail(key: number) {
  drop(key)
  if (state.value !== 'shown')
    state.value = 'failed'
}

function show(key: number, height: number) {
  clearTimeout(timers.get(key))
  timers.delete(key)
  // A newer frame (the other theme) replaces the one shown; older ones go.
  for (const frame of frames.value) {
    if (frame.key < key)
      drop(frame.key)
  }
  frames.value = frames.value.map(frame => frame.key === key
    ? {
        ...frame,
        height: Math.min(Math.max(height, MIN_HEIGHT), MAX_HEIGHT),
      }
    : frame)
  state.value = 'shown'
}

function parse(data: unknown): Record<string, any> | null {
  try {
    const value = typeof data === 'string'
      ? JSON.parse(data)
      : data
    const message = value?.['twttr.embed']
    return message && typeof message === 'object'
      ? message
      : null
  }
  catch {
    return null
  }
}

function onMessage(event: MessageEvent) {
  if (event.origin !== X_ORIGIN || !event.source)
    return
  const key = [...elements].find(([, element]) => element.contentWindow === event.source)?.[0]
  const message = parse(event.data)
  if (key === undefined || !message || typeof message.method !== 'string')
    return
  switch (message.method) {
    case 'twttr.private.resize': {
      const height = Number(message.params?.[0]?.height)
      if (Number.isFinite(height) && height > 0)
        show(key, height)
      return
    }
    case 'twttr.private.no_results':
      fail(key)
      return
    case 'twttr.private.rendered':
      return
    default:
      // X's page waits for an answer before it shows the post.
      if (typeof message.id === 'string' || typeof message.id === 'number') {
        (event.source as Window).postMessage(JSON.stringify({
          'twttr.embed': {
            jsonrpc: '2.0',
            id: message.id,
            result: [message.method],
          },
        }), X_ORIGIN)
      }
  }
}

function keep(key: number, element: unknown) {
  if (element)
    elements.set(key, element as HTMLIFrameElement)
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  load()
})

watch(theme, () => {
  if (state.value !== 'failed')
    load()
})

onBeforeUnmount(() => {
  window.removeEventListener('message', onMessage)
  for (const timer of timers.values())
    clearTimeout(timer)
})
</script>

<template>
  <div
    class="hlx-embed"
    :class="state === 'shown' ? 'hlx-embed--tweet' : 'hlx-embed--link'"
    :data-tweet="state"
  >
    <template v-if="state !== 'shown'">
      <span class="hlx-embed-label">{{ EMBED_LABELS.tweet }}</span>
      <a class="hlx-embed-url" :href="url" rel="noopener noreferrer" target="_blank">{{ url }}</a>
    </template>
    <iframe
      v-for="frame in frames"
      :key="frame.key"
      :ref="element => keep(frame.key, element)"
      class="hlx-embed-tweet-frame"
      :src="frame.src"
      :title="EMBED_LABELS.tweet"
      :sandbox="SANDBOX"
      loading="lazy"
      referrerpolicy="strict-origin-when-cross-origin"
      :data-pending="frame.height === undefined ? '' : undefined"
      :style="frame.height === undefined ? undefined : { height: `${frame.height}px` }"
    />
  </div>
</template>
