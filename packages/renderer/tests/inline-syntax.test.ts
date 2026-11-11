import type { SerializedNode } from '../src'
import { renderToString } from '@vue/server-renderer'
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, h } from 'vue'
import { normalizeRubyReading, RichRenderer } from '../src'

const text = (value: string, format = 0): SerializedNode => ({ type: 'text', text: value, format })
const paragraph = (...children: SerializedNode[]): SerializedNode => ({ type: 'paragraph', children })
const spoiler = (...children: SerializedNode[]): SerializedNode => ({ type: 'spoiler', children })
const ruby = (reading: unknown, ...children: SerializedNode[]): SerializedNode => ({ type: 'ruby', reading, children })
function documentOf(...children: SerializedNode[]) {
  return {
    root: { type: 'root', children },
  }
}

function ssr(...children: SerializedNode[]) {
  return renderToString(createSSRApp({
    render: () => h(RichRenderer, {
      value: documentOf(...children),
    }),
  }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('spoiler (SSR)', () => {
  it('starts hidden, keeps its text and formats, and can take focus', async () => {
    const html = await ssr(paragraph(spoiler(text('雷'), text('粗', 1))))
    expect(html).toContain('hlx-spoiler hlx-spoiler--hidden')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('role="button"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('雷')
    expect(html).toContain('<strong class="hlx-bold">粗</strong>')
  })
})

describe('spoiler (client)', () => {
  function mountSpoiler(...children: SerializedNode[]) {
    const wrapper = mount(RichRenderer, {
      attachTo: document.body,
      props: {
        value: documentOf(paragraph(spoiler(...children))),
      },
    })
    return {
      wrapper,
      element: wrapper.get('.hlx-spoiler'),
    }
  }
  const isHidden = (element: { classes: () => string[] }) => element.classes().includes('hlx-spoiler--hidden')

  it('hydrates server output without warnings', async () => {
    const value = documentOf(paragraph(spoiler(text('雷', 1))))
    const html = await renderToString(createSSRApp({
      render: () => h(RichRenderer, { value }),
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = document.createElement('div')
    host.innerHTML = html
    document.body.append(host)
    createSSRApp({
      render: () => h(RichRenderer, { value }),
    }).mount(host)
    expect(warn).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    warn.mockRestore()
    error.mockRestore()
  })

  it('toggles on click and reports its state', async () => {
    const { element } = mountSpoiler(text('雷'))
    await element.trigger('click')
    expect(isHidden(element)).toBe(false)
    expect(element.attributes('aria-expanded')).toBe('true')
    await element.trigger('click')
    expect(isHidden(element)).toBe(true)
    expect(element.attributes('aria-expanded')).toBe('false')
  })

  it.each(['Enter', ' '])('toggles with the %j key and stops the page from reacting', async (key) => {
    const { element } = mountSpoiler(text('雷'))
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    element.element.dispatchEvent(event)
    await element.trigger('focus')
    expect(event.defaultPrevented).toBe(true)
    expect(isHidden(element)).toBe(false)
  })

  it('stays covered after being hidden again, until the pointer or focus leaves', async () => {
    const { element } = mountSpoiler(text('雷'))
    await element.trigger('click')
    await element.trigger('click')
    expect(element.attributes('data-rehidden')).toBe('')
    await element.trigger('mouseleave')
    expect(element.attributes('data-rehidden')).toBeUndefined()

    await element.trigger('click')
    await element.trigger('click')
    expect(element.attributes('data-rehidden')).toBe('')
    await element.trigger('blur')
    expect(element.attributes('data-rehidden')).toBeUndefined()
  })

  it('does not follow a link while hidden, and leaves it alone once shown', async () => {
    const { element, wrapper } = mountSpoiler({
      type: 'link',
      url: 'https://example.com',
      children: [
        text('連結'),
      ],
    })
    const click = () => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      wrapper.get('a').element.dispatchEvent(event)
      return event
    }

    expect(click().defaultPrevented).toBe(true)
    await wrapper.vm.$nextTick()
    expect(isHidden(element)).toBe(false)

    expect(click().defaultPrevented).toBe(false)
    await wrapper.vm.$nextTick()
    expect(isHidden(element)).toBe(false)
  })

  it('ignores keys pressed on a link inside', async () => {
    const { element, wrapper } = mountSpoiler({
      type: 'link',
      url: 'https://example.com',
      children: [
        text('連結'),
      ],
    })
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    wrapper.get('a').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()
    expect(event.defaultPrevented).toBe(false)
    expect(isHidden(element)).toBe(true)
  })
})

describe('ruby (SSR)', () => {
  it('renders native ruby with formats kept', async () => {
    const html = await ssr(paragraph(ruby('hàn', text('漢', 1))))
    expect(html).toContain('<ruby class="hlx-ruby"><strong class="hlx-bold">漢</strong><rt>hàn</rt></ruby>')
  })

  it('escapes the reading', async () => {
    const html = await ssr(paragraph(ruby('<script>alert(1)</script>', text('漢'))))
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it.each([
    ['not a string', 42],
    ['missing', undefined],
    ['empty', ''],
    ['only spaces', '   '],
  ])('renders only the text when the reading is %s', async (_name, reading) => {
    const html = await ssr(paragraph(ruby(reading, text('漢'))))
    expect(html).toContain('漢')
    expect(html).not.toContain('<rt')
    expect(html).not.toContain('<ruby')
  })

  it('normalizes readings', () => {
    expect(normalizeRubyReading('  hàn ')).toBe('hàn')
    expect(normalizeRubyReading(42)).toBe('')
    expect(normalizeRubyReading(null)).toBe('')
  })
})
