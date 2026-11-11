import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h, nextTick } from 'vue'
import { parseEmbedUrl, RichRenderer } from '../src'

const X = 'https://platform.twitter.com'
const POST = 'https://x.com/jack/status/20'
const embed = (url: string): SerializedNode => ({ type: 'embed', version: 1, url })
function value(url = POST) {
  return {
    root: {
      type: 'root',
      children: [
        embed(url),
      ],
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
  document.documentElement.removeAttribute('lang')
})

/** Mounts a post, and gives its iframe a stand-in window to talk to (happy-dom loads no iframes). */
async function mounted(colorScheme: 'light' | 'dark' = 'light') {
  const wrapper = mount(RichRenderer, {
    props: {
      value: value(),
      colorScheme,
    },
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

function frameOf(wrapper: ReturnType<typeof mount>) {
  const iframe = wrapper.find('iframe').element as HTMLIFrameElement
  const window_ = {
    postMessage: vi.fn(),
  }
  Object.defineProperty(iframe, 'contentWindow', { value: window_, configurable: true })
  return { iframe, window: window_ }
}

function fromX(source: unknown, method: string, params: unknown[] = [], origin = X) {
  const data = JSON.stringify({
    'twttr.embed': {
      jsonrpc: '2.0',
      method,
      id: 'hlx-tweet',
      params,
    },
  })
  const event = new MessageEvent('message', { data, origin })
  Object.defineProperty(event, 'source', { value: source })
  window.dispatchEvent(event)
}

describe('reading the URL', () => {
  it('takes the post\'s ID from the URL', () => {
    expect(parseEmbedUrl('https://x.com/jack/status/20')).toMatchObject({ source: 'tweet', tweetId: '20' })
    expect(parseEmbedUrl('https://twitter.com/jack/status/1234567890?s=20')).toMatchObject({ source: 'tweet', tweetId: '1234567890' })
  })
})

describe('server output', () => {
  it('is the label and link, as before, and hydrates cleanly', async () => {
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, {
        value: value(),
      }),
    }))
    expect(html).toContain('<span class="hlx-embed-label">X 貼文</span>')
    expect(html).toContain(`href="${POST}"`)
    expect(html).not.toContain('<iframe')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    createSSRApp({
      render: () => h(RichRenderer, {
        value: value(),
      }),
    }).mount(container)
    await flushPromises()
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('in the browser', () => {
  it('adds X\'s iframe once mounted, in the renderer\'s theme and the page\'s language', async () => {
    document.documentElement.lang = 'zh-TW'
    const wrapper = await mounted('dark')
    const iframe = wrapper.find('iframe')
    const src = new URL(iframe.attributes('src')!)
    expect(`${src.origin}${src.pathname}`).toBe(`${X}/embed/Tweet.html`)
    expect(Object.fromEntries(src.searchParams)).toMatchObject({
      id: '20',
      theme: 'dark',
      dnt: 'true',
      lang: 'zh-tw',
    })
    expect(iframe.attributes('sandbox')).toBe('allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms')
    expect(iframe.attributes('loading')).toBe('lazy')
    for (const [page, x] of [
      ['zh-Hant', 'zh-tw'],
      ['zh-Hant-TW', 'zh-tw'],
      ['zh-CN', 'zh-cn'],
      ['ja', 'ja'],
      ['en-US', 'en'],
    ]) {
      document.documentElement.lang = page
      const other = mount(RichRenderer, {
        props: {
          value: value(),
        },
      })
      await nextTick()
      expect(new URL(other.find('iframe').attributes('src')!).searchParams.get('lang'), page).toBe(x)
      other.unmount()
    }
    // Until X says how tall the post is, the link is what shows.
    expect(wrapper.find('.hlx-embed-label').exists()).toBe(true)
    expect(wrapper.find('[data-tweet]').attributes('data-tweet')).toBe('loading')
  })

  it('answers X, and shows the post at the height X reports', async () => {
    const wrapper = await mounted()
    const { iframe, window: frame } = frameOf(wrapper)
    fromX(frame, 'twttr.private.initialized')
    expect(frame.postMessage).toHaveBeenCalledTimes(1)
    const [reply, origin] = frame.postMessage.mock.calls[0]
    expect(origin).toBe(X)
    expect(JSON.parse(reply)['twttr.embed']).toMatchObject({ jsonrpc: '2.0', id: 'hlx-tweet' })
    fromX(frame, 'twttr.private.resize', [
      { width: 500, height: 225 },
    ])
    await nextTick()
    expect(iframe.style.height).toBe('225px')
    expect(wrapper.find('[data-tweet]').attributes('data-tweet')).toBe('shown')
    expect(wrapper.find('.hlx-embed-label').exists()).toBe(false)
  })

  it('ignores messages from anywhere else, and heights out of reason', async () => {
    const wrapper = await mounted()
    const { iframe, window: frame } = frameOf(wrapper)
    fromX({
      postMessage: vi.fn(),
    }, 'twttr.private.resize', [
      { height: 300 },
    ])
    fromX(frame, 'twttr.private.resize', [
      { height: 300 },
    ], 'https://evil.example')
    fromX(frame, 'twttr.private.resize', [
      { height: 0 },
    ])
    fromX(frame, 'twttr.private.resize', [
      { height: 'tall' },
    ])
    await nextTick()
    expect(iframe.style.height).not.toBe('300px')
    expect(wrapper.find('[data-tweet]').attributes('data-tweet')).toBe('loading')
    fromX(frame, 'twttr.private.resize', [
      { height: 99999 },
    ])
    await nextTick()
    expect(iframe.style.height).toBe('2000px')
  })

  it('goes back to the link when X finds no post, or says nothing in time', async () => {
    const missing = await mounted()
    fromX(frameOf(missing).window, 'twttr.private.no_results')
    await nextTick()
    expect(missing.find('iframe').exists()).toBe(false)
    expect(missing.find('.hlx-embed-label').exists()).toBe(true)

    vi.useFakeTimers()
    const silent = await mounted()
    vi.advanceTimersByTime(10_001)
    await nextTick()
    expect(silent.find('iframe').exists()).toBe(false)
    expect(silent.find('.hlx-embed-label').exists()).toBe(true)
    expect(silent.find('[data-tweet]').attributes('data-tweet')).toBe('failed')
  })

  it('loads the other theme on a theme change, keeping the post shown until it is ready', async () => {
    const wrapper = await mounted('light')
    const first = frameOf(wrapper)
    fromX(first.window, 'twttr.private.resize', [
      { height: 225 },
    ])
    await nextTick()
    await wrapper.setProps({ colorScheme: 'dark' })
    const frames = wrapper.findAll('iframe')
    expect(frames.map(f => new URL(f.attributes('src')!).searchParams.get('theme'))).toEqual(['light', 'dark'])
    expect(wrapper.find('[data-tweet]').attributes('data-tweet')).toBe('shown')
    const next = frames[1].element as HTMLIFrameElement
    const nextWindow = {
      postMessage: vi.fn(),
    }
    Object.defineProperty(next, 'contentWindow', { value: nextWindow })
    fromX(nextWindow, 'twttr.private.resize', [
      { height: 230 },
    ])
    await nextTick()
    const left = wrapper.findAll('iframe')
    expect(left).toHaveLength(1)
    expect(new URL(left[0].attributes('src')!).searchParams.get('theme')).toBe('dark')
    expect((left[0].element as HTMLIFrameElement).style.height).toBe('230px')
  })

  it('stops listening once gone', async () => {
    const remove = vi.spyOn(window, 'removeEventListener')
    const wrapper = await mounted()
    wrapper.unmount()
    expect(remove.mock.calls.some(([type]) => type === 'message')).toBe(true)
    remove.mockRestore()
  })
})
